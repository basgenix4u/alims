# ALIMS — API Specification v1

**Status:** Authoritative contract · **Owner:** Agent 5 (Lead Architect) · **Version:** 1.0.0
**Source of truth:** `docs/PRD.md` (ALIMS PRD v2.0) · **Schema:** `prisma/schema.prisma`

> **This document is the handshake.** Backend agents (1–3) implement exactly this. Frontend agent (4) consumes exactly this. Neither side may change it unilaterally — raise a `roadblock` in `coordination_board.json` and Agent 5 will version the contract.
>
> Types are expressed as TypeScript. All schemas are mirrored as Zod in `packages/contracts` and are the single runtime validator on both sides.

---

## 1. Conventions

| Aspect | Rule |
|---|---|
| Base URL | `/api/v1` |
| Content type | `application/json; charset=utf-8` (uploads use presigned S3 PUT) |
| Auth | `Authorization: Bearer <accessToken>` — access token TTL 15 min |
| Refresh | Rotating refresh token in `httpOnly; Secure; SameSite=Strict` cookie `alims_rt` |
| Step-up | High-impact actions additionally require `X-Step-Up-Token: <token>` (TTL 5 min, single use) |
| Tenant context | Derived **server-side** from the authenticated membership. Never accepted from a client header or body. |
| IDs | UUID v7 strings |
| Timestamps | ISO 8601 UTC, e.g. `2026-08-14T09:30:00.000Z` |
| Pagination | Cursor: `?cursor=<opaque>&limit=<1..100>` (default 20) |
| Sorting | `?sort=field:asc|desc` — allow-listed fields only |
| Idempotency | `Idempotency-Key` header honoured on all POSTs that create resources |
| Correlation | Every response carries `X-Request-Id`; echo it in bug reports |
| Rate limits | 100 req/min authenticated · 20 req/min unauthenticated · 5 req/min on auth mutations |

### 1.1 Envelopes

```ts
// Collection response
type Paginated<T> = {
  data: T[];
  pagination: { nextCursor: string | null; hasMore: boolean; limit: number };
};

// Single resource: returned bare (no wrapper)
```

### 1.2 Error format — RFC 9457 Problem Details

```ts
type ProblemDetails = {
  type: string;        // "https://alims.org/errors/validation-failed"
  title: string;       // "Validation failed"
  status: number;      // 422
  detail: string;      // Safe, plain-language. NEVER leaks internals (PRD §9.1)
  instance: string;    // "/api/v1/records"
  requestId: string;
  errors?: Array<{ field: string; code: string; message: string }>;
};
```

**Status code contract**

| Code | Meaning in ALIMS |
|---|---|
| 200 | OK | 201 | Created | 202 | Accepted (async processing started) | 204 | No content |
| 400 | Malformed request | 401 | Missing/invalid/expired access token |
| 403 | Authenticated but policy denies **and** the resource's existence is already known to the caller |
| 404 | Not found **or** deliberately masked cross-tenant/unauthorised access (see §1.3) |
| 409 | State conflict (e.g. editing a non-draft record) | 410 | Gone (withdrawn) |
| 413 | Payload too large | 415 | Unsupported media type |
| 422 | Semantic validation failure | 423 | Locked (record under dispute) |
| 428 | Step-up MFA required | 429 | Rate limited | 503 | Dependency degraded (PRD §9.2) |

### 1.3 Security invariants — binding on every endpoint

1. **Cross-tenant reads return `404`, never `403`.** A `403` would confirm existence. PRD §6.1.
2. **Every response is an explicit allow-list DTO.** Never serialize a Prisma entity directly. Defeats OWASP API3.
3. **Authorization is server-side only.** UI state is never a control. PRD §9.1.
4. **`/public/*` endpoints read from narrow projections** that physically cannot select private columns. PRD §6.4.
5. **No endpoint returns an aggregate score** for integrity, quality, or contribution. PRD §1.5, §6.7, §6.8.
6. **Similarity data is never included** in any record, search, or public response. PRD §6.5.

---

## 2. Shared Enumerations

