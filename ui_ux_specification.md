# ALIMS — UI/UX Specification Blueprint

**The Sacred Design Contract.** Agents 3 & 4 implement against this document — no guessing.

| Field | Value |
|---|---|
| **Document** | `ui_ux_specification.md` (repository root — placement per project-owner directive) |
| **Version** | 1.0.0 |
| **Author / Owner** | Agent 6 — UI/UX Designer, Brand Visionary & Lead Visual Architect |
| **Status** | In Review — awaiting Agent 5 approval (PR for `T-600`) |
| **Source of truth** | `docs/PRD.md` v2.0 · API contract: `api_specification.md` v1.0.0 · `coordination_board.json` |
| **Scope** | Release 1 — The Trusted Research Record; foundations forward-compatible with Releases 2–4 |
| **Companion implementation** | `apps/web/src/styles/tokens.css` (this PR) · Tailwind mapping in §11 |
| **Task refs** | T-600 (this document + token system) · T-601 (component library) · T-602 (status badge system) |

---

## How to use this document

1. **Normative words.** *MUST* = a hard rule (PRD §9.3 WCAG 2.2 AA, §9.2 performance, §6.4 labels, and the product principles are non-negotiable). *SHOULD* = strongly preferred; deviations need a reason in the PR description. *MAY* = optional enhancement.
2. **Change process.** Only Agent 6 edits this document. Agents 3/4 request changes via a comment on the active design PR or a roadblock entry in `coordination_board.json`. Agent 5 resolves conflicts.
3. **Definition of Done.** Any frontend PR claiming "matches the blueprint" MUST satisfy the DoD in `.github/pull_request_template.md`, the Accessibility Contract (§9), and the token usage rules (§3.6).

---

## 1. Product design thesis & principles

### 1.1 Brand story — "The Scholar's Seal"

ALIMS is a **digital registry**: a place where academic work is recorded, attested, sealed, and looked up. The visual identity is built on three archival metaphors:

| Metaphor | Visual translation |
|---|---|
| **Ink** | Deep indigo-slate ink for text and authority (`ink` tokens) |
| **Parchment** | Warm paper-white surfaces that reduce glare and feel archival (`parchment` tokens) |
| **The Seal** | Verification badges, certificates, and the QR panel are rendered as a *seal* — a stamped, bordered mark with the ALIMS monogram. Verification levels are visibly distinct stamps, never abstract scores. |

**Brand promise:** *Preserve. Connect. Activate.* — encoded visually as: preservation (archival, durable, calm), connection (lineage lines, relationship chips), activation (the single warm accent — "wax gold" — reserved for meaningful progress moments: verified seals, issued certificates, matched opportunities).

### 1.2 Design principles (normative)

Each principle is binding and traceable to the PRD. Violating one is a defect, not a preference.

| # | Principle | Binding source | UI rule |
|---|---|---|---|
| D1 | **Evidence over assertion** | PRD §1.5.2, §9.5 | Every claim on screen carries its evidence source (`Self-declared` / `Institution-verified` / `Journal-linked` / `Imported`). No bare claims. |
| D2 | **Status must be seen, never decoded** | PRD §9.3, §6.4 | Every status is **icon + text + tone**, never colour alone; never an unexplained dot. |
| D3 | **No integrity scores. Ever.** | PRD §1.5.3, §6.8 | Percentage gauges, score rings, "trust meters" of people or records are **forbidden UI**. Similarity numbers are visible only to authorised roles inside a private review surface (PRD §6.5). |
| D4 | **Plain language over jargon** | PRD §9.3 | Microcopy explains *why* (e.g. "Why is my ID required?" inline). Error messages state what happened + what to do next in one sentence each. Reading level: grade 8–9 for student-facing copy. |
| D5 | **Calm over clever** | PRD §9.3, `prefers-reduced-motion` | Motion budget: 120–240 ms micro, ≤320 ms panels. No decorative parallax, no auto-playing anything. Reduced motion = zero effective animation. |
| D6 | **Low-bandwidth dignity** | PRD §9.3 | System font stacks only (no webfont downloads), inline SVG (no icon fonts, no sprite downloads), skeleton screens instead of spinners, pages functional on 2G. |
| D7 | **Accessible by default** | PRD §9.3 (WCAG 2.2 AA hard) | See Accessibility Contract §9. Nothing ships without keyboard path, labels, and contrast. |
| D8 | **Global-first, not local-first** | PRD §9.4 | English is first; every string lives in the i18n layer (`agent_4`), date/number formats are locale-aware, no culture-specific name/degree assumptions, NXR-ID rendered in a monospace face. |
| D9 | **One primary action per screen** | Cognitive-load budget | Every screen has exactly one visually dominant action; everything else is secondary/tertiary. Queues and dashboards lead with the user's *next required action*. |
| D10 | **Human decisions are visible as human decisions** | PRD §1.5.5, §6.5 | Review outcomes are signed by role + name + timestamp; machine signals are labelled as signals ("Advisory similarity report"), never conclusions. |

### 1.3 Cognitive-load budget

- **3-level information architecture** everywhere: global navigation → contextual (section) navigation → content. Never more than 7 items in any nav level.
- **Wizard steps carry one concept each** (max ~6 fields per step, max 8 steps). The student record wizard MUST not combine identity, contributors, access choice, and upload into one screen.
- **Progress is always visible**: wizard step indicator, upload progress with ETA, queue positions.
- **Queues order by urgency**: overdue first, then due-soon, then everything else (supervisor queue, registry queue).

---

## 2. Brand identity system

### 2.1 Naming & voice

