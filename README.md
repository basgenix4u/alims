# ALIMS — The Global Academic Knowledge Infrastructure

**Live:** https://alims-app.onrender.com · **Repo:** https://github.com/basgenix4u/alims-app (public) · **Demo accounts:** password `demo1234` for all (see table below)

**Preserve. Connect. Activate.** · *Mapping the World's Academic Lineage*

A full-stack implementation of the ALIMS PRD (v2.0) — a verified academic knowledge
infrastructure for Nigerian universities first, designed to expand internationally.
ALIMS gives every academic output a durable **Research Record** (with a permanent
**NXR-ID**), connects it to people, supervisors, institutions, contributions and
follow-on work, and activates permitted knowledge into collaboration and opportunity.

> An NXR-ID proves an ALIMS record exists. It is **not** a DOI, a copyright
> registration, or a legal ownership determination — and ALIMS never issues an
> "integrity score" or an automated plagiarism accusation. Humans decide.

## Run it

```bash
cd alims
npm run dev        # API on :4000 + Web on :5173 (Vite proxies /api → API)
# or production:
npm run build && npm start   # API only; serve client/dist statically if desired
```

Data persists in `server/data/db.json` (auto-seeded on first run with realistic
Nigerian-university demo data). Reset anytime with `POST /api/reset-demo`.

## Demo accounts (password for all: `demo1234`)

| Account | Role | Try this |
|---|---|---|
| `amara@demo.alims` | Student Researcher (UI) | Create/edit a draft, submit for review, build a passport |
| `supervisor@demo.alims` | Supervisor | Review Queue → open a record → Confirm supervision / Return with reason |
| `admin@demo.alims` | Department Admin | Complete institutional verification → QR certificate is issued |
| `library@demo.alims` | Librarian | Preservation, embargoes, disputes & corrections |
| `company@demo.alims` | Company (AgriServe) | Post challenges, request permissioned introductions |

One-click demo buttons are on the sign-in page (left panel).

## What was built (PRD mapping)

**Landing page** — sticky glass navbar, cinematic hero with live network stats,
institutional social proof, problem framing (NERD-policy aligned), six platform
capabilities, 4-step official journey, **working public certificate verification**,
academic-lineage showcase with SVG graph, audience benefits, testimonials,
institution-led pricing (Independent free / Institution / National-Consortium),
honest FAQ, CTA and footer. Scroll-reveal + staggered entrances, hover/micro-
interactions, ambient float, mobile-first responsive, keyboard/screen-reader
accessible, `prefers-reduced-motion` respected.

**Auth** — register/login with hashed passwords + JWT sessions, 5 seeded roles,
role-aware UI, protected API routes with server-side authorization (PRD §9.1).

**Dashboard (sidebar shell)** — Overview with live KPIs + explainable,
dismissible related-work suggestions (basis + confidence shown, never public
fact — §6.11); **My Records** with full CRUD (create/edit drafts, optimistic
delete with rollback, draft-only editing rule, verified records can't be
deleted); **Record Detail** with version timeline (never overwritten),
CRediT **Contribution Ledger** (acknowledge/dispute → private dispute flow),
certificate + QR-style verification block, reviewer decision panel that
*requires a human reason* (similarity = private signal only, §6.5);
**Discover** with multi-filter search (problem/discipline/verification/access);
**Lineage** interactive graph + typed, evidence-qualified relationship list;
**Opportunities** CRUD + express-interest (continuation, challenges,
collaboration, sponsored inquiries, §6.12–6.13); **Academic Passport** viewer
(evidence-labelled claims, no opaque score, §6.8); **Verify Certificate**
public page (Valid / Superseded / Revoked / Not Found, §6.4, §11.5);
**Review Queue**, **Access Requests** (approve / more-info / neutral decline,
no contact leakage, §11.8), **Disputes** (full lifecycle §7.3), and
**Institutions** (only Verified institutions can verify, §6.1).

**Access & honesty rules enforced in product copy and logic** — embargoes,
5 access levels, Self-Published vs Institutionally Verified labelling,
supervision ≠ authorship, certificate restrictions (no ownership/originality/
degree claims), and graceful empty/loading/skeleton states throughout.

## Seeded demo world

6 institutions (UI, UNILAG, OAU, UNN, ABU, UNILORIN-pending), 8 researchers,
10 Research Records (verified / in-review / draft / self-published / embargoed /
seeking-continuation / historical digitisation), 4 opportunities, access
requests, contribution & metadata disputes, lineage relationships, and
explainable suggestions — so the app feels alive on first load.

## Stack

