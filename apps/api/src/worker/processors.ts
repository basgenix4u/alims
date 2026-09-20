import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { AuditService } from '../infrastructure/audit/audit.service';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { EmailService } from '../infrastructure/email/email.service';
import { LocalStorage } from '../infrastructure/storage/local-storage.service';
import { makeScanner, type ScanOutcome, type VirusScannerPort } from '../modules/deposits/scan/scanner.service';

/** One processor cycle's honest summary — logged, never faked. */
export interface CycleResult {
  name: string;
  acted: number;
  note?: string;
}

/**
 * OutboxProcessor — drains due outbox rows through the configured
 * transport (api_specification.md §3, PRD §9).
 *
 * Due = status 'pending' AND next_attempt_at <= now. Without a transport
 * the cycle is an honest no-op: it neither burns attempts nor claims
 * sends. Dead-lettered rows ('failed') are surfaced, never deleted.
 */
@Injectable()
export class OutboxProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailService,
  ) {}

  async runOnce(): Promise<CycleResult> {
    if (!this.emails.configured) {
      return { name: 'outbox', acted: 0, note: 'transport not configured — rows stay pending' };
    }
    const due = await this.prisma.emailOutbox.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: 25,
    });
    let sent = 0;
    for (const row of due) {
      const result = await this.emails.deliver(row);
      if (result.delivered) sent += 1;
    }
    const dead = await this.prisma.emailOutbox.count({ where: { status: 'failed' } });
    return {
      name: 'outbox',
      acted: sent,
      note: due.length > 0 ? `${sent}/${due.length} delivered` : undefined,
      ...(dead > 0 ? { note: `${dead} dead-lettered row(s) awaiting operator attention` } : {}),
    };
  }
}

/**
 * ScanProcessor — crash recovery for the fire-and-forget safety scan
 * (PRD §6.3). The inline post-complete scan dies with the process; any
 * version still 'pending' after a grace window is swept here:
 * scanned when a scanner is configured, or settled honestly to
 * 'unsupported' exactly as the inline path would.
 */
@Injectable()
export class ScanProcessor {
  private scanner: VirusScannerPort;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: LocalStorage,
    config: ConfigService<Env, true>,
  ) {
    this.scanner = makeScanner(config);
  }

  /** Test seam. */
  setScanner(scanner: VirusScannerPort): void {
    this.scanner = scanner;
  }

  async runOnce(): Promise<CycleResult> {
    // Grace window: don't race the inline scan on freshly completed uploads.
    const olderThan = new Date(Date.now() - 60_000);
    const rows = await this.prisma.$queryRaw<
      Array<{ version_id: string; file_key: string; owner_user_id: string | null }>
    >`SELECT version_id, file_key, owner_user_id FROM pending_scan_versions(${olderThan}::timestamptz)`;

    let acted = 0;
    for (const row of rows) {
      let outcome: ScanOutcome;
      try {
        outcome = await this.scanner.scan(row.file_key, this.storage);
      } catch {
        outcome = { status: 'failed', message: 'The safety scan could not run.' };
      }
      await this.prisma.$executeRaw`SELECT set_version_scan_status(${row.version_id}::uuid, ${outcome.status}::text)`;
      await this.audit
        .record({
          action: 'file.scan.result',
          subjectType: 'record_version',
          subjectId: row.version_id,
          actorUserId: row.owner_user_id,
          payload: { status: outcome.status, scanner: this.scanner.name, swept: true },
        })
        .catch(() => undefined);
      acted += 1;
    }
    return { name: 'scan-sweep', acted, ...(acted > 0 ? { note: `${acted} stranded scan(s) recovered` } : {}) };
  }
}

/**
 * EmbargoProcessor — PRD §6.6: "When an embargo expires, release must
 * follow institution/owner policy; no full document should become public
 * contrary to active rights restrictions or unresolved disputes."
 *
 * The lift happens in a SECURITY DEFINER function that refuses records
 * with an unresolved dispute; the worker audits every lift it performed.
 */
@Injectable()
export class EmbargoProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async runOnce(): Promise<CycleResult> {
    const lifted = await this.prisma.$queryRaw<
      Array<{ record_id: string; previous_until: Date }>
    >`SELECT record_id, previous_until FROM lift_expired_embargos()`;

    for (const row of lifted) {
      await this.audit
        .record({
          action: 'record.embargo_lifted',
          subjectType: 'research_record',
          subjectId: row.record_id,
          payload: { previousUntil: row.previous_until.toISOString() },
        })
        .catch(() => undefined);
    }
    return { name: 'embargo-expiry', acted: lifted.length };
  }
}

/**
 * UploadSweepProcessor — abandoned multipart sessions (PRD §9 resource
 * hygiene). Sessions still 'in_progress' past the TTL are expired and
 * their orphaned part files discarded from storage. The assembled
 * object, once a session completed, is never touched.
 */
@Injectable()
export class UploadSweepProcessor {
  private readonly logger = new Logger('UploadSweepProcessor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorage,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async runOnce(): Promise<CycleResult> {
    const ttlHours = this.config.get('UPLOAD_SESSION_TTL_HOURS', { infer: true });
    const cutoff = new Date(Date.now() - ttlHours * 3_600_000);

    // file_upload is RLS-scoped (upload_via_record) — the system-context
    // sweeper cannot see rows directly, so the expire+return happens in a
    // SECURITY DEFINER function. Part-file discard is best-effort and
    // idempotent after the row is expired.
    const expired = await this.prisma.$queryRaw<
      Array<{ upload_id: string }>
    >`SELECT upload_id FROM expire_stale_upload_sessions(${cutoff}::timestamptz)`;

    let acted = 0;
    for (const row of expired) {
      await this.storage.discardParts(row.upload_id).catch((error: unknown) => {
        this.logger.warn(`Could not discard parts of session ${row.upload_id}: ${String(error)}`);
      });
      await this.audit
        .record({
          action: 'upload.expired',
          subjectType: 'file_upload',
          subjectId: row.upload_id,
          payload: { ttlHours },
        })
        .catch(() => undefined);
      acted += 1;
    }
    return { name: 'upload-sweep', acted };
  }
}