- **Product name:** ALIMS. Never "ALIMS platform" in headings; in body copy, "ALIMS" alone.
- **Promise line:** "Preserve. Connect. Activate." — used on marketing/landing and certificate footer only; never inside product UI chrome.
- **Voice:** calm, precise, respectful. No hype ("revolutionary", "world-class"), no blame ("you failed"), no legalistic walls in student-facing surfaces. Statuses describe *state*, not *character* (a record is `Under Dispute`, never "suspicious").

### 2.2 Logo & seal mark

- **Wordmark:** "ALIMS" in the display serif (Georgia), letterspaced `+0.02em`, ink-900 on parchment or white on ink-900. Minimum height 24 px.
- **Seal mark (the verification stamp):** a double-ring circle, 40 px diameter, containing a stylised open-book glyph; ring = `border-strong`, book = ink-900. Used at: certificate top-left, QR verification page, institution-verified badge context. SVG only, currentColor-aware, no raster.
- **Favicon:** seal mark monochrome ink-900 at 32×32 (transparent), plus 16×16 simplified.
- **Clearspace:** 1× seal diameter on all sides of the seal; 0.5× cap-height around the wordmark.
- **Do not:** tilt the seal, add drop shadows to it, render it in status colours (status belongs to badges, not the brand mark).

### 2.3 Colour system (WCAG 2.2 AA verified)

All ratios computed per WCAG relative luminance. Complete pair table in §3.5.

**Brand neutrals — "Ink & Parchment"**

| Token | Hex | Role |
|---|---|---|
| `ink-900` | `#0B1220` | Strongest text; high-emphasis surfaces (header/footer) |
| `ink-800` | `#0F172A` | Primary text on light surfaces (17.85:1 on white) |
| `ink-700` | `#1E293B` | Headings on parchment (13.89:1) |
| `ink-600` | `#334155` | Secondary text (10.35:1 on white) |
| `ink-500` | `#475569` | Muted text, captions (7.58:1 on white; 7.20:1 on parchment) |
| `ink-400` | `#64748B` | Disabled text, timestamps (4.76:1 on white — normal-text floor, do not go lighter) |
| `ink-300` | `#94A3B8` | Large display numerals only (7.30:1 on ink-900); never body text on light |
| `ink-200` | `#CBD5E1` | Decorative rules on dark only. **Never text.** |
| `parchment` | `#FAF9F6` | Default page background (warm paper) |
| `parchment-subtle` | `#F5F3EE` | Section/card background |
| `surface` | `#FFFFFF` | Cards, dialogs, inputs |

**Brand colour — "Registry Indigo"**

| Token | Hex | Role |
|---|---|---|
| `brand-700` | `#1D4ED8` | Primary buttons, links, focus ring (white text: 6.70:1 ✅) |
| `brand-800` | `#1E40AF` | Hover/active (white text: 8.72:1 ✅) |
| `brand-900` | `#1E3A8A` | Text-on-tint, active nav item |
| `brand-50` | `#EFF4FF` | Selected/tinted backgrounds (brand-900 text: 9.40:1 ✅) |

**Accent — "Wax Gold"** (used sparingly: seals, certificate accents, activated states)

| Token | Hex | Role |
|---|---|---|
| `accent-800` | `#6E5510` | Text/icon on accent-50 (6.42:1 ✅); large numerals |
| `accent-700` | `#8A6D1D` | **Large text / decorative only** (4.45:1 on accent-50 — below normal-text floor) |
| `accent-50` | `#FBF4DC` | Tint background |

**Borders**

| Token | Hex | Role |
|---|---|---|
| `border-input` | `#857F72` | Interactive component boundaries (3.78:1 on parchment, 3.98:1 on white — meets WCAG 1.4.11 non-text ≥3:1) |
| `border-strong` | `#6B7280` | Card outlines, table rules (4.59:1 on parchment) |
| `border-soft` | `#E7E4DC` | **Decorative separators only.** Never the sole boundary of an interactive control. |

### 2.4 Typography system

**Zero webfonts** (PRD §9.3 low-bandwidth). Stacks:

```css
--font-display: Georgia, 'Times New Roman', serif;      /* headings, wordmark, certificates */
--font-body: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;  /* NXR-IDs, hashes, timestamps */
```

**Type scale** (rem-based; base 16 px; readable at 200% zoom — no fixed heights on text containers):

| Step | Size / Line-height | Weight | Usage |
|---|---|---|---|
| `display` | 48 px / 1.15 (3rem) | 700 | Landing hero only (serif) |
| `h1` | 36 px / 1.2 (2.25rem) | 700 | Page titles (serif) |
| `h2` | 28 px / 1.3 (1.75rem) | 700 | Section titles (serif) |
| `h3` | 20 px / 1.4 (1.25rem) | 600 | Card titles (sans) |
| `body-lg` | 18 px / 1.6 | 400 | Lead paragraphs |
| `body` | 16 px / 1.6 | 400 | Default |
| `body-sm` | 14 px / 1.55 | 400 | Secondary text, table cells |
| `caption` | 12 px / 1.5 | 400–500 | Timestamps, meta, **minimum size; never smaller** |
| `mono` | 14 px / 1.5 | 500 | NXR-IDs (e.g. `NXR-2026-AB12-4F7C`), hashes, QR payload hints |

Rules: line-length 55–75 characters for prose; headings use `text-wrap: balance`; body uses `text-wrap: pretty`; letter-spacing only on wordmark/eyebrow labels (`+0.05em` uppercase 12 px eyebrows).

### 2.5 Spacing & layout grid

