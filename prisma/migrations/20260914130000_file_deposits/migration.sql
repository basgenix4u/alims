-- File deposits (api_specification.md §6): upload sessions and durable
-- deposit receipts. Receipts are evidence documents (PRD §6.3): their
-- language must never overclaim ownership or originality.

CREATE TABLE "file_upload" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "file_name" VARCHAR(300) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "part_size_bytes" BIGINT NOT NULL,
    "expected_sha256" CHAR(64),
    "parts" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "status" "text" NOT NULL DEFAULT 'in_progress',
    "intent" "text",
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "completed_at" TIMESTAMPTZ(6),
    CONSTRAINT "file_upload_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "file_upload_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "record_version"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "file_upload_creator_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "file_upload_version_id_idx" ON "file_upload"("version_id");
CREATE INDEX "file_upload_creator_idx" ON "file_upload"("created_by_id");

CREATE TABLE "deposit_receipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "deposited_by_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "deposit_receipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deposit_receipt_version_id_key" UNIQUE ("version_id"),
    CONSTRAINT "deposit_receipt_version_fkey" FOREIGN KEY ("version_id") REFERENCES "record_version"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "deposit_receipt_record_fkey" FOREIGN KEY ("record_id") REFERENCES "research_record"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "deposit_receipt_depositor_fkey" FOREIGN KEY ("deposited_by_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "deposit_receipt_record_id_idx" ON "deposit_receipt"("record_id");

-- Row-level security: both tables inherit visibility from the version's
-- record — a depositor sees their own uploads/receipts, tenant members see
-- their institution's, nothing leaks across tenants.
ALTER TABLE "file_upload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_upload" FORCE ROW LEVEL SECURITY;
CREATE POLICY upload_via_record ON "file_upload"
  USING (EXISTS (
    SELECT 1 FROM research_record r
    JOIN record_version v ON v.record_id = r.id
    WHERE v.id = file_upload.version_id
      AND (r.owner_user_id = current_user_id()
           OR (r.institution_id IS NOT NULL AND r.institution_id = current_institution_id()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM research_record r
    JOIN record_version v ON v.record_id = r.id
    WHERE v.id = file_upload.version_id
      AND r.owner_user_id = current_user_id()
  ));

ALTER TABLE "deposit_receipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deposit_receipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_via_record ON "deposit_receipt"
  USING (EXISTS (
    SELECT 1 FROM research_record r
    WHERE r.id = deposit_receipt.record_id
      AND (r.owner_user_id = current_user_id()
           OR (r.institution_id IS NOT NULL AND r.institution_id = current_institution_id()))
  ));

-- Cross-depositor duplicate detection (api_specification.md §6 duplicate
-- handling) needs a deliberately privileged existence check: row-level
-- security correctly hides one depositor's drafts from another, so the
-- application cannot ask "does this digest exist elsewhere?" directly.
--
-- This function is the ONLY such primitive. It returns a boolean — nothing
-- about the other record (id, title, owner, count) is exposed — and its
-- result is used solely to raise an internal provenance-review signal.
CREATE OR REPLACE FUNCTION digest_matches_other_depositor(
    p_sha256 text,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM record_version v
        JOIN research_record r ON r.id = v.record_id
        WHERE v.sha256 = p_sha256
          AND r.owner_user_id <> p_user_id
    );
$$;

REVOKE ALL ON FUNCTION digest_matches_other_depositor(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION digest_matches_other_depositor(text, uuid) TO alims_app;
