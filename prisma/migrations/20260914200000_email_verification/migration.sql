-- Email verification (api_specification.md §3: register returns
-- `verificationEmailSent: true`; UserSummary.identityLevel: unverified |
-- email | identity_verified).
--
-- Two tables, both following existing precedents:
--
--   email_verification_token — the refresh_token pattern: a public
--   (unauthenticated) confirm route looks the row up by the SHA-256 hash
--   of a 256-bit random token, so the hash IS the secret and no RLS is
--   needed (identical posture to refresh_token). Tokens are single-use
--   and expire after 24 hours; issuing a new one supersedes all previous.
--
--   email_outbox — a durable outbox (PRD §9 graceful degradation): every
--   email the system must send is persisted first, then delivered. With
--   no SMTP configured the row honestly stays `pending` — exactly like
--   the virus scanner reports `unsupported` instead of `clean`. The
--   worker processor drains the outbox when a transport is configured.

CREATE TABLE "email_verification_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_verification_token_token_hash_key"
    ON "email_verification_token"("token_hash");
CREATE INDEX "email_verification_token_user_id_idx"
    ON "email_verification_token"("user_id");
ALTER TABLE "email_verification_token"
    ADD CONSTRAINT "email_verification_token_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user_account"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "to_email" VARCHAR(320) NOT NULL,
    "template" VARCHAR(80) NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "body_text" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_outbox_status_created_at_idx"
    ON "email_outbox"("status", "created_at");

-- Explicit grants (default privileges already cover alims_owner-created
-- tables; these make the intent visible and hold in any environment).
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_verification_token" TO alims_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_outbox" TO alims_app;
