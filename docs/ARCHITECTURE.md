# ALIMS — System Architecture Proposal

**Source of truth:** `docs/PRD.md` (ALIMS PRD v2.0)
**Status:** Awaiting approval (Stage 1)
**Author:** AI Software Factory — Lead Software Architect

---

## 1. PRD Reading: What Constrains the Architecture

The PRD is implementation-agnostic, so the stack is a proposal. But seven product rules are *architecturally binding* — they cannot be bolted on later:

| # | PRD rule | Architectural consequence |
|---|---|---|
| A1 | §6.1 "An institution must not access another institution's private records, workflow activity, restricted reports, user data, or analytics." | **Hard multi-tenancy.** Tenant scoping enforced at the data layer (PostgreSQL Row-Level Security), not in application `WHERE` clauses that a developer can forget. |
| A2 | §9.1 "every access to a record, action, field, or download is authorised by the **server-side** product rules — not merely hidden in the interface." | Single central **policy engine**. No authorization logic in React. Every read/write passes one `authorize(actor, action, resource)` gate. Defeats OWASP API1 (BOLA) and API3 (BOPLA) by construction. |
| A3 | §6.3 "A submitted or approved version must not be silently overwritten." §7.1 "verified status applies to a **specific version**." | **Append-only version table.** Verification, certificates, and similarity results are foreign-keyed to `record_version.id`, never to `research_record.id`. Immutability enforced by DB trigger. |
| A4 | §9.1 "maintain a **tamper-evident** audit history." | Hash-chained `audit_event` table — each row stores `prev_hash` + `hash(payload‖prev_hash)`. Append-only via trigger; chain verifiable by a CLI/CI job. |
| A5 | §6.5 + §11.3 "A high overlap signal must create a review opportunity, **not** automatic public labeling, rejection, or certificate cancellation." | Similarity provider is an **advisory, async, out-of-band** service. It is *structurally incapable* of writing to record status — it writes only to `similarity_assessment`, and status transitions require a `human_decision_id`. |
| A6 | §6.9 "Machine-suggested relationships must never be presented publicly as fact unless accepted or verified." §6.11 | `relationship.evidence_state` is a required enum; the public read model filters to accepted/verified. Suggestions live in a separate table until promoted by a human. |
| A7 | §6.4/§6.6/§11.4 QR page + embargo must never leak private data. | The public verification endpoint reads from a **separate, deliberately narrow projection** containing only the ten PRD-approved certificate fields. It cannot over-fetch because the private columns are not in its query path. |

**Additional binding constraints:** WCAG 2.2 AA (§9.3), p95 < 2 s verification / < 3 s search (§9.2), low-bandwidth + resumable uploads (§6.3, §8), i18n-ready from day one (§9.4), no opaque scores anywhere (§1.5.3, §6.7, §6.8).

---

## 2. Recommended Stack

Full **TypeScript** end-to-end. One language, one type system, shared domain contracts between client and server — the highest-integrity option for a system whose core risk is *inconsistent authorization between layers*.

