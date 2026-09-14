import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, SYSTEM_CONTEXT } from '../../apps/api/src/infrastructure/database/prisma.service';
import { TenantContextService } from '../../apps/api/src/interface/middleware/tenant-context.service';
import { RecordService } from '../../apps/api/src/modules/records/application/record.service';
import { PrismaRecordRepository } from '../../apps/api/src/modules/records/infrastructure/prisma-record.repository';

/**
 * Record persistence — executable proof that research records live in
 * PostgreSQL, not in process memory.
 *
 * Runs the REAL production stack: RecordService → PrismaRecordRepository →
 * PrismaService (application role, row-level security enforced) against the
 * migrated database. Ground truth is asserted over a privileged connection,
 * never over the same client being tested.
 *
 * Requires: migrations applied, DATABASE_URL pointing at the application
 * role. Skipped automatically when DATABASE_URL is not set.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const INST = `44444444-4444-4000-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const OWNER = `55555555-5555-4500-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
/** Isolated owner so pagination math is exact regardless of other tests. */
const PAGER = `66666666-6666-4600-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;

/** Privileged connection for seeding and ground truth (same contract as security.test.ts). */
function asSuper(sql: string): string {
  const dsn = process.env.CI_SUPERUSER_DSN ?? process.env.DATABASE_MIGRATION_URL;
  if (dsn) {
    return execFileSync('psql', [dsn, '-qtA', '-c', sql], { encoding: 'utf8' }).trim();
  }
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

const draftInput = (n: number) => ({
  outputType: 'thesis' as const,
  title: `Persistence proof ${n}: soil degradation monitoring ${RUN}`,
  institutionId: INST,
  disciplines: ['Agriculture'],
  keywords: ['persistence', 'proof'],
  accessLevel: 'metadata_public' as const,
  licence: 'CC-BY-4.0',
});

d('Record persistence (real PostgreSQL, real RLS)', () => {
  let prisma: PrismaService;
  let tenants: TenantContextService;
  let service: RecordService;
  /** Owner context — the authenticated depositor inside their institution. */
  const ownerCtx = { userId: OWNER, institutionId: INST };

  beforeAll(async () => {
    asSuper(`INSERT INTO institution (id, legal_name, display_name, slug, country_code, category, official_domain, representative_email, privacy_contact_email, created_at, updated_at)
             VALUES ('${INST}', 'Federal University of Testing', 'FU Test', 'fu-test-${RUN}', 'NG', 'university', 'fu-test.edu', 'r@fu-test.edu', 'p@fu-test.edu', now(), now())`);
    asSuper(`INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
             VALUES ('${OWNER}', 'owner-${RUN}@fu-test.edu', 'not-a-login', 'Persistence Owner', now(), now()),
                    ('${PAGER}', 'pager-${RUN}@fu-test.edu', 'not-a-login', 'Pagination Owner', now(), now())`);

    prisma = new PrismaService();
    tenants = new TenantContextService(prisma);
    service = new RecordService(new PrismaRecordRepository(prisma, tenants));
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (!HAS_DB) return;
    asSuper(`DELETE FROM research_record WHERE owner_user_id IN ('${OWNER}', '${PAGER}')`);
    asSuper(`DELETE FROM user_account WHERE id IN ('${OWNER}', '${PAGER}')`);
    asSuper(`DELETE FROM institution WHERE id = '${INST}'`);
  });

  it('a created draft is durable in the database, with provenance rows', async () => {
    const record = await tenants.run(ownerCtx, () => service.createDraft(OWNER, draftInput(1)));

    expect(record.status).toBe('draft');
    expect(record.id).toBeTruthy();

    // Ground truth over the privileged connection — not the client under test.
    const rows = asSuper(
      `SELECT count(*), max(title) FROM research_record WHERE id = '${record.id}' AND owner_user_id = '${OWNER}'`,
    );
    expect(rows).toBe('1|' + record.title);

    const provenance = asSuper(
      `SELECT count(*) FROM record_metadata_provenance WHERE record_id = '${record.id}'`,
    );
    expect(Number(provenance)).toBe(6);
  });

  it('the same record round-trips through findById under the owner context', async () => {
    const created = await tenants.run(ownerCtx, () => service.createDraft(OWNER, draftInput(2)));
    const fetched = await tenants.run(ownerCtx, () =>
      new PrismaRecordRepository(prisma, tenants).findById(created.id),
    );
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.keywords).toEqual(['persistence', 'proof']);
    expect(fetched?.metadataProvenance.map((p) => p.field)).toContain('outputType');
  });

  it('a draft is INVISIBLE without the owner/tenant context (RLS, not application filtering)', async () => {
    const created = await tenants.run(ownerCtx, () => service.createDraft(OWNER, draftInput(3)));

    // System context: no user, no tenant. The row-level security policy must
    // hide the draft — this is the database refusing, not a WHERE clause.
    const leaked = await tenants.run(SYSTEM_CONTEXT, () =>
      new PrismaRecordRepository(prisma, tenants).findById(created.id),
    );
    expect(leaked).toBeNull();
  });

  it('a draft edit is persisted (save path)', async () => {
    const created = await tenants.run(ownerCtx, () => service.createDraft(OWNER, draftInput(4)));
    created.title = 'Persistence proof 4 (revised): soil degradation monitoring';
    created.keywords = ['persistence', 'proof', 'revision'];
    await tenants.run(ownerCtx, () =>
      new PrismaRecordRepository(prisma, tenants).save(created),
    );

    const groundTruth = asSuper(
      `SELECT title, array_to_string(keywords, ',') FROM research_record WHERE id = '${created.id}'`,
    );
    expect(groundTruth).toBe(
      'Persistence proof 4 (revised): soil degradation monitoring|persistence,proof,revision',
    );
  });

  it('listByOwner pages deterministically with an opaque keyset cursor', async () => {
    const repo = new PrismaRecordRepository(prisma, tenants);
    const pagerCtx = { userId: PAGER, institutionId: INST };
    for (let i = 5; i <= 7; i += 1) {
      await tenants.run(pagerCtx, () => service.createDraft(PAGER, draftInput(i)));
    }

    const page1 = await tenants.run(pagerCtx, () => repo.listByOwner(PAGER, { limit: 2 }));
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toMatch(/^[0-9TZ:.-]+\|[0-9a-f-]{36}$/);

    const page2 = await tenants.run(pagerCtx, () =>
      repo.listByOwner(PAGER, { limit: 2, cursor: page1.nextCursor }),
    );
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);

    // No overlaps between pages, everything owned, newest first.
    const ids = [...page1.items, ...page2.items].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
    for (const item of [...page1.items, ...page2.items]) {
      expect(item.ownerUserId).toBe(PAGER);
    }
  });
});