```ts
type OutputType = 'project'|'thesis'|'dissertation'|'article'|'report'|'dataset'
                | 'software'|'preprint'|'patent_disclosure'|'presentation'|'other';

type RecordStatus = 'draft'|'submitted'|'in_review'|'returned_for_revision'|'resubmitted'
                  | 'institutionally_verified'|'published'|'superseded'|'withdrawn'
                  | 'under_dispute'|'verification_revoked';

type VerificationLevel = 'draft'|'submitted'|'identity_verified_deposit'|'self_published'
                       | 'supervisor_verified'|'institutionally_verified'|'journal_verified'
                       | 'under_dispute'|'withdrawn'|'verification_revoked';

type AccessLevel = 'metadata_public'|'abstract_public'|'full_public'|'institution_only'|'restricted';

type MemberRole = 'student'|'supervisor'|'dept_admin'|'examiner'|'registry'|'librarian'|'inst_admin';

type InstitutionStatus = 'pending_verification'|'verified'|'suspended'|'archived';

type VersionState = 'draft'|'submitted'|'returned'|'approved'|'superseded'|'withdrawn';

type ScanStatus = 'pending'|'clean'|'infected'|'unsupported'|'failed';

type CertificateStatus = 'valid'|'superseded'|'revoked';

type ReviewDecisionType = 'approve'|'return_for_revision'|'request_contribution_correction'
                        | 'escalate_integrity';

type SimilarityStatus = 'not_requested'|'pending'|'completed'|'provider_delayed'
                      | 'review_required'|'reviewed'|'unavailable';

type IntegrityOutcome = 'no_issue'|'citation_correction_required'
                      | 'attribution_correction_required'|'escalated'|'inconclusive';

// CRediT — exactly 14 roles (NISO standard, PRD §6.7)
type CreditRole = 'conceptualization'|'data_curation'|'formal_analysis'|'funding_acquisition'
                | 'investigation'|'methodology'|'project_administration'|'resources'
                | 'software'|'supervision'|'validation'|'visualization'
                | 'writing_original_draft'|'writing_review_editing';

type ContributionLevel = 'lead'|'equal'|'supporting';
type AckStatus = 'pending'|'acknowledged'|'correction_requested'|'disputed'|'no_response';

type EvidenceState = 'self_declared'|'verified'|'externally_imported'|'machine_suggested'
                   | 'accepted'|'disputed'|'rejected';

type MetadataSource = 'self_declared'|'institution_verified'|'journal_linked'|'imported';
```

---

## 3. Authentication — `/auth` · **Agent 1**

### `POST /auth/register` → `201`
```ts
Request  { email: string; password: string; displayName: string; locale?: string }
Response { user: UserSummary; verificationEmailSent: true }
```
Password policy: ≥12 chars, not in breach list. Argon2id. `409` if email exists — but the generic message must not confirm registration state to an attacker.

### `POST /auth/login` → `200`
```ts
Request  { email: string; password: string }
Response { accessToken: string; expiresIn: 900; user: UserSummary; mfaRequired: boolean }
// mfaRequired=true → accessToken is a limited challenge token; call /auth/mfa/verify next
```
Sets `alims_rt` cookie. `429` after 5 failures. Timing-safe: identical response shape and latency for unknown email vs wrong password.

### `POST /auth/refresh` → `200`
Reads `alims_rt` cookie; rotates it. **Reuse of a consumed token revokes the entire family and returns `401`.**

### `POST /auth/logout` → `204` · `GET /auth/me` → `200 UserProfile`

### `POST /auth/mfa/enroll` → `200 { secret, otpauthUrl, recoveryCodes: string[] }`
### `POST /auth/mfa/verify` → `200 { accessToken, expiresIn, user }`
### `POST /auth/step-up` → `200 { stepUpToken, expiresIn: 300 }`
```ts
Request { totpCode: string }
```
Required before: certificate issue/revoke, institution status change, member role change, restricted-data export.

### `POST /auth/password/forgot` → `204` (always 204 — never reveals account existence)
### `POST /auth/password/reset` → `204` (invalidates all sessions)