| Layer | Choice | Why this, for ALIMS specifically |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Shared `@alims/contracts` package makes the API contract a compile-time dependency of both apps. Frontend literally cannot call an endpoint that doesn't exist. |
| Frontend | **Next.js 15 (App Router) + React 19 + TypeScript** | SSR gives fast first paint on poor Nigerian mobile networks (§9.2) and real SEO for public discovery (§6.10). Server Components keep private data server-side by default — a structural win for A2/A7. |
| UI | **Tailwind CSS + Radix UI primitives** | Radix ships WCAG-conformant keyboard/focus/ARIA behaviour out of the box; §9.3 is a hard requirement, not a nice-to-have. |
| Client state | **TanStack Query + Zustand** | Server-cache vs. UI state cleanly separated; retry/offline semantics for §8 connectivity edge cases. |
| Backend | **NestJS 11 (Node 20) + TypeScript** | DI + modules + guards + interceptors map 1:1 onto Clean Architecture layers and give one enforceable place for the policy engine (A2). Strong Fastify adapter perf. |
| ORM / DB | **Prisma 6 + PostgreSQL 16** | Typed queries; migrations in Git. Postgres gives RLS (A1), `tsvector` full-text search, `pg_trgm`, JSONB for flexible metadata, and `ltree`/recursive CTEs for lineage. |
| Graph | **PostgreSQL recursive CTEs** (not Neo4j, initially) | §6.9 lineage is a modest-depth, typed, permissioned DAG. A second datastore doubles the multi-tenant authorization surface for no Release-1/2 benefit. Documented escape hatch: swap `LineageRepository` for Neo4j behind the port if depth-6+ traversals become hot. |
| Search | **Postgres FTS at Release 1 → OpenSearch at Release 4** | §6.10 filters are relational (discipline, year, verification level, access level). Behind a `SearchPort` so the semantic/multilingual upgrade in Release 4 is a driver swap, not a rewrite. |
| Cache/queue | **Redis 7 + BullMQ** | Async virus scan, checksum, thumbnailing, similarity polling, embargo-expiry, notification fan-out (§6.3, §6.5, §6.6). |
| Object storage | **S3-compatible (MinIO local / S3 prod)** | Presigned multipart upload → resumable uploads for §6.3 + §8. Files never transit the API server. Private buckets only; downloads via short-TTL presigned URLs issued *after* a policy check. |
| Auth | **Argon2id passwords + short JWT access (15 m) + rotating refresh in `httpOnly`+`SameSite=Strict`+`Secure` cookie + TOTP MFA** | §9.1 "require stronger identity checks for high-impact actions" → **step-up MFA** enforced on certificate issuance, revocation, institution admin, restricted-data access. |
| Validation | **Zod**, shared in `@alims/contracts` | One schema validates on client *and* server. Server-side is authoritative. |
| API docs | **OpenAPI 3.1** auto-generated from Nest decorators | Contract published as a release asset. |
| Testing | **Vitest** (unit) + **Supertest + Testcontainers** (integration, real Postgres) + **Playwright** (E2E) + **axe-core** (a11y) | The nine PRD §11 Gherkin scenarios become executable E2E tests. |
| CI/CD | **GitHub Actions** | lint → typecheck → unit → integration → build → E2E → a11y → CodeQL + `npm audit` + Trivy → Docker build/push to GHCR. |
| Observability | **Pino** structured JSON logs (redaction-first) + OpenTelemetry traces + `/health`, `/health/ready` | §9.1 "communicate safely during failures without exposing sensitive system details." |

### Rejected alternatives (recorded for the ADR log)
- **Python/FastAPI backend** — fine choice, but loses the shared-contracts compile-time guarantee that directly mitigates this product's #1 risk (auth drift between layers).
- **Neo4j from day one** — premature; second authorization surface, second backup story, second multi-tenancy story.
- **Firebase/Supabase all-in** — client-side-enforced rules conflict with A2's "server-side product rules" mandate.
- **Microservices** — team-of-one velocity killer at this stage. Modular monolith with clean module boundaries; the similarity/virus workers are already separate processes, which is the only split the PRD actually forces.

---

## 3. Architecture Style — Modular Monolith, Clean Architecture

```
apps/web (Next.js)  ─HTTPS/JSON─▶  apps/api (NestJS)  ─▶ PostgreSQL 16 (RLS)
       │                                  │            ─▶ Redis (cache + BullMQ)
       │                                  │            ─▶ S3 / MinIO (private)
       └──────── presigned PUT ───────────┼──────────────────▲
                                          │
                                    apps/worker (BullMQ)
                                    virus scan · checksum · similarity poll
                                    embargo expiry · notifications · audit verify
```

Dependency rule — **inward only**:

```
interface (controllers, DTOs, guards)
        ↓
application (use-cases, ports)
        ↓
domain (entities, value objects, policy rules, state machines)  ← depends on NOTHING
        ↑
infrastructure (Prisma, S3, Redis, mail, similarity adapters)  implements ports
```

The domain layer holds the lifecycle state machines (§7.1, §7.2, §7.3) as pure functions — `canTransition(from, to, actor, context)` — making them exhaustively unit-testable with zero I/O.

### Per-request enforcement pipeline
```
Helmet/CORS → RateLimit → JWT auth → TenantContext (sets app.current_institution / app.current_user for RLS)
 → Zod validation → PolicyGuard (authorize) → StepUpMfaGuard (high-impact only)
 → UseCase → Repository (RLS-scoped) → AuditInterceptor (hash-chain append) → Response
```

