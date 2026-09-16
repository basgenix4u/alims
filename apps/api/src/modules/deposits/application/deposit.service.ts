import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEPOSIT_RECEIPT_STATEMENT,
  type CreateVersionInput,
  type DepositReceipt,
  type RecordVersion,
  type UploadInitInput,
  type UploadInitResponse,
  type UploadStatus,
  createVersionSchema,
} from '@alims/contracts';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../../infrastructure/audit/audit.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { LocalStorage } from '../../../infrastructure/storage/local-storage.service';
import { PolicyEngine } from '../../../domain/policy/policy-engine';
import { PolicyService } from '../../../domain/policy/policy.service';
import type { Resource } from '../../../domain/policy/policy';
import { TenantContextService } from '../../../interface/middleware/tenant-context.service';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
import { makeScanner, type ScanOutcome } from '../scan/scanner.service';

/**
 * File deposit lifecycle (api_specification.md §6, PRD §6.3).
 *
 * Versions are append-only rows; uploads are presigned-multipart sessions
 * against the storage port; completion assembles parts, verifies size,
 * records the deposit receipt with its honest evidence-only statement, and
 * queues the safety scan. Cross-tenant visibility is enforced by row-level
 * security — a foreign upload session is simply not found.
 */

const PART_TTL_SECONDS = 60 * 60;
const DOWNLOAD_TTL_SECONDS = 60;

type VersionRow = {
  id: string;
  versionNo: number;
  changeSummary: string;
  state: string;
  fileName: string | null;
  fileSizeBytes: bigint | null;
  mimeType: string | null;
  sha256: string | null;
  scanStatus: string;
  submittedAt: Date | null;
  isImmutable: boolean;
  createdAt: Date;
  submittedBy?: { id: string; displayName: string } | null;
};

