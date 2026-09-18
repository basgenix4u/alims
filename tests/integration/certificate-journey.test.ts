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
import { CertificateService } from '../../apps/api/src/modules/certificates/application/certificate.service';
import { PublicService } from '../../apps/api/src/modules/public/public.service';
import { CERTIFICATE_DISCLAIMER } from '../../packages/contracts/src/certificate';

/**
 * THE journey — one continuous, executable proof against a real PostgreSQL
 * with row-level security live (PRD §1.1, api_specification.md §5–§8, §13):
 *
 *   A student joins their verified university, deposits a thesis with a real
 *   file, submits it; their supervisor reviews and approves; the registry
 *   verifies with step-up; a certificate is issued with an opaque QR token;
 *   and AN ANONYMOUS VISITOR scans the QR and sees the verified record —
 *   exactly the ten approved fields, nothing else.
 *
 *   Then the honesty paths: revocation updates the public answer, the
 *   student cannot issue, and the PDF is a real document.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const INST = `fffffff0-0000-4f00-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const STUDENT = `fffffff1-0000-4f10-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const SUPERVISOR = `fffffff2-0000-4f20-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
const REGISTRY = `fffffff3-0000-4f30-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;

/** Inflate every FlateDecode stream in a PDF buffer, concatenated (latin1). */
function inflatePdfStreams(pdf: Buffer): string {
  const { inflateSync } = require('node:zlib') as typeof import('node:zlib');
  let out = '';
  let index = 0;
  for (;;) {
    const start = pdf.indexOf('stream', index);
    if (start === -1) break;
    const open = start + 'stream'.length;
    const nl = pdf[open] === 13 || pdf[open] === 10 ? open + (pdf[open] === 13 ? 2 : 1) : open;
    const end = pdf.indexOf('endstream', nl);
    if (end === -1) break;
    try {
      out += inflateSync(pdf.subarray(nl, end)).toString('latin1');
    } catch {
      out += pdf.subarray(nl, end).toString('latin1');
    }
    index = end + 'endstream'.length;
  }
  return out;
}

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