React 18 + Vite (custom design system: Fraunces/Inter, emerald+gold on ink,
glassmorphism, CSS animations) · Node/Express REST API · JWT + bcrypt ·
persistent JSON store (`server/data/db.json`). PRD is implementation-agnostic;
this stack was chosen for portability and auditability.

## Design system v2 — Oryze-inspired (Oct 2026 redesign)

Re-skinned to the visual language of [oryze.com](https://www.oryze.com/) without
changing layout, workflows, routes or data flows. Extracted from Oryze's actual
stylesheet and applied as tokens in `client/src/styles.css`:

- **Type:** Montserrat (800/900 headings, tight) · IBM Plex Sans (body) ·
  IBM Plex Mono (eyebrows, NXR-IDs, stats, badges — data always in mono).
- **Colour:** cream paper `#FAF8F2`, ink `#111111`, violet primary `#5F3EF8`,
  deep violet `#38278F`, lavender `#C4B5FD`, yellow CTA `#F6E27A`, pastel
  semantics (mint `#B7F0CE`/`#0D5D39` verified, peach `#FED7AA` embargo,
  blue `#BFDBFE`, red `#FCA5A5`) — ALIMS' verified-green meaning is preserved,
  now expressed in Oryze's mint/dark-green pairing.
- **Components:** 1.5px ink keylines, 14px radius, hard offset shadows
  (`3px 3px 0 #111`) with snap hover-lift / press-compress physics on every
  button, tab, card and feature tile; numbered mono section eyebrows
  (`01 · The problem` … `08 · FAQ`); striped progress bars; ink sidebar with
  violet active pill + yellow mono count badge.
- **Production hardening in the same pass:** hand-rolled security headers
  (nosniff / DENY framing / referrer / permissions), sign-in rate limiting
  (12/15min per IP+email → 429), clean 400/404 API errors, React error
  boundary with recovery UI, skip-to-content link, `aria-modal` dialogs,
  hero `fetchPriority=high`, mobile toast/topbar/modal tightening,
  `prefers-reduced-motion` retained. Regression-tested: all 5 demo logins,
  create→submit→supervise→verify→certificate, verify Valid/Superseded/
  Not Found, opportunities/disputes reads, production build.

### v3 structural pass (same day)
Token re-skin alone still read as "old product", so the hero and key surfaces
were rebuilt in Oryze's actual composition: **light cream hero** (ink
Montserrat headline, yellow marker highlight, mono trace stats), rotated
**verification stamp** on the hero record card and on issued certificates,
pastel KPI rotation (lavender/yellow/mint/pink), light lavender verify
showcase, pastel dashboard welcome banner, `aria-current` nav state and
`theme-color`. Layout order, anchors, workflows and data flows unchanged;
full regression re-run (build + submit→supervise→verify→public-verify).

## Design v4 — "The Living Atlas of Knowledge" (radical reimagination)
ALIMS reframed as cartography, not storage: *knowledge has ancestors — we map
them.* Bone graph-paper canvas, obsidian ink, jade lineage, sun activation,
seal-coral verification. Fraunces editorial display (italic accents) +
Space Grotesk UI + IBM Plex Mono data. Signatures: live verified-records
ticker, rotating Preserve·Connect·Activate seal, specimen-numbered feature
tiles, record cards as ledger entries (jade spine), discipline-coloured KPI
rules, animated dashed lineage connectors. All sections, anchors, workflows,
roles and data flows preserved; regression re-run end-to-end.

## Icons & Logo (no-emoji policy)
All UI emoji replaced with a professional stroke icon set (`client/src/icons.jsx`, 24px grid)
including the checkmark/star/arrow glyphs in badges, stamps and ratings. Official logo: "The Atlas Mark"
(generated master in `client/public/logo/alims-logo.png`, circular-cropped exports 32–1024px +
favicon/apple-touch; `Logo.jsx` serves size-matched PNG per surface: nav, sidebar, auth, footer).
Sign-in recomposed: obsidian atlas brand panel (logo lockup, icon value-points, mono register line)
+ composed form card with labelled fields, role demo directory with role icons, honest identity note.

## LiveOps (Tier S/A/B/C)
New sidebar: **NERD Compliance** (readiness bars, verified-only sync, provider status, comms
outbox), **Insights** (supervision load + gap heatmap), **Digitisation Studio** (JSONL bulk
import with provenance), **Developer & API** (keys, public verify API, W3C credential viewer),
**Billing & Plans** (Paystack-shaped ledger). Record pages gained file deposit evidence
(SHA-256), similarity runner, credential download, FR/HA/YO/IG abstracts, NERD-synced chip;
passports gained ORCID linking; opportunities gained charter acceptance.
Providers are adapters in `server/liveops.js` — set env keys to go live.
