import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CERTIFICATE_DISCLAIMER,
  type Certificate,
  type IssueCertificateInput,
  type RevokeCertificateInput,
  issueCertificateSchema,
  revokeCertificateSchema,
} from '@alims/contracts';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { Env } from '../../../config/env';
import { AuditService } from '../../../infrastructure/audit/audit.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PolicyEngine } from '../../../domain/policy/policy-engine';
import { PolicyService } from '../../../domain/policy/policy.service';
import type { Resource } from '../../../domain/policy/policy';
import { TenantContextService } from '../../../interface/middleware/tenant-context.service';

/**
 * Certificates (api_specification.md §8, PRD §6.4, §8).
 *
 * Issuance: registry capability + step-up (route guard), only for a record
 * that is institutionally_verified by a verified institution, and only
 * against the version that verification bound to (the completed final-stage
 * task). One certificate per version; re-verification on a newer version
 * supersedes the previous certificate — history is never rewritten.
 *
 * The QR token is 32 bytes of CSPRNG output, opaque, carrying no embedded
 * data: it is only ever resolved by the public verification function.
 */

export function formatCertificateNo(year: number, sequence: number): string {
  return `CERT-${year}-${String(sequence).padStart(6, '0')}`;
}

export function newQrToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class CertificateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantContextService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly policies: PolicyService,
    private readonly engine: PolicyEngine,
  ) {}

  async issue(
    recordId: string,
    userId: string,
    input: IssueCertificateInput,
  ): Promise<Certificate> {
    const parsed = issueCertificateSchema.parse(input);
    const ctx = this.tenants.current();

    return this.prisma.withTenant(ctx, async (tx) => {
      const record = await tx.researchRecord.findUnique({
        where: { id: recordId },
        include: { institution: true },
      });
      if (!record || !record.institutionId) {
        throw new NotFoundException('Record not found.');
      }
      await this.requireIssueCapability(userId, record.ownerUserId, record.institutionId, tx);

      if (record.status !== 'institutionally_verified' && record.status !== 'published') {
        throw new ConflictException(
          'Certificates are only issued for institutionally verified records.',
        );
      }
      if (record.institution!.status !== 'verified') {
        throw new ConflictException(
          'Only verified institutions can issue certificates.',
        );
      }

      // The verified version: what the completed final review stage bound
      // verification to (PRD §6.3 — the certificate names a sealed version).
      const instance = await tx.workflowInstance.findUnique({
        where: { recordId },
        include: {
          template: true,
          tasks: { where: { status: 'completed' }, orderBy: { completedAt: 'desc' } },
        },
      });
      if (!instance || !instance.isComplete) {
        throw new ConflictException(
          'No completed review workflow for this record.',
        );
      }
      const stages = (instance.template.stages as Array<{ name: string }>).map((s) => s.name);
      const finalStage = stages[stages.length - 1]!;
      const finalTask = instance.tasks.find((t) => t.stage === finalStage);
      if (!finalTask) {
        throw new ConflictException('The verified version could not be resolved.');
      }
      const versionId = parsed.versionId ?? finalTask.versionId;
      if (versionId !== finalTask.versionId) {
        throw new ConflictException(
          'That version is not the verified version of this record.',
        );
      }

      const existingForVersion = await tx.certificate.findUnique({ where: { versionId } });
      if (existingForVersion) {
        throw new ConflictException(
          'This version already has a certificate. A re-verified new version supersedes it.',
        );
      }

      const version = await tx.recordVersion.findUnique({ where: { id: versionId } });
      if (!version) throw new NotFoundException('Version not found.');

      const certificateNo = await this.mintCertificateNo(tx);
      const qrToken = newQrToken();

      // Supersede any earlier certificate for this record (a newer verified
      // version replaces it; the old one remains queryable as superseded).
      const previous = await tx.certificate.findFirst({
        where: { recordId, status: 'valid' },
        orderBy: { issuedAt: 'desc' },
      });

      const created = await tx.certificate.create({
        data: {
          id: randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
          recordId,
          versionId,
          certificateNo,
          nxrId: record.nxrId ?? '',
          qrToken,
          issuedById: userId,
        },
      });
      if (previous) {
        await tx.certificate.update({
          where: { id: previous.id },
          data: { status: 'superseded', supersededById: created.id },
        });
      }

      await this.audit.record(
        {
          action: 'certificate.issued',
          subjectType: 'certificate',
          subjectId: created.id,
          actorUserId: userId,
          institutionId: record.institutionId,
          payload: { recordId, versionId, certificateNo },
        },
        tx,
      );
      if (previous) {
        await this.audit.record(
          {
            action: 'certificate.superseded',
            subjectType: 'certificate',
            subjectId: previous.id,
            actorUserId: userId,
            institutionId: record.institutionId,
            payload: { by: created.id },
          },
          tx,
        );
      }

      return this.toDto(
        tx,
        created.id,
      );
    });
  }

  async revoke(
    certificateId: string,
    userId: string,
    input: RevokeCertificateInput,
  ): Promise<Certificate> {
    const parsed = revokeCertificateSchema.parse(input);
    const ctx = this.tenants.current();

    return this.prisma.withTenant(ctx, async (tx) => {
      const cert = await tx.certificate.findUnique({
        where: { id: certificateId },
        include: { record: true },
      });
      if (!cert) throw new NotFoundException('Certificate not found.');
      await this.requireIssueCapability(
        userId,
        cert.record.ownerUserId,
        cert.record.institutionId,
        tx,
      );
      if (cert.status !== 'valid') {
        throw new ConflictException('Only a valid certificate can be revoked.');
      }

      await tx.certificate.update({
        where: { id: certificateId },
        data: { status: 'revoked', revokedReason: parsed.reason, revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'certificate.revoked',
          subjectType: 'certificate',
          subjectId: certificateId,
          actorUserId: userId,
          institutionId: cert.record.institutionId,
          payload: { reason: parsed.reason },
        },
        tx,
      );

      return this.toDto(tx, certificateId);
    });
  }

  /** Private, role-scoped read: registry/librarian in-tenant, or the owner. */
  async get(certificateId: string, userId: string): Promise<Certificate> {
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const cert = await tx.certificate.findUnique({
        where: { id: certificateId },
        include: { record: true },
      });
      if (!cert) throw new NotFoundException('Certificate not found.');
      if (cert.record.ownerUserId !== userId) {
        await this.requireReadCapability(userId, cert.record.institutionId, tx);
      }
      return this.toDto(tx, certificateId);
    });
  }

  /**
   * The certificate PDF: A4, the verification facts, the QR that resolves
   * to the public verification page, and the disclaimer — no more.
   */
  async renderPdf(certificateId: string, userId: string): Promise<Uint8Array> {
    const dto = await this.get(certificateId, userId);
    const publicUrl = `${this.config.get('PUBLIC_BASE_URL')}/verify/${await this.qrTokenFor(certificateId)}`;
    const qrPng = await QRCode.toBuffer(publicUrl, { type: 'png', margin: 1, width: 240 });

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4
    const serif = await pdf.embedFont(StandardFonts.TimesRoman);
    const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const ink = rgb(0.09, 0.11, 0.16);
    const muted = rgb(0.35, 0.38, 0.44);

    const margin = 56;
    let y = 786;

    page.drawText('ALIMS', { x: margin, y, size: 20, font: serifBold, color: ink });
    y -= 16;
    page.drawLine({
      start: { x: margin, y },
      end: { x: 595.28 - margin, y },
      thickness: 1.2,
      color: rgb(0.29, 0.31, 0.55),
    });
    y -= 44;
    page.drawText('Certificate of Institutional Verification', {
      x: margin,
      y,
      size: 24,
      font: serifBold,
      color: ink,
    });
    y -= 34;

    const rows: Array<[string, string]> = [
      ['Certificate No', dto.certificateNo],
      ['NXR-ID', dto.nxrId],
      ['Title', dto.recordTitle],
      ['Output', dto.outputType],
      ['Institution', dto.institutionName],
      ['Verification level', 'Institutionally Verified'],
      ['Sealed version', `Version ${dto.versionNo}`],
      ['Issued on', dto.issuedAt.slice(0, 10)],
      ['Status', dto.status],
    ];
    for (const [label, value] of rows) {
      page.drawText(`${label}`, { x: margin, y, size: 11, font: serifBold, color: muted });
      page.drawText(value.slice(0, 72), { x: margin + 150, y, size: 11, font: serif, color: ink });
      y -= 20;
    }

    const qrImage = await pdf.embedPng(qrPng);
    page.drawImage(qrImage, { x: margin, y: y - 140, width: 120, height: 120 });
    page.drawText('Scan to verify independently', {
      x: margin + 136,
      y: y - 66,
      size: 11,
      font: serifBold,
      color: ink,
    });
    page.drawText(publicUrl, {
      x: margin + 136,
      y: y - 84,
      size: 9,
      font: serif,
      color: muted,
    });
    y -= 170;

    const disclaimer =
      'Disclaimer: ' + CERTIFICATE_DISCLAIMER;
    const wrapped = wrap(disclaimer, 92);
    for (const line of wrapped) {
      page.drawText(line, { x: margin, y, size: 9.5, font: serif, color: muted });
      y -= 14;
    }

    return pdf.save();
  }

  private async qrTokenFor(certificateId: string): Promise<string> {
    const ctx = this.tenants.current();
    const cert = await this.prisma.withTenant(ctx, (tx) =>
      tx.certificate.findUnique({ where: { id: certificateId }, select: { qrToken: true } }),
    );
    if (!cert) throw new NotFoundException('Certificate not found.');
    return cert.qrToken;
  }

  private async mintCertificateNo(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `CERT-${year}-`;
    const taken = await tx.certificate.count({
      where: { certificateNo: { startsWith: prefix } },
    });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const candidate = formatCertificateNo(year, taken + attempt);
      const clash = await tx.certificate.findUnique({
        where: { certificateNo: candidate },
      });
      if (!clash) return candidate;
    }
    return formatCertificateNo(year, 900_000 + Math.floor(Math.random() * 99_000));
  }

  private async requireIssueCapability(
    userId: string,
    ownerUserId: string,
    institutionId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const actor = await this.policies.resolveActor(userId, tx);
    const resource: Resource = {
      kind: 'certificate',
      ownerId: ownerUserId,
      institutionId: institutionId ?? undefined,
    };
    const decision = this.engine.authorize(actor, 'certificate:issue', resource);
    if (!decision.allowed) throw new NotFoundException('Certificate not found.');
  }

  private async requireReadCapability(
    userId: string,
    institutionId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const actor = await this.policies.resolveActor(userId, tx);
    const resource: Resource = {
      kind: 'certificate',
      institutionId: institutionId ?? undefined,
    };
    const decision = this.engine.authorize(actor, 'certificate:read', resource);
    if (!decision.allowed) throw new NotFoundException('Certificate not found.');
  }

  private async toDto(tx: Prisma.TransactionClient, certificateId: string): Promise<Certificate> {
    const cert = await tx.certificate.findUnique({
      where: { id: certificateId },
      include: {
        issuedBy: { select: { id: true, displayName: true } },
        version: true,
        record: {
          select: {
            id: true,
            title: true,
            verificationLevel: true,
            outputType: true,
            institution: { select: { displayName: true } },
          },
        },
        supersededBy: { select: { certificateNo: true } },
      },
    });
    if (!cert) throw new NotFoundException('Certificate not found.');
    return {
      id: cert.id,
      certificateNo: cert.certificateNo,
      recordId: cert.record.id,
      recordTitle: cert.record.title,
      institutionName: cert.record.institution?.displayName ?? '',
      versionId: cert.versionId,
      versionNo: cert.version.versionNo,
      nxrId: cert.nxrId,
      status: cert.status,
      verificationLevel: cert.record.verificationLevel,
      outputType: cert.record.outputType,
      issuedBy: cert.issuedBy,
      issuedAt: cert.issuedAt.toISOString(),
      supersededBy: cert.supersededBy?.certificateNo ?? null,
      revokedReason: cert.revokedReason,
      revokedAt: cert.revokedAt ? cert.revokedAt.toISOString() : null,
    };
  }
}

function wrap(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else {
      line += ` ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