- Base unit **4 px**. Scale: `0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128`.
- Page gutters: 16 px mobile → 24 px ≥768 → 32 px ≥1024.
- Content max-widths: prose `72ch`; app content `1200px`; auth card `400px`.
- Card padding: 16 mobile / 24 desktop; section rhythm: 32 px vertical gaps between sections, 48 px between major sections.
- Touch targets: **44×44 px primary**, 24×24 px minimum (WCAG 2.5.8), 8 px minimum spacing between adjacent targets.

### 2.6 Radius, elevation, motion

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 4 px | Chips, badges, inputs |
| `radius-md` | 8 px | Cards, dialogs |
| `radius-lg` | 12 px | Modals, panels |
| `radius-full` | 9999 px | Pills, status dots *with* text (never bare dots) |
| `shadow-card` | `0 1px 2px rgba(11,18,32,.06), 0 2px 8px rgba(11,18,32,.05)` | Resting cards |
| `shadow-float` | `0 8px 24px rgba(11,18,32,.12)` | Dialogs, popovers |

Motion: `motion-fast 120ms` (hover colour), `motion-base 180ms` (fades), `motion-slow 240ms` (panels), `motion-panel 320ms` (drawer), easing `cubic-bezier(0.2, 0, 0, 1)` throughout. All motion MUST respect `prefers-reduced-motion: reduce` → durations 0.01 ms (already scaffolded in `globals.css`).

### 2.7 Iconography system

- **Grid:** 24×24, 2 px stroke, rounded caps/joins (stroke-linecap/join: round), 1.5 px for 16 px inline icons.
- **Style:** linear, geometric, calm. No filled icons except the seal mark and file-type glyphs.
- **Colour:** icons inherit `currentColor`; interactive icons use ink-600, hover ink-900; status icons use their status tone (§7).
- **Accessibility:** every icon ships with a semantic alternative — decorative icons get `aria-hidden="true"`; meaningful icons get an accessible name via adjacent text or `aria-label`. No icon-only buttons without names.

---

## 3. Design tokens (canonical)

### 3.1 Delivery mechanism

`apps/web/src/styles/tokens.css` (this PR) exports every token below as a CSS custom property under `:root`. Agents 3 & 4 MUST consume tokens via variables (or the Tailwind mapping in §11) — **never raw hex values in component code**.

### 3.2 Semantic colour tokens (components bind to these, not raw hues)

```css
--color-bg: var(--parchment);
--color-bg-subtle: var(--parchment-subtle);
--color-surface: var(--surface);
--color-text: var(--ink-800);
--color-text-secondary: var(--ink-600);
--color-text-muted: var(--ink-500);
--color-text-inverse: #FFFFFF;
--color-link: var(--brand-700);
--color-link-hover: var(--brand-800);
--color-border-input: var(--border-input);
--color-border-strong: var(--border-strong);
--color-border-soft: var(--border-soft);
--color-focus: var(--brand-700);            /* 6.37:1 vs parchment — visible for all */
--color-primary-bg: var(--brand-700);
--color-primary-bg-hover: var(--brand-800);
--color-primary-fg: #FFFFFF;
--color-danger-bg: #B91C1C;                 /* white text 6.47:1 */
--color-danger-bg-hover: #991B1B;           /* white text 8.31:1 */
--color-danger-fg: #FFFFFF;
--color-danger-subtle-bg: #FEF2F2;
--color-danger-subtle-fg: #991B1B;          /* 7.60:1 */
--color-warning-subtle-bg: #FFFBEB;
--color-warning-subtle-fg: #92400E;         /* 6.84:1 */
--color-success-subtle-bg: #F0FDF4;
--color-success-subtle-fg: #14532D;         /* 8.70:1 */
--color-info-subtle-bg: #EFF4FF;
--color-info-subtle-fg: #1E3A8A;            /* 9.40:1 */
```

### 3.3 Status tone tokens

One hue family per *concept*, mapped to badges in §7. All "subtle" pairs verified ≥6:1 (see §3.5). Solid status fills only when white text passes 4.5:1.

| Concept | Subtle bg | Subtle fg | Solid (white text) |
|---|---|---|---|
| Neutral / in-progress (draft, pending) | `#F8FAFC` | `#334155` | `#334155` (10.35:1) |
| Informational (submitted, in review) | `#EFF4FF` | `#1E3A8A` | `#1D4ED8` (6.70:1) |
| Verified / success (institutionally verified, clean, valid) | `#F0FDF4` | `#14532D` | `#15803D` (5.02:1) |
| Trusted partner (supervisor-verified, journal-verified) | `#F0FDFA` | `#115E59` | `#115E59` (7.58:1) |
| Advisory / needs action (returned, review required) | `#FFFBEB` | `#92400E` | `#92400E` (7.09:1) |
| Dispute (under dispute — *not guilt*) | `#FFF7ED` | `#9A3412` | `#9A3412` (7.31:1) |
| Destructive (revoked, infected) | `#FEF2F2` | `#991B1B` | `#991B1B` (8.31:1) |
| Journal / prestige (journal-verified) | `#FAF5FF` | `#581C87` | `#581C87` (10.88:1) |

### 3.4 Typography, spacing, radius, motion tokens

Mirror §2.4–2.6 exactly (`--font-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--motion-*`, `--z-*`). Full listing in `tokens.css`.

### 3.5 Verified contrast pairs (normative — computed)

