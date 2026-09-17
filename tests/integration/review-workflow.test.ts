import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../../apps/api/src/infrastructure/audit/audit.service';
import { PrismaService, SYSTEM_CONTEXT } from '../../apps/api/src/infrastructure/database/prisma.service';
import { LocalStorage } from '../../apps/api/src/infrastructure/storage/local-storage.service';
import { PolicyEngine } from '../../apps/api/src/domain/policy/policy-engine';
import { PolicyService } from '../../apps/api/src/domain/policy/policy.service';
import { RecordService } from '../../apps/api/src/modules/records/application/record.service';
import { PrismaRecordRepository } from '../../apps/api/src/modules/records/infrastructure/prisma-record.repository';
import { DepositService } from '../../apps/api/src/modules/deposits/application/deposit.service';
import { TenantContextService } from '../../apps/api/src/interface/middleware/tenant-context.service';
import { WorkflowService } from '../../apps/api/src/modules/workflow/application/workflow.service';

/**
 * The review journey — executable proof against a real PostgreSQL with
 * row-level security live (api_specification.md §7, PRD §7.1):
 *
 *   deposit → submit → supervisor task → approve → registry stage
 *   → verification (step-up protected at the route; capability here)
 *   → institutionally_verified + NXR minted + version sealed.
 *
 *   …and the return path: returned_for_revision → NEW version required
 *   → resubmit → approve → verify.
 *
 *   Plus the guard rails: only the assignee decides, only registry/examiner
 *   verifies, an unverified institution can never confer institutional
 *   verification, and a sealed version is immutable at the DATABASE level.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const INST = `eeeeeee0-0000-4e00-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const PENDING_INST = `eeeeeee0-0000-4e01-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const STUDENT = `eeeeeee1-0000-4e10-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const SUPERVISOR = `eeeeeee2-0000-4e20-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const REGISTRY = `eeeeeee3-0000-4e30-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const OUTSIDER = `eeeeeee4-0000-4e40-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const PENDING_REG = `eeeeeee5-0000-4e50-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;

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

d('Review workflow (real PostgreSQL, real RLS, real humans)', () => {
  let prisma: PrismaService;
  let tenants: TenantContextService;
  let workflow: WorkflowService;
  let deposits: DepositService;
  let records: RecordService;
  let storageRoot: string;

  const studentCtx = { userId: STUDENT, institutionId: INST };
  const supervisorCtx = { userId: SUPERVISOR, institutionId: INST };
  const registryCtx = { userId: REGISTRY, institutionId: INST };

  const cfg = { get: (key: string) => ({})[key] } as never;
  const CFG_VALUES: Record<string, string> = {};

  beforeAll(async () => {
    const inst = (id: string, slug: string, status: string) =>
      `INSERT INTO institution (id, legal_name, display_name, slug, country_code, category, official_domain, representative_email, privacy_contact_email, status, created_at, updated_at)
       VALUES ('${id}', 'Journey University ${RUN}', 'JU ${slug}', 'ju-${slug}-${RUN}', 'NG', 'university', 'ju.edu', 'r@ju.edu', 'p@ju.edu', '${status}', now(), now())`;
    const user = (id: string, email: string) =>
      `INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
       VALUES ('${id}', '${email}', 'x', '${email.split('@')[0]}', now(), now())`;
    const member = (userId: string, institutionId: string, role: string) =>
      `INSERT INTO membership (id, user_id, institution_id, role, status, created_at)
       VALUES (gen_random_uuid(), '${userId}', '${institutionId}', '${role}', 'active', now())`;

    asSuper(inst(INST, 'main', 'verified'));
    asSuper(inst(PENDING_INST, 'pending', 'pending_verification'));
    asSuper(user(STUDENT, `student-${RUN}@ju.edu`));
    asSuper(user(SUPERVISOR, `supervisor-${RUN}@ju.edu`));
    asSuper(user(REGISTRY, `registry-${RUN}@ju.edu`));
    asSuper(user(OUTSIDER, `outsider-${RUN}@ju.edu`));
    asSuper(user(PENDING_REG, `preg-${RUN}@ju.edu`));
    asSuper(member(STUDENT, INST, 'student'));
    asSuper(member(SUPERVISOR, INST, 'supervisor'));
    asSuper(member(REGISTRY, INST, 'registry'));
    asSuper(member(PENDING_REG, PENDING_INST, 'registry'));

    storageRoot = await mkdtemp(join(tmpdir(), 'alims-workflow-'));
    Object.assign(CFG_VALUES, {
      STORAGE_ROOT: storageRoot,
      UPLOAD_TOKEN_SECRET: 'integration-upload-secret-000000000',
      UPLOAD_MIME_ALLOWLIST: 'application/pdf,text/plain',
      UPLOAD_MAX_FILE_MB: '5',
      UPLOAD_PART_SIZE_MB: '1',
      AUDIT_HASH_SALT: 'integration-audit-salt-0000000000000',
      PLATFORM_ADMIN_USER_IDS: '',
    });
    (cfg as { get: (k: string) => string }).get = (key: string) => CFG_VALUES[key];

    prisma = new PrismaService();
    tenants = new TenantContextService(prisma);
    const localStorage = new LocalStorage(cfg);
    const audit = new AuditService(prisma, cfg);
    records = new RecordService(new PrismaRecordRepository(prisma, tenants));
    deposits = new DepositService(
      prisma,
      tenants,
      audit,
      localStorage,
      cfg,
      new PolicyService(cfg, prisma),
      new PolicyEngine(),
    );
    workflow = new WorkflowService(
      prisma,
      tenants,
      audit,
      records,
      new PolicyService(cfg, prisma),
      new PolicyEngine(),
    );
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (!HAS_DB) return;
    // Verified records carry database-sealed versions; the same trigger that
    // proves immutability refuses their deletion. Teardown suspends it
    // briefly as the migration owner, then restores it.
    asSuper('ALTER TABLE review_decision DISABLE TRIGGER trg_review_decision_append_only');
    asSuper('ALTER TABLE record_version DISABLE TRIGGER trg_record_version_immutable');
    asSuper(
      `DELETE FROM review_decision WHERE version_id IN (
         SELECT v.id FROM record_version v
         JOIN research_record r ON r.id = v.record_id
         WHERE r.owner_user_id = '${STUDENT}')`,
    );
    asSuper(
      `DELETE FROM workflow_instance WHERE record_id IN (
         SELECT id FROM research_record WHERE owner_user_id = '${STUDENT}')`,
    );
    asSuper(`DELETE FROM research_record WHERE owner_user_id = '${STUDENT}'`);
    asSuper('ALTER TABLE record_version ENABLE TRIGGER trg_record_version_immutable');
    asSuper('ALTER TABLE review_decision ENABLE TRIGGER trg_review_decision_append_only');
    asSuper(`DELETE FROM institution WHERE id IN ('${INST}', '${PENDING_INST}')`);
    asSuper(
      `DELETE FROM user_account WHERE id IN ('${STUDENT}','${SUPERVISOR}','${REGISTRY}','${OUTSIDER}','${PENDING_REG}')`,
    );
  });

  /** Full deposit of one file-backed version onto a record. */
  async function depositVersion(recordId: string, payload: string, summary: string) {
    const version = await tenants.run(studentCtx, () =>
      deposits.createVersion(recordId, STUDENT, { changeSummary: summary }),
    );
    const init = await tenants.run(studentCtx, () =>
      deposits.initUpload(STUDENT, {
        versionId: version.id,
        fileName: 'thesis.pdf',
        fileSize: Buffer.byteLength(payload),
        mimeType: 'application/pdf',
      }),
    );
    const declared: Array<{ partNumber: number; etag: string }> = [];
    for (const part of init.parts) {
      const body = payload.slice(
        (part.partNumber - 1) * init.partSizeBytes,
        part.partNumber * init.partSizeBytes,
      );
      const token = new URL(`http://x${part.url}`).searchParams.get('token')!;
      const { etag } = await tenants.run(studentCtx, () =>
        deposits.putPart(init.uploadId, part.partNumber, token, Readable.from([body])),
      );
      declared.push({ partNumber: part.partNumber, etag });
    }
    await tenants.run(studentCtx, () =>
      deposits.completeUpload(STUDENT, init.uploadId, declared),
    );
    return version;
  }

  let journeyRecordId: string;

  it('the student deposits and submits — the supervisor receives the task', async () => {
    const record = await tenants.run(studentCtx, () =>
      records.createDraft(STUDENT, {
        outputType: 'thesis',
        title: `Review Journey ${RUN}`,
        institutionId: INST,
        abstract: 'An abstract of at least one hundred characters for the review journey test, padded to satisfy the contract minimum length.',
        disciplines: ['Agriculture'],
        keywords: ['review'],
        accessLevel: 'metadata_public',
        licence: 'CC-BY-4.0',
      }),
    );
    journeyRecordId = record.id;
    await depositVersion(
      journeyRecordId,
      'journey-thesis-bytes-',
      'Initial submission for review.',
    );

    const submitted = await tenants.run(studentCtx, () =>
      workflow.submitRecord(journeyRecordId, STUDENT),
    );
    expect(submitted.taskId).toBeTruthy();

    const status = asSuper(
      `SELECT status FROM research_record WHERE id = '${journeyRecordId}'`,
    );
    expect(status).toBe('submitted');

    const queue = await tenants.run(supervisorCtx, () =>
      workflow.listTasks(SUPERVISOR, { limit: 10 } as never),
    );
    const task = queue.data.find((t) => t.recordId === journeyRecordId);
    expect(task).toBeDefined();
    expect(task!.stage).toBe('supervisor-review');
    expect(task!.status).toBe('pending');
    expect(task!.recordTitle).toContain('Review Journey');
  });

  it('submission is blocked without a deposited file', async () => {
    const record = await tenants.run(studentCtx, () =>
      records.createDraft(STUDENT, {
        outputType: 'article',
        title: `No File ${RUN}`,
        institutionId: INST,
        abstract: 'Another abstract of at least one hundred characters for completeness, padded to satisfy the contract minimum length.',
        disciplines: ['Agriculture'],
        keywords: ['nofile'],
        accessLevel: 'metadata_public',
        licence: 'CC-BY-4.0',
      }),
    );
    await expect(
      tenants.run(studentCtx, () => workflow.submitRecord(record.id, STUDENT)),
    ).rejects.toThrow('Deposit a file version');
  });

  it('the supervisor approves — the registry stage opens', async () => {
    const queue = await tenants.run(supervisorCtx, () =>
      workflow.listTasks(SUPERVISOR, { limit: 10 } as never),
    );
    const task = queue.data.find((t) => t.recordId === journeyRecordId)!;

    const detail = await tenants.run(supervisorCtx, () =>
      workflow.taskDetail(SUPERVISOR, task.id),
    );
    expect(detail.priorDecisions).toHaveLength(0);
    expect(detail.changeSummary).toContain('Initial submission');

    const result = await tenants.run(supervisorCtx, () =>
      workflow.decideTask(SUPERVISOR, task.id, { decision: 'approve' }),
    );
    expect(result.recordStatus).toBe('in_review');
    expect(result.nextStage).toBe('registry-verification');
  });

  it('a plain task decision can NEVER complete verification (step-up path only)', async () => {
    const queue = await tenants.run(registryCtx, () =>
      workflow.listTasks(REGISTRY, { limit: 10 } as never),
    );
    const task = queue.data.find((t) => t.recordId === journeyRecordId)!;
    expect(task.stage).toBe('registry-verification');

    await expect(
      tenants.run(registryCtx, () =>
        workflow.decideTask(REGISTRY, task.id, { decision: 'approve' }),
      ),
    ).rejects.toThrow('verification');
  });

  it('verification confers status, mints the NXR id, seals the version', async () => {
    const queue = await tenants.run(registryCtx, () =>
      workflow.listTasks(REGISTRY, { limit: 10 } as never),
    );
    const task = queue.data.find((t) => t.recordId === journeyRecordId)!;

    const result = await tenants.run(registryCtx, () =>
      workflow.verifyRecord(journeyRecordId, REGISTRY, task.versionId),
    );

    expect(result.recordStatus).toBe('institutionally_verified');
    expect(result.nxrId).toMatch(/^NXR-\d{4}-\d{6}$/);

    const row = asSuper(
      `SELECT r.status, r.verification_level, r.nxr_id, v.state, v.is_immutable
       FROM research_record r JOIN record_version v ON v.id = '${task.versionId}'
       WHERE r.id = '${journeyRecordId}'`,
    );
    // The version stays sealed as submitted — historical fact (PRD §6.3);
    // verification binds via the decision row, not by mutating the version.
    expect(row).toBe(
      'institutionally_verified|institutionally_verified|' + result.nxrId + '|submitted|t',
    );

    // The workflow instance is complete; the human decision is on record.
    const decisions = asSuper(
      `SELECT count(*) FROM review_decision WHERE version_id = '${task.versionId}'`,
    );
    expect(Number(decisions)).toBeGreaterThanOrEqual(1);
  });

  it('a sealed version is immutable at the DATABASE level (PRD §6.3)', () => {
    expect(() =>
      asSuper(
        `UPDATE record_version SET change_summary = 'tampered' WHERE record_id = '${journeyRecordId}' AND is_immutable = true`,
      ),
    ).toThrow();
  });

  it('the return path: returned work requires a NEW version to progress', async () => {
    const record = await tenants.run(studentCtx, () =>
      records.createDraft(STUDENT, {
        outputType: 'thesis',
        title: `Return Path ${RUN}`,
        institutionId: INST,
        abstract: 'A third abstract of at least one hundred characters for the return path, padded to satisfy the contract minimum length.',
        disciplines: ['Agriculture'],
        keywords: ['return'],
        accessLevel: 'metadata_public',
        licence: 'CC-BY-4.0',
      }),
    );
    await depositVersion(record.id, 'return-path-v1-bytes-', 'First attempt.');
    await tenants.run(studentCtx, () => workflow.submitRecord(record.id, STUDENT));

    let queue = await tenants.run(supervisorCtx, () =>
      workflow.listTasks(SUPERVISOR, { limit: 10 } as never),
    );
    let task = queue.data.find((t) => t.recordId === record.id)!;
    const returned = await tenants.run(supervisorCtx, () =>
      workflow.decideTask(SUPERVISOR, task.id, {
        decision: 'return_for_revision',
        comment: 'The results chapter must state the sample size.',
        requiredActions: ['State the sample size'],
      }),
    );
    expect(returned.recordStatus).toBe('returned_for_revision');

    // Resubmitting the SAME returned version is refused.
    await expect(
      tenants.run(studentCtx, () => workflow.submitRecord(record.id, STUDENT)),
    ).rejects.toThrow('new version');

    // A fresh version unlocks resubmission; the cycle completes.
    await depositVersion(record.id, 'return-path-v2-bytes-', 'Revised with sample size.');
    await tenants.run(studentCtx, () => workflow.submitRecord(record.id, STUDENT));
    const status = asSuper(`SELECT status FROM research_record WHERE id = '${record.id}'`);
    expect(status).toBe('resubmitted');

    queue = await tenants.run(supervisorCtx, () =>
      workflow.listTasks(SUPERVISOR, { limit: 10 } as never),
    );
    task = queue.data.find((t) => t.recordId === record.id && t.status === 'pending')!;
    await tenants.run(supervisorCtx, () =>
      workflow.decideTask(SUPERVISOR, task.id, { decision: 'approve' }),
    );
    queue = await tenants.run(registryCtx, () =>
      workflow.listTasks(REGISTRY, { limit: 10 } as never),
    );
    const finalTask = queue.data.find((t) => t.recordId === record.id)!;
    const verified = await tenants.run(registryCtx, () =>
      workflow.verifyRecord(record.id, REGISTRY, finalTask.versionId),
    );
    expect(verified.recordStatus).toBe('institutionally_verified');
  });

  it('only the assigned reviewer can decide — anyone else gets 404', async () => {
    const record = await tenants.run(studentCtx, () =>
      records.createDraft(STUDENT, {
        outputType: 'article',
        title: `Guards ${RUN}`,
        institutionId: INST,
        abstract: 'A fourth abstract of at least one hundred characters for the guards, padded to satisfy the contract minimum length.',
        disciplines: ['Agriculture'],
        keywords: ['guards'],
        accessLevel: 'metadata_public',
        licence: 'CC-BY-4.0',
      }),
    );
    await depositVersion(record.id, 'guards-bytes-', 'Guard check.');
    await tenants.run(studentCtx, () => workflow.submitRecord(record.id, STUDENT));

    const queue = await tenants.run(supervisorCtx, () =>
      workflow.listTasks(SUPERVISOR, { limit: 10 } as never),
    );
    const task = queue.data.find((t) => t.recordId === record.id)!;

    // A student (even the owner) cannot decide; the task is not theirs.
    await expect(
      tenants.run(studentCtx, () =>
        workflow.decideTask(STUDENT, task.id, { decision: 'approve' }),
      ),
    ).rejects.toThrow('Task not found');
  });

  it('verification is capability-gated: a student can never verify', async () => {
    const record = await tenants.run(studentCtx, () =>
      records.createDraft(STUDENT, {
        outputType: 'article',
        title: `No Verify ${RUN}`,
        institutionId: INST,
        abstract: 'A fifth abstract of at least one hundred characters for capability checks, padded to satisfy the contract minimum length.',
        disciplines: ['Agriculture'],
        keywords: ['noverify'],
        accessLevel: 'metadata_public',
        licence: 'CC-BY-4.0',
      }),
    );
    const version = await depositVersion(record.id, 'noverify-bytes-', 'Capability check.');
    await tenants.run(studentCtx, () => workflow.submitRecord(record.id, STUDENT));

    await expect(
      tenants.run(studentCtx, () =>
        workflow.verifyRecord(record.id, STUDENT, version.id),
      ),
    ).rejects.toThrow('Not found');
  });

  it('an UNVERIFIED institution can never confer institutional verification (PRD §6.1)', async () => {
    // Ground-truth seed inside the pending institution: a submitted record
    // at the registry stage, decided by its own staff.
    const recordId = `abcdef00-0000-4ea0-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
    const versionId = `abcdef01-0000-4ea1-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
    asSuper(
      `INSERT INTO research_record (id, institution_id, owner_user_id, output_type, title, abstract, disciplines, keywords, access_level, licence, status, created_at, updated_at)
       VALUES ('${recordId}', '${PENDING_INST}', '${STUDENT}', 'article', 'Pending Institution ${RUN}',
               'Ground truth seed abstract of at least one hundred characters for the pending-institution immutability check, padded for the contract.',
               ARRAY['Agriculture'], ARRAY['pending'], 'metadata_public', 'CC-BY-4.0', 'in_review', now(), now())`,
    );
    asSuper(
      `INSERT INTO record_version (id, record_id, version_no, change_summary, state, file_key, file_name, file_size_bytes, mime_type, scan_status, created_at)
       VALUES ('${versionId}', '${recordId}', 1, 'Seeded submission.', 'submitted', 'versions/seed.bin', 'seed.pdf', 100, 'application/pdf', 'clean', now())`,
    );

    const pendingRegCtx = { userId: PENDING_REG, institutionId: PENDING_INST };
    await expect(
      tenants.run(pendingRegCtx, () =>
        workflow.verifyRecord(recordId, PENDING_REG, versionId),
      ),
    ).rejects.toThrow('Only verified institutions');

    // The seeded version was auto-sealed at 'submitted'; suspend the seal
    // guard briefly for teardown, then restore it.
    asSuper('ALTER TABLE record_version DISABLE TRIGGER trg_record_version_immutable');
    asSuper(`DELETE FROM research_record WHERE id = '${recordId}'`);
    asSuper('ALTER TABLE record_version ENABLE TRIGGER trg_record_version_immutable');
  });

  it('review tasks are invisible without a tenant/assignee context (RLS)', async () => {
    const tasks = await prisma.withTenant(SYSTEM_CONTEXT, (tx) => tx.reviewTask.findMany());
    expect(tasks).toHaveLength(0);
  });

  it('the whole journey is audit-logged with human decisions', async () => {
    const actions = asSuper(
      `SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM audit_event WHERE institution_id = '${INST}'`,
    );
    for (const expected of [
      'record.submitted',
      'task.created',
      'task.decided',
      'record.verified',
    ]) {
      expect(actions).toContain(expected);
    }
  });
});
