CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ALIMS security migration: RLS, immutability, audit hash chain.
--
-- These enforce PRD guarantees at the DATABASE layer so that an
-- application bug, a forgotten WHERE clause, or a compromised service
-- account cannot silently break them.
--
--   PRD §6.1  cross-institution isolation      -> Row-Level Security
--   PRD §6.3  approved versions are immutable  -> UPDATE/DELETE trigger
--   PRD §9.1  tamper-evident audit history     -> append-only hash chain

-- ═══════════════════════════════════════════════════════════
-- 1. APPLICATION ROLE
-- Must be NOSUPERUSER and NOT BYPASSRLS or RLS fails open.
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'alims_app') THEN
    CREATE ROLE alims_app LOGIN PASSWORD 'alims_dev_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- The migration/admin role MUST be able to bypass RLS: it runs DDL,
-- seeds reference data, and performs break-glass administration. The
-- RUNTIME role must never bypass RLS. Keeping these separate is the
-- whole point — if the app ever connects as the owner, PRD 6.1
-- isolation silently disappears.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'alims_owner') THEN
    EXECUTE 'ALTER ROLE alims_owner BYPASSRLS';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO alims_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO alims_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO alims_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO alims_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO alims_app;

-- ═══════════════════════════════════════════════════════════
-- 2. TENANT CONTEXT HELPERS
-- Set per request by the API. NULL means "no tenant" -> deny.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION current_institution_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('alims.current_institution', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('alims.current_user', true), '')::uuid;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. ROW-LEVEL SECURITY  (PRD §6.1)
-- ═══════════════════════════════════════════════════════════

-- Institution: a tenant sees only itself; verified institutions are
-- publicly listable (PRD §6.1 allows public institution directory).
ALTER TABLE "institution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution" FORCE ROW LEVEL SECURITY;
CREATE POLICY inst_tenant_isolation ON "institution"
  USING (id = current_institution_id() OR status = 'verified');
CREATE POLICY inst_tenant_write ON "institution"
  FOR UPDATE USING (id = current_institution_id());

-- Tenant-owned tables: strict institution scoping.
ALTER TABLE "department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "department" FORCE ROW LEVEL SECURITY;
CREATE POLICY dept_tenant ON "department"
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());

ALTER TABLE "programme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "programme" FORCE ROW LEVEL SECURITY;
CREATE POLICY prog_tenant ON "programme"
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());

ALTER TABLE "academic_session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_session" FORCE ROW LEVEL SECURITY;
CREATE POLICY sess_tenant ON "academic_session"
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());

ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY member_tenant ON "membership"
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());

ALTER TABLE "workflow_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_template" FORCE ROW LEVEL SECURITY;
CREATE POLICY wft_tenant ON "workflow_template"
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());

ALTER TABLE "institution_name_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_name_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY inh_tenant ON "institution_name_history"
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());

-- Research records: institution members OR the owner OR public records.
-- PRD §6.6: metadata_public / abstract_public / full_public are
-- discoverable; institution_only and restricted are not.
ALTER TABLE "research_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "research_record" FORCE ROW LEVEL SECURITY;
CREATE POLICY record_tenant_read ON "research_record" FOR SELECT
  USING (
    (institution_id IS NOT NULL AND institution_id = current_institution_id())
    OR owner_user_id = current_user_id()
    OR (
      access_level IN ('metadata_public', 'abstract_public', 'full_public')
      AND status IN ('institutionally_verified', 'published')
    )
  );
CREATE POLICY record_tenant_write ON "research_record" FOR INSERT
  WITH CHECK (
    owner_user_id = current_user_id()
    AND (institution_id IS NULL OR institution_id = current_institution_id())
  );
CREATE POLICY record_tenant_update ON "research_record" FOR UPDATE
  USING (
    owner_user_id = current_user_id()
    OR (institution_id IS NOT NULL AND institution_id = current_institution_id())
  );

-- Versions inherit their record's visibility.
ALTER TABLE "record_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "record_version" FORCE ROW LEVEL SECURITY;
CREATE POLICY version_via_record ON "record_version"
  USING (EXISTS (SELECT 1 FROM research_record r WHERE r.id = record_id));

ALTER TABLE "certificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certificate" FORCE ROW LEVEL SECURITY;
CREATE POLICY cert_via_record ON "certificate"
  USING (EXISTS (SELECT 1 FROM research_record r WHERE r.id = record_id));

-- Similarity results are private to authorised roles (PRD §6.5).
-- Base visibility requires an accessible version; the policy engine
-- applies the role check on top.
ALTER TABLE "similarity_assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "similarity_assessment" FORCE ROW LEVEL SECURITY;
CREATE POLICY sim_via_version ON "similarity_assessment"
  USING (EXISTS (SELECT 1 FROM record_version v WHERE v.id = version_id));

ALTER TABLE "contributor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contributor" FORCE ROW LEVEL SECURITY;
CREATE POLICY contrib_via_record ON "contributor"
  USING (
    EXISTS (SELECT 1 FROM research_record r WHERE r.id = record_id)
    OR user_id = current_user_id()
  );

ALTER TABLE "access_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_request" FORCE ROW LEVEL SECURITY;
CREATE POLICY areq_visible ON "access_request"
  USING (
    requester_user_id = current_user_id()
    OR EXISTS (SELECT 1 FROM research_record r WHERE r.id = record_id)
  );