| Pair | Ratio | Normal text (≥4.5) | Large/UI (≥3.0) |
|---|---|---|---|
| ink-800 on white | 17.85 | ✅ | ✅ |
| ink-800 on parchment | 17.78 | ✅ | ✅ |
| ink-600 on white | 10.35 | ✅ | ✅ |
| ink-500 on white / parchment | 7.58 / 7.20 | ✅ | ✅ |
| ink-400 on white / parchment | 4.76 / 4.52 | ✅ (floor) | ✅ |
| white on ink-900 | 18.72 | ✅ | ✅ |
| white on brand-700 / brand-800 | 6.70 / 8.72 | ✅ | ✅ |
| brand-900/800/700 on brand-50 | 9.40 / 7.91 / 6.08 | ✅ | ✅ |
| accent-800 on accent-50 | 6.42 | ✅ | ✅ |
| **accent-700 on accent-50** | **4.45** | ❌ **large text/UI only** | ✅ |
| green-800/700 vs white | 9.11 / 5.02 | ✅ | ✅ |
| red-800/700 vs white | 8.31 / 6.47 | ✅ | ✅ |
| border-input on parchment / white | 3.78 / 3.98 | — | ✅ (1.4.11) |
| border-strong on parchment | 4.59 | — | ✅ |
| focus (brand-700) on parchment | 6.37 | — | ✅ |

**Forbidden pairs** (build fails if found in review): any body text lighter than ink-400 on parchment/white; accent-700 for normal-size text; white on brand-700 at sizes below 18.66 px bold (never — keep to ≥16 px bold/18 px regular rule for button labels); ink-200 as text anywhere; colour-only statuses (§D2).

### 3.6 Token usage rules

1. Component code references tokens only. Raw hex in `*.tsx` = review-blocking.
2. Status colour MUST come from the §3.3 tone table and MUST be accompanied by icon + text label (§D2).
3. The seal/gold accent NEVER communicates state — statuses have their own hue family. (A gold "verified" and a gold "seal" must not be confusable.)
4. Disabled controls: opacity is allowed (exempt from 1.4.3) but keep ≥0.4, add `cursor: not-allowed`, and never make the *reason* invisible — pair disabled state with explanatory text where relevant.

---

## 4. Layout system & app shell

### 4.1 Breakpoints

`sm 640 · md 768 · lg 1024 · xl 1280`. Mobile-first. Verified layouts: 320 px (smallest), 360/390 (common), 768, 1024, 1280, 1440 (max density).

### 4.2 Shell anatomy (authenticated)

```
┌────────────────────────────────────────────┐
│ Top bar: skip-link · brand · search (≥md) ·│  h-16, ink-900 bg,
│ notifications · profile menu               │  white icons, labelled
├──────────────┬─────────────────────────────┤
│ Side nav     │  Breadcrumb (context)       │
│ (role-scoped)│  ─────────────────────────  │
│ · Dashboard  │  Page title (h1) + primary  │
│ · My records │  action (right, always)     │
│ · Uploads    │                             │
│ · Review     │  Content region (max 1200)  │
│ · Registry   │                             │
│ · Reports    │                             │
├──────────────┴─────────────────────────────┤
│ Footer (light): institution name · privacy │
└────────────────────────────────────────────┘
```

- **Mobile:** side nav collapses to a labelled hamburger opening a `motion-panel` drawer; the top bar keeps Search + Notifications + Profile.
- **Role-scoped nav** (server-provided): student (My records, Uploads, Passport), supervisor (Queue, Reviews), registry/dept-admin (Queue, Certificates, Reports), librarian (Metadata, Embargoes), institution admin (Institution, People, Workflows), company (Discovery, Opportunities), public visitor (no shell; public header).
- **Current-section indicator:** never colour alone — bold text + 3 px ink underline (or aria-current="page" for links).
- **Breadcrumbs** on all depth ≥3 screens, `aria-label="Breadcrumb"`.

### 4.3 Page templates

| Template | Structure | Used by |
|---|---|---|
| `landing` | Hero (display serif + promise + primary CTA) → 3 value props → trust strip (verification explanation) → footer | public home |
| `auth` | Centered 400 px card on parchment; brand seal above; one form per screen | login, register, MFA, step-up, reset |
| `dashboard` | Greeting + "your next action" card first, then metric cards, then lists | student/supervisor/registry |
| `wizard` | Stepper (top) → step content → sticky action bar (Back / Save draft / Continue) | record creation |
| `queue` | Filter bar → sorted list of task cards → detail drawer/panel | supervisor, registry |
| `detail` | Sticky summary header (title, NXR-ID mono, status badge, actions) → tabbed content | record pages |
| `public-record` | Read-only detail: metadata, seal status, QR block, access-request CTA | public visitors |
| `verify` | Minimal, fast (PRD §9.2 ≤2 s): seal + status panel + QR-resolved certificate data + disclaimer | QR landing |

### 4.4 Navigation protocols (global)

1. Primary actions live **top-right of content**, not buried in cards.
2. Destructive actions are secondary/tertiary and require confirmation only when irreversible (PRD §9.1); step-up (MFA) triggers are labelled ("Extra verification required").
3. After form submit: success = toast + context moves forward; failure = inline, field-anchored, focus moved to first error, error summary at top of form.
4. Back-navigation must preserve state (drafts auto-saved locally, PRD §8 row 1).

---

## 5. Navigation protocols per screen (journey-by-journey)

### 5.1 Public landing
- **Purpose:** explain what ALIMS verifies and what it doesn't (trust through honesty — §6.4 restrictions must be visible on the certificate explanation).
- **Hierarchy:** hero promise → "What is a Research Record?" (plain language, 3 cards) → verification level explainer (badge previews with plain-language meanings) → institutions strip → CTA (Browse public records / Create researcher account).
- **Loads:** static-first, no client-side waterfall; hero text in HTML, not image (SEO + bandwidth).

