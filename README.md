<div align="center">

# 🎓 ALIMS

### The Global Academic Knowledge Infrastructure

**Preserve. Connect. Activate.**

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/basgenix4u/alims/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](./LICENSE)

</div>

---

## 🌍 What ALIMS Is

ALIMS is an **institution-led registry for academic research records** — theses, datasets, articles, software, and every other scholarly output — with verification, certificates, and discovery built in.

Institutions keep full autonomy over their records. Researchers keep their dignity and privacy. The public gets trustworthy verification **without exposure of private data**.

> **Status:** Release 1 under active development. The core platform — auth, multi-tenant data layer, records, and public verification surfaces — is in place; workflow, certificates, and search are landing next. See the [roadmap](#-roadmap).

---

## 💡 Why ALIMS

Academic work today is scattered across email attachments, USB drives, faculty servers, and opaque third-party repositories. The questions that actually matter to institutions, supervisors, and researchers — *what was submitted, when, and by whom* — have no reliable answer.

ALIMS is built on a few non-negotiable principles:

| Principle | Meaning |
| --- | --- |
| **Institution-led, with room for independents** | Institutions own their verification workflows; no one is locked out for not having one |
| **No integrity scores. Ever.** | ALIMS records facts — who deposited what, when, who verified it. It never computes a "trustworthiness" number for a person or a work |
| **No automated accusations** | Similarity signals are advisory inputs to human review, never verdicts |
| **Humans decide consequential outcomes** | Verification, revocation, and status changes always carry a human decision |
| **Relationships must be explicit** | "Builds on", "supersedes", "corrects" are first-class, evidence-carrying links — never silently inferred |
| **Researcher dignity and privacy** | Grades, identity numbers, and reviewer notes are never exposed or reachable from public surfaces |
| **Openness with control** | Access levels and embargoes are chosen by the depositor and enforced by the database itself |

---

## 📦 What's Inside

| Capability | State |
| --- | --- |
| **Authentication** — Argon2id, rotating refresh tokens with reuse detection, TOTP MFA, step-up for high-impact actions | ✅ shipped |
| **Multi-tenancy** — PostgreSQL row-level security, per-request tenant context, claim proven by membership | ✅ shipped |
| **Authorization** — central deny-by-default policy engine, single entrypoint for every check | ✅ shipped |
| **Research records** — CRUD, draft semantics, server-authoritative validation | ✅ shipped |
| **Public surfaces** — search, record pages, QR certificate verification | ✅ shipped |
| **Design system** — WCAG 2.2 AA verified token set, zero-webfont, low-bandwidth first | ✅ shipped |
| Review workflow, certificates (PDF + QR), file uploads & safety pipeline | 🚧 next |
| Discovery search, embargo & access requests, academic passport, lineage | 🚧 planned |
| Collaboration, activation, disputes | 📋 Release 2–3 |

---

## 🏗 Architecture

A TypeScript monorepo:

```text
alims/
├─ apps/
│  ├─ api/        NestJS REST API — auth, records, policy, tenancy
│  ├─ web/        Next.js 15 app — public surfaces + authenticated app
│  └─ worker/     Background processors (scan, similarity, embargo)
├─ packages/
│  ├─ contracts/  Zod schemas shared by API and web (compile-time contract)
│  ├─ config/     Shared ESLint / tsconfig bases
│  └─ ui/         Accessible component library
├─ prisma/        Schema + versioned migrations (RLS, immutability, audit chain)
├─ tests/         Integration suites (real PostgreSQL, real RLS)
└─ docs/          PRD, architecture, decisions, design spec
```

**Security is enforced at the database layer, not just the application layer** — row-level security on every tenant table, append-only version history, and a hash-chained audit log with a verifier anyone can run.

Key decisions — and why — are recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md). The API contract is shared with the frontend as compiled Zod schemas, so the two sides cannot drift apart silently.

---

## 🛠 Tech Stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript (strict) |
| Monorepo | pnpm workspaces + Turborepo |
| API | NestJS 10, Prisma 6 |
| Database | PostgreSQL 16+ (row-level security, trigger-maintained full-text search) |
| Web | Next.js 15 (App Router), React 19, Tailwind CSS |
| Contracts | Zod, shared package |
| Tests | Vitest, Supertest, integration suites against real PostgreSQL |
| CI | GitHub Actions — build, typecheck, lint, unit, DB security suite, PRD invariants, dependency audit |

---

## ⚡ Getting Started

**Prerequisites:** Node 20+, pnpm 9+, PostgreSQL 16+ (or Docker for the bundled compose file).

```bash
git clone https://github.com/basgenix4u/alims.git
cd alims
pnpm install

# Database — either start the bundled one…
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

CI runs the full gate on every PR: build, typecheck, lint, unit tests, the database security suite against a real PostgreSQL (proving the app role cannot bypass RLS and that the audit chain verifies), PRD invariant checks, and a dependency audit — **high and critical advisories fail the build**.

---

## 📚 Documentation

| Document | Contents |
| --- | --- |
| [Product requirements (PRD)](docs/PRD.md) | The source of truth for what ALIMS is and must never be |
| [API specification](api_specification.md) | Every endpoint, error shape, and auth rule |
| [Architecture](docs/ARCHITECTURE.md) | The system, module by module |
| [Decision log](docs/DECISIONS.md) | What was chosen, what was rejected, why |
| [Design specification](docs/design/ui-ux-specification.md) | Brand, tokens, navigation, accessibility contract |

---

## 🗺 Roadmap

- **Release 1 — the registry core.** Auth & MFA, institutions, records with versioned deposits, review workflow, certificates with public QR verification, search. *(in progress)*
- **Release 2 — discovery & access.** Full multi-dimensional search, embargoes and access requests, academic passport, lineage visualisation.
- **Release 3 — connect & activate.** Relationship-aware collaboration, opportunity discovery, disputes with due process.

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Every change must hold the invariants above — especially the ones about human decisions and researcher privacy.

---

## 📄 License

Released under the [MIT License](./LICENSE).

---

<div align="center">

Built by [Abdulbasit Abdulalim](https://github.com/basgenix4u)

**Preserve. Connect. Activate.**

</div>