-- ═══════════════════════════════════════════════════════════
-- 4. VERSION IMMUTABILITY  (PRD §6.3, §11.2)
-- A submitted or approved version must never be silently overwritten.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reject_immutable_version_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_immutable THEN
      RAISE EXCEPTION
        'Version % of record % is immutable and cannot be deleted (PRD 6.3)',
        OLD.version_no, OLD.record_id
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_immutable THEN
    -- Only the supersede/withdraw transition and scan bookkeeping are
    -- permitted on a sealed version; content fields are frozen.
    IF NEW.file_key IS DISTINCT FROM OLD.file_key
       OR NEW.sha256 IS DISTINCT FROM OLD.sha256
       OR NEW.change_summary IS DISTINCT FROM OLD.change_summary
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.submitted_by_id IS DISTINCT FROM OLD.submitted_by_id
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION
        'Version % of record % is immutable; content cannot be altered (PRD 6.3)',
        OLD.version_no, OLD.record_id
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.state <> OLD.state
       AND NEW.state NOT IN ('superseded', 'withdrawn') THEN
      RAISE EXCEPTION
        'Immutable version % may only move to superseded or withdrawn, not %',
        OLD.version_no, NEW.state
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_record_version_immutable
  BEFORE UPDATE OR DELETE ON "record_version"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_version_change();

-- Seal a version automatically the moment it is submitted or approved.
CREATE OR REPLACE FUNCTION seal_version_on_submit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IN ('submitted', 'approved') AND NOT NEW.is_immutable THEN
    NEW.is_immutable := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_record_version_seal
  BEFORE INSERT OR UPDATE ON "record_version"
  FOR EACH ROW EXECUTE FUNCTION seal_version_on_submit();

-- ═══════════════════════════════════════════════════════════
-- 5. APPEND-ONLY DECISION LOG
-- A recorded review decision is historical fact (PRD §11.2).
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reject_decision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'review_decision is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_review_decision_append_only
  BEFORE UPDATE OR DELETE ON "review_decision"
  FOR EACH ROW EXECUTE FUNCTION reject_decision_mutation();

-- ═══════════════════════════════════════════════════════════
-- 6. TAMPER-EVIDENT AUDIT CHAIN  (PRD §9.1)
-- Each row hashes its own content plus the previous row's hash, so any
-- retroactive edit or deletion breaks the chain detectably.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION audit_event_chain()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  last_hash text;
BEGIN
  SELECT hash INTO last_hash
  FROM audit_event
  ORDER BY seq DESC
  LIMIT 1;

  NEW.prev_hash := last_hash;
  NEW.hash := encode(
    digest(
      COALESCE(NEW.seq::text, '') ||
      COALESCE(NEW.actor_user_id::text, '') ||
      NEW.action ||
      NEW.subject_type ||
      COALESCE(NEW.subject_id::text, '') ||
      COALESCE(NEW.payload::text, '{}') ||
      COALESCE(last_hash, 'GENESIS'),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'audit_event is append-only and tamper-evident; % is not permitted (PRD 9.1)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;



CREATE TRIGGER trg_audit_event_chain
  BEFORE INSERT ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION audit_event_chain();

CREATE TRIGGER trg_audit_event_append_only
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

-- Chain verifier: returns the first broken link, or no rows if intact.
CREATE OR REPLACE FUNCTION verify_audit_chain()
RETURNS TABLE(broken_seq bigint, expected_hash text, actual_hash text)
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  prev text := NULL;
  computed text;
BEGIN
  FOR r IN SELECT * FROM audit_event ORDER BY seq ASC LOOP
    computed := encode(
      digest(
        COALESCE(r.seq::text, '') ||
        COALESCE(r.actor_user_id::text, '') ||
        r.action || r.subject_type ||
        COALESCE(r.subject_id::text, '') ||
        COALESCE(r.payload::text, '{}') ||
        COALESCE(prev, 'GENESIS'),
        'sha256'
      ), 'hex');
    IF computed <> r.hash THEN
      broken_seq := r.seq; expected_hash := computed; actual_hash := r.hash;
      RETURN NEXT;
      RETURN;
    END IF;
    prev := r.hash;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 7. FULL-TEXT SEARCH  (PRD §6.10)
-- ═══════════════════════════════════════════════════════════
-- to_tsvector(regconfig, text) is only STABLE, not IMMUTABLE, so a
-- GENERATED column is rejected by PostgreSQL. A trigger-maintained
-- column gives the same behaviour with an explicit refresh point.
ALTER TABLE "research_record"
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION refresh_record_search_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.abstract, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.keywords, ' ')), 'C');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_record_search_vector
  BEFORE INSERT OR UPDATE OF title, abstract, keywords ON "research_record"
  FOR EACH ROW EXECUTE FUNCTION refresh_record_search_vector();

CREATE INDEX IF NOT EXISTS idx_record_search   ON "research_record" USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_record_keywords ON "research_record" USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_record_disc     ON "research_record" USING GIN (disciplines);
CREATE INDEX IF NOT EXISTS idx_version_approved
  ON "record_version" (record_id) WHERE state = 'approved';

-- ═══════════════════════════════════════════════════════════
-- 8. DATABASE-LEVEL UUID DEFAULTS
-- Prisma generates UUIDs client-side, so a raw SQL insert (migration,
-- admin script, or worker using raw SQL) would fail on NOT NULL id.
-- Audit rows in particular must be insertable from any path.
-- ═══════════════════════════════════════════════════════════
ALTER TABLE "audit_event"     ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE "record_version"  ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE "review_decision" ALTER COLUMN id SET DEFAULT gen_random_uuid();
