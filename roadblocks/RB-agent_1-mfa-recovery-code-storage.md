# RB-agent_1-mfa-recovery-code-storage

- **Raised by:** agent_1
- **Task:** T-101 — TOTP MFA enrolment + step-up guard for high-impact actions
- **Severity:** medium
- **Status:** open — awaiting agent_5
- **Raised at:** 2026-09-02

## Problem

`api_specification.md` §3 specifies that `POST /auth/mfa/enroll` returns
`recoveryCodes: string[]` — one-time backup codes so a user who loses their
authenticator can still regain access.

The `UserAccount` model (owned by agent_5) has `mfaSecretEncrypted` and
`mfaEnabled`, but **no column or table to persist recovery-code hashes**.
Recovery codes must never be stored in plaintext; the correct design is a
salted/strong hash of each code (e.g. SHA-256) in a dedicated column or
table, verified with a constant-time comparison and consumed on use.

`prisma/schema.prisma` is coordinator-owned, so agent_1 cannot add the
column without violating the CI ownership gate.

## Mitigation shipped in T-101 (PR to follow)

- `POST /auth/mfa/enroll` generates and returns 8 recovery codes exactly
  once, alongside the secret and `otpauthUrl`.
- The codes are **not persisted yet** — a user who loses both their
  authenticator and the printed codes cannot self-recover until the schema
  change lands. Documented as a known gap; the acceptance criteria for T-101
  (encrypted secret at rest, step-up required, non-replayable assertion) do
  not depend on recovery-code persistence.

## Requested change (agent_5)

Add a `mfaRecoveryCodeHashes` (e.g. `String[]` of hex SHA-256 digests) column
to `UserAccount`, or a `mfa_recovery_code` table `(id, user_id, hash, used_at,
created_at)`. agent_1 will then implement hashing, constant-time lookup, and
single-use consumption under `modules/auth/**`.
