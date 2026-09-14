# ALIMS — The Global Academic Knowledge Infrastructure

**Preserve. Connect. Activate.**

ALIMS is an institution-led registry for academic research records — theses, datasets, articles, software and every other scholarly output — with verification, certificates and discovery built in. Institutions keep full autonomy over their records; researchers keep their dignity and privacy; the public gets trustworthy verification without exposure of private data.

> **Status:** Release 1 under active development. The core platform (auth, multi-tenant data layer, records, public verification surfaces) is in place; workflow, certificates and search are landing next. See the [roadmap](#roadmap).

---

## Why ALIMS

Academic work today is scattered across email attachments, USB drives, faculty servers and opaque third-party repositories. Verification of what was submitted, when, and by whom — the questions that actually matter to institutions, supervisors and researchers — has no reliable answer.

ALIMS is built on a few non-negotiable principles (full list in the [PRD](docs/PRD.md)):

- **Institution-led, with room for independent researchers.** Institutions own their verification workflows; no one is locked out for not having one.
- **No integrity scores. Ever.** ALIMS records facts — who deposited what, when, who verified it. It never computes a "trustworthiness" number for a person or a work.
- **No automated accusations.** Similarity signals are advisory inputs to human review, never verdicts.
- **Humans decide consequential outcomes.** Verification, revocation and status changes always carry a human decision.
- **Relationships must be explicit.** "Builds on", "supersedes", "corrects" are first-class, evidence-carrying links — not inferred silently.
- **Researcher dignity and privacy.** Grades, identity numbers and reviewer notes are never exposed, and never reachable from public surfaces.
- **Openness with control.** Access levels and embargoes are chosen by the depositor and enforced by the database itself.

## What's inside

| Capability | State |
|---|---|
| Authentication — Argon2id, rotating refresh tokens with reuse detection, TOTP MFA, step-up for high-impact actions | ✅ shipped |
| Multi-tenancy — PostgreSQL row-level security, per-request tenant context, claim proven by membership | ✅ shipped |
| Authorization — central deny-by-default policy engine, single entrypoint for every check | ✅ shipped |
| Research records — CRUD, draft semantics, server-authoritative validation | ✅ shipped |
| Public surfaces — search, record pages, QR certificate verification | ✅ shipped |
| Design system — WCAG 2.2 AA verified token set, zero-webfont, low-bandwidth first | ✅ shipped |
| Review workflow, certificates (PDF + QR), file uploads & safety pipeline | 🚧 next |
| Discovery search, embargo & access requests, academic passport, lineage | 🚧 planned |
| Collaboration, activation, disputes | 📋 Release 2–3 |

## Architecture

A TypeScript monorepo:

```
alims/
├─ apps/
│  ├─ api/        NestJS REST API — auth, records, policy, tenancy
│  ├─ web/        Next.js 15 app — public surfaces + authenticated app
│  └─ worker/     background processors (scan, similarity, embargo)
├─ packages/
│  ├─ contracts/  Zod schemas shared by API and web (compile-time contract)
│  ├─ config/     shared eslint/tsconfig bases
│  └─ ui/         accessible component library
├─ prisma/        schema + versioned migrations (RLS, immutability, audit chain)
├─ tests/         integration suites (real PostgreSQL, real RLS)
└─ docs/          PRD, architecture, decisions, design spec
```

Key decisions — and why — are recorded in [docs/DECISIONS.md](docs/DECISIONS.md). The data model enforces security at the database layer, not just the application layer: row-level security on every tenant table, append-only version history, and a hash-chained audit log with a chain verifier anyone can run.

The API contract is specified in [api_specification.md](api_specification.md) and shared with the frontend as compiled Zod schemas — the two sides cannot drift apart silently.

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Monorepo | pnpm workspaces + Turborepo |
| API | NestJS 10, Prisma 6 |
| Database | PostgreSQL 16+ (row-level security, trigger-maintained full-text search) |
| Web | Next.js 15 (App Router), React 19, Tailwind CSS |
| Contracts | Zod, shared package |
| Tests | Vitest, Supertest, integration suites against real PostgreSQL |
| CI | GitHub Actions — build, typecheck, lint, unit, DB security suite, PRD invariants, dependency audit |

## Getting started

Prerequisites: **Node 20+**, **pnpm 9+**, **PostgreSQL 16+** (or Docker for the bundled compose file).

```bash
git clone https://github.com/basgenix4u/alims.git
cd alims
pnpm install

# database (either start the bundled one…)
docker compose up -d postgres
# …or point DATABASE_URL at your own PostgreSQL

cp .env.example .env          # then fill in the values
pnpm db:deploy                # apply migrations (RLS, roles, triggers)
pnpm db:generate              # generate the Prisma client

pnpm dev                      # api on :4000, web on :3000
```

Health check:

```bash
curl http://localhost:4000/api/v1/health
```

### Tests

```bash
pnpm test                 # unit tests
pnpm test:integration     # RLS, immutability, audit-chain suites (needs PostgreSQL)
pnpm audit --audit-level=high
```

CI runs the full gate on every PR: build, typecheck, lint, unit tests, the database security suite against a real PostgreSQL (proving the app role cannot bypass RLS and the audit chain verifies), PRD invariant checks, and a dependency audit — high and critical advisories fail the build.

## Documentation

- [Product requirements (PRD)](docs/PRD.md) — the source of truth for what ALIMS is and must never be
- [API specification](api_specification.md) — every endpoint, error shape and auth rule
- [Architecture](docs/ARCHITECTURE.md) — the system, module by module
- [Decision log](docs/DECISIONS.md) — what was chosen, what was rejected, why
- [Design specification](docs/design/ui-ux-specification.md) — brand, tokens, navigation, accessibility contract

## Roadmap

- **Release 1 — the registry core.** Auth & MFA, institutions, records with versioned deposits, review workflow, certificates with public QR verification, search. *(in progress)*
- **Release 2 — discovery & access.** Full multi-dimensional search, embargoes and access requests, academic passport, lineage visualisation.
- **Release 3 — connect & activate.** Relationship-aware collaboration, opportunity discovery, disputes with due process.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome — the CI gate is the floor, not the ceiling.

## License

[MIT](LICENSE) © Abdulbasit Abdulalim