---

## 4. Database Schema (Release 1 + 2 core)

PostgreSQL 16. All PKs `uuid` (v7-ordered). All tenant-owned tables carry `institution_id` and an RLS policy. `citext` for emails. Timestamps `timestamptz`.

### 4.1 Tenancy & identity
```
institution        id, legal_name, display_name, slug, country_code, category,
                   official_domain, status(pending_verification|verified|suspended|archived),
                   branding jsonb, policies jsonb, privacy_contact, created_at, updated_at
institution_name_history  id, institution_id→, previous_name, changed_at   -- §6.1 name-change edge case
department         id, institution_id→, name, code, parent_id→self, status(active|merged|renamed|archived),
                   merged_into_id→self                                     -- §6.1 merge/rename edge case
programme          id, department_id→, name, degree_type, duration_years, status
academic_session   id, institution_id→, label, starts_on, ends_on, is_current

user_account       id, email citext UNIQUE, password_hash, display_name,
                   legal_name_encrypted, identity_level(unverified|email|identity_verified),
                   mfa_secret_encrypted, mfa_enabled, locale, status, created_at
                   -- §8 name change: legal name private+audited, display_name mutable
user_name_history  id, user_id→, previous_display_name, changed_at
membership         id, user_id→, institution_id→, department_id→null, programme_id→null,
                   role(student|supervisor|dept_admin|examiner|registry|librarian|inst_admin),
                   status(active|pending|revoked), starts_on, ends_on
                   UNIQUE(user_id, institution_id, role)
```

### 4.2 Research records & versions (A3)
```
research_record    id, nxr_id UNIQUE null, institution_id→null, owner_user_id→,
                   output_type, title, abstract, discipline[], keywords[],
                   research_year, session_id→null, access_level, licence,
                   status(draft|submitted|in_review|returned|resubmitted|inst_verified|
                          published|superseded|withdrawn|under_dispute|revoked),
                   verification_level, provenance(native|historical_digitisation|imported),
                   completion_state(complete|incomplete_seeking_continuation),
                   incomplete_reason, embargo_until, search_vector tsvector, created_at
record_version     id, record_id→, version_no int, change_summary,
                   file_key, file_name, file_size, mime_type, sha256,
                   scan_status(pending|clean|infected|unsupported|failed),
                   state(draft|submitted|returned|approved|superseded|withdrawn),
                   submitted_by→, submitted_at, is_immutable bool
                   UNIQUE(record_id, version_no)
                   -- TRIGGER: UPDATE/DELETE rejected when is_immutable
record_metadata_provenance  id, record_id→, field_name,
                   source(self_declared|institution_verified|journal_linked|imported),
                   confidence, note   -- §9.5
```

### 4.3 Workflow, verification, certificates
```
workflow_template  id, institution_id→, name, output_type, stages jsonb, is_active
workflow_instance  id, record_id→, template_id→, current_stage, status, due_at
review_task        id, workflow_instance_id→, version_id→, assignee_user_id→,
                   stage, status(pending|completed|reassigned|escalated), due_at,
                   reminder_count, completed_at
review_decision    id, task_id→, reviewer_user_id→, version_id→,
                   decision(approve|return_for_revision|request_contrib_correction|
                            escalate_integrity), comment, decided_at   -- append-only
certificate        id, record_id→, version_id→, certificate_no UNIQUE, nxr_id,
                   status(valid|superseded|revoked), issued_by→, issued_at,
                   superseded_by_id→self, revoked_reason, qr_token UNIQUE
                   -- public projection exposes ONLY the 10 PRD §6.4 fields
similarity_assessment  id, version_id→, provider, status(not_requested|pending|completed|
                   provider_delayed|review_required|reviewed|unavailable),
                   score numeric null, report_key, requested_at, completed_at
                   -- A5: NO foreign key path that can mutate record.status
integrity_review   id, assessment_id→, reviewer_user_id→,
                   outcome(no_issue|citation_correction|attribution_correction|
                           escalated|inconclusive), reason, decided_at
```

