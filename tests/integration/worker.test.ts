import { execFileSync } from 'node:child_process';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../apps/api/src/infrastructure/audit/audit.service';
import { PrismaService } from '../../apps/api/src/infrastructure/database/prisma.service';
import { EmailService } from '../../apps/api/src/infrastructure/email/email.service';
import { LocalStorage } from '../../apps/api/src/infrastructure/storage/local-storage.service';
import {
  EmbargoProcessor,
  OutboxProcessor,
  ScanProcessor,
  UploadSweepProcessor,
} from '../../apps/api/src/worker/processors';
import type { VirusScannerPort, ScanOutcome } from '../../apps/api/src/modules/deposits/scan/scanner.service';

/**
 * The worker processors against real infrastructure (PRD §6.3, §6.6, §9):
 *
 *   - outbox delivery over a REAL SMTP conversation (a minimal sink
 *     speaking the actual protocol over a socket — no mocked library),
 *     with honest retry/backoff and dead-lettering;
 *   - scan sweep recovers versions stranded at 'pending' (crash
 *     recovery), settling them via the SECURITY DEFINER helpers;
 *   - embargo expiry lifts only undisputed records (PRD §6.6) and
 *     audits every lift;
 *   - the upload sweeper expires abandoned sessions and discards their
 *     orphaned part files from real storage.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const RUN = Date.now();
const SUFFIX = String(RUN).slice(-4).padStart(4, '0');
const INST = 'bbbbbbb0-0000-4b00-8000-00000000' + SUFFIX;
const STUDENT = 'bbbbbbb1-0000-4b10-8000-00000000' + SUFFIX;

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

/**
 * A minimal but REAL SMTP sink: it speaks the actual protocol over a real
 * socket (220 greeting, 250/354 replies, DATA termination). All raw
 * traffic is captured so assertions can prove what a real SMTP server
 * would have received.
 */
class SmtpSink {
  readonly server: Server;
  raw = '';
  private readonly sockets = new Set<Socket>();

  constructor() {
    this.server = createServer((socket) => {
      this.sockets.add(socket);
      let inData = false;
      let buffer = '';
      socket.write('220 alims-sink ESMTP ready\r\n');
      socket.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        this.raw += text;
        buffer += text;
        let index: number;
        while ((index = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (inData) {
            if (line === '.') {
              inData = false;
              socket.write('250 OK: queued\r\n');
            }
            continue;
          }
          if (/^DATA$/i.test(line)) {
            inData = true;
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (/^(EHLO|HELO|MAIL FROM|RCPT TO|NOOP)/i.test(line)) {
            socket.write('250 OK\r\n');
          } else if (/^QUIT/i.test(line)) {
            socket.write('221 Bye\r\n');
            socket.end();
          } else {
            socket.write('500 Unrecognised\r\n');
          }
        }
      });
      socket.on('close', () => this.sockets.delete(socket));
      socket.on('error', () => undefined);
    });
  }

  listen(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server.address();
        resolve(typeof address === 'object' && address ? address.port : 0);
      });
    });
  }

  close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

