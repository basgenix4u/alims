# ALIMS — Decision Log

Every significant architectural decision, in order. Each entry records what was chosen, what was rejected, and why — so the same debates don't get re-litigated, and so future changes know what they're overturning.

---

## ADR-001 — Full TypeScript monorepo

**Status:** Accepted · **Date:** 2026-07

**Decision.** One language end to end. A pnpm-workspaces + Turborepo monorepo: `apps/api` (NestJS), `apps/web` (Next.js), `apps/worker`, and `packages/contracts`, `packages/config`, `packages/ui`.

**Why.** The single biggest risk in this product is drift between the API and its clients — an authorization rule on one side and a stale assumption on the other. TypeScript with a shared contracts package makes the API contract a *compile-time* dependency of both sides. Types carry the guarantee; tests just confirm it.

**Rejected.**
- *Polyglot (e.g. Go API + TS web).* Two toolchains, two type universes, contract drift becomes runtime-only. Not worth the performance headroom for this product.
- *BFF-in-one-framework (Next API routes).* The review workflow, audit chain and background processors need a real service layer and long-running workers.

---

## ADR-002 — Tenant isolation by PostgreSQL row-level security

**Status:** Accepted · **Date:** 2026-07

**Decision.** Every tenant-owned table has RLS enabled with `FORCE ROW LEVEL SECURITY`. The application connects as `alims_app` — `NOSUPERUSER`, `NOBYPASSRLS` — and sets the tenant context per request (transaction-local `SET LOCAL`, never a pooled `SET`). CI proves the app role's flags and asserts cross-tenant reads return zero rows on every tenant table.

**Why.** Institution data separation is the product's license to exist. Application-layer filtering is one forgotten `WHERE` clause away from a cross-tenant leak; RLS makes the database itself refuse.

**Rejected.**
- *Schema-per-tenant / database-per-tenant.* Operationally heavy at the scale of many small institutions; migration fan-out becomes a project of its own.
- *Application-layer filtering only.* Cheaper, but the guarantee is only as strong as every query ever written. Not acceptable here.

---

## ADR-003 — Recursive CTEs for lineage, not a graph database

**Status:** Accepted · **Date:** 2026-07 · **Revisit:** when lineage depth or query patterns outgrow Postgres

**Decision.** Lineage (builds-on, supersedes, corrects chains) is queried with recursive CTEs on the relationship tables.

**Why.** The relationship graph is shallow (typical depth < 10), write-light and read-regular — squarely inside Postgres' comfort zone. One datastore to operate, back up, and secure; relationships stay transactional with the records they reference.

**Rejected.**
- *Neo4j / graph store.* Another datastore, another security surface, another backup regime — for a workload that doesn't need it yet. If depth or traversal workloads grow, revisit with data.

---

## ADR-004 — Similarity provider is advisory only

**Status:** Accepted · **Date:** 2026-07

**Decision.** The similarity subsystem produces advisory signals for human reviewers. It has no code path that writes record status. CI greps for exactly this and fails the build on violation.

**Why.** PRD §6.5: automated accusations are forbidden. A similarity score is an input to a human decision, never the decision itself. Encoding this as an un-enforceable convention was not enough — it's a build check.

---

## ADR-005 — Trigger-maintained full-text search vector

**Status:** Accepted · **Date:** 2026-08

**Decision.** `search_vector` on research records is maintained by a trigger, not a `GENERATED ALWAYS AS` column.

**Why.** `to_tsvector('english', …)` is `STABLE`, not `IMMUTABLE` — Postgres rejects it in generation expressions ("generation expression is not immutable"). A trigger gives the same always-current behaviour with the dictionary dependency made explicit.

---

## ADR-006 — Append-only versions; certificates bind to a version

**Status:** Accepted · **Date:** 2026-08

**Decision.** `record_version` is append-only (enforced at the DB layer); verification and certificates reference a specific `record_version.id`, never the mutable record head. Deposits are evidenced with receipts whose language claims only deposit, not ownership.

**Why.** Verification must survive later edits: a certificate that says "X was deposited and verified as version N" stays true when version N+1 arrives. Deposit receipts that overclaim ownership would be dishonest by design.

---

## ADR-007 — Hash-chained audit log

**Status:** Accepted · **Date:** 2026-08

**Decision.** `audit_event` rows chain `prev_hash → hash` (SHA-256 over the row payload). A `verify_audit_chain()` SQL function walks the chain; CI and `pnpm db:verify-audit` both assert zero broken links. Raw IPs and user agents are never stored — salted hashes only.

**Why.** The audit trail must be able to prove its own integrity. And a privacy-preserving audit log that stores raw PII would undermine the very records it protects.

---

## ADR-008 — Public verification is a narrow projection

**Status:** Accepted · **Date:** 2026-08

**Decision.** `GET /public/verify/:qrToken` returns exactly the ten PRD §6.4 fields from a typed projection. The response schema lives in the shared contracts package with a regression test asserting that grade, student-number, similarity and reviewer-note fields cannot appear. Cross-tenant misses return 404, never 403 — existence is not disclosed.

**Why.** The public surface is the most attacked surface. Making the projection structurally incapable of carrying private data beats hoping every future query author remembers.

---

## ADR-009 — Zero-webfont, inline-SVG design system

**Status:** Accepted · **Date:** 2026-08

**Decision.** System font stack only (tuned per platform), icons as inline SVG, no client-rendered hero imagery, WCAG 2.2 AA contrast pairs verified numerically in the design spec and shipped as CSS custom properties (`tokens.css`).

**Why.** PRD §9.3: the product must be fast on low-bandwidth connections. Fonts and icon fonts are the most wasteful first-load bytes. Zero downloads beats clever caching.

---

## ADR-010 — RFC 9457 problem details everywhere

**Status:** Accepted · **Date:** 2026-08

**Decision.** Every API error is an RFC 9457 problem-details object with safe, plain-language `detail`, a stable `type` URI, and a request id. Never stack traces, never internal messages.

**Why.** Errors are part of the contract. Clients need to branch on them; users need to understand them; attackers deserve nothing.

---

## ADR-011 — CI is the floor for the PRD's hard rules

**Status:** Accepted · **Date:** 2026-08

**Decision.** The PRD's most erodible rules are build checks: no score columns in the schema, exactly 14 CRediT roles, similarity code cannot write status, public projection stays clean, app role cannot bypass RLS, audit chain verifies.

**Why.** Principles in documents decay; checks in CI don't. A well-meaning "just this once" PR is exactly how the product's promises would die.
