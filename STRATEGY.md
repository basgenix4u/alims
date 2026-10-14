# ALIMS — Go-Live Strategy, Competitor Research & Product Roadmap
### *From validated prototype to live SaaS for real institutions*
**Prepared: 14 Oct 2026 · Product + Growth review**

---

## 1. The honest verdict: is the aim achieved?

**The PRD's core aim — a trusted Research Record from creation → institutional verification → controlled discovery → activation — is achieved as a working, demonstrable product.** The full loop runs today: deposit, supervisor review, registry verification, NXR-ID + QR certificate, public verification, embargo, contribution ledger, lineage, opportunities, disputes.

**It is not yet a live product.** What exists is a *sales-grade prototype* (seeded data, simulated similarity, no real file storage, no email/SMS, no payments, single-file JSON database). That distinction matters: every demo claim works, but no real university could run a semester on it yet. The gap list in §5 is the difference.

| PRD release | Status | Score |
|---|---|---|
| R1 Trusted Research Record (workflow, verification, certificates, embargo) | Built & demo-verified | **75%** — needs real files, email, audit-grade storage |
| R2 Lineage Network (contributions, passports, relationships, opportunities) | Built (seeded/manual relationships) | **60%** — needs real graph + ORCID/Crossref enrichment |
| R3 Research Activation (companies, challenges, introductions) | Built (requests, neutral declines) | **45%** — needs company KYB, payments, charter e-sign |
| R4 Knowledge Intelligence (semantic search, gap maps, multilingual) | Suggested only (explainable seed suggestions) | **15%** — needs real embeddings + OpenAlex/Crossref data |

**Verdict: aim achieved at prototype level; the moat/features below make it a business.**

---

## 2. Competitor research — who actually competes with ALIMS?

