# ALIMS

**The Global Academic Knowledge Infrastructure**
*Preserve. Connect. Activate.*

> Status: **Stage 1–2 — Foundation & Contracts.** Not yet functional. See `docs/TASKBOARD.md`.

ALIMS gives every eligible academic output a durable **Research Record**: a structured
identity linking a work to its people, institution, supervision, contribution roles,
versions, lineage, and permitted real-world outcomes.

It is **not** a document dump, a plagiarism checker, or a CV site. It preserves research
before it disappears, makes provenance visible without overclaiming it, and turns
discoverable knowledge into governed collaboration.

## What makes this build different

The PRD contains rules that are architecturally binding — encoded here as structure, not policy docs:

- **Tenant isolation** — PostgreSQL Row-Level Security, so a forgotten `WHERE` clause cannot leak across institutions.
- **Server-side authorization only** — one central policy engine; zero authorization logic in the UI.
- **Append-only versions** — approved versions are immutable at the database level; verification binds to a *version*, never a record.
- **Tamper-evident audit** — hash-chained events; `UPDATE`/`DELETE` rejected by trigger.
- **No automated accusations** — the similarity subsystem has no write path to record status. A human decision is structurally required.
- **No opaque scores** — there is no integrity, quality, or contribution score column. The PRD forbids them, so they are unrepresentable.
- **Narrow public projections** — the QR verification endpoint physically cannot select private columns.

## Documentation

| Document | Purpose |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements — **single source of truth** |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, schema, security posture, ADRs |
| [`api_specification.md`](api_specification.md) | API contract — the frontend/backend handshake |
| [`coordination_board.json`](coordination_board.json) | Live task board for all six agents |
| [`docs/TASKBOARD.md`](docs/TASKBOARD.md) | Human-readable delivery plan |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Git-Ops Collaboration Protocol |

## Stack

TypeScript monorepo · Next.js 15 · NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis + BullMQ · S3 · Turborepo

## Quick start

```bash
cp .env.example .env      # fill in secrets — never commit .env
pnpm install
docker compose up -d      # postgres, redis, minio, mailhog
pnpm db:migrate
pnpm dev
```

## Licence

Proprietary — © 2026 basgenix4u. All rights reserved.
