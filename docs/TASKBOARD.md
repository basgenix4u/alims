# ALIMS — Master Task Board

Legend: `[ ]` Pending · `[~]` In Progress · `[x]` Completed
**Rule:** exactly one `[~]` at any time.

**Source of truth:** `docs/PRD.md` (ALIMS PRD v2.0)
**Last updated:** 2026-08-14

---

## Stage 1 — Architecture & Planning  `AWAITING APPROVAL`

- [x] 1.1 Retrieve and securely store GitHub PAT; verify scopes
- [x] 1.2 Retrieve and read full PRD (983 lines, 12 sections)
- [x] 1.3 Extract architecturally-binding constraints (A1–A7)
- [x] 1.4 Propose system architecture and stack with justification
- [x] 1.5 Design database schema (Release 1 + 2 core)
- [x] 1.6 Define API contract (v1 surface)
- [x] 1.7 Define project folder structure
- [x] 1.8 Create master task board
- [~] 1.9 Present Stage 1 for approval  ← **YOU ARE HERE**

## Stage 2 — Development Environment  `BLOCKED ON STAGE 1 APPROVAL`

- [ ] 2.1 Create private GitHub repo `basgenix4u/alims`; configure Git credentials via PAT
- [ ] 2.2 Initialise pnpm + Turborepo monorepo; workspace manifests
- [ ] 2.3 Root configs: `.gitignore`, `.env.example`, `tsconfig` bases, ESLint, Prettier, EditorConfig, Husky + lint-staged, commitlint
- [ ] 2.4 Scaffold `apps/api` (NestJS) with strict TS
- [ ] 2.5 Scaffold `apps/web` (Next.js 15 + Tailwind + Radix)
- [ ] 2.6 Scaffold `apps/worker` (BullMQ) and `packages/{contracts,config,ui}`
- [ ] 2.7 Install all dependencies non-interactively
- [ ] 2.8 `docker-compose.yml`: postgres, redis, minio, mailhog
- [ ] 2.9 Prisma init + connection; baseline migration
- [ ] 2.10 Smoke-test endpoint `GET /api/v1/health` + web page consuming it
- [ ] 2.11 Vitest + Playwright + Testcontainers harness; first passing test
- [ ] 2.12 Verify environment: build, lint, typecheck, test all green; logs to files
- [ ] 2.13 Initial commit + push; branch protection; present for approval

## Stage 3 — Backend Implementation  `PENDING`

- [ ] 3.1 Full Prisma schema + initial migration + seed data
- [ ] 3.2 RLS policies migration + cross-tenant isolation test suite (A1)
- [ ] 3.3 Hash-chained audit module + immutability triggers + chain verifier (A4)
- [ ] 3.4 Auth: register, login, refresh rotation + reuse detection, logout, password reset
- [ ] 3.5 TOTP MFA + step-up guard for high-impact actions (§9.1)
- [ ] 3.6 Central policy engine + `PolicyGuard`; deny-by-default (A2)
- [ ] 3.7 Institutions, departments, programmes, sessions, workflow templates (§6.1)
- [ ] 3.8 Memberships, roles, invitations, bulk invite
- [ ] 3.9 Research Record CRUD + validation + draft save (§6.2)
- [ ] 3.10 Versions: append-only, immutability trigger, change summaries (§6.3, A3)
- [ ] 3.11 Uploads: presigned multipart, resume, checksum, scan pipeline, receipts (§6.3, §8)
- [ ] 3.12 Workflow engine: submit, assign, review decisions, return, resubmit (§5.1, §7.1)
- [ ] 3.13 Similarity assessment (advisory only) + human integrity review (§6.5, A5)
- [ ] 3.14 Certificates: issue, supersede, revoke, PDF + QR (§6.4, §7.2)
- [ ] 3.15 Public verification projection endpoint — 10 approved fields only (A7)
- [ ] 3.16 Access levels, embargo scheduling, access requests (§6.6)
- [ ] 3.17 Contributor Ledger + CRediT roles + acknowledge/dispute (§6.7)
- [ ] 3.18 Academic Passport + visibility controls + evidence labelling (§6.8)
- [ ] 3.19 Relationships/lineage + evidence states + recursive CTE traversal (§6.9, A6)
- [ ] 3.20 Search + discovery filters + safe result projection (§6.10)
- [ ] 3.21 Explainable suggestions with plain-language basis + confidence (§6.11)
- [ ] 3.22 Collaboration opportunities + charters + acceptance (§6.12)
- [ ] 3.23 Company verification + opportunity posts + introduction requests (§6.13)
- [ ] 3.24 Disputes lifecycle across all 9 categories (§7.3)
- [ ] 3.25 Institution metrics/reporting endpoints (§10.1)
- [ ] 3.26 Worker jobs: scan, similarity poll, embargo expiry, reminders, notifications
- [ ] 3.27 Logging, error handling, rate limiting, security headers, i18n error catalogue
- [ ] 3.28 Unit + integration tests; coverage gate; all green

## Stage 4 — Frontend Implementation  `PENDING`

- [ ] 4.1 Design system: tokens, typography, WCAG 2.2 AA colour contrast, focus states
- [ ] 4.2 App shell: responsive nav, skip links, landmarks, i18n scaffolding
- [ ] 4.3 Auth flows: register, login, MFA, step-up, password reset, session handling
- [ ] 4.4 Student: dashboard, record wizard, resumable upload, receipts, version history
- [ ] 4.5 Supervisor: task queue, review, structured feedback, return/approve
- [ ] 4.6 Registry/admin: workflow config, verification, certificate issuance/revocation
- [ ] 4.7 Librarian: metadata quality, embargo/access management, historical ingest
- [ ] 4.8 Public: search, record page, QR verification page, public passport
- [ ] 4.9 Contributor ledger UI: declare, acknowledge, dispute
- [ ] 4.10 Passport editor + visibility controls
- [ ] 4.11 Lineage visualisation with explicit relationship + evidence labels
- [ ] 4.12 Collaboration, opportunities, charter acceptance, introduction requests
- [ ] 4.13 Institution dashboard/metrics
- [ ] 4.14 Loading, empty, error, offline, low-bandwidth states everywhere
- [ ] 4.15 Remove all mock data — 100% live API
- [ ] 4.16 axe-core a11y pass + keyboard-only walkthrough
- [ ] 4.17 Zero compile / lint / TypeScript errors; production build green

## Stage 5 — Production Readiness  `PENDING`

- [ ] 5.1 Multi-stage Dockerfiles (api, web, worker), non-root, hadolint-clean
- [ ] 5.2 Production docker-compose + healthchecks + resource limits
- [ ] 5.3 CI: lint, typecheck, unit, integration, build, E2E, a11y
- [ ] 5.4 Security CI: CodeQL, npm audit, Trivy, secret scanning
- [ ] 5.5 CD: build + push images to GHCR; migration strategy
- [ ] 5.6 Env config matrix + secret management documentation
- [ ] 5.7 Comprehensive README (badges, quickstart, architecture, scripts)
- [ ] 5.8 `docs/DEPLOYMENT.md`, `SECURITY.md`, `CONTRIBUTING.md`, ADR log
- [ ] 5.9 Executable PRD §11 acceptance-criteria E2E suite (all 9 scenarios)
- [ ] 5.10 Issues, milestones, labels, project board on GitHub
- [ ] 5.11 CHANGELOG, semantic version tag, GitHub Release with assets
- [ ] 5.12 Final audit: full test run, security review, PRD traceability matrix
