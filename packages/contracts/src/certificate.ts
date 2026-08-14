import { z } from 'zod';
import { certificateStatusSchema, outputTypeSchema, verificationLevelSchema } from './enums';

/**
 * Public certificate verification.
 * PRD §6.4: the QR destination exposes ONLY these approved fields and must
 * never reveal private academic, identity, assessment or review data.
 */

export const CERTIFICATE_DISCLAIMER =
  'Confirms an ALIMS verification record. Not a legal determination of copyright ownership, originality, or degree award.';

export const publicVerificationSchema = z.object({
  status: z.enum(['valid', 'superseded', 'revoked', 'not_found']),
  certificateNo: z.string(),
  nxrId: z.string(),
  title: z.string(),
  researcherNames: z.array(z.string()),
  institutionName: z.string(),
  outputType: outputTypeSchema,
  issueDate: z.string(),
  verificationLevel: verificationLevelSchema,
  supersededBy: z.string().nullable(),
  disclaimer: z.literal(CERTIFICATE_DISCLAIMER),
});
export type PublicVerification = z.infer<typeof publicVerificationSchema>;

/**
 * Fields that must NEVER appear in any public verification payload.
 * Enforced by contract tests so a future change cannot silently leak them.
 */
export const FORBIDDEN_PUBLIC_FIELDS = [
  'grade', 'studentId', 'similarityScore', 'similarityReport',
  'reviewerNotes', 'reviewComments', 'email', 'phone',
  'fileKey', 'downloadUrl', 'legalName', 'internalNotes',
] as const;

export const certificateStatusResponseSchema = z.object({ status: certificateStatusSchema });