### 5.2 Authentication surfaces (T-401 owner: agent_4)
- **Register (researcher):** single purpose; optional institution membership search (select with typeahead); required-field rationale visible ("Why is my ID required?").
- **Login:** email/password, show/hide password toggle (`aria-pressed`), "Forgot password?" link; rate-limit error copy: "Too many attempts. Try again in X minutes."
- **MFA (TOTP):** 6-digit segmented input, single `inputMode="numeric"` field with letter-spaced mono digits (NOT six separate inputs — screen-reader sanity), one QR + manual secret fallback at enrolment.
- **Step-up:** full-screen interstitial ("This action needs extra verification") listing the *concrete action* being protected, never bare MFA prompt.
- **Password reset:** one-field-per-step flow (email → code → new password), success screen always says "sent *if* the account exists" (no account enumeration).

### 5.3 Student dashboard (T-402)
- **First card = next required action** ("Programme deadline: 31 Jul — 2 records due", "Resubmit '…' by …", "Upload resumed"). No empty dashboard ever: empty state = guided first step.
- Metrics (secondary): records by status, active embargoes, verified count.
- List of my records: title, type, status badge, version, last-updated, chevron. Row = whole-card link with visible focus ring.

### 5.4 Record wizard (T-402)
- Steps (progressive disclosure, one concept per step): 1 Output type & title/abstract → 2 Institution & programme context (if official) → 3 Contributors & roles (CRediT chips + level selector lead/equal/supporting) → 4 Access choice (visual access-level cards: who sees what — PRD §6.6 table rendered as three-column visibility diagram with icons) → 5 Licence & declarations → 6 Upload → 7 Review & submit.
- Draft persistence: save on every step change (local storage + debounced API), "Draft saved" indicator with timestamp; offline changes queued (PRD §8).
- Required-field rationale inline (PRD §6.2); validation errors field-anchored with text + icon.
- Submit button shows preconditions unmet as a checklist (not disabled mystery): e.g. "Scan still in progress — you can submit once complete."

### 5.5 Upload experience (T-402, contract §8 of api_specification)
- Dropzone: 44+ px tall target, drag + click + keyboard (Enter/Space opens file picker), accepted formats + size limits stated **before** choosing (PRD §6.3).
- Progress: percent + size + speed, resumable; interruption → "Connection lost — we'll resume where you stopped" banner, auto-resume on reconnect (PRD §8).
- Completion: deposit receipt (mono receipt ID, timestamp, SHA-256 prefix) — the "receipt" look (monospace, perforated divider) reinforces trust.
- Scan states (`ScanStatus`): pending (progress), clean (success seal), infected (plain language: "This file can't be accepted — replace it with a safe copy", no internal details), unsupported/failed (explain + next action).
- Never allow submit while scan pending (button shows checklist reason — PRD §6.3).

### 5.6 Receipts & version timeline (T-402, T-201)
- Version history = vertical timeline (line + node per version), each node: version no., date, who, change summary, status chip; current version marked (text + bold, not colour alone); returned/approved/superseded states labelled (PRD §6.3, `VersionState`).
- "Compare versions" diff view (files) is a future enhancement; in R1 show change summaries.

### 5.7 Supervisor queue & review (T-403)
- Queue sorted: overdue → due soon → rest; each row: record title, student (safe display), version, time in queue, deadline, decision buttons.
- Review screen: document preview pane + structured decision panel (approve / return with revision / request contributor correction / escalate integrity — `ReviewDecisionType`), required structured feedback fields, decision confirmation summarises what happens next (PRD §4.2: supervisor never edits the file — no edit affordances on the document).
- Integrity escalation shows the **fairness copy** verbatim (PRD §6.5): "Potential overlap with existing registered research has been identified…" — never accusatory phrasing.

### 5.8 Registry & institution admin (T-404)
- Registry queue mirrors supervisor queue; certificate actions carry step-up interstitial.
- Certificate issue screen: preview of the public certificate exactly as it will render + explicit "what this certificate does and doesn't prove" checklist (PRD §6.4 restrictions).
- Institution admin: department/programme/session management, workflow templates, policy toggles — tables with inline editing; every policy toggle has plain-language impact description.

### 5.9 Public record detail (T-404)
- Header: title (serif), NXR-ID (mono), verification badge (the seal), institution, year, type, access status.
- Body: abstract (per access level), contributor list with CRediT roles + evidence source labels, relationship chips (explicit type labels — PRD §6.9), embargo countdown ("Full text available 2028-03-01"), access-request CTA (if enabled).
- Machine-suggested relationships: labelled "Suggested — not verified" and non-public per PRD §6.9; never rendered as fact.

### 5.10 Certificate & QR verification page (T-404, `GET /public/verify/:qrToken`)
- Budget: ≤2 s to first paint (static shell + fetch, skeleton card) — PRD §9.2.
- States: `valid` (green seal + check), `superseded` (amber seal + arrow, link to successor), `revoked` (red seal + explanation + "what to do"), `not_found` (neutral, plain language).
- Always shows: certificate no., NXR-ID, title, researcher name(s) where approved, institution, type, issue date, verification level, and the **disclaimer** (contract field) — never grades/IDs/private data (PRD §11.5).
- QR code on certificates encodes **only the public verification URL** (PRD §8 edge case: no sensitive data in the QR).

### 5.11 Academic passport (R2 foundation, PRD §6.8)
- Sections with per-section visibility controls; **every claim labelled by evidence source** (D1): self-declared / institution-verified / journal-linked / externally linked.
- **No aggregate score.** No "Research Quality 8.5". No trust meters. (D3)

### 5.12 Search & discovery (T-304, T-404)
- One search bar + collapsible filter panel (the 14 dimensions of PRD §6.10 as grouped controls); active filter count on the trigger button.
- Result card (contract `SearchResult`): title, type, safe contributor display, institution where allowed, year, abstract excerpt (≤2 lines), **verification badge**, **access status chip** (`open|embargoed|restricted|metadata_only`), related-work indicators where permitted.
- Empty/no-result states: distinguish "no results" from "restricted content excluded" (honesty: "Some records may be hidden due to access rules").