```ts
type UserSummary = { id: string; email: string; displayName: string;
                     identityLevel: 'unverified'|'email'|'identity_verified'; mfaEnabled: boolean };
type UserProfile = UserSummary & { locale: string; memberships: MembershipSummary[]; createdAt: string };
type MembershipSummary = { institutionId: string; institutionName: string;
                           departmentId: string|null; programmeId: string|null;
                           role: MemberRole; status: 'active'|'pending'|'revoked' };
```

---

## 4. Institutions — `/institutions` · **Agent 1**

### `GET /institutions` → `200 Paginated<InstitutionSummary>`
Filters: `?status=&country=&q=`. Unauthenticated callers see verified institutions only.

### `POST /institutions` → `201 Institution`
```ts
Request {
  legalName: string; displayName: string; countryCode: string;   // ISO 3166-1 alpha-2
  category: 'university'|'polytechnic'|'college'|'research_institute'|'other';
  officialDomain: string; representativeEmail: string; privacyContactEmail: string;
  academicContactEmail: string; libraryContactEmail?: string;
  branding?: { primaryColor?: string; logoUrl?: string };
}
```
Created as `pending_verification`. **Only `verified` institutions may issue Institutionally Verified status or certificates** (PRD §6.1).

### `GET /institutions/:id` → `200 Institution` · `PATCH /institutions/:id` → `200`
### `PATCH /institutions/:id/status` → `200` — **platform admin + `X-Step-Up-Token`**
Suspension halts certificate issuance and new workflow decisions; existing public records keep a policy-defined status (PRD §6.1 edge cases).

### Sub-resources (all `inst_admin`/`registry` scoped)
```
GET|POST   /institutions/:id/departments      PATCH|DELETE /departments/:deptId
GET|POST   /institutions/:id/programmes       PATCH|DELETE /programmes/:progId
GET|POST   /institutions/:id/sessions         PATCH        /sessions/:sessionId
GET|POST   /institutions/:id/workflow-templates
GET        /institutions/:id/metrics          // role-scoped, PRD §10.1
```
Department delete is a soft `merge`/`rename`: historical record metadata stays historically accurate (PRD §6.1).

### Members
```
GET  /institutions/:id/members?role=&status=&q=   → Paginated<Member>
POST /institutions/:id/members                    → 201  { email, role, departmentId?, programmeId? }
POST /institutions/:id/members/bulk-invite        → 202  { invitations: [...] }  (max 500)
PATCH /members/:memberId                          → 200  role/status change — step-up required
DELETE /members/:memberId                         → 204  (revokes, never hard-deletes)
```

```ts
type InstitutionSummary = { id: string; displayName: string; slug: string;
                            countryCode: string; category: string; status: InstitutionStatus };
type Institution = InstitutionSummary & {
  legalName: string; officialDomain: string;
  branding: { primaryColor: string|null; logoUrl: string|null };
  previousNames: Array<{ name: string; changedAt: string }>;
  createdAt: string; updatedAt: string;
};
```

---

## 5. Research Records — `/records` · **Agent 2**

### `POST /records` → `201 ResearchRecord`
```ts
Request {
  outputType: OutputType;
  title: string;                 // 10–500 chars
  abstract?: string;             // 100–10 000; REQUIRED to submit or publish
  institutionId?: string;        // required for official records
  departmentId?: string; programmeId?: string; sessionId?: string;
  disciplines: string[];         // ≥1, controlled vocabulary
  keywords: string[];            // 1–20 for discoverable records
  researchYear?: number;
  accessLevel: AccessLevel;
  licence: string;               // SPDX id or controlled value
  contributors?: ContributorInput[];
  supervisorUserIds?: string[];
  // optional (PRD §6.2)
  researchQuestion?: string; methodology?: string; fundingSource?: string;
  ethicsApprovalRef?: string; datasetLinks?: string[]; codeLinks?: string[];
  equipmentUsed?: string; externalPartner?: string; publicationRefs?: string[];
  patentRefs?: string[]; languages?: string[];
  completionState?: 'complete'|'incomplete_seeking_continuation';
  incompleteReason?: 'funding_ended'|'graduation'|'equipment_unavailable'
                   |'dataset_unavailable'|'supervisor_change'|'time_constraint'|'other';
  relatedRecordIds?: string[];
}
```
Created as `draft`. **A draft saves without complete publication fields** (PRD §6.2). Validation errors return `422` with per-field `errors[]` explaining *why* the field is needed and *who will see it* — the frontend renders `visibility` from `GET /records/schema`.

