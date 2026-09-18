import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../../apps/api/src/infrastructure/audit/audit.service';
import { PrismaService } from '../../apps/api/src/infrastructure/database/prisma.service';
import { PolicyEngine } from '../../apps/api/src/domain/policy/policy-engine';
import { PolicyService } from '../../apps/api/src/domain/policy/policy.service';
import { TenantContextService } from '../../apps/api/src/interface/middleware/tenant-context.service';
import { MembershipService } from '../../apps/api/src/modules/institutions/application/membership.service';

/**
 * Member management against a real PostgreSQL with row-level security live
 * (api_specification.md §4 "Members", PRD §6.1):
 *
 *   - listing is scoped to the caller's tenant; a foreign institution's
 *     roster is invisible;
 *   - adding requires an existing account (404 otherwise), is idempotent
 *     per person (409 for an active member), and re-activates revoked rows
 *     in place — exactly one row per (person, institution);
 *   - role changes refuse self-modification (409) and hide foreign members
 *     behind 404 (RLS + capability);
 *   - revocation keeps the row (status revoked) and is idempotent;
 *   - bulk invite reports per-item outcomes and never throws per item;
 *   - every mutation lands in the audit trail.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const SUFFIX = String(RUN).slice(-4).padStart(4, '0');
const INST = 'eeeeeee0-0000-4e00-8000-00000000' + SUFFIX;
const OTHER_INST = 'eeeeeee0-0000-4e01-8000-00000000' + SUFFIX;
const STUDENT = 'eeeeeee1-0000-4e10-8000-00000000' + SUFFIX;
const REGISTRY = 'eeeeeee2-0000-4e20-8000-00000000' + SUFFIX;
const OTHER_REGISTRY = 'eeeeeee3-0000-4e30-8000-00000000' + SUFFIX;
const NEWCOMER = 'eeeeeee4-0000-4e40-8000-00000000' + SUFFIX;

function asSuper(sql: string): string {
  const dsn = process.env.CI_SUPERUSER_DSN ?? process.env.DATABASE_MIGRATION_URL;
  if (dsn) {
    return execFileSync('psql', [dsn, '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      encoding: 'utf8',
    }).trim();
  }
  return execFileSync(
    'sudo',
    ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

d('Member management (real PostgreSQL, real RLS, real humans)', () => {
  let prisma: PrismaService;
  let tenants: TenantContextService;
  let members: MembershipService;

  const registryCtx = { userId: REGISTRY, institutionId: INST };
  const studentCtx = { userId: STUDENT, institutionId: INST };
  const otherCtx = { userId: OTHER_REGISTRY, institutionId: OTHER_INST };

  const cfg = { get: (key: string) => ({})[key] } as never;

  beforeAll(async () => {
    const inst = (id: string, slug: string) =>
      `INSERT INTO institution (id, legal_name, display_name, slug, country_code, category, official_domain, representative_email, privacy_contact_email, status, created_at, updated_at)
       VALUES ('${id}', 'Members University ${RUN}', 'MU ${slug}', 'mu-${slug}-${RUN}', 'NG', 'university', 'mu.edu', 'r@mu.edu', 'p@mu.edu', 'verified', now(), now())`;
    const user = (id: string, email: string) =>
      `INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
       VALUES ('${id}', '${email}', 'x', '${email.split('@')[0]}', now(), now())`;
    const member = (userId: string, institutionId: string, role: string) =>
      `INSERT INTO membership (id, user_id, institution_id, role, status, created_at)
       VALUES (gen_random_uuid(), '${userId}', '${institutionId}', '${role}', 'active', now())`;

    asSuper(inst(INST, 'main'));
    asSuper(inst(OTHER_INST, 'other'));
    asSuper(user(STUDENT, `mem-student-${RUN}@mu.edu`));
    asSuper(user(REGISTRY, `mem-registry-${RUN}@mu.edu`));
    asSuper(user(OTHER_REGISTRY, `mem-other-registry-${RUN}@mu.edu`));
    asSuper(user(NEWCOMER, `mem-newcomer-${RUN}@mu.edu`));
    asSuper(member(STUDENT, INST, 'student'));
    asSuper(member(REGISTRY, INST, 'registry'));
    asSuper(member(OTHER_REGISTRY, OTHER_INST, 'registry'));

    prisma = new PrismaService();
    tenants = new TenantContextService(prisma);
    const audit = new AuditService(prisma, cfg);
    members = new MembershipService(
      prisma,
      tenants,
      audit,
      new PolicyService(cfg, prisma),
      new PolicyEngine(),
    );
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (!HAS_DB) return;
    asSuper(`DELETE FROM membership WHERE institution_id IN ('${INST}', '${OTHER_INST}')`);
    asSuper(`DELETE FROM institution WHERE id IN ('${INST}', '${OTHER_INST}')`);
    asSuper(
      `DELETE FROM user_account WHERE id IN ('${STUDENT}', '${REGISTRY}', '${OTHER_REGISTRY}', '${NEWCOMER}')`,
    );
  });

  it('the registry lists its own members only', async () => {
    const own = await tenants.run(registryCtx, () => members.list(INST, { limit: 50 }));
    expect(own.items.map((m) => m.email).sort()).toEqual(
      [`mem-registry-${RUN}@mu.edu`, `mem-student-${RUN}@mu.edu`].sort(),
    );

    // A foreign institution's roster is invisible (RLS).
    const foreign = await tenants.run(otherCtx, () => members.list(INST, { limit: 50 }));
    expect(foreign.items).toHaveLength(0);
  });

  it('role/status/q filters apply inside the tenant', async () => {
    const students = await tenants.run(registryCtx, () =>
      members.list(INST, { limit: 50, role: 'student', status: 'active' }),
    );
    expect(students.items).toHaveLength(1);
    expect(students.items[0].role).toBe('student');

    const search = await tenants.run(registryCtx, () =>
      members.list(INST, { limit: 50, q: 'registry' }),
    );
    expect(search.items).toHaveLength(1);
    expect(search.items[0].email).toContain('registry');
  });

  it('adding an existing account creates an active membership (audited)', async () => {
    const added = await tenants.run(registryCtx, () =>
      members.add(INST, REGISTRY, { email: `mem-newcomer-${RUN}@mu.edu`, role: 'librarian' }),
    );
    expect(added.status).toBe('active');
    expect(added.role).toBe('librarian');

    const audited = await prisma.auditEvent.count({
      where: { action: 'membership.created', subjectId: added.id },
    });
    expect(audited).toBe(1);
  });

  it('adding an active member again is a 409, not a duplicate row', async () => {
    await expect(
      tenants.run(registryCtx, () =>
        members.add(INST, REGISTRY, { email: `mem-newcomer-${RUN}@mu.edu`, role: 'librarian' }),
      ),
    ).rejects.toMatchObject({ status: 409 });

    const rows = await tenants.run(registryCtx, () => members.list(INST, { limit: 50, q: 'newcomer' }));
    expect(rows.items).toHaveLength(1);
  });

  it('adding an email with no ALIMS account is an actionable 404', async () => {
    await expect(
      tenants.run(registryCtx, () =>
        members.add(INST, REGISTRY, { email: `ghost-${RUN}@mu.edu`, role: 'student' }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a foreign registry cannot add to our institution (RLS)', async () => {
    await expect(
      tenants.run(otherCtx, () =>
        members.add(INST, OTHER_REGISTRY, { email: `mem-student-${RUN}@mu.edu`, role: 'supervisor' }),
      ),
    ).rejects.toThrow();
  });

  it('role change: self-modification refused (409), foreign member invisible (404)', async () => {
    const own = await tenants.run(registryCtx, () => members.list(INST, { limit: 50 }));
    const ownRow = own.items.find((m) => m.email.includes('registry'))!;

    await expect(
      tenants.run(registryCtx, () =>
        members.update(ownRow.id, REGISTRY, { role: 'inst_admin' }),
      ),
    ).rejects.toMatchObject({ status: 409 });

    // A member of THIS institution, addressed from a foreign tenant: 404.
    await expect(
      tenants.run(otherCtx, () => members.update(ownRow.id, OTHER_REGISTRY, { role: 'examiner' })),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a student cannot change roles (capability denied → 404)', async () => {
    const own = await tenants.run(registryCtx, () => members.list(INST, { limit: 50 }));
    const target = own.items.find((m) => m.email.includes('newcomer'))!;
    await expect(
      tenants.run(studentCtx, () => members.update(target.id, STUDENT, { role: 'examiner' })),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('the registry re-roles the librarian → examiner', async () => {
    const own = await tenants.run(registryCtx, () => members.list(INST, { limit: 50 }));
    const target = own.items.find((m) => m.email.includes('newcomer'))!;

    const updated = await tenants.run(registryCtx, () =>
      members.update(target.id, REGISTRY, { role: 'examiner' }),
    );
    expect(updated.role).toBe('examiner');
    expect(updated.status).toBe('active');

    const audited = await prisma.auditEvent.count({
      where: { action: 'membership.updated', subjectId: target.id },
    });
    expect(audited).toBe(1);
  });

  it('revocation keeps the row, is idempotent, and is audited', async () => {
    const own = await tenants.run(registryCtx, () => members.list(INST, { limit: 50 }));
    const target = own.items.find((m) => m.email.includes('newcomer'))!;

    await tenants.run(registryCtx, () => members.revoke(target.id, REGISTRY));
    await tenants.run(registryCtx, () => members.revoke(target.id, REGISTRY)); // idempotent

    const after = await tenants.run(registryCtx, () =>
      members.list(INST, { limit: 50, status: 'revoked' }),
    );
    const row = after.items.find((m) => m.id === target.id);
    expect(row).toBeTruthy();
    expect(row!.status).toBe('revoked');

    const audited = await prisma.auditEvent.count({
      where: { action: 'membership.revoked', subjectId: target.id },
    });
    expect(audited).toBe(1); // the idempotent second call wrote nothing
  });

  it('a revoked membership is terminal for updates (409)', async () => {
    const revoked = await tenants.run(registryCtx, () =>
      members.list(INST, { limit: 50, status: 'revoked' }),
    );
    const row = revoked.items.find((m) => m.email.includes('newcomer'))!;
    await expect(
      tenants.run(registryCtx, () => members.update(row.id, REGISTRY, { role: 'librarian' })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('re-adding a revoked member re-activates the same row with the new role', async () => {
    const readded = await tenants.run(registryCtx, () =>
      members.add(INST, REGISTRY, { email: `mem-newcomer-${RUN}@mu.edu`, role: 'dept_admin' }),
    );
    expect(readded.status).toBe('active');
    expect(readded.role).toBe('dept_admin');

    const all = await tenants.run(registryCtx, () => members.list(INST, { limit: 50, q: 'newcomer' }));
    expect(all.items).toHaveLength(1); // still exactly one row
  });

  it('bulk invite: per-item outcomes, no per-item failures', async () => {
    const result = await tenants.run(registryCtx, () =>
      members.bulkInvite(INST, REGISTRY, {
        invitations: [
          { email: `mem-student-${RUN}@mu.edu`, role: 'student' }, // already active
          { email: `ghost-${RUN}@mu.edu`, role: 'student' }, // no account
        ],
      }),
    );
    const byEmail = new Map(result.invitations.map((i) => [i.email, i.outcome]));
    expect(byEmail.get(`mem-student-${RUN}@mu.edu`)).toBe('already_member');
    expect(byEmail.get(`ghost-${RUN}@mu.edu`)).toBe('no_account');

    const audited = await prisma.auditEvent.count({
      where: { action: 'membership.bulk_invited', subjectId: INST },
    });
    expect(audited).toBe(1);
  });
});
