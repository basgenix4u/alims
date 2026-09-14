-- Single-use MFA recovery codes: only keyed hashes are stored (spec §3).
-- User-scoped data: row-level security keyed to the acting user, so one
-- account can never read or consume another account's codes.

CREATE TABLE "mfa_recovery_code" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "mfa_recovery_code_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mfa_recovery_code_user_id_idx" ON "mfa_recovery_code"("user_id");

ALTER TABLE "mfa_recovery_code"
  ADD CONSTRAINT "mfa_recovery_code_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mfa_recovery_code" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mfa_recovery_code" FORCE ROW LEVEL SECURITY;

CREATE POLICY recovery_code_self ON "mfa_recovery_code"
  USING ("user_id" = current_user_id())
  WITH CHECK ("user_id" = current_user_id());
