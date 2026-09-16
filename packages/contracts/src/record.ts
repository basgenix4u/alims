import { z } from 'zod';
import {
  accessLevelSchema, incompleteReasonSchema, outputTypeSchema,
  recordStatusSchema, scanStatusSchema, verificationLevelSchema,
  versionStateSchema,
} from './enums';
import { uuidSchema } from './common';

/**
 * Research Record contracts.
 * Field limits come directly from PRD §6.2 and are enforced identically
 * on client and server — the server remains authoritative.
 */

export const TITLE_MIN = 10;
export const TITLE_MAX = 500;
export const ABSTRACT_MIN = 100;
export const ABSTRACT_MAX = 10_000;
export const KEYWORDS_MIN = 1;
export const KEYWORDS_MAX = 20;
export const CHANGE_SUMMARY_MIN = 10;
export const CHANGE_SUMMARY_MAX = 1_000;

export const createRecordSchema = z.object({
  outputType: outputTypeSchema,
  title: z.string().trim().min(TITLE_MIN).max(TITLE_MAX),
  abstract: z.string().trim().min(ABSTRACT_MIN).max(ABSTRACT_MAX).optional(),
  institutionId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  programmeId: uuidSchema.optional(),
  sessionId: uuidSchema.optional(),
  disciplines: z.array(z.string().trim().min(1)).min(1),
  keywords: z.array(z.string().trim().min(1)).min(KEYWORDS_MIN).max(KEYWORDS_MAX),
  researchYear: z.number().int().min(1800).max(2200).optional(),
  accessLevel: accessLevelSchema,
  licence: z.string().trim().min(1),
  supervisorUserIds: z.array(uuidSchema).optional(),
  researchQuestion: z.string().trim().max(2_000).optional(),
  methodology: z.string().trim().max(5_000).optional(),
  fundingSource: z.string().trim().max(500).optional(),
  ethicsApprovalRef: z.string().trim().max(200).optional(),
  datasetLinks: z.array(z.string().url()).max(50).optional(),
  codeLinks: z.array(z.string().url()).max(50).optional(),
  languages: z.array(z.string().trim()).max(20).optional(),
  completionState: z.enum(['complete', 'incomplete_seeking_continuation']).optional(),
  incompleteReason: incompleteReasonSchema.optional(),
  relatedRecordIds: z.array(uuidSchema).max(100).optional(),
});
export type CreateRecordInput = z.infer<typeof createRecordSchema>;

export const updateRecordSchema = createRecordSchema.partial();
export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;

/** UI hints only. The server re-authorizes every action (PRD §9.1). */
export const recordPermissionsSchema = z.object({
  canEdit: z.boolean(),
  canSubmit: z.boolean(),
  canUpload: z.boolean(),
  canIssueCertificate: z.boolean(),
  canViewSimilarity: z.boolean(),
  canDownload: z.boolean(),
});

export const recordSummarySchema = z.object({
  id: uuidSchema,
  nxrId: z.string().nullable(),
  title: z.string(),
  outputType: outputTypeSchema,
  status: recordStatusSchema,
  verificationLevel: verificationLevelSchema,
  accessLevel: accessLevelSchema,
  institution: z.object({ id: uuidSchema, displayName: z.string() }).nullable(),
  researchYear: z.number().int().nullable(),
  disciplines: z.array(z.string()),
  contributorsDisplay: z.array(
    z.object({ displayName: z.string(), isSupervision: z.boolean() }),
  ),
  currentVersionNo: z.number().int().nullable(),
  embargoUntil: z.string().nullable(),
  updatedAt: z.string(),
});
export type RecordSummary = z.infer<typeof recordSummarySchema>;

export const createVersionSchema = z.object({
  changeSummary: z.string().trim().min(CHANGE_SUMMARY_MIN).max(CHANGE_SUMMARY_MAX),
});
export type CreateVersionInput = z.infer<typeof createVersionSchema>;

/**
 * PRD §6.3: deposit evidence is NOT proof of ownership or originality.
 * The disclaimer travels with the receipt so no consumer can misrepresent it.
 */
export const DEPOSIT_RECEIPT_STATEMENT =
  'Deposit evidence only — confirms that a verified account deposited this file at the recorded time. Not proof of legal ownership or original authorship.';

export const depositReceiptSchema = z.object({
  receiptId: uuidSchema,
  recordId: uuidSchema,
  versionId: uuidSchema,
  sha256: z.string().length(64),
  receivedAt: z.string(),
  depositedBy: z.string(),
  statement: z.literal(DEPOSIT_RECEIPT_STATEMENT),
});
export type DepositReceipt = z.infer<typeof depositReceiptSchema>;

/** Version listing/creation — api_specification.md §6. */
export const recordVersionSchema = z.object({
  id: uuidSchema,
  versionNo: z.number().int().positive(),
  changeSummary: z.string(),
  state: versionStateSchema,
  fileName: z.string().nullable(),
  fileSizeBytes: z.number().int().nullable(),
  mimeType: z.string().nullable(),
  sha256: z.string().nullable(),
  scanStatus: scanStatusSchema,
  submittedBy: z.object({ id: uuidSchema, displayName: z.string() }).nullable(),
  submittedAt: z.string().nullable(),
  isImmutable: z.boolean(),
  createdAt: z.string(),
});
export type RecordVersion = z.infer<typeof recordVersionSchema>;

export const uploadInitSchema = z.object({
  versionId: uuidSchema,
  fileName: z.string().min(1).max(300),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(3).max(150),
  /** Optional pre-computed digest — enables init-time duplicate detection. */
  sha256: z.string().length(64).optional(),
  /** Required when re-sending after a DUPLICATE_FILE_CONFIRM_INTENT 409. */
  intent: z.enum(['new_version', 'replace_draft']).optional(),
});
export type UploadInitInput = z.infer<typeof uploadInitSchema>;

export const uploadInitResponseSchema = z.object({
  uploadId: uuidSchema,
  parts: z.array(
    z.object({ partNumber: z.number().int().positive(), url: z.string(), expiresAt: z.string() }),
  ),
  partSizeBytes: z.number().int().positive(),
  maxFileSize: z.number().int().positive(),
  acceptedMimeTypes: z.array(z.string()),
});
export type UploadInitResponse = z.infer<typeof uploadInitResponseSchema>;

export const uploadCompleteSchema = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string() })),
});
export type UploadCompleteInput = z.infer<typeof uploadCompleteSchema>;

export const uploadStatusSchema = z.object({
  scanStatus: scanStatusSchema,
  checksumStatus: z.enum(['unavailable', 'verified', 'mismatch']),
  progressPercent: z.number().int().min(0).max(100),
  message: z.string().nullable(),
});
export type UploadStatus = z.infer<typeof uploadStatusSchema>;
