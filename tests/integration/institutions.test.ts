import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, SYSTEM_CONTEXT } from '../../apps/api/src/infrastructure/database/prisma.service';
import { AuditService } from '../../apps/api/src/infrastructure/audit/audit.service';
import { InstitutionService } from '../../apps/api/src/modules/institutions/application/institution.service';

/**
 * Institutions — executable proof of the onboarding lifecycle against a real
 * PostgreSQL with row-level security live:
 *
 *   apply → pending (invisible to the public directory) → administrated by
 *   the applicant → verified by the platform → public → suspended → hidden.
 *
 * Visibility is enforced by RLS, not application filtering: the same service
 * method returns different rows depending only on the tenant context.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const APPLICANT = `99999999-9999-4900-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const PLATFORM = `aaaaaaa0-0000-4a00-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;

function asSuper(sql: string): string {
  const dsn = process.env.CI_SUPERUSER_DSN ?? process.env.DATABASE_MIGRATION_URL;
  if (dsn) {
    return execFileSync('psql', [dsn, '-qtA', '-c', sql], { encoding: 'utf8' }).trim();
  }
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

const createInput = (tag: string) => ({
  legalName: `Federal University of Integration ${tag}`,
  displayName: `FUI ${tag}`,
  countryCode: 'NG',
  category: 'university' as const,
  officialDomain: 'fui-test.edu',
  representativeEmail: `r-${tag}@fui-test.edu`,
  privacyContactEmail: `p-${tag}@fui-test.edu`,
  academicContactEmail: `a-${tag}@fui-test.edu`,
});

d('Institutions (real PostgreSQL, real RLS)', () => {
  let prisma: PrismaService;
  let service: InstitutionService;
  let createdId: string;

  beforeAll(async () => {
    asSuper(`INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
             VALUES ('${APPLICANT}', 'applicant-${RUN}@fu-test.edu', 'x', 'Applicant', now(), now()),
                    ('${PLATFORM}', 'platform-${RUN}@fu-test.edu', 'x', 'Platform', now(), now())`);
    prisma = new PrismaService();
    const audit = new AuditService(prisma, { get: () => 'integration-audit-salt-0000000000000' } as never);
    service = new InstitutionService(prisma, audit);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (!HAS_DB) return;
    asSuper(`DELETE FROM institution WHERE slug LIKE 'fui-%' OR legal_name LIKE 'Federal University of Integration%'`);
    asSuper(`DELETE FROM user_account WHERE id IN ('${APPLICANT}', '${PLATFORM}')`);
  });

  it('onboarding creates a pending_verification institution and makes the applicant its inst_admin', async () => {
    const created = await service.create(APPLICANT, createInput(String(RUN)));
    createdId = created.id;

    expect(created.status).toBe('pending_verification');
    expect(created.slug).toMatch(/^fui-/);
    expect(created.branding).toEqual({ primaryColor: null, logoUrl: null });

    const membership = asSuper(
      `SELECT role, status FROM membership WHERE user_id = '${APPLICANT}' AND institution_id = '${createdId}'`,
    );
    expect(membership).toBe('inst_admin|active');
  });

  it('a pending institution is INVISIBLE to the public directory (RLS, system context)', async () => {
    const page = await service.list({ limit: 100 } as never, SYSTEM_CONTEXT);
    expect(page.items.some((i) => i.id === createdId)).toBe(false);

    // ...and 404 on direct lookup: existence is not disclosed.
    await expect(service.getById(createdId, SYSTEM_CONTEXT)).rejects.toThrow('not found');
  });

  it('the institution is visible and administrable from inside its tenant', async () => {
    const memberCtx = { userId: APPLICANT, institutionId: createdId };

    const page = await service.list({ limit: 100 } as never, memberCtx);
    expect(page.items.some((i) => i.id === createdId)).toBe(true);

    const detail = await service.getById(createdId, memberCtx);
    expect(detail.legalName).toContain('Integration');

    // A legal-name change is recorded as history, never overwritten.
    const updated = await service.update(createdId, memberCtx, {
      legalName: `Federal University of Integration ${RUN} (Renamed)`,
    });
    expect(updated.legalName).toContain('Renamed');
    expect(updated.previousNames).toHaveLength(1);
    expect(updated.previousNames[0]?.name).not.toContain('Renamed');
  });

  it('platform verification makes the institution public (step-up is enforced at the route)', async () => {
    const verified = await service.setStatus(createdId, PLATFORM, { status: 'verified' });
    expect(verified.status).toBe('verified');

    const page = await service.list({ limit: 100 } as never, SYSTEM_CONTEXT);
    expect(page.items.some((i) => i.id === createdId && i.status === 'verified')).toBe(true);

    const detail = await service.getById(createdId, SYSTEM_CONTEXT);
    expect(detail.id).toBe(createdId);
  });

  it('directory filters work (country + status + search)', async () => {
    const byCountry = await service.list({ limit: 100, country: 'NG' } as never, SYSTEM_CONTEXT);
    expect(byCountry.items.some((i) => i.id === createdId)).toBe(true);

    const byWrongCountry = await service.list({ limit: 100, country: 'FR' } as never, SYSTEM_CONTEXT);
    expect(byWrongCountry.items.some((i) => i.id === createdId)).toBe(false);

    const byQuery = await service.list({ limit: 100, q: `FUI ${RUN}` } as never, SYSTEM_CONTEXT);
    expect(byQuery.items.some((i) => i.id === createdId)).toBe(true);
  });

  it('suspension hides the institution from the public directory again', async () => {
    const suspended = await service.setStatus(createdId, PLATFORM, {
      status: 'suspended',
      note: 'integration test suspension',
    });
    expect(suspended.status).toBe('suspended');

    const page = await service.list({ limit: 100 } as never, SYSTEM_CONTEXT);
    expect(page.items.some((i) => i.id === createdId)).toBe(false);
    await expect(service.getById(createdId, SYSTEM_CONTEXT)).rejects.toThrow('not found');

    // The institution's own members still see it.
    const memberCtx = { userId: APPLICANT, institutionId: createdId };
    const inside = await service.getById(createdId, memberCtx);
    expect(inside.status).toBe('suspended');
  });

  it('the lifecycle is fully audit-logged', async () => {
    const actions = asSuper(
      `SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM audit_event WHERE institution_id = '${createdId}'`,
    );
    for (const expected of ['institution.created', 'institution.status_changed', 'institution.updated']) {
      expect(actions).toContain(expected);
    }
  });
});