### 4.4 Contribution, passport, lineage (Release 2)
```
contributor        id, record_id→, user_id→null, external_name, external_orcid,
                   credit_roles text[] CHECK ⊆ 14 CRediT roles,
                   level(lead|equal|supporting), evidence_note,
                   ack_status(pending|acknowledged|correction_requested|disputed|no_response),
                   is_supervision bool   -- §6.7: supervision ≠ authorship
                   -- NO contribution_score column, by design (§6.7)
passport_profile   id, user_id→, headline, interests[], methods[], skills[],
                   section_visibility jsonb, orcid, is_public
                   -- NO global score column, by design (§6.8)
relationship       id, from_type, from_id, to_type, to_id,
                   rel_type(supervised_by|co_supervised_by|contributed_to|affiliated_with|
                            cites|builds_on|extends|challenges|replicates|uses_dataset|
                            produces_dataset|published_as|continues|collaborates_on|
                            funded_by|resulted_in|adopted_by|licensed_to),
                   evidence_state(self_declared|verified|externally_imported|
                                  machine_suggested|accepted|disputed|rejected),
                   confidence, explanation, created_by→, created_at
                   -- A6: public read model filters to verified|accepted
```

### 4.5 Access, collaboration, activation, disputes
```
access_request     id, record_id→, requester_user_id→, purpose, organisation,
                   status(pending|approved|declined|info_requested|ignored), decided_by→
collaboration_opportunity  id, record_id→null, owner_user_id→, title, problem_statement,
                   status, field, desired_roles[], completed_so_far, whats_needed,
                   deadline, confidentiality_level, visibility_level, funding_ip_expectation
collaboration_charter      id, opportunity_id→, terms jsonb, version
charter_acceptance         id, charter_id→, user_id→, accepted_at, ip_hash
company            id, legal_name, country, domain, verification_status, verified_at
opportunity_post   id, company_id→, type(9 PRD types), title, description, status
introduction_request  id, from_company_id→, to_user_id→, record_id→null,
                   status(pending|accepted|declined|info_requested), decided_at
                   -- decline reason NEVER exposed to requester (§6.13)
dispute            id, subject_type, subject_id, category(9 PRD categories),
                   raised_by→, status(submitted|triage|evidence_requested|under_review|
                   resolved|dismissed|escalated), resolution, assigned_to→
```

### 4.6 Audit (A4)
```
audit_event        id, seq bigserial, institution_id→null, actor_user_id→null,
                   action, subject_type, subject_id, payload jsonb (redacted),
                   ip_hash, user_agent_hash, prev_hash, hash, created_at
                   -- hash = sha256(seq‖actor‖action‖subject‖payload‖prev_hash)
                   -- TRIGGER: UPDATE and DELETE unconditionally rejected
```

### 4.7 Isolation & performance
- **RLS** on every tenant table: `USING (institution_id = current_setting('app.current_institution')::uuid)`, plus explicit public-read policies for published records. Application connects as a **non-superuser, non-BYPASSRLS** role — so a forgotten `WHERE` clause cannot leak across tenants.
- Indexes: GIN on `search_vector`, `keywords`, `discipline`; btree on every FK; partial index on `record_version(record_id) WHERE state='approved'`; unique on `nxr_id`, `certificate_no`, `qr_token`.
- Soft-delete + retention flags rather than hard deletes (§7.1, §8 legal-request row).

---

## 5. API Contract (v1, REST + OpenAPI 3.1)

Base `/api/v1`. JSON. Cursor pagination (`?cursor=&limit=`). Errors are RFC 9457 Problem Details — generic messages externally, correlation ID for support (§9.1).

