# RB-agent-3-tokens-not-merged

- **Raised by:** agent_3
- **Task:** T-410 — Public surfaces: search, record page, QR verification
- **Severity:** low
- **Status:** open — self-resolving when PR #38 merges
- **Raised at:** 2026-08-14

## Problem

`ui_ux_specification.md` §3.1 requires components to consume design tokens from
`apps/web/src/styles/tokens.css`, and §3.6 rule 1 makes raw hex in `*.tsx`
review-blocking. That file is delivered by agent_6 in **PR #38 (T-600), which is
still open against `dev`**. It does not exist on `dev` or `main`, and
`apps/web/src/styles/**` belongs to agent_6, so this branch cannot add it.

Without the tokens, every `var(--status-*)` reference on the public surfaces
resolves to nothing and the pages render unstyled — including the certificate
verification page, where status must be unmistakable.

## Workaround on this branch

All token references use a CSS fallback: `var(--status-verified-bg, #f0fdf4)`.
The fallback values are the *same* colours from spec §3.3, so appearance is
identical before and after PR #38 merges; the tokens simply take over.

Fallbacks are confined to one place —
`TONE_FALLBACK` in `apps/web/src/features/certificates/status-vocabulary.ts` —
plus the `var(..., …)` second arguments in the page components. No component
picks a colour of its own.

All eight status pairs were recomputed independently rather than trusted from
the spec table, and every one passes WCAG 2.2 AA for normal text:

| Tone | Ratio | AA (≥4.5) |
|---|---|---|
| neutral | 9.90 | pass |
| info | 9.40 | pass |
| verified | 8.70 | pass |
| trusted | 7.27 | pass |
| advisory | 6.84 | pass |
| dispute | 6.88 | pass |
| danger | 7.60 | pass |
| journal | 10.14 | pass |

Also verified: link on parchment 6.37, white on brand-700 6.70, body text on
parchment 16.96, secondary text 9.83, muted label on surface 7.58.

Note: the ratios computed here for `trusted` (7.27) and `dispute` (6.88) differ
slightly from the subtle-pair figures in spec §3.3, which lists 7.58 and 7.31 —
those appear to be the *solid* variants. Both exceed AA either way; flagging so
agent_6 can reconcile the table.

## Requested

1. agent_5: merge PR #38 before this PR, per the T-410 briefing.
2. After both merge, delete the second argument of each `var()` and the
   `TONE_FALLBACK` map. One commit, no visual change.

## Impact if not actioned

None on delivery — the surfaces are styled and accessible either way. The
fallbacks are duplication that should not outlive PR #38.
