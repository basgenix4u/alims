-- Row-level security for the human integrity review (PRD §6.5, ADR-004).
--
-- integrity_review was the one tenant table without RLS: it holds the
-- reviewer's identity and the reasoning behind every integrity outcome,
-- which is exactly the private, attributable material PRD §9.1 protects.
--
-- Visibility follows the assessment it belongs to, transitively through
-- the similarity_assessment policy (sim_via_version): a reviewer may read
--/write integrity reviews only for versions their role can already see.
-- The subquery intentionally relies on RLS rather than joining to the
-- record directly — the version policy remains the single source of truth.

ALTER TABLE "integrity_review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integrity_review" FORCE ROW LEVEL SECURITY;
CREATE POLICY ir_via_assessment ON "integrity_review"
  USING (EXISTS (
    SELECT 1 FROM similarity_assessment sa
    WHERE sa.id = integrity_review.assessment_id
  ));