### `GET /records` → `200 Paginated<ResearchRecordSummary>`
Scope: `?scope=mine|institution|assigned`. Filters: `status`, `outputType`, `accessLevel`, `verificationLevel`, `sessionId`, `departmentId`, `q`.

### `GET /records/:id` → `200 ResearchRecord`
Response is **viewer-shaped**: fields the caller may not see are omitted entirely (not nulled). `404` if not entitled.

### `PATCH /records/:id` → `200` — **`409` unless status is `draft`** (PRD §7.1 "only a draft can be directly edited")
### `POST /records/:id/submit` → `200 { record, receipt }`
Preconditions, each returning a distinct `422` code: required fields complete · current version `scan_status='clean'` · institution `verified` · supervisor assigned where the workflow requires it.
Effects: status → `submitted`; workflow instance created; supervisor review task created; **receipt issued**; `verificationLevel` stays non-verified (PRD §11.1).

### `POST /records/:id/withdraw` → `200` · `PATCH /records/:id/access` → `200`
### `GET /records/schema` → `200` — field metadata: requirement, limits, visibility label, help text (drives the frontend wizard; no duplicated rules in the client)

```ts
type ResearchRecordSummary = {
  id: string; nxrId: string|null; title: string; outputType: OutputType;
  status: RecordStatus; verificationLevel: VerificationLevel; accessLevel: AccessLevel;
  institution: { id: string; displayName: string }|null;
  researchYear: number|null; disciplines: string[];
  contributorsDisplay: Array<{ displayName: string; isSupervision: boolean }>;
  currentVersionNo: number|null; embargoUntil: string|null; updatedAt: string;
};
type ResearchRecord = ResearchRecordSummary & {
  abstract: string|null; keywords: string[]; licence: string;
  completionState: string; incompleteReason: string|null;
  provenance: 'native'|'historical_digitisation'|'imported';
  metadataProvenance: Array<{ field: string; source: MetadataSource; confidence: number|null }>;
  permissions: { canEdit: boolean; canSubmit: boolean; canUpload: boolean;
                 canIssueCertificate: boolean; canViewSimilarity: boolean; canDownload: boolean };
  createdAt: string;
};
```
> `permissions` is a **UI hint only**. The server re-authorizes every action independently. PRD §9.1.

---

## 6. Versions & Uploads — **Agent 2**

### `GET /records/:id/versions` → `200 { data: RecordVersion[] }`
Every version ever submitted, newest first. Nothing is ever removed (PRD §6.3, §11.2).

### `POST /records/:id/versions` → `201 RecordVersion`
```ts
Request { changeSummary: string }   // 10–1000 chars, human-readable — REQUIRED
```
`409` if the record is not in a state that accepts a new version.

### `POST /uploads/init` → `200`
```ts
Request  { versionId: string; fileName: string; fileSize: number; mimeType: string }
Response { uploadId: string; parts: Array<{ partNumber: number; url: string; expiresAt: string }>;
           partSizeBytes: number; maxFileSize: number; acceptedMimeTypes: string[] }
```
Client PUTs parts directly to storage — **files never transit the API server**. Interrupted uploads resume by re-requesting only missing part URLs (PRD §6.3, §8).

### `POST /uploads/:uploadId/complete` → `202`
```ts
Request  { parts: Array<{ partNumber: number; etag: string }> }
Response { versionId: string; scanStatus: 'pending'; receipt: DepositReceipt }
```
### `GET /uploads/:uploadId/status` → `200 { scanStatus, checksumStatus, progressPercent, message }`
Poll or subscribe. `infected`/`unsupported` returns a **plain-language message with a next action and zero internal detail** (PRD §8).