### 5.13 Loading, error, empty, offline — global protocol
- **Loading:** skeleton screens matching final layout (no spinners except ≤500 ms micro-waits); `aria-busy` on containers; content never jumps.
- **Errors:** inline panel: what happened (plain) + what to do + retry button; API `ProblemDetails.detail` is user-safe (contract), never show stack traces (PRD §9.1).
- **Empty:** illustration + plain-language explanation + primary action ("Create your first Research Record").
- **Offline:** banner when connectivity drops; locally queued actions listed; upload resumes; drafts persist (PRD §8).
- **Announcements:** `role="status"` for progress, `role="alert"` for blocking errors; toasts live in one polite region.

---

## 6. Component specifications (T-601 preview — implementable now)

Each component below lists anatomy, states, and non-negotiable a11y. Agents 3/4 build these in `packages/ui` + `apps/web/src/components` per T-601 acceptance once tokens land.

| Component | Variants | States | A11y (non-negotiable) |
|---|---|---|---|
| `Button` | primary / secondary / ghost / destructive / link-like | default, hover, focus, active, disabled, loading (inline spinner + text) | real `<button>`; 44 px min height; focus ring 3 px brand-700 offset 2; loading keeps width (no layout shift) + `aria-busy` |
| `TextField` | default / with-prefix / textarea | default, focus, error, disabled | label bound (`htmlFor`), helper + error text, error = icon+text+`aria-invalid`+`aria-describedby`; error never colour-only |
| `Select` | native-style listbox | same | keyboard full support; label bound; custom listbox MUST replicate all native key behaviour |
| `Checkbox` / `Radio` | single / group with fieldset+legend | checked, focus, error | native inputs; group labelled by `legend`; error summary names the group |
| `Toggle` | on/off | +disabled | `role="switch"` + `aria-checked`; on/off text labels beside the control (never colour-only) |
| `FileDropzone` | drag / click / keyboard | idle, drag-over, uploading, resumed, done, error | Enter/Space opens picker; progress is `role="progressbar"` with aria-valuenow; interruption banner `role="status"` |
| `Badge` (status) | all §7 mappings | — | icon + text + tone; `aria-label` expands the enum to plain language where truncated |
| `Alert` | info / success / warning / danger | — | `role="alert"` (danger) or `role="status"`; icon + heading + body |
| `Dialog` | confirm / form / step-up | open/closed | focus trapped, Esc closes, focus returns to trigger, `aria-modal`, labelled |
| `Toast` | info / success / warning / danger | entering/leaving | single polite live region; never auto-dismiss warnings/danger |
| `Table` | data / action rows | sorted, selected | `<th scope>`, captions on data tables, row actions labelled ("Review record '…'") |
| `Tabs` | line / contained | active, focus | roving tabindex, arrow keys, `role="tablist/tab/tabpanel"` |
| `Breadcrumb` | — | — | `nav` + `aria-label="Breadcrumb"`, current page `aria-current="page"` |
| `Pagination` | compact / full | — | labelled page buttons, current announced, results count text |
| `Skeleton` | text / card / table | — | `aria-busy` on container; no motion for reduced-motion users |
| `Tooltip` | hover / focus | — | also on focus; dismiss via Esc; never sole carrier of vital info |
| `QRPanel` | certificate / verify page | valid / superseded / revoked / not-found | QR has alt text "Scan to verify this certificate"; panel states per §5.10 |
| `Timeline` | versions / audit | — | ordered list semantics; each node labelled with state text |
| `EmptyState` | per journey | — | illustration (aria-hidden) + heading + action |

---

## 7. Status & verification badge system (T-602 foundation)

**Rules (binding):** every badge = icon + text + tone (D2). Plain-language label is the *primary* text; enum value never shown raw. Badges read left-to-right: icon, label, optional detail (e.g. "since 12 Jun 2026"). Solid fills only for top-level seals (certificate/verify page); list/table badges use subtle pairs. This section maps the **contract enums verbatim** (`api_specification.md` §2).

### 7.1 RecordStatus (workflow position — always paired with the VerificationLevel seal)

| Enum | Label (plain) | Tone (token) | Icon |
|---|---|---|---|
| `draft` | Draft | neutral | ✎ pencil |
| `submitted` | Submitted | info-blue | ↗ paper-plane |
| `in_review` | In review | info-blue | ◔ eye |
| `returned_for_revision` | Returned for revision | advisory-amber | ↩ arrow-return |
| `resubmitted` | Resubmitted | info-blue | ⟳ refresh |
| `institutionally_verified` | Institutionally verified | verified-green **seal** | ✓ seal-check |
| `published` | Published | info-blue | ⊙ globe |
| `superseded` | Superseded | advisory-amber | ⤴ arrow-up |
| `withdrawn` | Withdrawn | neutral-strong | ⊘ circle-slash |
| `under_dispute` | Under dispute | dispute-orange | ⚖ scales — **copy rule:** "under active review — not a misconduct finding" (PRD §6.4) |
| `verification_revoked` | Verification revoked | destructive-red | ✕ x-seal |

### 7.2 VerificationLevel (evidence seal — PRD §3 definitions, §6.4)

| Enum | Label | Tone | Seal? |
|---|---|---|---|
| `draft` | Draft | neutral | — |
| `submitted` | Submitted | info-blue | — |
| `identity_verified_deposit` | Identity-verified deposit | neutral-strong | small |
| `self_published` | Self-published | neutral-strong | small |
| `supervisor_verified` | Supervisor-verified | trusted-teal | small |
| `institutionally_verified` | **Institutionally verified** | verified-green | **full seal** |
| `journal_verified` | Journal-verified | journal-purple | full seal |
| `under_dispute` | Under dispute | dispute-orange | — |
| `withdrawn` | Withdrawn | neutral-strong | — |
| `verification_revoked` | Verification revoked | destructive-red | — |

