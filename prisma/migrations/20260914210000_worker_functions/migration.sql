-- Worker processors (PRD §6.3 scan, §6.6 embargo expiry, §9 graceful
-- degradation; api_specification.md §3 email outbox).
--
-- The worker runs in the system context (no user, no institution claim),
-- so row-level security correctly hides tenant tables from it. Its
-- narrow, single-purpose cross-tenant operations follow the established
-- SECURITY DEFINER precedent (upload_record_part, my_memberships): each
-- function touches exactly one column or one guarded transition.

-- ═══════════════════════════════════════════════════════════
-- 1. Outbox retry scheduling
-- ═══════════════════════════════════════════════════════════
-- When the next delivery attempt becomes eligible (exponential backoff).
ALTER TABLE "email_outbox"
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
DROP INDEX IF EXISTS "email_outbox_status_created_at_idx";
CREATE INDEX "email_outbox_status_next_attempt_at_idx"
  ON "email_outbox"("status", "next_attempt_at");

-- ═══════════════════════════════════════════════════════════
-- 2. Stuck scan recovery
-- ═══════════════════════════════════════════════════════════
-- The inline post-complete scan is fire-and-forget: a process restart
-- strands versions at scan_status='pending' forever. The worker sweeps
-- them. Reading version rows needs to cross tenants (RLS hides them from
-- the system context), so the sweep reads through a SECURITY DEFINER
-- function and writes back through another that may only ever touch the
-- scan_status column.

CREATE OR REPLACE FUNCTION pending_scan_versions(p_older_than timestamptz)
RETURNS TABLE (version_id uuid, file_key text, owner_user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT v.id, v.file_key, v.submitted_by_id
      FROM record_version v
     WHERE v.scan_status = 'pending'
       AND v.file_key IS NOT NULL
       AND v.created_at <= p_older_than
     ORDER BY v.created_at ASC
     LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION set_version_scan_status(p_version_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('pending', 'clean', 'infected', 'unsupported', 'failed') THEN
    RAISE EXCEPTION 'invalid scan status: %', p_status;
  END IF;
  UPDATE record_version SET scan_status = p_status::scan_status WHERE id = p_version_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Embargo expiry (PRD §6.6)
-- ═══════════════════════════════════════════════════════════
-- "When an embargo expires, release must follow institution/owner policy;
-- no full document should become public contrary to active rights
-- restrictions or unresolved disputes." The guard is the dispute check:
-- a record with ANY not-resolved/not-dismissed dispute keeps its embargo
-- until humans settle it. Returns what was lifted so the worker can audit.

CREATE OR REPLACE FUNCTION lift_expired_embargos()
RETURNS TABLE (record_id uuid, previous_until timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH candidates AS (
      SELECT r.id, r.embargo_until
        FROM research_record r
       WHERE r.embargo_until IS NOT NULL
         AND r.embargo_until <= now()
         AND NOT EXISTS (
           SELECT 1 FROM dispute d
            WHERE d.subject_type = 'research_record'
              AND d.subject_id = r.id
              AND d.status NOT IN ('resolved', 'dismissed')
         )
    ), lifted AS (
      UPDATE research_record r
         SET embargo_until = NULL
       WHERE r.id IN (SELECT id FROM candidates)
      RETURNING r.id
    )
    SELECT c.id, c.embargo_until FROM candidates c JOIN lifted l ON l.id = c.id;
$$;

-- Abandoned multipart sessions: file_upload is RLS-scoped (upload_via_record),
-- so the system-context sweeper cannot even see stale rows. One function
-- expires them and returns the ids so the worker can discard their
-- orphaned part files from storage and audit.
CREATE OR REPLACE FUNCTION expire_stale_upload_sessions(p_cutoff timestamptz)
RETURNS TABLE (upload_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH expired AS (
      UPDATE file_upload
         SET status = 'expired'
       WHERE status = 'in_progress'
         AND created_at < p_cutoff
      RETURNING id
    )
    SELECT id FROM expired;
$$;

REVOKE ALL ON FUNCTION pending_scan_versions(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_version_scan_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lift_expired_embargos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pending_scan_versions(timestamptz) TO alims_app;
GRANT EXECUTE ON FUNCTION set_version_scan_status(uuid, text) TO alims_app;
GRANT EXECUTE ON FUNCTION lift_expired_embargos() TO alims_app;
REVOKE ALL ON FUNCTION expire_stale_upload_sessions(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_stale_upload_sessions(timestamptz) TO alims_app;