### `GET /records/:id/versions/:versionId/download` → `302`
Policy-gated; redirects to a 60-second presigned URL. Blocked by embargo, access level, or unclean scan. Logged to the audit chain.

### Duplicate handling
If the SHA-256 matches an existing version **by the same user on the same record**, `POST /uploads/init` returns `409` with `code: 'DUPLICATE_FILE_CONFIRM_INTENT'` — the client must resend with `intent: 'new_version'|'replace_draft'`.
If it matches **another user's protected record**, the response is a normal success: an authorised-only provenance review signal is raised and **nothing about the other record is disclosed** (PRD §6.3).

```ts
type RecordVersion = { id: string; versionNo: number; changeSummary: string;
  state: VersionState; fileName: string|null; fileSizeBytes: number|null;
  mimeType: string|null; sha256: string|null; scanStatus: ScanStatus;
  submittedBy: { id: string; displayName: string }|null;
  submittedAt: string|null; isImmutable: boolean; createdAt: string };
type DepositReceipt = { receiptId: string; recordId: string; versionId: string;
  sha256: string; receivedAt: string; depositedBy: string;
  statement: string /* "Deposit evidence only — not proof of ownership or originality." */ };
```

---

## 7. Review Workflow — **Agent 3**

### `GET /tasks?assigned=me&status=pending` → `200 Paginated<ReviewTask>`
### `GET /tasks/:id` → `200 ReviewTaskDetail` — record metadata, version under review, declared contributors, prior decisions
### `POST /tasks/:id/decision` → `200`
```ts
Request { decision: ReviewDecisionType; comment: string; /* required when returning */
          requiredActions?: string[] }
```
Rules: reviewer **cannot** edit the student's file · a returned record requires a **new version** to progress · **no auto-approval on deadline lapse** unless the institution explicitly configured delegation (PRD §8).

### `POST /records/:id/escalate-integrity` → `202`
### `GET /versions/:versionId/similarity` → `200 SimilarityAssessment` — **authorised roles only; `404` otherwise**
### `POST /versions/:versionId/similarity/review` → `200`
```ts
Request { outcome: IntegrityOutcome; reason: string }
```
> **Invariant (PRD §6.5, §11.3, ADR-004):** the similarity subsystem has **no write path to record status**. A high score changes nothing on its own. Any resulting transition carries `humanDecisionId`. No public labelling, no automatic rejection, no certificate cancellation.

### `POST /records/:id/verify` → `200` — registry/examiner + **step-up**
Marks a **specific version** Institutionally Verified, mints the NXR-ID, and applies access/embargo rules (PRD §7.1).

```ts
type ReviewTask = { id: string; recordId: string; recordTitle: string; versionId: string;
  versionNo: number; stage: string; status: 'pending'|'completed'|'reassigned'|'escalated';
  dueAt: string|null; isOverdue: boolean; assignedAt: string };
type SimilarityAssessment = { id: string; versionId: string; status: SimilarityStatus;
  score: number|null; reportUrl: string|null; provider: string;
  advisoryNotice: string /* "Review signal only. Not a finding of misconduct." */;
  requestedAt: string; completedAt: string|null };
```

---

## 8. Certificates & Public Verification — **Agent 3**

### `POST /records/:id/certificate` → `201 Certificate` — registry + **step-up**
Requires `institutionally_verified` on the target version and a `verified` institution.

### `POST /certificates/:id/revoke` → `200` — registry + **step-up**, `{ reason: string }`
### `GET /certificates/:id` → `200 Certificate` (private, role-scoped)
### `GET /certificates/:id/pdf` → `200 application/pdf` — embedded QR → the public URL