**Copy rule:** `Self-Published` and `Identity-Verified Deposit` must never be styled to resemble `Institutionally Verified` (PRD §11.7 — no false impression of approval). The full seal (double ring) is reserved for `institutionally_verified` and `journal_verified` only.

### 7.3 CertificateStatus & public verification (`PublicVerification.status`)

| Enum | Label | Tone | Verify-page presentation |
|---|---|---|---|
| `valid` | Valid | verified-green + seal | headline "Valid certificate" + check seal |
| `superseded` | Superseded | advisory-amber | "Replaced by a newer certificate" + link to successor (never styled as misconduct) |
| `revoked` | Revoked | destructive-red | "No longer valid for verification" + reason visibility per policy |
| `not_found` | Not found | neutral | plain-language: "No certificate matches this code" — no private data ever |

### 7.4 ScanStatus (uploads)

| Enum | Label | Tone | Note |
|---|---|---|---|
| `pending` | Scanning… | neutral + progress | "We're checking the file" — no internal details |
| `clean` | File accepted | verified-green | with deposit receipt |
| `infected` | File not accepted | destructive-red | plain-language, safe-replacement next step (PRD §8) |
| `unsupported` | Format not supported | neutral | lists accepted formats + next action |
| `failed` | Check incomplete | advisory-amber | "Please try uploading again" |

### 7.5 InstitutionStatus, SimilarityStatus, AckStatus, VersionState, access chips

- `InstitutionStatus`: pending_verification (neutral), verified (green seal), suspended (advisory-amber), archived (neutral-strong).
- `SimilarityStatus` (**private surfaces only** — PRD §6.5): not_requested (neutral), pending (info), completed (neutral), provider_delayed (advisory: "Our similarity provider is delayed — nothing is wrong with your record"), review_required (advisory + human-review card), reviewed (neutral + outcome summary), unavailable (neutral).
- `AckStatus` (contribution declarations): pending (neutral), acknowledged (green), correction_requested (advisory), disputed (orange — routes privately, PRD §11.6), no_response (neutral).
- `VersionState`: draft / submitted / returned / approved / superseded / withdrawn — timeline node styles, subtle pairs, never colour-only.
- Access chips (`open|embargoed|restricted|metadata_only`): lock/globe icons + text; embargo chip includes countdown date.

---

## 8. Icon, illustration & visual asset requirements

### 8.1 Custom icon inventory (needed — inline SVG, 24 px grid, 2 px stroke)

**Core (30):** record, seal, seal-check, seal-x, shield-check, shield-alert, qr, upload, cloud-off, clock, calendar, user, users, institution (columns), search, filter, arrow-right, arrow-return, chevron-down/left/right, check, x, alert-triangle, info, lock, unlock, globe, eye, eye-off, edit, trash, history, document-stack, link, chart (reports).

**File/output types (11, per `OutputType`):** project, thesis, dissertation, article, report, dataset, software, preprint, patent-disclosure, presentation, other.

**Status glyphs (§7):** pencil, paper-plane, refresh, circle-slash, scales, seal variants, scan.

**Journey glyphs:** passport (book-person), lineage (branching nodes), opportunity (handshake), continuation (infinity-in-arrow), embargo (lock-clock).

### 8.2 Illustrations

Six empty-state illustrations, **inline SVG only**, 2-colour (ink-300 + ink-200 on parchment, decorative → contrast-exempt but never information-bearing):
1. no records yet (empty shelf) · 2. no search results (magnifier + gaps) · 3. review queue empty (inbox + check) · 4. upload interrupted (cloud + zigzag) · 5. access restricted (lock on document) · 6. certificate not found (seal + question mark).

### 8.3 Brand assets

| Asset | Spec |
|---|---|
| Wordmark SVG | serif "ALIMS", ink-900, +0.02em letterspacing |
| Seal SVG | double-ring + open-book glyph, currentColor |
| Favicon | 32×32 + 16×16, monochrome seal |
| OG image | 1200×630 SVG→PNG: parchment bg, wordmark, promise line, seal; alt-able content, no raster text dependence |
| Certificate template (PDF) | A4; white; seal top-left; title serif; NXR-ID mono; QR bottom-right (≥2 cm); gold hairline accents; footer promise + restrictions text (PRD §6.4) |
| Email templates | minimal, text-forward, brand header |

### 8.4 Photography / texture policy
No stock photography in product UI (bandwidth + distraction). The landing page MAY use one hero treatment: parchment texture via CSS gradients only (no image downloads). All illustration is vector.

---

## 9. Accessibility contract (WCAG 2.2 AA — PRD §9.3 hard requirement)

