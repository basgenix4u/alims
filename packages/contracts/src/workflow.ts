import { z } from 'zod';
import { paginationQuerySchema, paginatedSchema, uuidSchema } from './common';
import { integrityOutcomeSchema, reviewDecisionTypeSchema, similarityStatusSchema } from './enums';

/** Review workflow — api_specification.md §7. */
// Note: ReviewDecisionType / reviewDecisionTypeSchema live in ./enums and are
// re-exported from there; importing here keeps one canonical definition.

export const taskStatusSchema = z.enum(['pending', 'completed', 'reassigned', 'escalated']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const reviewTaskSchema = z.object({
  id: uuidSchema,
  recordId: uuidSchema,
  recordTitle: z.string(),
  versionId: uuidSchema,
  versionNo: z.number().int().positive(),
  stage: z.string(),
  status: taskStatusSchema,
  dueAt: z.string().nullable(),
  isOverdue: z.boolean(),
  assignedAt: z.string(),
});
export type ReviewTask = z.infer<typeof reviewTaskSchema>;

/** Task detail — everything a reviewer needs before deciding (spec §7). */
export const reviewTaskDetailSchema = reviewTaskSchema.extend({
  recordStatus: z.string(),
  outputType: z.string(),
  verificationLevel: z.string(),
  institutionId: uuidSchema.nullable(),
  changeSummary: z.string().nullable(),
  fileName: z.string().nullable(),
  scanStatus: z.string(),
  contributors: z.array(
    z.object({
      displayName: z.string(),
      isSupervision: z.boolean(),
      ackStatus: z.string(),
    }),
  ),
  priorDecisions: z.array(
    z.object({
      decision: reviewDecisionTypeSchema,
      comment: z.string(),
      decidedAt: z.string(),
      reviewerName: z.string(),
    }),
  ),
});
export type ReviewTaskDetail = z.infer<typeof reviewTaskDetailSchema>;

export const taskListQuerySchema = paginationQuerySchema.extend({
  /** `me` (default) lists the caller's own tasks. */
  assigned: z.enum(['me']).optional(),
  status: taskStatusSchema.optional(),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const paginatedTasksSchema = paginatedSchema(reviewTaskSchema);

export const taskDecisionSchema = z
  .object({
    decision: reviewDecisionTypeSchema,
    /** Required when the decision returns work to the depositor. */
    comment: z.string().trim().max(4000).optional(),
    requiredActions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  })
  .refine((input) => input.decision === 'approve' || (input.comment ?? '').length >= 10, {
    message: 'A comment of at least 10 characters is required when returning work.',
    path: ['comment'],
  });
export type TaskDecisionInput = z.infer<typeof taskDecisionSchema>;

export const verifyRecordSchema = z.object({
  /** Confirmation that the specific version under review was checked. */
  versionId: uuidSchema,
});
export type VerifyRecordInput = z.infer<typeof verifyRecordSchema>;

// ── Similarity assessment (PRD §6.5, ADR-004) ────────────────────────────
// The similarity subsystem has NO write path to record status. A high score
// changes nothing on its own; every consequence carries a human decision.

/** The exact advisory sentence every assessment response must carry. */
export const SIMILARITY_ADVISORY_NOTICE = 'Review signal only. Not a finding of misconduct.';

export const similarityAssessmentSchema = z.object({
  id: uuidSchema,
  versionId: uuidSchema,
  status: similarityStatusSchema,
  /** Overall overlap percentage from the provider, when a scan completed. */
  score: z.number().min(0).max(100).nullable(),
  /** Provider report location; null until a report exists. */
  reportUrl: z.string().nullable(),
  provider: z.string(),
  advisoryNotice: z.literal(SIMILARITY_ADVISORY_NOTICE),
  requestedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type SimilarityAssessment = z.infer<typeof similarityAssessmentSchema>;

/** A human must choose an outcome and give a reason (PRD §6.5). */
export const similarityReviewSchema = z.object({
  outcome: integrityOutcomeSchema,
  reason: z.string().trim().min(10).max(4000),
});
export type SimilarityReviewInput = z.infer<typeof similarityReviewSchema>;