### `GET /public/verify/:qrToken` → `200 PublicVerification` — **UNAUTHENTICATED**
```ts
type PublicVerification = {
  status: 'valid'|'superseded'|'revoked'|'not_found';
  certificateNo: string; nxrId: string; title: string;
  researcherNames: string[];        // only where approved for display
  institutionName: string; outputType: OutputType;
  issueDate: string; verificationLevel: VerificationLevel;
  supersededBy: string|null;
  disclaimer: string;
  // "Confirms an ALIMS verification record. Not a legal determination of copyright
  //  ownership, originality, or degree award."
};
```
> **Exactly the ten PRD §6.4 fields.** No grades, student IDs, similarity data, reviewer notes, files, or contact details are reachable from this path — the projection cannot select them. The QR token is an opaque random identifier carrying no embedded data (PRD §8). Target p95 < 2 s (PRD §9.2).

---

## 9. Access, Embargo & Requests — **Agent 3**

### `PATCH /records/:id/embargo` → `200 { embargoUntil, scope: 'full_text'|'full_record' }`
Expiry **never** overrides an active rights restriction or an unresolved dispute; owners are notified before any planned access change (PRD §6.6).

### `POST /records/:id/access-requests` → `201`
```ts
Request { purpose: string; organisation: string; requesterRole: string }
```
### `GET /access-requests?scope=incoming|outgoing` → `200 Paginated<AccessRequest>`
### `POST /access-requests/:id/decide` → `200 { decision: 'approve'|'decline'|'request_info', note? }`
Declines are neutral. **The requester never receives private contact information** (PRD §6.6, §6.13).

---

## 10. Contributor Ledger — **Agent 2**

```
GET  /records/:id/contributors            → 200 { data: Contributor[] }
POST /records/:id/contributors            → 201
PATCH /contributors/:id                   → 200
POST /contributors/:id/acknowledge        → 200
POST /contributors/:id/dispute            → 200 { reason: string }
POST /contributors/:id/request-correction → 200 { requestedChange: string }
```
```ts
type ContributorInput = { userId?: string; externalName?: string; externalOrcid?: string;
  creditRoles: CreditRole[]; level: ContributionLevel; isSupervision: boolean; evidenceNote?: string };
type Contributor = ContributorInput & { id: string; ackStatus: AckStatus;
  displayName: string; invitedAt: string; respondedAt: string|null };
```
> **Invariants (PRD §6.7):** no contribution score is computed or returned — the field does not exist · supervision is `isSupervision: true`, never inferred authorship · academic rank confers no credit · a disputed declaration stays visibly unresolved to authorised parties and the contributor is never silently removed (PRD §11.6).

---

## 11. Academic Passport — **Agent 2**

```
GET   /me/passport            → 200 Passport
PATCH /me/passport            → 200
GET   /passports/:userId      → 200 Passport            (visibility-filtered)
GET   /public/passports/:handle → 200 PublicPassport    (UNAUTHENTICATED, public sections only)
```
```ts
type Passport = {
  userId: string; displayName: string; headline: string|null;
  affiliations: Array<{ institutionName: string; role: string;
                        evidenceSource: MetadataSource; startedOn: string; endedOn: string|null }>;
  records: ResearchRecordSummary[];
  contributions: Array<{ recordId: string; recordTitle: string;
                         creditRoles: CreditRole[]; level: ContributionLevel; ackStatus: AckStatus }>;
  interests: string[]; methods: string[]; skills: string[];
  availableForCollaboration: boolean;
  sectionVisibility: Record<string, 'public'|'network'|'institution'|'private'>;
};
```
> **Every claim carries `evidenceSource`.** No global score, no "Researcher Quality 8.5/10", no integrity percentage — by schema design (PRD §6.8, §1.5.3).

---

## 12. Lineage & Suggestions — **Agent 3**

```
POST  /relationships                  → 201
PATCH /relationships/:id/accept       → 200
PATCH /relationships/:id/reject       → 200
POST  /relationships/:id/report       → 202
GET   /records/:id/lineage?depth=1..5 → 200 LineageGraph
GET   /suggestions?for=record:<id>    → 200 { data: Suggestion[] }
POST  /suggestions/:id/accept|dismiss|save → 200
```
```ts
type Suggestion = { id: string; kind: 'related_record'|'possible_relationship'|
                                      'potential_collaborator'|'research_gap';
  targetId: string; targetTitle: string;
  basis: string;        // plain language: "Shares 4 keywords and cites the same 2 sources"
  confidence: 'low'|'medium'|'high';
  notice: string;       // "Suggestion only — not verified and not publicly displayed."
};
```
> **Invariants (PRD §6.9, §6.11):** every relationship states its `relType` **and** `evidenceState` · machine suggestions are never public until accepted by a human · supervision never implies intellectual ownership · restricted content is excluded from recommendation processing.

