import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, SimilarityAssessment as SimilarityAssessmentRow } from '@prisma/client';
import { SIMILARITY_ADVISORY_NOTICE, type SimilarityAssessment, type SimilarityReviewInput } from '@alims/contracts';
import { PolicyEngine } from '../../../domain/policy/policy-engine';
import { PolicyService } from '../../../domain/policy/policy.service';
import type { Resource } from '../../../domain/policy/policy';
import { AuditService } from '../../../infrastructure/audit/audit.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TenantContextService } from '../../../interface/middleware/tenant-context.service';

/**
 * Similarity assessment application service (api_specification.md §7,
 * PRD §6.5, ADR-004).
 *
 * THE INVARIANT: this service has no write path to record status. It
 * touches exactly two tables — similarity_assessment and its append-only
 * integrity_review decisions — plus the audit trail. A high score changes
 * nothing on its own; any consequence anywhere else in the system must
 * carry a human decision recorded here.
 *
 * Authorisation: the `similarity.read` capability (supervisor,
 * dept_admin, examiner, registry, librarian, inst_admin — never the
 * student). Everything a caller may not see is a 404, including other
 * institutions' versions (RLS hides them) and the owner's own report
 * (PRD §6.5: results are private to authorised roles).
 */
@Injectable()
export class SimilarityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantContextService,
    private readonly audit: AuditService,
    private readonly policies: PolicyService,
    private readonly engine: PolicyEngine,
  ) {}

  /**
   * The assessment for a version. Assessments materialise on first read
   * in their truthful initial state (`not_requested`, provider `none`) —
   * the row then becomes the durable holder for the (future) provider
   * pipeline and for human reviews.
   */
  async getAssessment(recordId: string, versionId: string, userId: string): Promise<SimilarityAssessment> {
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const { institutionId } = await this.loadVersion(tx, recordId, versionId);
      await this.requireCapability(userId, 'similarity:read', institutionId, recordId, tx);
      const assessment = await this.materialise(tx, versionId);
      return this.toDto(assessment);
    });
  }

  /**
   * Record the human integrity review: append the decision, mark the
   * assessment reviewed, audit it. Changes nothing else — not the record,
   * not the version, not any certificate.
   */
  async reviewAssessment(
    recordId: string,
    versionId: string,
    userId: string,
    input: SimilarityReviewInput,
  ): Promise<SimilarityAssessment> {
    const ctx = this.tenants.current();
    return this.prisma.withTenant(ctx, async (tx) => {
      const { institutionId } = await this.loadVersion(tx, recordId, versionId);
      await this.requireCapability(userId, 'similarity:review', institutionId, recordId, tx);
      const assessment = await this.materialise(tx, versionId);

      // The human decision first — append-only, attributed, reasoned.
      await tx.integrityReview.create({
        data: {
          id: randomUUID(),
          assessmentId: assessment.id,
          reviewerUserId: userId,
          outcome: input.outcome,
          reason: input.reason,
        },
      });

      const updated = await tx.similarityAssessment.update({
        where: { id: assessment.id },
        data: { status: 'reviewed' },
      });

      await this.audit.record(
        {
          action: 'similarity.reviewed',
          subjectType: 'record_version',
          subjectId: versionId,
          actorUserId: userId,
          institutionId,
          payload: { assessmentId: assessment.id, outcome: input.outcome },
        },
        tx,
      );

      return this.toDto(updated);
    });
  }

  // ── internals ─────────────────────────────────────────────

  /** Load the version inside the caller's tenant context; 404 otherwise. */
  private async loadVersion(
    tx: Prisma.TransactionClient,
    recordId: string,
    versionId: string,
  ): Promise<{ recordId: string; institutionId: string | null }> {
    const version = await tx.recordVersion.findUnique({
      where: { id: versionId },
      select: { recordId: true, record: { select: { id: true, institutionId: true } } },
    });
    // Mismatched record/version pairs and RLS-invisible rows are the same 404.
    if (!version || version.recordId !== recordId) {
      throw new NotFoundException('Not found.');
    }
    return { recordId: version.record.id, institutionId: version.record.institutionId };
  }

  /** Get-or-create the version's assessment row in its initial state. */
  private async materialise(
    tx: Prisma.TransactionClient,
    versionId: string,
  ): Promise<SimilarityAssessmentRow> {
    return tx.similarityAssessment.upsert({
      where: { versionId },
      create: { id: randomUUID(), versionId, provider: 'none', status: 'not_requested' },
      update: {},
    });
  }

  private async requireCapability(
    userId: string,
    action: 'similarity:read' | 'similarity:review',
    institutionId: string | null,
    subjectId: string,
    tx: Parameters<Parameters<PrismaService['withTenant']>[1]>[0],
  ): Promise<void> {
    // Membership rows are RLS-scoped to the tenant — resolve inside the
    // ambient transaction, where the caller's context is already bound.
    const actor = await this.policies.resolveActor(userId, tx);
    const resource: Resource = { kind: 'record', id: subjectId, institutionId: institutionId ?? undefined };
    const decision = this.engine.authorize(actor, action, resource);
    if (!decision.allowed) {
      // 404-shape: no disclosure that the version exists.
      throw new NotFoundException('Not found.');
    }
  }

  private toDto(assessment: SimilarityAssessmentRow): SimilarityAssessment {
    return {
      id: assessment.id,
      versionId: assessment.versionId,
      status: assessment.status,
      score: assessment.score === null ? null : Number(assessment.score),
      // Reports are served by the provider pipeline when it exists; there
      // is no URL to hand out until then.
      reportUrl: null,
      provider: assessment.provider,
      advisoryNotice: SIMILARITY_ADVISORY_NOTICE,
      requestedAt: assessment.requestedAt?.toISOString() ?? null,
      completedAt: assessment.completedAt?.toISOString() ?? null,
    };
  }
}