1. **Keyboard:** every flow operable keyboard-only; visible focus everywhere (3 px brand-700 ring, 2 px offset; 6.37:1 contrast); logical tab order; skip-link first tab stop (already scaffolded).
2. **Screen readers:** semantic landmarks (header/nav/main/footer), one `h1` per page, labelled form fields, `aria-live` regions for dynamic content, dialog/tab/combobox patterns per APG.
3. **Contrast:** §3.5 tables only; text ≥4.5:1, large ≥3:1, UI components ≥3:1 (1.4.11), focus indicators ≥3:1.
4. **Not colour alone:** every status, error, and selection carries text/icon (D2). Test: full grayscale screenshot must remain fully usable.
5. **Target size:** ≥24×24 px (2.5.8), 44×44 for primary touch actions, 8 px spacing (2.5.8).
6. **Zoom:** functional at 200% and 400% reflow; no two-dimensional scrolling; rem-based type; no fixed-height text containers.
7. **Motion:** `prefers-reduced-motion` → near-zero animation (scaffolded); no flashing content >3/s (2.3.1).
8. **Errors (3.3.1/3.3.3):** identified, described, and recovery suggested; focus moves to first error; `aria-invalid` + `aria-describedby` on fields; errors never colour-only.
9. **Language & copy:** plain language (D4); "if account exists" phrasing; non-technical file-safety explanations.
10. **Testing gate:** axe-core in CI with zero violations on new components (T-601 DoD); keyboard smoke script per journey.

---

## 10. Responsive, performance & low-bandwidth protocol

- Budgets (PRD §9.2): verification page first paint ≤2 s; navigation ≤2 s on mobile connection; search ≤3 s; uploads always show progress.
- Zero webfonts; zero icon fonts; SVG inline; no client-rendered hero images; Next.js static/dynamic split per route (agent_4).
- Images: none beyond favicon/OG in R1 — content is documents (never previewed as images). Document previews render as downloadable links + safe text extraction only.
- Bundle discipline: route-level code-splitting; UI library tree-shaken; no moment.js-scale date libs (`Intl` only).
- Offline: draft queue + resumable uploads (PRD §8); service worker is a later enhancement, not R1 blocker.

---

## 11. Implementation notes for Agents 3 & 4

1. **Tokens file:** `apps/web/src/styles/tokens.css` (this PR) — import via `globals.css`. Components consume CSS variables; never hex literals.
2. **Tailwind theme mapping** — apply to `apps/web/tailwind.config.ts` (owned by the implementer; snippet below):

```ts
colors: {
  parchment: 'var(--parchment)',
  'parchment-subtle': 'var(--parchment-subtle)',
  surface: 'var(--surface)',
  ink: { 900: 'var(--ink-900)', 800: 'var(--ink-800)', 700: 'var(--ink-700)',
         600: 'var(--ink-600)', 500: 'var(--ink-500)', 400: 'var(--ink-400)',
         300: 'var(--ink-300)', 200: 'var(--ink-200)' },
  brand: { 50: 'var(--brand-50)', 700: 'var(--brand-700)', 800: 'var(--brand-800)', 900: 'var(--brand-900)' },
  accent: { 50: 'var(--accent-50)', 700: 'var(--accent-700)', 800: 'var(--accent-800)' },
  status: { neutral: 'var(--status-neutral)', info: 'var(--status-info)',
            verified: 'var(--status-verified)', trusted: 'var(--status-trusted)',
            advisory: 'var(--status-advisory)', dispute: 'var(--status-dispute)',
            danger: 'var(--status-danger)', journal: 'var(--status-journal)' },
},
fontFamily: { display: 'var(--font-display)', sans: 'var(--font-body)', mono: 'var(--font-mono)' },
borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)' },
boxShadow: { card: 'var(--shadow-card)', float: 'var(--shadow-float)' },
```

3. **Existing scaffold cleanup (agent_4):** replace `bg-surface-subtle`/`text-ink-muted` ad-hoc classes with mapped tokens; the placeholder `brand #1d4ed8` token is replaced by the §3 system.
4. **i18n:** all strings through the i18n layer from the first PR (T-400 scope); this document's labels are the English source strings.
5. **Contracts:** component props typed from `@alims/contracts`; badge components take the enum union types directly — adding an enum value to `api_specification.md` requires a §7 mapping addition here (Agent 6 change).

---

## 12. Design audit — current state & gap list (this turn's findings)

**Current state (M0 scaffold, `main` @ 5d9a193):**
- `apps/web`: root layout with skip-link (good), landing shell, health-check component (exemplary loading/error/success triad with non-colour-only errors), typed API client, placeholder Tailwind tokens explicitly awaiting T-600.
- `packages/ui`: empty shell awaiting T-601.
- `apps/web/public`: **no assets** — no favicon, logo, seal, OG image, or illustrations.
- No component library, no i18n layer, no auth/dashboard/record surfaces yet (tasks pending/blocked by design).

**Gap list (resolved by this document + T-601/T-602):**

| # | Gap | Resolution |
|---|---|---|
| G1 | Placeholder colour tokens (raw `#1d4ed8`, slate) — unverified pairs | §2.3/§3 verified token system + `tokens.css` (this PR) |
| G2 | No typography scale or font policy | §2.4 zero-webfont serif/sans/mono system |
| G3 | No brand assets (logo, seal, favicon, OG) | §8.3 specs — SVG production in T-601 |
| G4 | No status badge system; PRD §6.4 demands visibly distinct labels | §7 full enum→visual mapping (T-602 implementation) |
| G5 | No page templates / navigation protocols for the 5 journeys | §4–§5 per-screen protocols |
| G6 | No component specs | §6 anatomy/states/a11y tables |
| G7 | Hardcoded focus outline `#1d4ed8` | token `--color-focus` (6.37:1) wired in `globals.css` |
| G8 | No empty-state/illustration guidance | §8.2 six inline SVG specs |
| G9 | No accessibility test gate defined | §9.10 axe-core + keyboard smoke in CI (T-601 DoD) |

---

## 13. Approval & changelog

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0.0 | 2026-08-14 | agent_6 | Initial blueprint: brand system, verified tokens, per-screen navigation protocols, component specs, status badge mapping, accessibility contract, audit + gap list. PR for T-600. |

**Approval:** Agent 5 (Tech Lead) — by merging the T-600 PR, this document becomes the binding design contract for all frontend tasks.