```
Auth            POST /auth/register · /auth/login · /auth/refresh · /auth/logout
                POST /auth/mfa/enroll · /auth/mfa/verify · /auth/step-up
                POST /auth/password/forgot · /auth/password/reset
                GET  /auth/me

Institutions    GET/POST /institutions · GET/PATCH /institutions/:id
                PATCH /institutions/:id/status              [platform admin + step-up]
                CRUD  /institutions/:id/departments|programmes|sessions|workflow-templates
                GET   /institutions/:id/metrics             [role-scoped, §10.1]

Members         GET/POST /institutions/:id/members · PATCH/DELETE /members/:id
                POST  /institutions/:id/members/bulk-invite

Records         GET/POST /records · GET/PATCH/DELETE /records/:id
                POST /records/:id/submit
                GET  /records/:id/versions · POST /records/:id/versions
                POST /records/:id/versions/:vid/finalize
                PATCH /records/:id/access · POST /records/:id/withdraw
                GET  /records/:id/lineage?depth=

Uploads         POST /uploads/init      → presigned multipart URLs (resumable, §6.3)
                POST /uploads/:id/complete
                GET  /uploads/:id/status → scan/checksum progress
                GET  /records/:id/versions/:vid/download → 302 short-TTL presigned [policy-gated]

Review          GET  /tasks?assigned=me · GET /tasks/:id
                POST /tasks/:id/decision
                POST /records/:id/escalate-integrity
                GET  /versions/:vid/similarity            [authorised roles only, §6.5]
                POST /versions/:vid/similarity/review

Certificates    POST /records/:id/certificate             [registry + step-up MFA]
                POST /certificates/:id/revoke             [registry + step-up MFA]
                GET  /certificates/:id                    [private, role-scoped]
                GET  /public/verify/:qrToken              [PUBLIC — 10 approved fields only]

Contribution    GET/POST /records/:id/contributors · PATCH /contributors/:id
                POST /contributors/:id/acknowledge|dispute|request-correction

Passport        GET  /passports/:userId                   [visibility-filtered]
                GET/PATCH /me/passport
                GET  /public/passports/:handle            [PUBLIC — public sections only]

Lineage         POST /relationships · PATCH /relationships/:id/accept|reject|report
                GET  /suggestions?for=record:id           [explainable, §6.11]
                POST /suggestions/:id/dismiss|accept|save

Discovery       GET  /public/search?q=&discipline=&type=&institution=&country=&year=
                       &methodology=&verification=&access=&hasData=&collab=&opportunity=
                GET  /public/records/:nxrId              [PUBLIC — permitted fields only]

Access          POST /records/:id/access-requests · POST /access-requests/:id/decide
Collab          CRUD /opportunities · POST /opportunities/:id/charter/accept
Activation      POST /companies · POST /companies/:id/verify · CRUD /opportunity-posts
                POST /introduction-requests · POST /introduction-requests/:id/decide
Disputes        POST /disputes · GET /disputes?scope= · PATCH /disputes/:id
System          GET  /health · /health/ready · /metrics · /docs (OpenAPI UI)
```

**Public endpoints are namespaced under `/public/*`** and served by read-only projection services — a reviewable, auditable boundary for A7.

---

## 6. Project Structure

```
alims/
├─ apps/
│  ├─ api/                 NestJS
│  │  └─ src/
│  │     ├─ domain/        entities · value-objects · state-machines · policy   (pure)
│  │     ├─ application/   use-cases · ports · dto
│  │     ├─ infrastructure/ prisma · storage · queue · mail · similarity · audit
│  │     ├─ interface/     http controllers · guards · interceptors · filters
│  │     └─ modules/       auth institutions records versions review certificates
│  │                       contribution passport lineage discovery access collab
│  │                       activation disputes admin health
│  ├─ web/                 Next.js 15 App Router
│  │  └─ src/{app,components,features,hooks,lib,styles,i18n}
│  └─ worker/              BullMQ processors
├─ packages/
│  ├─ contracts/           Zod schemas + inferred TS types + OpenAPI  (shared)
│  ├─ config/              eslint · prettier · tsconfig bases
│  └─ ui/                  shared accessible components
├─ prisma/                 schema.prisma · migrations/ · seed.ts
├─ docs/                   PRD.md · ARCHITECTURE.md · TASKBOARD.md · API.md
│                          SECURITY.md · DEPLOYMENT.md · adr/
├─ tests/{e2e,integration,a11y}
├─ .github/workflows/      ci.yml · codeql.yml · release.yml
├─ docker/                 Dockerfile.api · Dockerfile.web · Dockerfile.worker
├─ docker-compose.yml      postgres · redis · minio · mailhog · api · web · worker
└─ turbo.json · pnpm-workspace.yaml · .env.example · .gitignore
```