---

## 13. Discovery — **Agent 3** · public

### `GET /public/search` → `200 Paginated<PublicRecordSummary>`
All 14 PRD §6.10 dimensions: `q`, `researchQuestion`, `discipline`, `outputType`, `researcher`, `institution`, `country`, `year`, `methodology`, `verificationLevel`, `accessLevel`, `hasData`, `collaborationStatus`, `opportunityType`.

### `GET /public/records/:nxrId` → `200 PublicRecordDetail`
```ts
type PublicRecordSummary = { nxrId: string; title: string; outputType: OutputType;
  contributorsDisplay: string[]; institutionName: string|null; researchYear: number|null;
  abstractExcerpt: string|null;      // omitted entirely when access level forbids
  verificationLevel: VerificationLevel; accessStatus: 'open'|'embargoed'|'restricted'|'metadata_only';
  relationshipIndicators: Array<{ relType: string; count: number }>;
  embargoUntil: string|null };
```
> Restricted titles, abstracts, files, reviewer notes, personal data and commercial information are **never** returned to an unauthorised viewer (PRD §6.10, §11.4). Target p95 < 3 s.

---

## 14. Collaboration & Activation — **Agent 3** *(Release 2–3)*

```
GET|POST /opportunities · GET|PATCH /opportunities/:id
POST /opportunities/:id/charter          → 201
POST /opportunities/:id/charter/accept   → 200
POST /companies · POST /companies/:id/verify
GET|POST /opportunity-posts
POST /introduction-requests · POST /introduction-requests/:id/decide
```
Charter acceptance is recorded **before** any restricted material is shared and records parties, roles, confidentiality, authorship expectation, IP status, decision process and dispute route (PRD §6.12). ALIMS records interest and routes it; it never transfers IP or grants access by virtue of a request (PRD §6.13).

---

## 15. Disputes — **Agent 3**

```
POST  /disputes            → 201  { subjectType, subjectId, category, description }
GET   /disputes?scope=     → 200  Paginated<Dispute>
PATCH /disputes/:id        → 200  { status, resolution?, assignedTo? }
```
Categories (PRD §7.3): `incorrect_metadata`, `authorship_contribution`, `false_institution_claim`, `duplicate_provenance`, `copyright_rights`, `privacy_confidentiality`, `offensive_unsafe_content`, `certificate_verification_error`, `relationship_lineage_error`.
Lifecycle: `submitted → triage → evidence_requested → under_review → resolved|dismissed|escalated`.
**ALIMS records authorised workflow status; it does not adjudicate misconduct or law** (PRD §6.5).

---

## 16. System — **Agent 5**

```
GET /health        → 200 { status: 'ok', version, uptime }
GET /health/ready  → 200|503 { database, redis, storage }   // dependency probes
GET /docs          → OpenAPI 3.1 UI
GET /openapi.json  → OpenAPI 3.1 document
```

---

## 17. Ownership Matrix

| Area | Owner | Milestone |
|---|---|---|
| §3 Auth, §4 Institutions/Members | Agent 1 | M1 |
| Policy engine, RLS, audit chain (cross-cutting) | Agent 1 | M1 |
| §5 Records, §6 Versions/Uploads, §10 Contributors, §11 Passport | Agent 2 | M2 |
| §7 Review, §8 Certificates, §9 Access, §12 Lineage, §13 Discovery, §14 Collab, §15 Disputes | Agent 3 | M3 |
| All frontend consumption | Agent 4 | M4 |
| Component contracts & a11y | Agent 6 | M5 |
| This document, schema, §16 System | Agent 5 | M0/M6 |

**Change process:** raise a `roadblock` in `coordination_board.json` → Agent 5 versions this file and bumps `board_version`. Never implement an undocumented endpoint.
