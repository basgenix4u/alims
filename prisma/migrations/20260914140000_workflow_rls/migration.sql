-- Review workflow tables get the same row-level security posture as the
-- records they derive from (api_specification.md §7):
--   - the record's owner sees their own workflow,
--   - members of the record's institution see their institution's workflow,
--   - the assigned reviewer can always reach their own tasks.
-- review_decision stays append-only (trigger from the security migration).

ALTER TABLE "workflow_instance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_instance" FORCE ROW LEVEL SECURITY;
CREATE POLICY wfi_via_record ON "workflow_instance"
  USING (EXISTS (
    SELECT 1 FROM research_record r
    WHERE r.id = workflow_instance.record_id
      AND (r.owner_user_id = current_user_id()
           OR (r.institution_id IS NOT NULL AND r.institution_id = current_institution_id()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM research_record r
    WHERE r.id = workflow_instance.record_id
      AND (r.owner_user_id = current_user_id()
           OR (r.institution_id IS NOT NULL AND r.institution_id = current_institution_id()))
  ));

ALTER TABLE "review_task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "review_task" FORCE ROW LEVEL SECURITY;
CREATE POLICY task_via_record ON "review_task"
  USING (
    assignee_user_id = current_user_id()
    OR EXISTS (
      SELECT 1 FROM research_record r
      JOIN workflow_instance w ON w.record_id = r.id
      WHERE w.id = review_task.workflow_instance_id
        AND (r.owner_user_id = current_user_id()
             OR (r.institution_id IS NOT NULL AND r.institution_id = current_institution_id()))
    )
  )
  WITH CHECK (EXISTS (
    SELECT 1 FROM research_record r
    JOIN workflow_instance w ON w.record_id = r.id
    WHERE w.id = review_task.workflow_instance_id
      AND (r.owner_user_id = current_user_id()
           OR (r.institution_id IS NOT NULL AND r.institution_id = current_institution_id()))
  ));

ALTER TABLE "review_decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "review_decision" FORCE ROW LEVEL SECURITY;
CREATE POLICY decision_via_record ON "review_decision"
  USING (EXISTS (
    SELECT 1 FROM research_record r
    JOIN workflow_instance w ON w.record_id = r.id
    JOIN review_task t ON t.workflow_instance_id = w.id
    WHERE t.id = review_decision.task_id
      AND (r.owner_user_id = current_user_id()
           OR (r.institution_id IS NOT NULL AND r.institution_id = current_institution_id()))
  ));