---

## 7. Security Posture (OWASP Top 10 + API Top 10)

| Risk | Control |
|---|---|
| A01/API1 Broken access control (BOLA) | Central policy engine; deny-by-default; PostgreSQL RLS as second layer; integration test asserting cross-tenant 404 on **every** resource route. |
| API3 Property-level auth (BOPLA) | Explicit response DTO serialization — allow-list fields only. `excludeExtraneousValues: true` globally. Never return a Prisma entity directly. |
| A02 Crypto failures | Argon2id; AES-256-GCM for legal names/MFA secrets; TLS 1.2+; private buckets; short-TTL presigned URLs. |
| A03 Injection | Prisma parameterized queries; Zod validation; no raw SQL with interpolation; no shell exec on user input; DOMPurify + strict CSP for any rendered rich text. |
| A04 Insecure design | Threat model in `docs/SECURITY.md`; state machines make illegal transitions unrepresentable. |
| A05 Misconfiguration | Helmet, strict CSP, HSTS, CORS allow-list, no stack traces in prod, `.env.example` only, secrets via GitHub Encrypted Secrets. |
| A06 Vulnerable components | Dependabot + `npm audit --audit-level=high` + Trivy image scan, all CI-blocking. |
| A07 Auth failures | Rate-limited + lockout login, rotating refresh tokens with reuse detection, TOTP MFA, step-up for high-impact actions. |
| A08 Integrity failures | SHA-256 per uploaded version; hash-chained audit; signed release artifacts. |
| A09 Logging failures | Pino with redaction paths for tokens/passwords/PII; audit trail for every consequential action; alerting on auth anomalies. |
| A10 SSRF | No user-supplied URL fetching; outbound allow-list for similarity/ORCID adapters. |
| CSRF | `SameSite=Strict` refresh cookie + double-submit token on cookie-auth routes; bearer JWT for API calls. |
| File upload | Type + magic-byte + size validation, ClamAV scan before any download is possible, private bucket, `Content-Disposition: attachment`, no execution path. |

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Scope: PRD spans 4 releases | Build Release 1 fully and correctly; scaffold R2 domain; R3/R4 behind ports + feature flags. Nothing half-built and claimed done. |
| No Docker daemon in this sandbox | Dockerfiles/compose authored + linted (hadolint) and validated in GitHub Actions where Docker *is* available. Flagged honestly, not silently skipped. |
| Similarity provider is external/absent | `SimilarityPort` with a deterministic stub adapter; PRD §9.2 "degrade gracefully" is the default path, and `provider_delayed` is a first-class state. |
| Postgres FTS may not satisfy R4 semantics | `SearchPort` isolates it; OpenSearch swap is a driver change. |
| RLS misconfiguration silently disables isolation | Dedicated integration test suite that connects as the app role and asserts cross-tenant reads return zero rows. |

---

## 9. Delivery Plan (Stages)

1. **Stage 1** — this document + schema + API contract + structure + task board → *awaiting your approval*
2. **Stage 2** — monorepo scaffold, configs, deps, tooling, smoke endpoint, verification → approval gate
3. **Stage 3** — backend: migrations, auth+MFA, policy engine, records/versions/workflow/certificates/audit, tests
4. **Stage 4** — frontend: accessible responsive UI, auth flow, all screens wired to live API, zero mock data, clean build
5. **Stage 5** — Docker, CI/CD, env config, README, deployment docs, release assets, tagged release

---

## 10. Open Questions (non-blocking; sensible defaults assumed)

1. **NXR-ID format** — PRD says permanent, not a DOI. Default: `NXR-<YYYY>-<base32(uuidv7)[0:10]>` e.g. `NXR-2026-7K3M9QX2ZB`.
2. **Similarity provider** — none named. Default: stub adapter + documented port; real provider is config, not code.
3. **Certificate rendering** — default: server-side PDF (pdf-lib) with embedded QR → `/public/verify/:qrToken`.
4. **Email delivery** — default: MailHog locally, SMTP via env in prod.
5. **Release 1 scope confirmation** — I plan to build R1 fully + R2 foundations. R3/R4 scaffolded behind flags.

Defaults are applied unless you say otherwise; none of them block Stage 2.
