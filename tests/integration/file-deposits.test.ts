import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEPOSIT_RECEIPT_STATEMENT } from '../../packages/contracts/src/record';
import { AuditService } from '../../apps/api/src/infrastructure/audit/audit.service';
import { PrismaService, SYSTEM_CONTEXT } from '../../apps/api/src/infrastructure/database/prisma.service';
import { LocalStorage } from '../../apps/api/src/infrastructure/storage/local-storage.service';
import { PolicyEngine } from '../../apps/api/src/domain/policy/policy-engine';
import { PolicyService } from '../../apps/api/src/domain/policy/policy.service';
import { RecordService } from '../../apps/api/src/modules/records/application/record.service';
import { PrismaRecordRepository } from '../../apps/api/src/modules/records/infrastructure/prisma-record.repository';
import { TenantContextService } from '../../apps/api/src/interface/middleware/tenant-context.service';
import { DepositService } from '../../apps/api/src/modules/deposits/application/deposit.service';

/**
 * The deposit journey — executable proof against a real PostgreSQL with
 * row-level security live and real files on disk (api_specification.md §6):
 *
 *   version → init → part PUTs → complete → receipt (honest statement)
 *   → scan status (honestly 'unsupported' without a scanner)
 *   → duplicate intent gate → cross-depositor provenance signal
 *   → policy-gated download → streamed bytes identical to what was deposited.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const OWNER = `ddddddd1-0000-4d10-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const OTHER = `ddddddd2-0000-4d20-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;

function asSuper(sql: string): string {
  const dsn = process.env.CI_SUPERUSER_DSN ?? process.env.DATABASE_MIGRATION_URL;
  if (dsn) {
    return execFileSync('psql', [dsn, '-qtA', '-c', sql], { encoding: 'utf8' }).trim();
  }
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

const partBody = (uploadUrl: string): string => {
  const token = new URL(`http://x${uploadUrl}`).searchParams.get('token')!;
  return token;
};

/** PUT every part of `payload` for `init`, exactly as a client would. */
async function uploadAll(
  run: <T>(work: () => Promise<T>) => Promise<T>,
  deposits: DepositService,
  userId: string,
  payload: string,
  init: { uploadId: string; parts: Array<{ partNumber: number; url: string }>; partSizeBytes: number },
): Promise<Array<{ partNumber: number; etag: string }>> {
  const declared: Array<{ partNumber: number; etag: string }> = [];
  for (const part of init.parts) {
    const body = payload.slice((part.partNumber - 1) * init.partSizeBytes, part.partNumber * init.partSizeBytes);
    const { etag } = await run(() =>
      deposits.putPart(init.uploadId, part.partNumber, partBody(part.url), Readable.from([body])),
    );
    declared.push({ partNumber: part.partNumber, etag });
  }
  void userId;
  return declared;
}

