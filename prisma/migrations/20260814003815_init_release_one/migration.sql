-- CreateEnum
CREATE TYPE "institution_status" AS ENUM ('pending_verification', 'verified', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "institution_category" AS ENUM ('university', 'polytechnic', 'college', 'research_institute', 'other');

-- CreateEnum
CREATE TYPE "department_status" AS ENUM ('active', 'merged', 'renamed', 'archived');

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('student', 'supervisor', 'dept_admin', 'examiner', 'registry', 'librarian', 'inst_admin');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('active', 'pending', 'revoked');

-- CreateEnum
CREATE TYPE "identity_level" AS ENUM ('unverified', 'email', 'identity_verified');

-- CreateEnum
CREATE TYPE "output_type" AS ENUM ('project', 'thesis', 'dissertation', 'article', 'report', 'dataset', 'software', 'preprint', 'patent_disclosure', 'presentation', 'other');

-- CreateEnum
CREATE TYPE "record_status" AS ENUM ('draft', 'submitted', 'in_review', 'returned_for_revision', 'resubmitted', 'institutionally_verified', 'published', 'superseded', 'withdrawn', 'under_dispute', 'verification_revoked');

-- CreateEnum
CREATE TYPE "verification_level" AS ENUM ('draft', 'submitted', 'identity_verified_deposit', 'self_published', 'supervisor_verified', 'institutionally_verified', 'journal_verified', 'under_dispute', 'withdrawn', 'verification_revoked');

-- CreateEnum
CREATE TYPE "access_level" AS ENUM ('metadata_public', 'abstract_public', 'full_public', 'institution_only', 'restricted');

-- CreateEnum
CREATE TYPE "version_state" AS ENUM ('draft', 'submitted', 'returned', 'approved', 'superseded', 'withdrawn');

-- CreateEnum
CREATE TYPE "scan_status" AS ENUM ('pending', 'clean', 'infected', 'unsupported', 'failed');

-- CreateEnum
CREATE TYPE "provenance" AS ENUM ('native', 'historical_digitisation', 'imported');

-- CreateEnum
CREATE TYPE "completion_state" AS ENUM ('complete', 'incomplete_seeking_continuation');

-- CreateEnum
CREATE TYPE "incomplete_reason" AS ENUM ('funding_ended', 'graduation', 'equipment_unavailable', 'dataset_unavailable', 'supervisor_change', 'time_constraint', 'other');

-- CreateEnum
CREATE TYPE "metadata_source" AS ENUM ('self_declared', 'institution_verified', 'journal_linked', 'imported');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('pending', 'completed', 'reassigned', 'escalated');

-- CreateEnum
CREATE TYPE "review_decision_type" AS ENUM ('approve', 'return_for_revision', 'request_contribution_correction', 'escalate_integrity');

-- CreateEnum
CREATE TYPE "certificate_status" AS ENUM ('valid', 'superseded', 'revoked');

-- CreateEnum
CREATE TYPE "similarity_status" AS ENUM ('not_requested', 'pending', 'completed', 'provider_delayed', 'review_required', 'reviewed', 'unavailable');

-- CreateEnum
CREATE TYPE "integrity_outcome" AS ENUM ('no_issue', 'citation_correction_required', 'attribution_correction_required', 'escalated', 'inconclusive');

-- CreateEnum
CREATE TYPE "credit_role" AS ENUM ('conceptualization', 'data_curation', 'formal_analysis', 'funding_acquisition', 'investigation', 'methodology', 'project_administration', 'resources', 'software', 'supervision', 'validation', 'visualization', 'writing_original_draft', 'writing_review_editing');

-- CreateEnum
CREATE TYPE "contribution_level" AS ENUM ('lead', 'equal', 'supporting');

-- CreateEnum
CREATE TYPE "ack_status" AS ENUM ('pending', 'acknowledged', 'correction_requested', 'disputed', 'no_response');

-- CreateEnum
CREATE TYPE "evidence_state" AS ENUM ('self_declared', 'verified', 'externally_imported', 'machine_suggested', 'accepted', 'disputed', 'rejected');

-- CreateEnum
CREATE TYPE "relationship_type" AS ENUM ('supervised_by', 'co_supervised_by', 'contributed_to', 'affiliated_with', 'cites', 'builds_on', 'extends', 'challenges', 'replicates', 'uses_dataset', 'produces_dataset', 'published_as', 'continues', 'collaborates_on', 'funded_by', 'resulted_in', 'adopted_by', 'licensed_to');

-- CreateEnum
CREATE TYPE "access_request_status" AS ENUM ('pending', 'approved', 'declined', 'info_requested', 'ignored');

-- CreateEnum
CREATE TYPE "dispute_category" AS ENUM ('incorrect_metadata', 'authorship_contribution', 'false_institution_claim', 'duplicate_provenance', 'copyright_rights', 'privacy_confidentiality', 'offensive_unsafe_content', 'certificate_verification_error', 'relationship_lineage_error');

-- CreateEnum
CREATE TYPE "dispute_status" AS ENUM ('submitted', 'triage', 'evidence_requested', 'under_review', 'resolved', 'dismissed', 'escalated');

-- CreateTable
CREATE TABLE "institution" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(300) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "category" "institution_category" NOT NULL,
    "official_domain" VARCHAR(253) NOT NULL,
    "status" "institution_status" NOT NULL DEFAULT 'pending_verification',
    "representative_email" VARCHAR(320) NOT NULL,
    "privacy_contact_email" VARCHAR(320) NOT NULL,
    "academic_email" VARCHAR(320),
    "library_email" VARCHAR(320),
    "branding" JSONB NOT NULL DEFAULT '{}',
    "policies" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_name_history" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "previous_name" VARCHAR(300) NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_name_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(40),
    "parent_id" UUID,
    "status" "department_status" NOT NULL DEFAULT 'active',
    "merged_into_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "degree_type" VARCHAR(80) NOT NULL,
    "duration_years" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_session" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "academic_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_account" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "legal_name_encrypted" TEXT,
    "identity_level" "identity_level" NOT NULL DEFAULT 'unverified',
    "mfa_secret_encrypted" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_name_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "previous_display_name" VARCHAR(150) NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_name_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "department_id" UUID,
    "programme_id" UUID,
    "role" "member_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'pending',
    "starts_on" DATE,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_record" (
    "id" UUID NOT NULL,
    "nxr_id" VARCHAR(40),
    "institution_id" UUID,
    "department_id" UUID,
    "programme_id" UUID,
    "session_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "output_type" "output_type" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "abstract" TEXT,
    "disciplines" TEXT[],
    "keywords" TEXT[],
    "research_year" INTEGER,
    "access_level" "access_level" NOT NULL DEFAULT 'metadata_public',
    "licence" VARCHAR(120) NOT NULL,
    "status" "record_status" NOT NULL DEFAULT 'draft',
    "verification_level" "verification_level" NOT NULL DEFAULT 'draft',
    "provenance" "provenance" NOT NULL DEFAULT 'native',
    "completion_state" "completion_state" NOT NULL DEFAULT 'complete',
    "incomplete_reason" "incomplete_reason",
    "embargo_until" TIMESTAMPTZ(6),
    "research_question" TEXT,
    "methodology" TEXT,
    "funding_source" VARCHAR(500),
    "ethics_approval_ref" VARCHAR(200),
    "dataset_links" TEXT[],
    "code_links" TEXT[],
    "languages" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "research_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_version" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "change_summary" VARCHAR(1000) NOT NULL,
    "state" "version_state" NOT NULL DEFAULT 'draft',
    "file_key" VARCHAR(500),
    "file_name" VARCHAR(300),
    "file_size_bytes" BIGINT,
    "mime_type" VARCHAR(150),
    "sha256" CHAR(64),
    "scan_status" "scan_status" NOT NULL DEFAULT 'pending',
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "is_immutable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_metadata_provenance" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "field_name" VARCHAR(80) NOT NULL,
    "source" "metadata_source" NOT NULL,
    "confidence" DECIMAL(3,2),
    "note" VARCHAR(500),

    CONSTRAINT "record_metadata_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_template" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "output_type" "output_type" NOT NULL,
    "stages" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instance" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "current_stage" VARCHAR(80) NOT NULL,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "due_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_task" (
    "id" UUID NOT NULL,
    "workflow_instance_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "assignee_user_id" UUID NOT NULL,
    "stage" VARCHAR(80) NOT NULL,
    "status" "task_status" NOT NULL DEFAULT 'pending',
    "due_at" TIMESTAMPTZ(6),
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decision" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "reviewer_user_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "decision" "review_decision_type" NOT NULL,
    "comment" TEXT NOT NULL,
    "required_actions" TEXT[],
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "similarity_assessment" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "status" "similarity_status" NOT NULL DEFAULT 'not_requested',
    "score" DECIMAL(5,2),
    "report_key" VARCHAR(500),
    "requested_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "similarity_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity_review" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "reviewer_user_id" UUID NOT NULL,
    "outcome" "integrity_outcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrity_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "certificate_no" VARCHAR(60) NOT NULL,
    "nxr_id" VARCHAR(40) NOT NULL,
    "qr_token" VARCHAR(64) NOT NULL,
    "status" "certificate_status" NOT NULL DEFAULT 'valid',
    "issued_by_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_by_id" UUID,
    "revoked_reason" TEXT,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributor" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "user_id" UUID,
    "external_name" VARCHAR(200),
    "external_orcid" VARCHAR(30),
    "credit_roles" "credit_role"[],
    "level" "contribution_level" NOT NULL,
    "is_supervision" BOOLEAN NOT NULL DEFAULT false,
    "evidence_note" TEXT,
    "ack_status" "ack_status" NOT NULL DEFAULT 'pending',
    "dispute_reason" TEXT,
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passport_profile" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "handle" VARCHAR(80),
    "headline" VARCHAR(300),
    "orcid" VARCHAR(30),
    "interests" TEXT[],
    "methods" TEXT[],
    "skills" TEXT[],
    "available_for_collaboration" BOOLEAN NOT NULL DEFAULT false,
    "section_visibility" JSONB NOT NULL DEFAULT '{}',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "passport_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship" (
    "id" UUID NOT NULL,
    "from_type" VARCHAR(40) NOT NULL,
    "from_id" UUID NOT NULL,
    "to_type" VARCHAR(40) NOT NULL,
    "to_id" UUID NOT NULL,
    "rel_type" "relationship_type" NOT NULL,
    "evidence_state" "evidence_state" NOT NULL,
    "confidence" DECIMAL(3,2),
    "explanation" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_request" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "requester_user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "organisation" VARCHAR(300) NOT NULL,
    "requester_role" VARCHAR(120),
    "status" "access_request_status" NOT NULL DEFAULT 'pending',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute" (
    "id" UUID NOT NULL,
    "subject_type" VARCHAR(40) NOT NULL,
    "subject_id" UUID NOT NULL,
    "category" "dispute_category" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "dispute_status" NOT NULL DEFAULT 'submitted',
    "raised_by_id" UUID NOT NULL,
    "assigned_to_id" UUID,
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "institution_id" UUID,
    "actor_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "subject_type" VARCHAR(60) NOT NULL,
    "subject_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "ip_hash" VARCHAR(64),
    "user_agent_hash" VARCHAR(64),
    "prev_hash" VARCHAR(64),
    "hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institution_slug_key" ON "institution"("slug");

-- CreateIndex
CREATE INDEX "institution_status_idx" ON "institution"("status");

-- CreateIndex
CREATE INDEX "institution_country_code_idx" ON "institution"("country_code");

-- CreateIndex
CREATE INDEX "institution_name_history_institution_id_idx" ON "institution_name_history"("institution_id");

-- CreateIndex
CREATE INDEX "department_institution_id_status_idx" ON "department"("institution_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "department_institution_id_name_key" ON "department"("institution_id", "name");

-- CreateIndex
CREATE INDEX "programme_institution_id_idx" ON "programme"("institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "programme_department_id_name_key" ON "programme"("department_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_session_institution_id_label_key" ON "academic_session"("institution_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_email_key" ON "user_account"("email");

-- CreateIndex
CREATE INDEX "user_account_email_idx" ON "user_account"("email");

-- CreateIndex
CREATE INDEX "user_name_history_user_id_idx" ON "user_name_history"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");

-- CreateIndex
CREATE INDEX "refresh_token_family_id_idx" ON "refresh_token"("family_id");

-- CreateIndex
CREATE INDEX "membership_institution_id_role_status_idx" ON "membership"("institution_id", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "membership_user_id_institution_id_role_key" ON "membership"("user_id", "institution_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "research_record_nxr_id_key" ON "research_record"("nxr_id");

-- CreateIndex
CREATE INDEX "research_record_institution_id_status_idx" ON "research_record"("institution_id", "status");

-- CreateIndex
CREATE INDEX "research_record_owner_user_id_idx" ON "research_record"("owner_user_id");

-- CreateIndex
CREATE INDEX "research_record_status_verification_level_idx" ON "research_record"("status", "verification_level");

-- CreateIndex
CREATE INDEX "research_record_access_level_idx" ON "research_record"("access_level");

-- CreateIndex
CREATE INDEX "research_record_research_year_idx" ON "research_record"("research_year");

-- CreateIndex
CREATE INDEX "record_version_record_id_state_idx" ON "record_version"("record_id", "state");

-- CreateIndex
CREATE INDEX "record_version_sha256_idx" ON "record_version"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "record_version_record_id_version_no_key" ON "record_version"("record_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "record_metadata_provenance_record_id_field_name_key" ON "record_metadata_provenance"("record_id", "field_name");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_institution_id_name_key" ON "workflow_template"("institution_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_instance_record_id_key" ON "workflow_instance"("record_id");

-- CreateIndex
CREATE INDEX "review_task_assignee_user_id_status_idx" ON "review_task"("assignee_user_id", "status");

-- CreateIndex
CREATE INDEX "review_task_workflow_instance_id_idx" ON "review_task"("workflow_instance_id");

-- CreateIndex
CREATE INDEX "review_decision_version_id_idx" ON "review_decision"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "similarity_assessment_version_id_key" ON "similarity_assessment"("version_id");

-- CreateIndex
CREATE INDEX "integrity_review_assessment_id_idx" ON "integrity_review"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_version_id_key" ON "certificate"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_certificate_no_key" ON "certificate"("certificate_no");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_qr_token_key" ON "certificate"("qr_token");

-- CreateIndex
CREATE INDEX "certificate_record_id_idx" ON "certificate"("record_id");

-- CreateIndex
CREATE INDEX "certificate_status_idx" ON "certificate"("status");

-- CreateIndex
CREATE INDEX "contributor_user_id_ack_status_idx" ON "contributor"("user_id", "ack_status");

-- CreateIndex
CREATE UNIQUE INDEX "contributor_record_id_user_id_key" ON "contributor"("record_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "passport_profile_user_id_key" ON "passport_profile"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "passport_profile_handle_key" ON "passport_profile"("handle");

-- CreateIndex
CREATE INDEX "relationship_from_type_from_id_idx" ON "relationship"("from_type", "from_id");

-- CreateIndex
CREATE INDEX "relationship_to_type_to_id_idx" ON "relationship"("to_type", "to_id");

-- CreateIndex
CREATE INDEX "relationship_evidence_state_idx" ON "relationship"("evidence_state");

-- CreateIndex
CREATE UNIQUE INDEX "relationship_from_type_from_id_to_type_to_id_rel_type_key" ON "relationship"("from_type", "from_id", "to_type", "to_id", "rel_type");

-- CreateIndex
CREATE INDEX "access_request_record_id_status_idx" ON "access_request"("record_id", "status");

-- CreateIndex
CREATE INDEX "dispute_subject_type_subject_id_idx" ON "dispute"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "dispute_status_idx" ON "dispute"("status");

-- CreateIndex
CREATE UNIQUE INDEX "audit_event_seq_key" ON "audit_event"("seq");

-- CreateIndex
CREATE INDEX "audit_event_subject_type_subject_id_idx" ON "audit_event"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "audit_event_actor_user_id_idx" ON "audit_event"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_event_institution_id_idx" ON "audit_event"("institution_id");

-- CreateIndex
CREATE INDEX "audit_event_created_at_idx" ON "audit_event"("created_at");

-- AddForeignKey
ALTER TABLE "institution_name_history" ADD CONSTRAINT "institution_name_history_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme" ADD CONSTRAINT "programme_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme" ADD CONSTRAINT "programme_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_session" ADD CONSTRAINT "academic_session_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_name_history" ADD CONSTRAINT "user_name_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_record" ADD CONSTRAINT "research_record_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_record" ADD CONSTRAINT "research_record_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_record" ADD CONSTRAINT "research_record_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_record" ADD CONSTRAINT "research_record_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_record" ADD CONSTRAINT "research_record_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_version" ADD CONSTRAINT "record_version_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "research_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_version" ADD CONSTRAINT "record_version_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_metadata_provenance" ADD CONSTRAINT "record_metadata_provenance_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "research_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_template" ADD CONSTRAINT "workflow_template_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instance" ADD CONSTRAINT "workflow_instance_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "research_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instance" ADD CONSTRAINT "workflow_instance_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_workflow_instance_id_fkey" FOREIGN KEY ("workflow_instance_id") REFERENCES "workflow_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "record_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "review_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "record_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similarity_assessment" ADD CONSTRAINT "similarity_assessment_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "record_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_review" ADD CONSTRAINT "integrity_review_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "similarity_assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "research_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "record_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributor" ADD CONSTRAINT "contributor_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "research_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributor" ADD CONSTRAINT "contributor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_profile" ADD CONSTRAINT "passport_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "research_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
