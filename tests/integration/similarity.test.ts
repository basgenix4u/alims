import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../../apps/api/src/infrastructure/audit/audit.service';
import { PrismaService } from '../../apps/api/src/infrastructure/database/prisma.service';
import { PolicyEngine } from '../../apps/api/src/domain/policy/policy-engine';
import { PolicyService } from '../../apps/api/src/domain/policy/policy.service';
import { RecordService } from '../../apps/api/src/modules/records/application/record.service';
import { PrismaRecordRepository } from '../../apps/api/src/modules/records/infrastructure/prisma-record.repository';
import { DepositService } from '../../apps/api/src/modules/deposits/application/deposit.service';
import { LocalStorage } from '../../apps/api/src/infrastructure/storage/local-storage.service';
import { TenantContextService } from '../../apps/api/src/interface/middleware/tenant-context.service';
import { SimilarityService } from '../../apps/api/src/modules/similarity/application/similarity.service';

/**
 * The similarity subsystem against a real PostgreSQL with row-level
 * security live (api_specification.md §7, PRD §6.5, ADR-004):
 *
 *   - assessments are private to authorised roles — the owner gets 404,
 *     a foreign-institution reviewer gets 404;
 *   - GET materialises the truthful initial state (not_requested);
 *   - a review appends an attributed human decision with a reason;
 *   - THE INVARIANT: a review — even outcome `escalated` — writes
 *     nothing outside the similarity subsystem. Record status, version
 *     state and certificates are untouched.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const INST = 'ddddddd0-0000-4d00-8000-00000000' + String(RUN).slice(-4).padStart(4, '0');
const OTHER_INST = 'ddddddd0-0000-4d01-8000-00000000' + String(RUN).slice(-4).padStart(4, '0');
const STUDENT = 'ddddddd1-0000-4d10-8000-00000000' + String(RUN).slice(-4).padStart(4, '0');
const SUPERVISOR = 'ddddddd2-0000-4d20-8000-00000000' + String(RUN).slice(-4).padStart(4, '0');
const OUTSIDER_EXAMINER = 'ddddddd3-0000-4d30-8000-00000000' + String(RUN).slice(-4).padStart(4, '0');

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

d('Similarity assessment (real PostgreSQL, real RLS, real humans)', () => {
  let prisma: PrismaService;
  let tenants: TenantContextService;
  let records: RecordService;
  let deposits: DepositService;
  let similarity: SimilarityService;

  const studentCtx = { userId: STUDENT, institutionId: INST };
  const supervisorCtx = { userId: SUPERVISOR, institutionId: INST };
  const outsiderCtx = { userId: OUTSIDER_EXAMINER, institutionId: OTHER_INST };

  const cfg = { get: (key: string) => ({})[key] } as never;
  const CFG_VALUES: Record<string, string> = {};

  beforeAll(async () => {
    const inst = (id: string, slug: string) =>
      `INSERT INTO institution (id, legal_name, display_name, slug, country_code, category, official_domain, representative_email, privacy_contact_email, status, created_at, updated_at)
       VALUES ('${id}', 'Similarity University ${RUN}', 'SU ${slug}', 'su-${slug}-${RUN}', 'NG', 'university', 'su.edu', 'r@su.edu', 'p@su.edu', 'verified', now(), now())`;
    const user = (id: string, email: string) =>
      `INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
       VALUES ('${id}', '${email}', 'x', '${email.split('@')[0]}', now(), now())`;
    const member = (userId: string, institutionId: string, role: string) =>
      `INSERT INTO membership (id, user_id, institution_id, role, status, created_at)
       VALUES (gen_random_uuid(), '${userId}', '${institutionId}', '${role}', 'active', now())`;

    asSuper(inst(INST, 'main'));
    asSuper(inst(OTHER_INST, 'other'));
    asSuper(user(STUDENT, `sim-student-${RUN}@su.edu`));
    asSuper(user(SUPERVISOR, `sim-supervisor-${RUN}@su.edu`));
    asSuper(user(OUTSIDER_EXAMINER, `sim-outsider-${RUN}@su.edu`));
    asSuper(member(STUDENT, INST, 'student'));
    asSuper(member(SUPERVISOR, INST, 'supervisor'));
    asSuper(member(OUTSIDER_EXAMINER, OTHER_INST, 'examiner'));

    Object.assign(CFG_VALUES, {
      STORAGE_ROOT: '/tmp/alims-similarity-test',
      UPLOAD_TOKEN_SECRET: 'integration-upload-secret-000000000',
      UPLOAD_MIME_ALLOWLIST: 'application/pdf,text/plain',
      UPLOAD_MAX_FILE_MB: '5',
      UPLOAD_PART_SIZE_MB: '1',
      AUDIT_HASH_SALT: 'integration-audit-salt-0000000000000',
      PLATFORM_ADMIN_USER_IDS: '',
    });
    (cfg as { get: (k: string) => string }).get = (key) => CFG_VALUES[key];

    prisma = new PrismaService();
    tenants = new TenantContextService(prisma);
    const audit = new AuditService(prisma, cfg);
    records = new RecordService(new PrismaRecordRepository(prisma, tenants));
    deposits = new DepositService(
      prisma,
      tenants,
      audit,
      new LocalStorage(cfg),
      cfg,
      new PolicyService(cfg, prisma),
      new PolicyEngine(),
    );
    similarity = new SimilarityService(
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
    asSuper(
      `DELETE FROM integrity_review WHERE assessment_id IN (
         SELECT sa.id FROM similarity_assessment sa
         JOIN record_version v ON v.id = sa.version_id
         JOIN research_record r ON r.id = v.record_id
         WHERE r.owner_user_id = '${STUDENT}')`,
    );
    asSuper(
      `DELETE FROM similarity_assessment WHERE version_id IN (
         SELECT v.id FROM record_version v
         JOIN research_record r ON r.id = v.record_id
         WHERE r.owner_user_id = '${STUDENT}')`,
    );
    asSuper(
      `DELETE FROM research_record WHERE owner_user_id = '${STUDENT}'`,
    );
    asSuper(`DELETE FROM institution WHERE id IN ('${INST}', '${OTHER_INST}')`);
    asSuper(
      `DELETE FROM user_account WHERE id IN ('${STUDENT}', '${SUPERVISOR}', '${OUTSIDER_EXAMINER}')`,
    );
  });

  let recordId: string;
  let versionId: string;

  it('a version exists on the student\u2019s record', async () => {
    const record = await tenants.run(studentCtx, () =>
      records.createDraft(STUDENT, {
        outputType: 'thesis',
        title: `Similarity Journey ${RUN}`,
        institutionId: INST,
        abstract: 'An abstract of at least one hundred characters for the similarity journey test, padded to satisfy the contract minimum length.',
        disciplines: ['Computer Science'],
        keywords: ['similarity'],
        accessLevel: 'metadata_public',
        licence: 'CC-BY-4.0',
      }),
    );
    recordId = record.id;
    const version = await tenants.run(studentCtx, () =>
      deposits.createVersion(recordId, STUDENT, { changeSummary: 'Initial deposit for similarity.' }),
    );
    versionId = version.id;
    expect(versionId).toBeTruthy();
  });

  it('GET by an authorised reviewer materialises the truthful initial state', async () => {
    const assessment = await tenants.run(supervisorCtx, () =>
      similarity.getAssessment(recordId, versionId, SUPERVISOR),
    );
    expect(assessment.status).toBe('not_requested');
    expect(assessment.provider).toBe('none');
    expect(assessment.score).toBeNull();
    // The exact spec sentence — pinned literally on purpose.
    expect(assessment.advisoryNotice).toBe('Review signal only. Not a finding of misconduct.');
    expect(assessment.versionId).toBe(versionId);
  });

  it('the owner (student) gets 404 — results are private to authorised roles', async () => {
    await expect(
      tenants.run(studentCtx, () => similarity.getAssessment(recordId, versionId, STUDENT)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a reviewer from another institution gets 404 — RLS hides the version', async () => {
    await expect(
      tenants.run(outsiderCtx, () => similarity.getAssessment(recordId, versionId, OUTSIDER_EXAMINER)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a mismatched record/version pair is 404, not a leak', async () => {
    await expect(
      tenants.run(supervisorCtx, () =>
        similarity.getAssessment('00000000-0000-4000-8000-000000000000', versionId, SUPERVISOR),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('THE INVARIANT: an escalated review writes nothing outside the subsystem', async () => {
    // Verification reads run in the supervisor's tenant context — RLS must
    // actually SEE the rows for these assertions to mean anything.
    const before = await prisma.withTenant(supervisorCtx, (tx) =>
      tx.researchRecord.findUnique({
        where: { id: recordId },
        select: { status: true, updatedAt: true },
      }),
    );
    const versionBefore = await prisma.withTenant(supervisorCtx, (tx) =>
      tx.recordVersion.findUnique({ where: { id: versionId }, select: { state: true } }),
    );

    const reviewed = await tenants.run(supervisorCtx, () =>
      similarity.reviewAssessment(recordId, versionId, SUPERVISOR, {
        outcome: 'escalated',
        reason: 'Substantial unattributed overlap with an earlier registered record; referring to the institutional process.',
      }),
    );
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.advisoryNotice).toBe('Review signal only. Not a finding of misconduct.');

    const after = await prisma.withTenant(supervisorCtx, (tx) =>
      tx.researchRecord.findUnique({
        where: { id: recordId },
        select: { status: true, updatedAt: true },
      }),
    );
    const versionAfter = await prisma.withTenant(supervisorCtx, (tx) =>
      tx.recordVersion.findUnique({ where: { id: versionId }, select: { state: true } }),
    );

    // No status write, no version-state write, no certificate.
    expect(after?.status).toBe(before?.status);
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
    expect(versionAfter?.state).toBe(versionBefore?.state);
    const certificates = await prisma.withTenant(supervisorCtx, (tx) =>
      tx.certificate.count({ where: { recordId } }),
    );
    expect(certificates).toBe(0);
  });

  it('the review is appended, attributed and reasoned — a second decision accumulates', async () => {
    await tenants.run(supervisorCtx, () =>
      similarity.reviewAssessment(recordId, versionId, SUPERVISOR, {
        outcome: 'inconclusive',
        reason: 'Provider report never completed; the signal cannot be interpreted either way.',
      }),
    );

    const rows = await prisma.withTenant(supervisorCtx, (tx) =>
      tx.integrityReview.findMany({
        where: { assessment: { versionId } },
        select: { reviewerUserId: true, outcome: true, reason: true },
        orderBy: { decidedAt: 'asc' },
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.reviewerUserId === SUPERVISOR)).toBe(true);
    expect(rows.map((r) => r.outcome)).toEqual(['escalated', 'inconclusive']);
    expect(rows[0]?.reason).toContain('institutional process');

    // The audit trail carries the human decisions.
    const audited = await prisma.withTenant(supervisorCtx, (tx) =>
      tx.auditEvent.count({ where: { action: 'similarity.reviewed', subjectId: versionId } }),
    );
    expect(audited).toBe(2);
  });

  it('the owner cannot record a review either (404)', async () => {
    await expect(
      tenants.run(studentCtx, () =>
        similarity.reviewAssessment(recordId, versionId, STUDENT, {
          outcome: 'no_issue',
          reason: 'The student should not be able to close their own review.',
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
