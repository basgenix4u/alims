-- Deposit metadata completion (api_specification.md §5 / PRD §6.2): fields the
-- record API accepts that previously had no column. Scalar columns stay
-- nullable; array columns default to empty so existing rows remain valid.

ALTER TABLE "research_record" ADD COLUMN "equipment_used" VARCHAR(500);
ALTER TABLE "research_record" ADD COLUMN "external_partner" VARCHAR(300);
ALTER TABLE "research_record" ADD COLUMN "publication_refs" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE "research_record" ADD COLUMN "patent_refs" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE "research_record" ADD COLUMN "related_record_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE "research_record" ADD COLUMN "supervisor_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

-- Drafts and owner-scoped reads hit this index on every dashboard load.
CREATE INDEX "research_record_owner_updated_idx" ON "research_record" ("owner_user_id", "updated_at" DESC);
