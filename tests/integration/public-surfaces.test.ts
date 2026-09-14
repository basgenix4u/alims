import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FORBIDDEN_PUBLIC_FIELDS } from '../../packages/contracts/src/certificate';
import { PrismaService } from '../../apps/api/src/infrastructure/database/prisma.service';
import { PublicService } from '../../apps/api/src/modules/public/public.service';

/**
 * Public surfaces — executable proof of the narrow-projection guarantees
 * (api_specification.md §8, §13; PRD §6.4, §6.10, §11.4).
 *
 * Runs the real service against a real PostgreSQL with row-level security
 * live and NO tenant context — exactly what an anonymous visitor gets:
 *
 *   - only public, verified/published records are reachable at all
 *   - embargoed records appear with status 'embargoed' and NO excerpt
 *   - the projections carry none of the forbidden fields
 *   - unknown verification tokens return not_found without leaking existence
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const INST = 'ccccccc0-0000-4c00-8000-000000000001';
const OWNER = 'ccccccc1-0000-4c10-8000-000000000001';
const REC_PUBLIC = 'ccccccc2-0000-4c20-8000-000000000001';
const REC_EMBARGO = 'ccccccc2-0000-4c20-8000-000000000002';
const REC_EXTRA = 'ccccccc2-0000-4c20-8000-000000000003';
const REC_PRIVATE = 'ccccccc2-0000-4c20-8000-000000000004';
const NXR_PUBLIC = `NXR-2026-PUB-${String(RUN).slice(-6)}`;
const NXR_EMBARGO = `NXR-2026-EMB-${String(RUN).slice(-6)}`;

function asSuper(sql: string): string {
  const dsn = process.env.CI_SUPERUSER_DSN ?? process.env.DATABASE_MIGRATION_URL;
  if (dsn) {
    return execFileSync('psql', [dsn, '-qtA', '-c', sql], { encoding: 'utf8' }).trim();
  }
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

d('Public surfaces (real PostgreSQL, real RLS, anonymous context)', () => {
  let prisma: PrismaService;
  let service: PublicService;

  beforeAll(async () => {
    asSuper(`INSERT INTO institution (id, legal_name, display_name, slug, country_code, category, official_domain, representative_email, privacy_contact_email, status, created_at, updated_at)
             VALUES ('${INST}', 'Public Test University', 'PTU', 'ptu-${RUN}', 'NG', 'university', 'ptu.edu', 'r@ptu.edu', 'p@ptu.edu', 'verified', now(), now())`);
    asSuper(`INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
             VALUES ('${OWNER}', 'owner-${RUN}@ptu.edu', 'x', 'Public Owner', now(), now())`);

    const record = (id: string, nxr: string | null, access: string, status: string, embargo: string | null, title: string) =>
      `INSERT INTO research_record (id, nxr_id, institution_id, owner_user_id, output_type, title, abstract, disciplines, keywords, access_level, licence, status, verification_level, embargo_until, created_at, updated_at)
       VALUES ('${id}', ${nxr ? `'${nxr}'` : 'NULL'}, '${INST}', '${OWNER}', 'thesis', '${title}',
               'An abstract with searchable terms about soil science for the public record.', ARRAY['Agriculture'], ARRAY['soil'], '${access}', 'CC-BY-4.0', '${status}', '${status === 'published' ? 'institutionally_verified' : 'draft'}', ${embargo}, now(), now())`;

    asSuper(record(REC_PUBLIC, NXR_PUBLIC, 'full_public', 'published', 'NULL', `Public Deposit ${RUN}`));
    asSuper(record(REC_EMBARGO, NXR_EMBARGO, 'full_public', 'published', "now() + interval '90 days'", `Embargoed Deposit ${RUN}`));
    asSuper(record(REC_EXTRA, null, 'full_public', 'published', 'NULL', `Second Public Deposit ${RUN}`));
    asSuper(record(REC_PRIVATE, null, 'metadata_public', 'draft', 'NULL', `Private Draft ${RUN}`));

    prisma = new PrismaService();
    service = new PublicService(prisma);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (!HAS_DB) return;
    asSuper(`DELETE FROM research_record WHERE id IN ('${REC_PUBLIC}', '${REC_EMBARGO}', '${REC_EXTRA}', '${REC_PRIVATE}')`);
    asSuper(`DELETE FROM user_account WHERE id = '${OWNER}'`);
    asSuper(`DELETE FROM institution WHERE id = '${INST}'`);
  });

  it('search reaches only public, published records — drafts are invisible', async () => {
    const page = await service.search({ limit: 100 } as never);
    const titles = page.data.map((r) => r.title);
    expect(titles).toContain(`Public Deposit ${RUN}`);
    expect(titles).toContain(`Embargoed Deposit ${RUN}`);
    expect(titles.some((t) => t.includes('Private Draft'))).toBe(false);
  });

  it('an embargoed record surfaces as embargoed with NO excerpt; open records carry one', async () => {
    const page = await service.search({ limit: 100 } as never);
    const embargoed = page.data.find((r) => r.title.includes('Embargoed'));
    const open = page.data.find((r) => r.title.includes('Public Deposit'));

    expect(embargoed?.accessStatus).toBe('embargoed');
    expect(embargoed?.abstractExcerpt).toBeNull();
    expect(embargoed?.embargoUntil).toBeTruthy();

    expect(open?.accessStatus).toBe('open');
    expect(open?.abstractExcerpt).toContain('soil science');
  });

  it('search projections carry none of the forbidden fields', async () => {
    const page = await service.search({ limit: 100 } as never);
    for (const row of page.data) {
      const keys = Object.keys(row);
      for (const forbidden of FORBIDDEN_PUBLIC_FIELDS) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });

  it('filters narrow results (query, outputType, year, discipline)', async () => {
    // Substring semantics: 'Second' isolates one record; 'soil science'
    // (abstract text) reaches every seeded public record.
    const byQuery = await service.search({ limit: 100, q: 'Second' } as never);
    expect(byQuery.data).toHaveLength(1);
    expect(byQuery.data[0]?.title).toContain('Second Public Deposit');
    expect(byQuery.data[0]?.title).not.toContain('Embargoed');

    const byType = await service.search({ limit: 100, outputType: 'dataset' } as never);
    expect(byType.data).toHaveLength(0);

    const byDiscipline = await service.search({ limit: 100, discipline: 'Agriculture' } as never);
    expect(byDiscipline.data.length).toBeGreaterThanOrEqual(2);
  });

  it('search paginates with an opaque cursor', async () => {
    const page1 = await service.search({ limit: 1 } as never);
    expect(page1.data).toHaveLength(1);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await service.search({ limit: 100, cursor: page1.pagination.nextCursor } as never);
    expect(page2.data.some((r) => r.id !== page1.data[0]?.nxrId)).toBe(true);
  });

  it('record detail by NXR id returns the narrow projection only', async () => {
    const detail = await service.recordByNxrId(NXR_PUBLIC);
    expect(detail?.title).toContain('Public Deposit');
    expect(detail?.abstract).toContain('soil science');
    expect(detail?.keywords).toEqual(['soil']);

    const keys = new Set(Object.keys(detail ?? {}));
    for (const forbidden of FORBIDDEN_PUBLIC_FIELDS) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it('unknown NXR ids and unpublished records return null (no existence leak)', async () => {
    expect(await service.recordByNxrId('NXR-2026-DOES-NOT-EXIST')).toBeNull();
    // The private draft has no nxrId at all — and would be invisible anyway.
    const page = await service.search({ limit: 100 } as never);
    expect(page.data.some((r) => r.title.includes('Private Draft'))).toBe(false);
  });

  it('verification of an unknown QR token returns not_found with the honest disclaimer', async () => {
    const result = await service.verify('not-a-real-token');
    expect(result.status).toBe('not_found');
    expect(result.disclaimer).toContain('Not a legal determination');
    // Positive-path verification proof lands with certificate issuance
    // (workflow engine); the query here runs the real table.
  });
});