d('Worker processors (real PostgreSQL, real SMTP, real storage)', () => {
  let prisma: PrismaService;
  let emails: EmailService;
  let storage: LocalStorage;
  let outbox: OutboxProcessor;
  let audit: AuditService;
  let storageRoot: string;
  let sink: SmtpSink;

  const makeConfig = (overrides: Record<string, string> = {}) => {
    const CFG: Record<string, string> = {
      JWT_ACCESS_SECRET: 'integration-access-secret-00000000000',
      REFRESH_TOKEN_SECRET: 'integration-refresh-secret-0000000000',
      MFA_ENCRYPTION_KEY: 'integration-mfa-key-0000000000000000',
      AUDIT_HASH_SALT: 'integration-audit-salt-0000000000000',
      PLATFORM_ADMIN_USER_IDS: '',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      STORAGE_ROOT: storageRoot,
      UPLOAD_TOKEN_SECRET: 'integration-upload-secret-000000000',
      AV_CLAMD_HOST: '',
      OUTBOX_MAX_ATTEMPTS: '3',
      UPLOAD_SESSION_TTL_HOURS: '24',
      ...overrides,
    };
    return { get: (key: string) => CFG[key] } as unknown as ConfigService<never, true>;
  };

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'alims-worker-'));
    asSuper(
      `INSERT INTO institution (id, legal_name, display_name, slug, country_code, category, official_domain, representative_email, privacy_contact_email, status, created_at, updated_at)
       VALUES ('${INST}', 'Worker University ${RUN}', 'WU', 'wu-${RUN}', 'NG', 'university', 'wu.edu', 'r@wu.edu', 'p@wu.edu', 'verified', now(), now())`,
    );
    asSuper(
      `INSERT INTO user_account (id, email, password_hash, display_name, created_at, updated_at)
       VALUES ('${STUDENT}', 'worker-student-${RUN}@wu.edu', 'x', 'worker-student', now(), now())`,
    );
    asSuper(
      `INSERT INTO membership (id, user_id, institution_id, role, status, created_at)
       VALUES (gen_random_uuid(), '${STUDENT}', '${INST}', 'student', 'active', now())`,
    );

    prisma = new PrismaService();
    sink = new SmtpSink();
    const port = await sink.listen();

    emails = new EmailService(prisma, makeConfig({ SMTP_URL: `smtp://127.0.0.1:${port}` }));
    await emails.onModuleInit();
    storage = new LocalStorage(makeConfig());
    audit = new AuditService(prisma, makeConfig());
    outbox = new OutboxProcessor(prisma, emails);
  });

  afterAll(async () => {
    await sink?.close();
    if (prisma) await prisma.$disconnect();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (!HAS_DB) return;
    asSuper(`DELETE FROM email_outbox WHERE to_email LIKE '%${RUN}%'`);
    asSuper(`DELETE FROM research_record WHERE owner_user_id = '${STUDENT}'`);
    asSuper(`DELETE FROM institution WHERE id = '${INST}'`);
    asSuper(`DELETE FROM user_account WHERE id = '${STUDENT}'`);
  });

  it('the outbox drains through a REAL SMTP conversation', async () => {
    const queued = await emails.enqueue({
      to: `recipient-${RUN}@wu.edu`,
      template: 'email-verification',
      subject: `Worker proof ${RUN}`,
      bodyText: 'Confirm your email: http://localhost:3000/verify-email?token=abc123',
    });
    expect(queued.delivered).toBe(true); // the first attempt already goes through

    const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: queued.outboxId } });
    expect(row.status).toBe('sent');
    expect(row.sentAt).not.toBeNull();

    // The sink received a real SMTP conversation: envelope + payload.
    expect(sink.raw).toContain(`recipient-${RUN}@wu.edu`);
    expect(sink.raw).toContain(`Worker proof ${RUN}`);
    expect(sink.raw).toContain('RCPT TO');
    expect(sink.raw).toContain('MAIL FROM');
  });

  it('a pending row that is due is drained by the processor', async () => {
    const row = await prisma.emailOutbox.create({
      data: {
        toEmail: `due-${RUN}@wu.edu`,
        template: 'test',
        subject: 'Due now',
        bodyText: 'body',
        status: 'pending',
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });
    const result = await outbox.runOnce();
    expect(result.acted).toBeGreaterThanOrEqual(1);
    const after = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe('sent');
  });

  it('failures back off exponentially and dead-letter at the cap', async () => {
    // Swap in a transport that always rejects — a real outage.
    emails.setTransport({
      send: () => {
        throw new Error('connection refused (simulated outage)');
      },
    });

    const row = await prisma.emailOutbox.create({
      data: {
        toEmail: `flaky-${RUN}@wu.edu`,
        template: 'test',
        subject: 'Will fail',
        bodyText: 'body',
        status: 'pending',
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });

    // Attempt 1 → pending with future next_attempt_at.
    await emails.deliver(row);
    let current = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(current.status).toBe('pending');
    expect(current.attempts).toBe(1);
    expect(current.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(current.lastError).toContain('connection refused');

    // Force it due again; attempts 2 and 3 → dead-letter ('failed').
    for (let i = 0; i < 2; i += 1) {
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: { nextAttemptAt: new Date(Date.now() - 1000) },
      });
      await emails.deliver(current);
      current = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    }
    expect(current.status).toBe('failed'); // dead-lettered, never silently dropped
    expect(current.attempts).toBe(3);
  });

  it('an unconfigured transport is an honest no-op (no attempt burned)', async () => {
    emails.setTransport(null);
    const row = await prisma.emailOutbox.create({
      data: {
        toEmail: `quiet-${RUN}@wu.edu`,
        template: 'test',
        subject: 'Stays pending',
        bodyText: 'body',
        status: 'pending',
      },
    });
    const result = await outbox.runOnce();
    expect(result.note).toContain('transport not configured');
    const after = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe('pending');
    expect(after.attempts).toBe(0);
  });

  let recordId: string;
  let versionId: string;

  it('a record + version exist for the sweep tests', async () => {
    recordId = asSuper(
      `INSERT INTO research_record (id, owner_user_id, institution_id, output_type, title, abstract, disciplines, keywords, access_level, licence, status, created_at, updated_at)
       VALUES (gen_random_uuid(), '${STUDENT}', '${INST}', 'thesis', 'Worker Journey ${RUN}', '${'a'.repeat(120)}', ARRAY['Computer Science'], ARRAY['worker'], 'metadata_public', 'CC-BY-4.0', 'draft', now(), now())
       RETURNING id`,
    );
    versionId = asSuper(
      `INSERT INTO record_version (id, record_id, version_no, change_summary, state, file_key, scan_status, submitted_by_id, created_at)
       VALUES (gen_random_uuid(), '${recordId}', 1, 'worker sweep test', 'draft', 'objects/worker-test-${RUN}', 'pending', '${STUDENT}', now() - interval '2 hours')
       RETURNING id`,
    );
    expect(versionId.length).toBe(36);
  });

  it('scan sweep recovers a stranded pending scan (no scanner → honest unsupported)', async () => {
    const scan = new ScanProcessor(prisma, audit, storage, makeConfig({ AV_CLAMD_HOST: '' }));
    const result = await scan.runOnce();
    expect(result.acted).toBeGreaterThanOrEqual(1);

    const settled = asSuper(`SELECT scan_status FROM record_version WHERE id = '${versionId}'`);
    expect(settled).toBe('unsupported'); // exactly what the inline path would say

    const audited = await prisma.auditEvent.count({
      where: { action: 'file.scan.result', subjectId: versionId },
    });
    expect(audited).toBeGreaterThanOrEqual(1);
  });

  it('scan sweep with a configured scanner records its real outcome', async () => {
    const freshVersionId = asSuper(
      `INSERT INTO record_version (id, record_id, version_no, change_summary, state, file_key, scan_status, submitted_by_id, created_at)
       VALUES (gen_random_uuid(), '${recordId}', 2, 'scanner present', 'draft', 'objects/worker-clean-${RUN}', 'pending', '${STUDENT}', now() - interval '2 hours')
       RETURNING id`,
    );
    const scan = new ScanProcessor(prisma, audit, storage, makeConfig());
    scan.setScanner({
      name: 'test-scanner',
      configured: true,
      scan: async (): Promise<ScanOutcome> => ({ status: 'clean' }),
    });
    const result = await scan.runOnce();
    expect(result.acted).toBeGreaterThanOrEqual(1);
    expect(asSuper(`SELECT scan_status FROM record_version WHERE id = '${freshVersionId}'`)).toBe('clean');
  });

  it('embargo expiry lifts only undisputed records (PRD §6.6)', async () => {
    // Expired + undisputed → will be lifted.
    asSuper(
      `UPDATE research_record SET embargo_until = now() - interval '1 day' WHERE id = '${recordId}'`,
    );
    // Expired but under an UNRESOLVED dispute → must keep its embargo.
    const disputedId = asSuper(
      `INSERT INTO research_record (id, owner_user_id, institution_id, output_type, title, abstract, disciplines, keywords, access_level, licence, status, embargo_until, created_at, updated_at)
       VALUES (gen_random_uuid(), '${STUDENT}', '${INST}', 'thesis', 'Disputed Journey ${RUN}', '${'b'.repeat(120)}', ARRAY['Computer Science'], ARRAY['worker'], 'restricted', 'CC-BY-4.0', 'draft', now() - interval '1 day', now(), now())
       RETURNING id`,
    );
    asSuper(
      `INSERT INTO dispute (id, subject_type, subject_id, category, description, status, raised_by_id, created_at, updated_at)
       VALUES (gen_random_uuid(), 'research_record', '${disputedId}', 'authorship_contribution', 'Under active review', 'under_review', '${STUDENT}', now(), now())`,
    );

    const embargo = new EmbargoProcessor(prisma, audit);
    const result = await embargo.runOnce();
    expect(result.acted).toBeGreaterThanOrEqual(1);

    const lifted = asSuper(`SELECT embargo_until IS NULL FROM research_record WHERE id = '${recordId}'`);
    expect(lifted).toBe('t');
    const kept = asSuper(`SELECT embargo_until IS NULL FROM research_record WHERE id = '${disputedId}'`);
    expect(kept).toBe('f'); // the dispute guard held

    const audited = await prisma.auditEvent.count({
      where: { action: 'record.embargo_lifted', subjectId: recordId },
    });
    expect(audited).toBeGreaterThanOrEqual(1);

    asSuper(`DELETE FROM dispute WHERE subject_id = '${disputedId}'`);
  });

  it('the upload sweeper expires abandoned sessions and discards their parts', async () => {
    const uploadId = asSuper(
      `INSERT INTO file_upload (id, version_id, file_name, file_size_bytes, mime_type, part_size_bytes, parts, status, created_by_id, created_at)
       VALUES (gen_random_uuid(), '${versionId}', 'abandoned.pdf', 10, 'application/pdf', 8, '[]', 'in_progress', '${STUDENT}', now() - interval '48 hours')
       RETURNING id`,
    );
    await storage.writePart(uploadId, 1, Readable.from(['orphan-part-bytes']));
    expect(await storage.listParts(uploadId)).toEqual([1]);

    const sweeper = new UploadSweepProcessor(prisma, storage, audit, makeConfig());
    const result = await sweeper.runOnce();
    expect(result.acted).toBeGreaterThanOrEqual(1);

    const status = asSuper(`SELECT status FROM file_upload WHERE id = '${uploadId}'`);
    expect(status).toBe('expired');
    expect(await storage.listParts(uploadId)).toEqual([]); // part file discarded

    const audited = await prisma.auditEvent.count({
      where: { action: 'upload.expired', subjectId: uploadId },
    });
    expect(audited).toBe(1);
  });
});