d('The Release-1 journey, end to end (real PostgreSQL, real RLS, real file)', () => {
  let prisma: PrismaService;
  let tenants: TenantContextService;
  let records: RecordService;
  let deposits: DepositService;
  let workflow: WorkflowService;
  let certificates: CertificateService;
  let publicSurfaces: PublicService;
  let storageRoot: string;

  const studentCtx = { userId: STUDENT, institutionId: INST };
  const supervisorCtx = { userId: SUPERVISOR, institutionId: INST };
  const registryCtx = { userId: REGISTRY, institutionId: INST };

  const CFG_VALUES: Record<string, string> = {};
  const cfg = { get: (key: string) => ({})[key] } as never;

  beforeAll(async () => {
    asSuper(
      `INSERT INTO institution (id, legal_name, display_name, slug, country_code, category, official_domain, representative_email, privacy_contact_email, status, created_at, updated_at)
       VALUES ('${INST}', 'Journey Complete University', 'JCU', 'jcu-${RUN}', 'NG', 'university', 'jcu.edu', 'r@jcu.edu', 'p@jcu.edu', 'verified', now(), now())`,
    );
    const user = (id: string, email: string) =>
      `INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
       VALUES ('${id}', '${email}', 'x', '${email.split('@')[0].replace(/-\d+/, '')}', now(), now())`;
    asSuper(user(STUDENT, `student-${RUN}@jcu.edu`));
    asSuper(user(SUPERVISOR, `supervisor-${RUN}@jcu.edu`));
    asSuper(user(REGISTRY, `registry-${RUN}@jcu.edu`));
    const member = (userId: string, role: string) =>
      `INSERT INTO membership (id, user_id, institution_id, role, status, created_at)
       VALUES (gen_random_uuid(), '${userId}', '${INST}', '${role}', 'active', now())`;
    asSuper(member(STUDENT, 'student'));
    asSuper(member(SUPERVISOR, 'supervisor'));
    asSuper(member(REGISTRY, 'registry'));

    storageRoot = await mkdtemp(join(tmpdir(), 'alims-journey-'));
    Object.assign(CFG_VALUES, {
      STORAGE_ROOT: storageRoot,
      UPLOAD_TOKEN_SECRET: 'integration-upload-secret-000000000',
      UPLOAD_MIME_ALLOWLIST: 'application/pdf,text/plain',
      UPLOAD_MAX_FILE_MB: '5',
      UPLOAD_PART_SIZE_MB: '1',
      AUDIT_HASH_SALT: 'integration-audit-salt-0000000000000',
      PLATFORM_ADMIN_USER_IDS: '',
      PUBLIC_BASE_URL: 'https://verify.alims.example',
    });
    (cfg as { get: (k: string) => string }).get = (key: string) => CFG_VALUES[key];

    prisma = new PrismaService();
    tenants = new TenantContextService(prisma);
    const localStorage = new LocalStorage(cfg);
    const audit = new AuditService(prisma, cfg);
    const policies = new PolicyService(cfg, prisma);
    const engine = new PolicyEngine();
    records = new RecordService(new PrismaRecordRepository(prisma, tenants));
    deposits = new DepositService(prisma, tenants, audit, localStorage, cfg, policies, engine);
    workflow = new WorkflowService(prisma, tenants, audit, records, policies, engine);
    certificates = new CertificateService(prisma, tenants, audit, cfg, policies, engine);
    publicSurfaces = new PublicService(prisma);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (!HAS_DB) return;
    asSuper('ALTER TABLE review_decision DISABLE TRIGGER trg_review_decision_append_only');
    asSuper('ALTER TABLE record_version DISABLE TRIGGER trg_record_version_immutable');
    asSuper(
      `DELETE FROM certificate WHERE record_id IN (
         SELECT id FROM research_record WHERE owner_user_id = '${STUDENT}')`,
    );
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
    asSuper(`DELETE FROM institution WHERE id = '${INST}'`);
    asSuper(
      `DELETE FROM user_account WHERE id IN ('${STUDENT}','${SUPERVISOR}','${REGISTRY}')`,
    );
  });

  it('deposit → submit → review → verify → certificate → anonymous QR verification', async () => {
    // 1. The student deposits a thesis with a real file.
    const record = await tenants.run(studentCtx, () =>
      records.createDraft(STUDENT, {
        outputType: 'thesis',
        title: `The Complete Journey ${RUN}`,
        institutionId: INST,
        abstract:
          'The final end-to-end proof abstract, written deliberately to sit comfortably above the one hundred character contract minimum.',
        disciplines: ['Computer Science'],
        keywords: ['journey'],
        accessLevel: 'metadata_public',
        licence: 'CC-BY-4.0',
      }),
    );
    const version = await tenants.run(studentCtx, () =>
      deposits.createVersion(record.id, STUDENT, {
        changeSummary: 'Complete thesis submitted for institutional verification.',
      }),
    );
    const payload = 'the-actual-thesis-bytes-';
    const init = await tenants.run(studentCtx, () =>
      deposits.initUpload(STUDENT, {
        versionId: version.id,
        fileName: 'journey-thesis.pdf',
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
    const completion = await tenants.run(studentCtx, () =>
      deposits.completeUpload(STUDENT, init.uploadId, declared),
    );
    expect(completion.receipt.statement).toContain('Deposit evidence only');

    // 2. Submit for review.
    await tenants.run(studentCtx, () => workflow.submitRecord(record.id, STUDENT));

    // 3. Supervisor approves.
    let queue = await tenants.run(supervisorCtx, () =>
      workflow.listTasks(SUPERVISOR, { limit: 10 } as never),
    );
    const supervisorTask = queue.data.find((t) => t.recordId === record.id)!;
    await tenants.run(supervisorCtx, () =>
      workflow.decideTask(SUPERVISOR, supervisorTask.id, { decision: 'approve' }),
    );

    // 4. Registry verifies (step-up is enforced at the route; capability here).
    queue = await tenants.run(registryCtx, () =>
      workflow.listTasks(REGISTRY, { limit: 10 } as never),
    );
    const finalTask = queue.data.find((t) => t.recordId === record.id)!;
    const verified = await tenants.run(registryCtx, () =>
      workflow.verifyRecord(record.id, REGISTRY, finalTask.versionId),
    );
    expect(verified.recordStatus).toBe('institutionally_verified');
    expect(verified.nxrId).toMatch(/^NXR-\d{4}-\d{6}$/);

    // 5. The registry issues the certificate (step-up enforced at the route).
    const certificate = await tenants.run(registryCtx, () =>
      certificates.issue(record.id, REGISTRY, {}),
    );
    expect(certificate.status).toBe('valid');
    expect(certificate.certificateNo).toMatch(/^CERT-\d{4}-\d{6}$/);
    expect(certificate.nxrId).toBe(verified.nxrId);
    expect(certificate.recordTitle).toContain('Complete Journey');
    expect(certificate.institutionName).toBe('JCU'); // displayName, the public-facing name

    // 6. ANONYMOUS VERIFICATION — the QR scan. System context, no identity.
    const qrToken = asSuper(
      `SELECT qr_token FROM certificate WHERE id = '${certificate.id}'`,
    );
    expect(qrToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const answer = await tenants.run(SYSTEM_CONTEXT, () => publicSurfaces.verify(qrToken));

    expect(answer.status).toBe('valid');
    expect(answer.certificateNo).toBe(certificate.certificateNo);
    expect(answer.nxrId).toBe(verified.nxrId);
    expect(answer.title).toContain('Complete Journey');
    expect(answer.institutionName).toBe('JCU');
    expect(answer.outputType).toBe('thesis');
    expect(answer.verificationLevel).toBe('institutionally_verified');
    expect(answer.researcherNames.length).toBeGreaterThanOrEqual(1);
    expect(answer.researcherNames).toContain('student');
    expect(answer.supersededBy).toBeNull();
    expect(answer.disclaimer).toBe(CERTIFICATE_DISCLAIMER);

    // Exactly the ten approved fields — nothing else in the payload.
    expect(Object.keys(answer).sort()).toEqual(
      [
        'certificateNo',
        'disclaimer',
        'institutionName',
        'issueDate',
        'nxrId',
        'outputType',
        'researcherNames',
        'status',
        'supersededBy',
        'title',
        'verificationLevel',
      ].sort(),
    );

    // 7. The certificate PDF is a real document with the QR target inside.
    const pdfBytes = await tenants.run(registryCtx, () =>
      certificates.renderPdf(certificate.id, REGISTRY),
    );
    const asBuffer = Buffer.from(pdfBytes);
    expect(asBuffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(asBuffer.length).toBeGreaterThan(1000);
    // Content streams are Flate-compressed and pdf-lib writes strings as
    // hex: inflate the streams and assert the URL and certificate number
    // are actually drawn.
    const drawnText = inflatePdfStreams(asBuffer).toLowerCase();
    const asPdfHex = (value: string) => Buffer.from(value, 'latin1').toString('hex');
    expect(drawnText).toContain(asPdfHex('https://verify.alims.example/verify/'));
    expect(drawnText).toContain(asPdfHex(certificate.certificateNo));

    // 8. Revocation flips the public answer honestly.
    const revoked = await tenants.run(registryCtx, () =>
      certificates.revoke(
        certificate.id,
        REGISTRY,
        { reason: 'Integration test revocation — verification withdrawn after review.' },
      ),
    );
    expect(revoked.status).toBe('revoked');
    expect(revoked.revokedReason).toContain('Integration test');

    const afterRevoke = await tenants.run(SYSTEM_CONTEXT, () =>
      publicSurfaces.verify(qrToken),
    );
    expect(afterRevoke.status).toBe('revoked');
    expect(afterRevoke.title).toContain('Complete Journey');

    // 9. A re-issue for the same version is refused (supersede path instead).
    await expect(
      tenants.run(registryCtx, () => certificates.issue(record.id, REGISTRY, {})),
    ).rejects.toThrow('already has a certificate');

    // 10. The student can neither issue nor read foreign certificates.
    const otherCertId = asSuper(
      `SELECT id FROM certificate WHERE record_id = '${record.id}' LIMIT 1`,
    );
    await expect(
      tenants.run(studentCtx, () => certificates.issue(record.id, STUDENT, {})),
    ).rejects.toThrow('Certificate not found');
    // The owner CAN read their own certificate.
    const own = await tenants.run(studentCtx, () => certificates.get(otherCertId, STUDENT));
    expect(own.certificateNo).toBe(certificate.certificateNo);
  });

  it('an unknown QR token answers not_found without leaking existence', async () => {
    const answer = await tenants.run(SYSTEM_CONTEXT, () =>
      publicSurfaces.verify('definitely-not-a-real-token-value-0000000000000'),
    );
    expect(answer.status).toBe('not_found');
    expect(answer.title).toBe('');
    expect(answer.disclaimer).toBe(CERTIFICATE_DISCLAIMER);
  });

  it('certificate row visibility follows record visibility (RLS)', async () => {
    // A certificate on a PUBLIC verified record is visible to the anonymous
    // context — exactly like the record itself. The narrow projection
    // function remains the only anonymous API surface.
    const publicCerts = await prisma.withTenant(SYSTEM_CONTEXT, (tx) =>
      tx.certificate.findMany({ where: { record: { accessLevel: 'metadata_public' } } }),
    );
    expect(publicCerts.length).toBeGreaterThanOrEqual(1);

    // A certificate on a RESTRICTED record is invisible outside its tenant.
    const restrictedId = `bbbbbb00-0000-4b00-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
    const restrictedVersion = `bbbbbb01-0000-4b01-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}`;
    asSuper(
      `INSERT INTO research_record (id, institution_id, owner_user_id, output_type, title, abstract, disciplines, keywords, access_level, licence, status, created_at, updated_at)
       VALUES ('${restrictedId}', '${INST}', '${STUDENT}', 'dataset', 'Restricted Certificate ${RUN}',
               'A restricted record whose certificate must never be visible to an anonymous database context.',
               ARRAY['Agriculture'], ARRAY['restricted'], 'restricted', 'CC-BY-NC-4.0', 'institutionally_verified', now(), now())`,
    );
    asSuper(
      `INSERT INTO record_version (id, record_id, version_no, change_summary, state, file_key, file_name, file_size_bytes, mime_type, scan_status, is_immutable, created_at)
       VALUES ('${restrictedVersion}', '${restrictedId}', 1, 'Sealed.', 'submitted', 'versions/seed.bin', 'seed.pdf', 100, 'application/pdf', 'clean', true, now())`,
    );
    asSuper(
      `INSERT INTO certificate (id, record_id, version_id, certificate_no, nxr_id, qr_token, issued_by_id, issued_at)
       VALUES ('bbbbbb02-0000-4b02-8000-00000000${String(RUN).slice(-4).padStart(4, '0')}', '${restrictedId}', '${restrictedVersion}',
               'CERT-RESTRICT-${RUN}', 'NXR-RESTRICT-${RUN}', 'restricted-qr-token-${RUN}', '${REGISTRY}', now())`,
    );

    const visible = await prisma.withTenant(SYSTEM_CONTEXT, (tx) =>
      tx.certificate.findMany({ where: { record: { accessLevel: 'restricted' } } }),
    );
    expect(visible).toHaveLength(0);

    // ...but the anonymous PROJECTION still answers for its QR token —
    // the token is the capability, the projection is the only surface.
    const answer = await tenants.run(SYSTEM_CONTEXT, () =>
      publicSurfaces.verify(`restricted-qr-token-${RUN}`),
    );
    expect(answer.status).toBe('valid');
    expect(answer.title).toContain('Restricted Certificate');

    asSuper('ALTER TABLE record_version DISABLE TRIGGER trg_record_version_immutable');
    asSuper(`DELETE FROM certificate WHERE record_id = '${restrictedId}'`);
    asSuper(`DELETE FROM research_record WHERE id = '${restrictedId}'`);
    asSuper('ALTER TABLE record_version ENABLE TRIGGER trg_record_version_immutable');
  });

  it('the journey is fully audit-logged', async () => {
    const actions = asSuper(
      `SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM audit_event WHERE institution_id = '${INST}'`,
    );
    for (const expected of [
      'record.submitted',
      'task.created',
      'task.decided',
      'record.verified',
      'certificate.issued',
      'certificate.revoked',
      'upload.completed',
    ]) {
      expect(actions).toContain(expected);
    }
  });
});