@Injectable()
export class DepositService {
  private readonly scanner: ReturnType<typeof makeScanner>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantContextService,
    private readonly audit: AuditService,
    private readonly localStorage: LocalStorage,
    private readonly config: ConfigService<Env, true>,
    private readonly policies: PolicyService,
    private readonly engine: PolicyEngine,
  ) {
    this.scanner = makeScanner(config);
  }

  /** Versions are created from a record in a state that accepts one. */
  async createVersion(
    recordId: string,
    userId: string,
    input: CreateVersionInput,
  ): Promise<RecordVersion> {
    const parsed = createVersionSchema.parse(input);
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const record = await tx.researchRecord.findUnique({ where: { id: recordId } });
      if (!record || record.ownerUserId !== userId) {
        throw new NotFoundException('Record not found.');
      }
      const accepting = new Set(['draft', 'returned_for_revision', 'published']);
      if (!accepting.has(record.status)) {
        throw new ConflictException(
          'This record does not accept a new version in its current state.',
        );
      }

      const latest = await tx.recordVersion.findFirst({
        where: { recordId },
        orderBy: { versionNo: 'desc' },
        select: { versionNo: true },
      });
      const created = await tx.recordVersion.create({
        data: {
          id: randomUUID(),
          recordId,
          versionNo: (latest?.versionNo ?? 0) + 1,
          changeSummary: parsed.changeSummary,
          state: 'draft',
        },
        include: { submittedBy: { select: { id: true, displayName: true } } },
      });

      await this.audit.record({
        action: 'version.created',
        subjectType: 'record_version',
        subjectId: created.id,
        actorUserId: userId,
        institutionId: record.institutionId,
        payload: { recordId, versionNo: created.versionNo },
      });

      return this.toVersionDto(created);
    });
  }

  /** Every version ever submitted, newest first — nothing is removed. */
  async listVersions(recordId: string, userId: string): Promise<RecordVersion[]> {
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const record = await tx.researchRecord.findUnique({ where: { id: recordId } });
      if (!record || record.ownerUserId !== userId) {
        throw new NotFoundException('Record not found.');
      }
      const rows = await tx.recordVersion.findMany({
        where: { recordId },
        orderBy: { versionNo: 'desc' },
        include: { submittedBy: { select: { id: true, displayName: true } } },
      });
      return rows.map((r) => this.toVersionDto(r));
    });
  }

  async initUpload(userId: string, input: UploadInitInput): Promise<UploadInitResponse> {
    const allow = this.mimeAllowlist();
    if (!allow.has(input.mimeType)) {
      throw new ConflictException(
        `This file type is not accepted. Allowed: ${[...allow].join(', ')}.`,
      );
    }
    const maxBytes = this.maxFileBytes();
    if (input.fileSize > maxBytes) {
      throw new ConflictException(`Files are limited to ${maxBytes / 1_048_576} MB.`);
    }

    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const version = await tx.recordVersion.findUnique({
        where: { id: input.versionId },
        include: { record: true },
      });
      if (!version || version.record.ownerUserId !== userId) {
        throw new NotFoundException('Version not found.');
      }

      // Init-time duplicate detection when the client supplies the digest.
      if (input.sha256 && !input.intent) {
        const duplicate = await tx.recordVersion.findFirst({
          where: {
            sha256: input.sha256,
            record: { ownerUserId: userId, id: version.recordId },
          },
        });
        if (duplicate) {
          throw new ConflictException(
            'This exact file was already deposited on this record. Confirm your intent to deposit it again.',
          );
        }
      }

      const partSize = this.partSizeBytes();
      const partCount = Math.max(1, Math.ceil(input.fileSize / partSize));
      const uploadId = randomUUID();
      await tx.fileUpload.create({
        data: {
          id: uploadId,
          versionId: input.versionId,
          fileName: sanitizeFileName(input.fileName),
          fileSizeBytes: BigInt(input.fileSize),
          mimeType: input.mimeType,
          partSizeBytes: BigInt(partSize),
          expectedSha256: input.sha256,
          intent: input.intent,
          createdById: userId,
          parts: [],
        },
      });

      await this.audit.record({
        action: 'upload.initialized',
        subjectType: 'file_upload',
        subjectId: uploadId,
        actorUserId: userId,
        institutionId: version.record.institutionId,
        payload: { versionId: input.versionId, fileSize: input.fileSize, mimeType: input.mimeType },
      });

      const parts = Array.from({ length: partCount }, (_, i) => {
        const signed = this.localStorage.signPartUpload(
          '',
          uploadId,
          i + 1,
          PART_TTL_SECONDS,
        );
        return {
          partNumber: i + 1,
          url: signed.url,
          expiresAt: signed.expiresAt.toISOString(),
        };
      });

      return {
        uploadId,
        parts,
        partSizeBytes: partSize,
        maxFileSize: maxBytes,
        acceptedMimeTypes: [...allow],
      };
    });
  }

  /** Local-mode part sink. Authorised by the signed part token only. */
  async putPart(
    uploadId: string,
    partNumber: number,
    token: string,
    body: NodeJS.ReadableStream,
  ): Promise<{ etag: string }> {
    if (!this.localStorage.verifyPartToken(token, uploadId, partNumber)) {
      throw new NotFoundException('Upload part URL is invalid or expired.');
    }
    const etag = await this.localStorage.writePart(uploadId, partNumber, body as never);

    const ctx = this.tenants.current();
    await this.prisma.withTenant(ctx, async (tx) => {
      const upload = await tx.fileUpload.findUnique({ where: { id: uploadId } });
      if (!upload || upload.status !== 'in_progress') {
        throw new NotFoundException('Upload session not found.');
      }
      const parts = (upload.parts as Array<{ partNumber: number; etag: string }>) ?? [];
      const next = parts.filter((p) => p.partNumber !== partNumber);
      next.push({ partNumber, etag });
      next.sort((a, b) => a.partNumber - b.partNumber);
      await tx.fileUpload.update({ where: { id: uploadId }, data: { parts: next } });
    });

    return { etag };
  }

  async completeUpload(
    userId: string,
    uploadId: string,
    declared: Array<{ partNumber: number; etag: string }>,
  ): Promise<{ versionId: string; scanStatus: 'pending'; receipt: DepositReceipt }> {
    const ctx = this.tenants.current();
    const upload = await this.prisma.withTenant(ctx, (tx) =>
      tx.fileUpload.findUnique({
        where: { id: uploadId },
        include: { version: { include: { record: true } } },
      }),
    );
    if (!upload || upload.createdById !== userId) {
      throw new NotFoundException('Upload session not found.');
    }
    if (upload.status === 'completed') {
      throw new ConflictException('This upload session is already complete.');
    }

    const stored = (upload.parts as Array<{ partNumber: number; etag: string }>) ?? [];
    const storedMap = new Map(stored.map((p) => [p.partNumber, p.etag]));
    for (const part of declared) {
      if (storedMap.get(part.partNumber) !== part.etag) {
        throw new ConflictException('Part inventory does not match. Re-request missing part URLs.');
      }
    }
    const partSize = Number(upload.partSizeBytes);
    const expectedParts = Math.max(1, Math.ceil(Number(upload.fileSizeBytes) / partSize));
    if (stored.length !== expectedParts) {
      throw new ConflictException(
        `Upload incomplete: ${stored.length}/${expectedParts} parts received.`,
      );
    }

    const key = `versions/${upload.versionId}/object.bin`;
    const sha256 = await this.localStorage.assemble(
      uploadId,
      key,
      Number(upload.fileSizeBytes),
    );

    // Complete-time duplicate detection — the computed digest is authoritative.
    if (!upload.intent) {
      const duplicate = await this.prisma.withTenant(ctx, (tx) =>
        tx.recordVersion.findFirst({
          where: {
            sha256,
            record: { ownerUserId: userId, id: upload.version.recordId },
            id: { not: upload.versionId },
          },
        }),
      );
      if (duplicate) {
        await this.prisma.withTenant(ctx, (tx) =>
          tx.fileUpload.update({ where: { id: uploadId }, data: { status: 'needs_intent' } }),
        );
        throw new ConflictException(
          'This exact file was already deposited on this record. Confirm your intent to deposit it again.',
        );
      }
    }

    // A digest matching another depositor's record raises an internal
    // provenance-review signal and discloses NOTHING to this depositor.
    // Row-level security correctly hides other depositors' drafts, so the
    // existence check is a SECURITY DEFINER boolean — no data crosses the
    // tenant boundary, only "yes/no".
    const foreignRows = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ match: boolean }>>`
        SELECT digest_matches_other_depositor(${sha256}::text, ${userId}::uuid) AS match
      `,
    );
    const foreignMatch = foreignRows[0]?.match === true;

    const receipt = await this.prisma.withTenant(ctx, async (tx) => {
      await tx.recordVersion.update({
        where: { id: upload.versionId },
        data: {
          fileKey: key,
          fileName: upload.fileName,
          fileSizeBytes: upload.fileSizeBytes,
          mimeType: upload.mimeType,
          sha256,
          scanStatus: 'pending',
        },
      });
      const created = await tx.depositReceipt.create({
        data: {
          versionId: upload.versionId,
          recordId: upload.version.recordId,
          sha256,
          depositedById: userId,
        },
      });
      await tx.fileUpload.update({
        where: { id: uploadId },
        data: { status: 'completed', completedAt: new Date() },
      });
      return created;
    });

    await this.localStorage.discardParts(uploadId);

    await this.audit.record({
      action: 'upload.completed',
      subjectType: 'file_upload',
      subjectId: uploadId,
      actorUserId: userId,
      institutionId: upload.version.record.institutionId,
      payload: { versionId: upload.versionId, sha256 },
    });
    if (foreignMatch === true) {
      await this.audit.record({
        action: 'file.provenance_signal',
        subjectType: 'record_version',
        subjectId: upload.versionId,
        actorUserId: userId,
        payload: { reason: 'duplicate_digest_across_depositors' },
      });
    }

    // Safety scan runs after the response; status is pollable.
    void this.runScan(upload.versionId, key, userId);

    return {
      versionId: upload.versionId,
      scanStatus: 'pending',
      receipt: {
        receiptId: receipt.id,
        recordId: upload.version.recordId,
        versionId: upload.versionId,
        sha256,
        receivedAt: receipt.receivedAt.toISOString(),
        depositedBy: userId,
        statement: DEPOSIT_RECEIPT_STATEMENT,
      },
    };
  }

  async uploadStatus(userId: string, uploadId: string): Promise<UploadStatus> {
    const ctx = this.tenants.current();
    const upload = await this.prisma.withTenant(ctx, (tx) =>
      tx.fileUpload.findUnique({ where: { id: uploadId }, include: { version: true } }),
    );
    if (!upload || upload.createdById !== userId) {
      throw new NotFoundException('Upload session not found.');
    }
    const partSize = Number(upload.partSizeBytes);
    const expectedParts = Math.max(1, Math.ceil(Number(upload.fileSizeBytes) / partSize));
    const stored = ((upload.parts as Array<{ partNumber: number }>) ?? []).length;
    const progress =
      upload.status === 'completed' ? 100 : Math.min(99, Math.round((stored / expectedParts) * 100));

    let message: string | null = null;
    if (upload.version.scanStatus === 'infected') {
      message =
        'This file was rejected by the safety scan. It cannot be downloaded. Contact the repository administrator.';
    } else if (upload.version.scanStatus === 'unsupported') {
      message =
        'No virus scanner is configured for this deployment. Contact the repository administrator before relying on this file.';
    }

    return {
      scanStatus: upload.version.scanStatus as UploadStatus['scanStatus'],
      checksumStatus: upload.status === 'completed' ? 'verified' : 'unavailable',
      progressPercent: progress,
      message,
    };
  }

  /** Policy-gated download: 60-second signed URL; blocked by scan/embargo. */
  async requestDownload(
    recordId: string,
    versionId: string,
    userId: string,
  ): Promise<{ url: string }> {
    const ctx = this.tenants.current();
    const version = await this.prisma.withTenant(ctx, (tx) =>
      tx.recordVersion.findFirst({
        where: { id: versionId, recordId },
        include: { record: true },
      }),
    );
    if (!version) throw new NotFoundException('Version not found.');

    const isOwner = version.record.ownerUserId === userId;
    if (!isOwner) {
      const actor = await this.policies.resolveActor(userId);
      const resource: Resource = {
        kind: 'version',
        id: version.id,
        ownerId: version.record.ownerUserId,
        institutionId: version.record.institutionId ?? undefined,
      };
      const decision = this.engine.authorize(actor, 'version:download', resource);
      if (!decision.allowed) {
        await this.auditDenial(userId, version.id, 'unauthorized');
        throw new NotFoundException('Version not found.');
      }
    }

    if (version.scanStatus === 'infected') {
      await this.auditDenial(userId, version.id, 'unclean_scan');
      throw new ConflictException(
        'This file did not pass the safety scan and cannot be downloaded.',
      );
    }
    const embargoed =
      version.record.embargoUntil !== null &&
      version.record.embargoUntil.getTime() > Date.now();
    if (embargoed && !isOwner) {
      await this.auditDenial(userId, version.id, 'embargo');
      throw new ConflictException('This record is under embargo and cannot be downloaded yet.');
    }
    if (!version.fileKey) {
      throw new ConflictException('This version has no deposited file.');
    }

    await this.audit.record({
      action: 'file.download',
      subjectType: 'record_version',
      subjectId: version.id,
      actorUserId: userId,
      institutionId: version.record.institutionId ?? undefined,
      payload: { recordId },
    });

    const signed = this.localStorage.signDownload('', version.fileKey, DOWNLOAD_TTL_SECONDS);
    return { url: signed.url };
  }

  /** Streams an object for a valid download token (the 302 target). */
  async openDownload(token: string, key: string): Promise<NodeJS.ReadableStream> {
    if (!this.localStorage.verifyDownloadToken(token, key)) {
      throw new NotFoundException('Download URL is invalid or expired.');
    }
    return this.localStorage.openObject(key);
  }

  private async runScan(versionId: string, key: string, userId: string): Promise<void> {
    let outcome: ScanOutcome;
    try {
      outcome = await this.scanner.scan(key, this.localStorage);
    } catch {
      outcome = { status: 'failed', message: 'The safety scan could not run.' };
    }
    await this.prisma
      .withTenant({ institutionId: null, userId }, (tx) =>
        tx.recordVersion.update({
          where: { id: versionId },
          data: { scanStatus: outcome.status },
        }),
      )
      .catch(() => undefined);
    await this.audit
      .record({
        action: 'file.scan.result',
        subjectType: 'record_version',
        subjectId: versionId,
        actorUserId: userId,
        payload: { status: outcome.status, scanner: this.scanner.name },
      })
      .catch(() => undefined);
  }

  private async auditDenial(userId: string, versionId: string, reason: string): Promise<void> {
    await this.audit
      .record({
        action: 'file.download.denied',
        subjectType: 'record_version',
        subjectId: versionId,
        actorUserId: userId,
        payload: { reason },
      })
      .catch(() => undefined);
  }

  private toVersionDto(row: VersionRow): RecordVersion {
    return {
      id: row.id,
      versionNo: row.versionNo,
      changeSummary: row.changeSummary,
      state: row.state as RecordVersion['state'],
      fileName: row.fileName,
      fileSizeBytes: row.fileSizeBytes === null ? null : Number(row.fileSizeBytes),
      mimeType: row.mimeType,
      sha256: row.sha256,
      scanStatus: row.scanStatus as RecordVersion['scanStatus'],
      submittedBy: row.submittedBy ?? null,
      submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
      isImmutable: row.isImmutable,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mimeAllowlist(): Set<string> {
    const raw = (this.config.get('UPLOAD_MIME_ALLOWLIST') as string) ?? '';
    return new Set(
      raw
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    );
  }

  private maxFileBytes(): number {
    return Number(this.config.get('UPLOAD_MAX_FILE_MB')) * 1_048_576;
  }

  private partSizeBytes(): number {
    return Number(this.config.get('UPLOAD_PART_SIZE_MB')) * 1_048_576;
  }
}

/** Strips path separators and control characters from a client filename. */
function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is being stripped
  return name.replace(/[/\\\u0000-\u001f]/g, "_").slice(0, 300);
}