d('File deposits (real PostgreSQL, real files, real RLS)', () => {
  let prisma: PrismaService;
  let tenants: TenantContextService;
  let records: RecordService;
  let deposits: DepositService;
  let storageRoot: string;
  let recordId: string;

  const cfg = {
    get: (key: string) =>
      ({
        STORAGE_ROOT: '/tmp/replaced-at-runtime',
        UPLOAD_TOKEN_SECRET: 'integration-upload-secret-000000000',
        UPLOAD_MIME_ALLOWLIST: 'application/pdf,text/plain',
        UPLOAD_MAX_FILE_MB: '5',
        UPLOAD_PART_SIZE_MB: '1',
        AUDIT_HASH_SALT: 'integration-audit-salt-0000000000000',
        PLATFORM_ADMIN_USER_IDS: '',
      })[key],
  } as never;

  beforeAll(async () => {
    asSuper(`INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
             VALUES ('${OWNER}', 'depositor-${RUN}@ptu.edu', 'x', 'Depositor', now(), now()),
                    ('${OTHER}', 'other-${RUN}@ptu.edu', 'x', 'Other Depositor', now(), now())`);

    storageRoot = await mkdtemp(join(tmpdir(), 'alims-deposits-'));
    (cfg as { get: (k: string) => string }).get = (key: string) =>
      ({
        STORAGE_ROOT: storageRoot,
        UPLOAD_TOKEN_SECRET: 'integration-upload-secret-000000000',
        UPLOAD_MIME_ALLOWLIST: 'application/pdf,text/plain',
        UPLOAD_MAX_FILE_MB: '5',
        UPLOAD_PART_SIZE_MB: '1',
        AUDIT_HASH_SALT: 'integration-audit-salt-0000000000000',
        PLATFORM_ADMIN_USER_IDS: '',
      })[key] ?? undefined;

    prisma = new PrismaService();
    tenants = new TenantContextService(prisma);
    const localStorage = new LocalStorage(cfg);
    const audit = new AuditService(prisma, cfg);
    const recordRepo = new PrismaRecordRepository(prisma, tenants);
    records = new RecordService(recordRepo);
    deposits = new DepositService(
      prisma,
      tenants,
      audit,
      localStorage,
      cfg,
      new PolicyService(cfg, prisma),
      new PolicyEngine(),
    );

    const ctx = { userId: OWNER, institutionId: null };
    const record = await tenants.run(ctx, () =>
      records.createDraft(OWNER, {
        outputType: 'thesis',
        title: `Deposit Journey ${RUN}`,
        disciplines: ['Agriculture'],
        keywords: ['deposit'],
        accessLevel: 'metadata_public',
        licence: 'CC-BY-4.0',
        abstract: 'a'.repeat(100),
      }),
    );
    recordId = record.id;
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (!HAS_DB) return;
    asSuper(`DELETE FROM research_record WHERE owner_user_id IN ('${OWNER}', '${OTHER}')`);
    asSuper(`DELETE FROM user_account WHERE id IN ('${OWNER}', '${OTHER}')`);
  });

  it('runs the full journey: version → upload → parts → complete → receipt', async () => {
    const ctx = { userId: OWNER, institutionId: null };

    const version = await tenants.run(ctx, () =>
      deposits.createVersion(recordId, OWNER, {
        changeSummary: 'Initial deposit of the full thesis document.',
      }),
    );
    expect(version.versionNo).toBe(1);
    expect(version.state).toBe('draft');

    const payload = 'thesis-bytes-'.repeat(90_000); // ~1.17 MB → 2 parts at 1 MB
    const expectedSha = createHash('sha256').update(payload).digest('hex');

    const init = await tenants.run(ctx, () =>
      deposits.initUpload(OWNER, {
        versionId: version.id,
        fileName: 'thesis-final.pdf',
        fileSize: Buffer.byteLength(payload),
        mimeType: 'application/pdf',
      }),
    );
    expect(init.parts).toHaveLength(2);
    expect(init.partSizeBytes).toBe(1_048_576);

    // PUT parts using the signed URLs (exactly what a client does).
    const part1 = payload.slice(0, init.partSizeBytes);
    const part2 = payload.slice(init.partSizeBytes);
    const etag1 = await tenants.run(ctx, () =>
      deposits.putPart(init.uploadId, 1, partBody(init.parts[0]!.url), Readable.from([part1])),
    );
    const etag2 = await tenants.run(ctx, () =>
      deposits.putPart(init.uploadId, 2, partBody(init.parts[1]!.url), Readable.from([part2])),
    );
    expect(etag1.etag).toHaveLength(64);
    expect(etag2.etag).toHaveLength(64);

    const completion = await tenants.run(ctx, () =>
      deposits.completeUpload(OWNER, init.uploadId, [
        { partNumber: 1, etag: etag1.etag },
        { partNumber: 2, etag: etag2.etag },
      ]),
    );

    // The receipt tells the truth about what deposit evidence is.
    expect(completion.scanStatus).toBe('pending');
    expect(completion.receipt.sha256).toBe(expectedSha);
    expect(completion.receipt.statement).toBe(DEPOSIT_RECEIPT_STATEMENT);
    expect(completion.receipt.recordId).toBe(recordId);

    // Durable ground truth.
    const row = asSuper(
      `SELECT sha256, file_name FROM record_version WHERE id = '${version.id}'`,
    );
    expect(row).toBe(`${expectedSha}|thesis-final.pdf`);
    const receipts = asSuper(
      `SELECT count(*) FROM deposit_receipt WHERE version_id = '${version.id}'`,
    );
    expect(receipts).toBe('1');
  });

  it('status is honest: without a scanner it reports unsupported with guidance', async () => {
    const ctx = { userId: OWNER, institutionId: null };
    const versions = await tenants.run(ctx, () => deposits.listVersions(recordId, OWNER));
    const uploadId = asSuper(
      `SELECT id FROM file_upload WHERE version_id = '${versions[0]!.id}'`,
    );
    const status = await tenants.run(ctx, () => deposits.uploadStatus(OWNER, uploadId));
    expect(status.progressPercent).toBe(100);
    expect(status.checksumStatus).toBe('verified');
    // The scan runs async; with no scanner configured it settles on
    // 'unsupported' — never 'clean'.
    expect(['pending', 'unsupported']).toContain(status.scanStatus);
  });

  it('a second deposit of the identical file demands explicit intent (409, then success)', async () => {
    const ctx = { userId: OWNER, institutionId: null };
    const version = await tenants.run(ctx, () =>
      deposits.createVersion(recordId, OWNER, {
        changeSummary: 'Redepositing the same document intentionally.',
      }),
    );
    const payload = 'thesis-bytes-'.repeat(90_000);
    const sha = createHash('sha256').update(payload).digest('hex');

    // Init-time detection when the digest is supplied.
    await expect(
      tenants.run(ctx, () =>
        deposits.initUpload(OWNER, {
          versionId: version.id,
          fileName: 'same.pdf',
          fileSize: Buffer.byteLength(payload),
          mimeType: 'application/pdf',
          sha256: sha,
        }),
      ),
    ).rejects.toThrow('already deposited');

    const init = await tenants.run(ctx, () =>
      deposits.initUpload(OWNER, {
        versionId: version.id,
        fileName: 'same.pdf',
        fileSize: Buffer.byteLength(payload),
        mimeType: 'application/pdf',
        sha256: sha,
        intent: 'new_version',
      }),
    );
    const declared = await uploadAll((w) => tenants.run(ctx, w), deposits, OWNER, payload, init);
    const done = await tenants.run(ctx, () =>
      deposits.completeUpload(OWNER, init.uploadId, declared),
    );
    expect(done.receipt.sha256).toBe(sha);
  });

  it('another depositor with the identical digest: success + silent provenance signal', async () => {
    const ctx = { userId: OWNER, institutionId: null };
    const otherCtx = { userId: OTHER, institutionId: null };

    // The other depositor's own record and version.
    const otherRecord = await tenants.run(otherCtx, () =>
      records.createDraft(OTHER, {
        outputType: 'article',
        title: `Suspiciously Identical ${RUN}`,
        disciplines: ['Agriculture'],
        keywords: ['copy'],
        accessLevel: 'metadata_public',
        licence: 'CC-BY-4.0',
        abstract: 'b'.repeat(100),
      }),
    );
    const otherVersion = await tenants.run(otherCtx, () =>
      deposits.createVersion(otherRecord.id, OTHER, { changeSummary: 'Not my document, allegedly.' }),
    );

    const payload = 'thesis-bytes-'.repeat(90_000);
    const init = await tenants.run(otherCtx, () =>
      deposits.initUpload(OTHER, {
        versionId: otherVersion.id,
        fileName: 'copy.pdf',
        fileSize: Buffer.byteLength(payload),
        mimeType: 'application/pdf',
      }),
    );
    const declared = await uploadAll((w) => tenants.run(otherCtx, w), deposits, OTHER, payload, init);
    // Ordinary success — nothing about the first depositor is disclosed.
    const done = await tenants.run(otherCtx, () =>
      deposits.completeUpload(OTHER, init.uploadId, declared),
    );
    expect(done.scanStatus).toBe('pending');

    // The internal signal exists for authorised review only.
    const signals = asSuper(
      `SELECT count(*) FROM audit_event WHERE action = 'file.provenance_signal' AND subject_id = '${done.versionId}'`,
    );
    expect(signals).toBe('1');
  });

  it('the owner downloads and receives byte-identical content', async () => {
    const ctx = { userId: OWNER, institutionId: null };
    const versions = await tenants.run(ctx, () => deposits.listVersions(recordId, OWNER));
    const target = versions.find((v) => v.fileName === 'thesis-final.pdf')!;

    const { url } = await tenants.run(ctx, () =>
      deposits.requestDownload(recordId, target.id, OWNER),
    );
    const token = url.split('/download/')[1]!.split('?')[0]!;
    const key = new URL(`http://x${url}`).searchParams.get('key')!;

    const stream = await deposits.openDownload(decodeURIComponent(token), key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const content = Buffer.concat(chunks).toString();
    expect(content).toBe('thesis-bytes-'.repeat(90_000));
  });

  it('an infected file is refused at the download gate and audited', async () => {
    const ctx = { userId: OWNER, institutionId: null };
    const versions = await tenants.run(ctx, () => deposits.listVersions(recordId, OWNER));
    const target = versions[versions.length - 1]!;
    asSuper(`UPDATE record_version SET scan_status = 'infected' WHERE id = '${target.id}'`);

    await expect(
      tenants.run(ctx, () => deposits.requestDownload(recordId, target.id, OWNER)),
    ).rejects.toThrow('safety scan');
    const denied = asSuper(
      `SELECT count(*) FROM audit_event WHERE action = 'file.download.denied' AND subject_id = '${target.id}'`,
    );
    expect(Number(denied)).toBeGreaterThanOrEqual(1);

    // restore for cleanup neutrality
    asSuper(`UPDATE record_version SET scan_status = 'unsupported' WHERE id = '${target.id}'`);
  });

  it('upload sessions are invisible without the depositor context (RLS)', async () => {
    const uploads = await prisma.withTenant(SYSTEM_CONTEXT, (tx) => tx.fileUpload.findMany());
    expect(uploads).toHaveLength(0);
  });
});