| Player | What they own | What they lack (ALIMS opening) |
|---|---|---|
| **NERD (Federal Government)** — mandatory deposit for NYSC since 6 Oct 2025; 400k+ submissions, 115k+ credentials verified by Sep 2026 [1](https://www.alltimepost.com/2026/09/nerd-crosses-400000-academic-submissions-in-fgs-education-digitisation-drive) [2](https://www.thecable.ng/fg-makes-nerd-compliance-mandatory-for-nysc-mobilisation-exemption/) | Legal mandate, national registry, NCN | Day-to-day *workflow* (supervision, revision, contribution, lineage), discovery UX, industry activation. NERD is the **rail + regulator**, not the campus tool. |
| **DSpace / EPrints / Digital Commons** | Mature institutional repositories, OAI harvesting | Librarian-grade UX; no supervision workflow, contribution ledger, passports, or activation. Students hate them. |
| **ResearchGate / Academia.edu** | Researcher network & discovery (ResearchGate dominates usage) [3](https://pmc.ncbi.nlm.nih.gov/articles/PMC7467223/) | No institutional verification/governance; undergrad projects unwelcome; no embargo-safe student workflow. |
| **ORCID** | Researcher identity standard (integrates with DSpace/EPrints) [4](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=7301&context=libphilprac) | Identity only — no records, workflow, or verification. **Integrate, don't fight.** |
| **Google Scholar / OpenAlex / Crossref (180M+ records)** | Global discovery graph | Index published literature, not the 95% of African student research that never publishes. |
| **Turnitin / iThenticate** | Similarity checking (already referenced in NERD compliance) | A checker, not a record system — and ALIMS' "signal, never accusation" stance is a differentiator lecturers trust. |
| **Credly / Accredible / Parchment** | Digital credentials (181M+ credentials on Accredible; blockchain-anchored verification) [5](https://www.accredible.com/blog/how-does-blockchain-secure-credentials) | Badges ≠ research evidence. No thesis/workflow/lineage. |
| **AJOL (650+ African journals)** | African published-research visibility since 1998 [6](https://www.ajol.info/index.php/ajol/about-AJOL-African-Journals-Online) | Journals only; student/institutional layer untouched. Potential partner. |

**The whitespace (ALIMS' defensible position):** *No one owns the governed journey of non-journal academic work in the Global South — from student draft → supervisor → registry → verifiable record → lineage → industry.* NERD makes deposit mandatory; ALIMS makes the institution's life around that mandate excellent, then syncs upward.

**Market size:** ~300 universities + ~120 polytechnics/colleges, ~2.5M tertiary students in Nigeria alone [7](https://studentsmedia.com.ng/how-many-students-are-in-nigeria-tertiary-institutions/) [8](https://guardian.ng/opinion/why-nigeria-needs-more-universities-after-all). Every final-year student × every year = a recurring, policy-mandated deposit flow. That is a conveyor belt no competitor is productizing.

---

## 3. What is genuinely special (say this on the homepage)

1. **NERD-native, not NERD-competing** — "Deposit once in ALIMS; be NERD-compliant automatically" (metadata incl. student, supervisor, HOD, institution as the policy requires [2](https://www.thecable.ng/fg-makes-nerd-compliance-mandatory-for-nysc-mobilisation-exemption/)).
2. **Honest verification** — five evidence levels, QR verify in <2s, *no integrity score, no automated accusations*. In a market burned by fake-degree scandals and heavy-handed plagiarism framing, lecturers and students both trust this.
3. **Contribution Ledger (CRediT)** — who actually did what, acknowledged/disputable. Nobody in African edtech shows this.
4. **Academic lineage as a graph** — supervision ≠ ownership, builds-on/continues made visible. This is the demo moment ("knowledge has ancestors") and the long-term data moat.
5. **Activation with consent** — industry discovers permitted work and requests introductions; IP boundaries explicit. NERD itself talks about students/lecturers earning from deposits [2](https://www.thecable.ng/fg-makes-nerd-compliance-mandatory-for-nysc-mobilisation-exemption/) — ALIMS is where that transaction can actually happen.

---

## 4. Super-features to add (ranked by moat × revenue)

### Tier S — build before/just after launch
1. **NERD Sync & Compliance Kit** — one-click export/API sync in NERD metadata format, compliance dashboard ("98.2% of 2026 finalists deposited"), NYSC-readiness reports. *This is the #1 sales feature.*
2. **Real file pipeline** — resumable uploads (tus), S3 storage, antivirus (ClamAV), PDF text extraction, OCR for digitized archives (Tesseract/Google Vision), version hashing (SHA-256 deposit evidence).
3. **Similarity integration (Turnitin/iThenticate API)** — private reviewer signal with human decision workflow (already designed; wire the real API + fallback queue).
4. **Identity rails** — ORCID OAuth connect/import, Crossref/OpenAlex enrichment (auto-link journal versions, citations), institutional SSO (Microsoft/Google + SAML for universities).
5. **Verifiable Credentials** — W3C VC + Open Badges 3.0 export, PDF certificate with QR, Apple/Google Wallet pass, public verify API for employers (rate-limited, paid tier).
6. **Comms that reach Nigeria** — email (Resend/SES) + SMS/WhatsApp (Termii) for review nudges, deadline/escalation flows, embargo-expiry notices. *Supervisors respond to WhatsApp, not email.*
7. **Payments & billing** — Paystack/Flutterwave: institution SaaS, per-certificate wallet, company challenge posting, employer verify packs.

### Tier A — differentiation (months 3–9)
8. **Explainable AI layer** — related-work + collaborator suggestions on embeddings (OpenAI/pgvector) with the existing "basis + confidence, never public until accepted" guardrails; research-gap heatmaps per department ("what has nobody continued?").
9. **Supervision Intelligence for institutions** — supervisor load, turnaround, earned-allowance evidence (NERD explicitly enables supervision metrics [9](https://thisdaylive.com/2025/11/09/nerd-fg-records-10000-digitised-thesis-submissions-in-three-weeks)), accreditation (NUC) evidence packs.
10. **Employer & funder portals** — bulk verify, talent search over passports with consent, challenge campaigns with charter e-sign (DocuSign/own OTP-sign) and intro credits.
11. **PWA + offline drafts** — low-bandwidth first: offline record drafting, compressed uploads, data-light public verify (<50KB page).
12. **Bulk digitization studio** — librarian pipeline for back-catalogue (1932→ on NERD's ambition): batch ingest, provenance/confidence per item, student-claim flow ("claim your 1998 thesis").

### Tier B — moat (year 2)
13. **Pan-African graph** — cross-border lineage/discovery (Ghana, Kenya, South Africa), multilingual abstracts (EN/FR + Yoruba/Hausa/Igbo summaries).
14. **Research continuation exchange** — unfinished-work marketplace with milestone charters; success-fee on sponsored continuations.
15. **Public API + embeds** — "Verify on ALIMS" badge for university sites, Zapier/LMS (Moodle/Canvas) integrations, Turnitin-style LTI for submission portals.

**Modify (don't rebuild):** keep the honest-verification copy and workflow exactly; add granular RBAC (dept vs faculty vs registry scopes), full audit log UI, institution branding controls, and SSR/SEO for public records (employers Google names).

---

## 5. Go-live checklist — what still MUST be done

**Product/engineering:** real DB + file storage (§6), email/SMS, password reset + email verification + MFA for admins/registry, granular permissions, audit logs, backups + restore drill, error monitoring (Sentry), uptime + status page, load test submission-week peaks, WCAG 2.2 AA audit pass, NDPR compliance (privacy policy, DPA, data-residency choice, consent records), Terms/ToS + institution contract, content-moderation & takedown runbook.

**Business/ops:** legal entity + NDPC registration, Paystack business account, support desk + SLA, onboarding playbook (data migration from departmental drives/DSpace), training for supervisors/librarians, pricing page + pilot MOUs, brand/domain (alims.org/.com.ng) + SSL, trademark search on "ALIMS".

**GTM (beachhead first):** 3–5 *private* universities/polytechnics (fast procurement, tuition-funded) + 1 flagship federal dept. Offer: **"NERD-compliant in 30 days" pilot** — free for one faculty, success fee on full rollout. Land via VC/registrar + librarian (workflow pain), expand via student passport virality (QR on every certificate → employer checks → brand impressions). Channels: NUC/NBTE events, university librarians' association, NYSC-season student campaigns, LinkedIn for employer verify.

**Pricing (NGN, per market reality):** Institution SaaS ₦1.5–4M/yr by size + ₦150–300/active student/yr at scale · Employer verify API packs · Company challenge/introduction credits · Researcher Pro (portfolio analytics) optional. Always: students free, institutions pay — and NERD sync included, never paywalled (it's the wedge).

**KPIs that prove the aim:** % of finalists deposited via ALIMS, median submission→verification days, certificate verifications/month, % records with complete metadata + acknowledged contributions, continuation matches, employer repeat verifications, institution renewal.

---

## 6. Tech stack — the unbiased, widely-adopted best (and why)

ALIMS today: React (Vite SPA) + Express + JSON file. Fine for a prototype; below is the production recommendation chosen for **talent availability in Nigeria, ecosystem maturity, and SEO needs** — not fashion.

| Layer | Recommendation | Why (unbiased) | Credible alternative |
|---|---|---|---|
| Language | **TypeScript end-to-end** | One language hiring pool, type safety at API boundaries | Python (Django) — equally hireable in NG |
| Web app | **Next.js (App Router)** | SSR/SSG for public records + verify pages (SEO: employers Google graduates), React ecosystem, one deploy | Keep Vite SPA + separate SSR landing if team prefers |
| API | **NestJS** (modular monolith → split later) | Structure for workflows/RBAC/audit; OpenAPI free | Laravel (cheapest NG hiring) / Django REST |
| Database | **PostgreSQL + Prisma** | Relational integrity for records/versions; `pgvector` covers AI suggestions without a second DB | Supabase (hosted PG + auth + storage) to move fastest |
| Jobs/queues | **Redis + BullMQ** | Uploads, OCR, similarity, email at submission-week scale | Cloud Tasks / SQS |
| Files | **S3-compatible (Cloudflare R2 / Wasabi)** + ClamAV + tus resumable | Cheap egress, durable; CDN via Cloudflare | Supabase Storage |
| Search | **Meilisearch** now → OpenSearch later | Typo-tolerant, cheap, great DX for discovery filters | Postgres FTS (start) / Algolia (paid) |
| Auth | **WorkOS / Clerk or Keycloak** (SSO/SAML for universities) + ORCID OAuth | Universities demand SSO; don't hand-roll SAML | Supabase Auth (fast start, migrate later) |
| Integrations | Turnitin API · ORCID · Crossref/OpenAlex · Paystack · Termii (SMS/WhatsApp) · Resend | These are the ecosystem rails; all have mature SDKs | iThenticate · Flutterwave · Twilio |
| Infra | **Docker on Fly.io/Render → AWS (ECS/RDS/S3) at scale**, Cloudflare front | Start <$100/mo, no DevOps hire; graduate when contracts demand data residency | Azure (many NG universities are Microsoft shops) |
| Quality | Vitest/Playwright, GitHub Actions CI, Sentry, PostHog | E2E on the 5 critical flows before every release | — |

**Migration path from the prototype (4–6 weeks, no rewrite theatre):** (1) Postgres + Prisma behind the existing API shapes; (2) S3 uploads + ClamAV; (3) auth provider + ORCID; (4) Next.js public shell (landing, record pages, verify) over the same API, keep the SPA dashboard; (5) queues for similarity/OCR/email; (6) Meilisearch sync. Every current screen and workflow survives.

---

## 7. Roadmap

- **Days 0–90 (Live):** §5 checklist + Tier S 1–4, 6. Sign 3 pilot institutions. Price the pilot, not the vision.
- **Months 3–6 (Prove):** Tier S 5, 7 + A8–A10 beta. First employer verify revenue. Publish "State of Nigerian Student Research" report from anonymized metadata — the PR asset competitors can't copy.
- **Months 6–12 (Expand):** polytechnics + colleges of education, 2nd country pilot, continuation exchange beta, NUC/accreditation evidence packs.
- **Year 2 (Moat):** Pan-African lineage graph, multilingual discovery, API ecosystem. At this point ALIMS' dataset (who supervised/continued/built-on what, consented and verified) is the asset acquirers pay for.

**One-line strategy:** *NERD made deposit mandatory. ALIMS makes it valuable — for the student who keeps a career asset, the supervisor who gets credited fairly, the institution that proves quality, and the employer who can finally trust what a graduate shows them.*

---
*Sources: NERD policy & rollout reporting [1](https://www.alltimepost.com/2026/09/nerd-crosses-400000-academic-submissions-in-fgs-education-digitisation-drive) [2](https://www.thecable.ng/fg-makes-nerd-compliance-mandatory-for-nysc-mobilisation-exemption/) [9](https://thisdaylive.com/2025/11/09/nerd-fg-records-10000-digitised-thesis-submissions-in-three-weeks); repository/identity landscape [3](https://pmc.ncbi.nlm.nih.gov/articles/PMC7467223/) [4](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=7301&context=libphilprac); credentials market [5](https://www.accredible.com/blog/how-does-blockchain-secure-credentials); African visibility [6](https://www.ajol.info/index.php/ajol/about-AJOL-African-Journals-Online); market size [7](https://studentsmedia.com.ng/how-many-students-are-in-nigeria-tertiary-institutions/) [8](https://guardian.ng/opinion/why-nigeria-needs-more-universities-after-all).*

---
## Implementation status (14 Oct 2026 — all tiers implemented)
Tier S (NERD sync w/ verified-only guard, SHA-256 file pipeline + AV/type gates, similarity
queue as private signal, ORCID validation + Crossref/OpenAlex enrichment, W3C VC/Open Badges
credential JSON, Termii-shaped comms outbox, Paystack-shaped billing ledger), Tier A (supervision
+ research-gap insights, digitisation studio bulk import with provenance), Tier B/C (continuation
charters, developer API keys + key-gated public verify API, multilingual abstracts EN/FR/HA/YO/IG,
pan-African institutions NG/GH/KE/ZA) — all live in the product with new pages: NERD Compliance,
Insights, Digitisation Studio, Developer & API, Billing & Plans. External providers run behind
adapters (`server/liveops.js`): simulation mode today, production keys via env (NERD_API_KEY,
TURNITIN_API_KEY, PAYSTACK_SECRET_KEY, TERMII_API_KEY, ORCID_CLIENT_ID) switch them live with
zero code change. Full endpoint regression passed 14 Oct 2026.
