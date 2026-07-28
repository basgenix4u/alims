import { z } from 'zod';

/**
 * Controlled vocabularies from the ALIMS PRD.
 * These are the single source of truth for both API and web.
 * Mirrors api_specification.md §2.
 */

export const outputTypeSchema = z.enum([
  'project', 'thesis', 'dissertation', 'article', 'report', 'dataset',
  'software', 'preprint', 'patent_disclosure', 'presentation', 'other',
]);
export type OutputType = z.infer<typeof outputTypeSchema>;

/** PRD §7.1 Research Record lifecycle. */
export const recordStatusSchema = z.enum([
  'draft', 'submitted', 'in_review', 'returned_for_revision', 'resubmitted',
  'institutionally_verified', 'published', 'superseded', 'withdrawn',
  'under_dispute', 'verification_revoked',
]);
export type RecordStatus = z.infer<typeof recordStatusSchema>;

/** PRD §6.4 verification labels — must remain visibly distinct. */
export const verificationLevelSchema = z.enum([
  'draft', 'submitted', 'identity_verified_deposit', 'self_published',
  'supervisor_verified', 'institutionally_verified', 'journal_verified',
  'under_dispute', 'withdrawn', 'verification_revoked',
]);
export type VerificationLevel = z.infer<typeof verificationLevelSchema>;

/** PRD §6.6 access levels. */
export const accessLevelSchema = z.enum([
  'metadata_public', 'abstract_public', 'full_public', 'institution_only', 'restricted',
]);
export type AccessLevel = z.infer<typeof accessLevelSchema>;

/** PRD §4 roles. */
export const memberRoleSchema = z.enum([
  'student', 'supervisor', 'dept_admin', 'examiner', 'registry', 'librarian', 'inst_admin',
]);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const institutionStatusSchema = z.enum([
  'pending_verification', 'verified', 'suspended', 'archived',
]);
export type InstitutionStatus = z.infer<typeof institutionStatusSchema>;

export const versionStateSchema = z.enum([
  'draft', 'submitted', 'returned', 'approved', 'superseded', 'withdrawn',
]);
export type VersionState = z.infer<typeof versionStateSchema>;

export const scanStatusSchema = z.enum(['pending', 'clean', 'infected', 'unsupported', 'failed']);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

/** PRD §7.2 certificate lifecycle. */
export const certificateStatusSchema = z.enum(['valid', 'superseded', 'revoked']);
export type CertificateStatus = z.infer<typeof certificateStatusSchema>;

export const reviewDecisionTypeSchema = z.enum([
  'approve', 'return_for_revision', 'request_contribution_correction', 'escalate_integrity',
]);
export type ReviewDecisionType = z.infer<typeof reviewDecisionTypeSchema>;

/** PRD §6.5 — advisory statuses only. Never mutates record status. */
export const similarityStatusSchema = z.enum([
  'not_requested', 'pending', 'completed', 'provider_delayed',
  'review_required', 'reviewed', 'unavailable',
]);
export type SimilarityStatus = z.infer<typeof similarityStatusSchema>;

/** PRD §6.5 — a human must select one of these. */
export const integrityOutcomeSchema = z.enum([
  'no_issue', 'citation_correction_required', 'attribution_correction_required',
  'escalated', 'inconclusive',
]);
export type IntegrityOutcome = z.infer<typeof integrityOutcomeSchema>;

/** NISO CRediT — exactly 14 roles (PRD §6.7). */
export const creditRoleSchema = z.enum([
  'conceptualization', 'data_curation', 'formal_analysis', 'funding_acquisition',
  'investigation', 'methodology', 'project_administration', 'resources',
  'software', 'supervision', 'validation', 'visualization',
  'writing_original_draft', 'writing_review_editing',
]);
export type CreditRole = z.infer<typeof creditRoleSchema>;

export const contributionLevelSchema = z.enum(['lead', 'equal', 'supporting']);
export type ContributionLevel = z.infer<typeof contributionLevelSchema>;

export const ackStatusSchema = z.enum([
  'pending', 'acknowledged', 'correction_requested', 'disputed', 'no_response',
]);
export type AckStatus = z.infer<typeof ackStatusSchema>;

/** PRD §6.9 — every relationship must carry its evidence state. */
export const evidenceStateSchema = z.enum([
  'self_declared', 'verified', 'externally_imported', 'machine_suggested',
  'accepted', 'disputed', 'rejected',
]);
export type EvidenceState = z.infer<typeof evidenceStateSchema>;

/** PRD §6.9 relationship types. */
export const relationshipTypeSchema = z.enum([
  'supervised_by', 'co_supervised_by', 'contributed_to', 'affiliated_with',
  'cites', 'builds_on', 'extends', 'challenges', 'replicates',
  'uses_dataset', 'produces_dataset', 'published_as', 'continues',
  'collaborates_on', 'funded_by', 'resulted_in', 'adopted_by', 'licensed_to',
]);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

/** PRD §9.5 — records must show how metadata was obtained. */
export const metadataSourceSchema = z.enum([
  'self_declared', 'institution_verified', 'journal_linked', 'imported',
]);
export type MetadataSource = z.infer<typeof metadataSourceSchema>;

/** PRD §7.3 dispute categories. */
export const disputeCategorySchema = z.enum([
  'incorrect_metadata', 'authorship_contribution', 'false_institution_claim',
  'duplicate_provenance', 'copyright_rights', 'privacy_confidentiality',
  'offensive_unsafe_content', 'certificate_verification_error', 'relationship_lineage_error',
]);
export type DisputeCategory = z.infer<typeof disputeCategorySchema>;

/** PRD §6.12 — reasons research stalls. */
export const incompleteReasonSchema = z.enum([
  'funding_ended', 'graduation', 'equipment_unavailable', 'dataset_unavailable',
  'supervisor_change', 'time_constraint', 'other',
]);
export type IncompleteReason = z.infer<typeof incompleteReasonSchema>;
