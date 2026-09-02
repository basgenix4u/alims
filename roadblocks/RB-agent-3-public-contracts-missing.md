# RB-agent-3-public-contracts-missing

- **Raised by:** agent_3
- **Task:** T-410 — Public surfaces: search, record page, QR verification
- **Severity:** medium
- **Status:** resolved by agent_5 (2026-09-02) — schemas ported verbatim to packages/contracts/src/discovery.ts; recorded as RB-009
- **Raised at:** 2026-08-14

## Problem

`packages/contracts` exports `publicVerificationSchema` (contract §8) but has no
schema for the two discovery endpoints in `api_specification.md` §13:

- `GET /public/search` → `Paginated<PublicRecordSummary>`
- `GET /public/records/:nxrId` → `PublicRecordDetail`

`packages/contracts/**` is not in agent_3's `owned_paths`, and the CI ownership
gate rejects edits outside an agent's lane, so these schemas cannot be added
from this branch.

This matters more than a missing type. ADR-001 states that the shared contracts
package exists so the API contract is a *compile-time* dependency of both sides,
"directly mitigating this product's primary risk: authorization drift between
layers." For the discovery endpoints that guarantee is currently absent — the
public search surface is exactly where a widened projection would leak.

## Workaround on this branch

`apps/web/src/features/discovery/public-contracts.ts` transcribes the §13 shapes
verbatim, composed from the shared enum schemas (`outputTypeSchema`,
`verificationLevelSchema`, `accessLevelSchema`, `paginatedSchema`) so an enum
change in the contracts package still breaks this file at compile time rather
than drifting silently. Every response is parsed through these schemas before
render, and unknown keys are stripped, so a wider server payload cannot reach
the DOM.

`PublicRecordDetail` is named in §13 but its fields are not enumerated. It is
modelled here as `PublicRecordSummary` widened with the fields §5.9 of
`ui_ux_specification.md` explicitly permits (abstract, keywords, discipline,
contributors with CRediT roles and evidence labels, relationships), all
optional so a narrower server projection still parses.

## Requested from agent_5

1. Add `publicRecordSummarySchema`, `publicSearchResponseSchema` and
   `publicRecordDetailSchema` to `packages/contracts/src`.
2. Enumerate the `PublicRecordDetail` fields in `api_specification.md` §13, so
   agent_2's backend and this frontend agree on one definition rather than two.
3. On merge, `public-contracts.ts` should be reduced to re-exports from
   `@alims/contracts` with no shape change.

## Impact if not actioned

Low for delivery — the pages work and are validated. Medium for correctness:
until the schemas are shared, the backend implementing §13 and this client are
two independent transcriptions of the same prose, which is the drift ADR-001
was written to prevent.


## Resolution (agent_5, 2026-09-02)

Schemas ported **verbatim** (no shape change) into
`packages/contracts/src/discovery.ts`, exported from `@alims/contracts`, with
PRD §6.10 regression tests in `contracts.test.ts`. Recorded as RB-009.

Follow-up for agent_3 (T-411+): replace the local stubs in
`apps/web/src/features/discovery/public-contracts.ts` with imports from
`@alims/contracts` and delete the duplicated schema definitions; keep
`parseSearchFilters` (app logic) local.
