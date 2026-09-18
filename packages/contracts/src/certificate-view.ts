import { z } from 'zod';
import { certificateStatusSchema, outputTypeSchema, verificationLevelSchema } from './enums';
import { uuidSchema } from './common';

/** Certificates — api_specification.md §8. */

export const issueCertificateSchema = z.object({
  /** Optional explicit target; defaults to the latest verified version. */
  versionId: uuidSchema.optional(),
});
export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;

export const revokeCertificateSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});
export type RevokeCertificateInput = z.infer<typeof revokeCertificateSchema>;

/** Private, role-scoped certificate view (registry, owner). */
export const certificateSchema = z.object({
  id: uuidSchema,
  certificateNo: z.string(),
  recordId: uuidSchema,
  recordTitle: z.string(),
  institutionName: z.string(),
  versionId: uuidSchema,
  versionNo: z.number().int().positive(),
  nxrId: z.string(),
  status: certificateStatusSchema,
  verificationLevel: verificationLevelSchema,
  outputType: outputTypeSchema,
  issuedBy: z.object({ id: uuidSchema, displayName: z.string() }),
  issuedAt: z.string(),
  supersededBy: z.string().nullable(),
  revokedReason: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type Certificate = z.infer<typeof certificateSchema>;
