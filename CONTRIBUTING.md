# Contributing to ALIMS

Thanks for helping build ALIMS — the global academic knowledge infrastructure. This document covers the workflow, the quality bar, and the few hard rules that keep the platform trustworthy.

## Ground rules (non-negotiable)

These come from the [PRD](docs/PRD.md) and are enforced by CI where possible:

1. **No scores for people or works.** No integrity score, no quality score, no researcher rating — not in the schema, not in the API, not in the UI. Ever.
2. **No automated accusations.** Similarity tooling is advisory input to human review. It can never write record status.
3. **Consequential outcomes carry a human decision.** Verification, revocation and status changes are always attributable to a person.
4. **Public surfaces are narrow by construction.** The public verification projection cannot select grades, student IDs, reviewer notes or files. If you think you need to widen it, stop and open an issue first.
5. **Multi-tenancy is enforced by the database.** Every tenant table gets row-level security; the application role cannot bypass it. A new tenant table without RLS fails the security suite.
6. **Privacy is a feature.** Raw IPs and user agents are never stored — salted hashes only.

## Development workflow

```
main   ← release-ready. Protected.
dev    ← integration. Protected.
<type>/<slug>   ← your work. Target dev.
```

Branch naming: `feat/...`, `fix/...`, `chore/...`, `docs/...`, `test/...`, `refactor/...` — e.g. `feat/record-versioning`.

```bash
git checkout dev && git pull
git checkout -b feat/record-versioning

# ... build, test ...
git commit -m "feat(records): append-only version history"
git push -u origin feat/record-versioning
```

Then open a pull request into `dev`. PRs into `main` are promotions only, done when `dev` is release-ready.

### The quality gate

CI must be green before merge — no exceptions, no merging past a red build:

- **Build & typecheck & lint & unit tests** — the whole monorepo, strict TypeScript.
- **Database security suite** — runs against a real PostgreSQL: migrations apply, the app role is proven `NOSUPERUSER`/`NOBYPASSRLS`, cross-tenant reads return zero rows, immutability holds, the audit hash chain verifies.
- **PRD invariants** — forbidden score columns, exactly 14 CRediT roles, no status writes from the similarity path, clean public projection.
- **Dependency audit** — zero high/critical advisories.

### Code review

Every PR gets a review before merge. Reviewers should check, in order:

1. Does it belong in this PR? One logical change per PR.
2. Does the API match [api_specification.md](api_specification.md)? If the contract changed, did the spec change in the same PR?
3. Tenant isolation: does every new query path run under a tenant context? New table → RLS policy → security-suite case.
4. Error responses: RFC 9457 problem details, safe plain-language `detail`, never internals.
5. Frontend: tokens not hex values, keyboard operability, visible focus, accessible names, reduced-motion respected. The [design spec](docs/design/ui-ux-specification.md) is the contract.

### Commit messages

```
feat(records): append-only version history
fix(auth): prevent refresh token reuse across families
test(rls): assert cross-tenant reads return zero rows
```

Imperative mood, lowercase area, no issue tags in the title — the PR description carries the context.

## Project layout

See the [README](README.md) for the monorepo map and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together. The short version: `packages/contracts` is the shared source of truth for API shapes — if you change an endpoint, you change the contract package in the same PR.

## Local development

```bash
pnpm install
docker compose up -d postgres   # or your own PostgreSQL 16+
cp .env.example .env            # fill in values
pnpm db:deploy && pnpm db:generate
pnpm dev
```

```bash
pnpm test               # unit
pnpm test:integration   # needs a migrated PostgreSQL
pnpm audit --audit-level=high
```

## Licensing

By contributing you agree your contributions are MIT-licensed, as the project is.
