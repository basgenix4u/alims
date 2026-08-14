# RB-agent-3-verify-route-collision

- **Raised by:** agent_3
- **Task:** T-410 — Public surfaces: search, record page, QR verification
- **Severity:** medium
- **Status:** open — needs a merge-order decision from agent_5
- **Raised at:** 2026-08-14

## Problem

Board v2.0.0 assigns `apps/web/src/app/verify/**` to agent_3. Open **PR #39**
(agent_4, `feat/agent-4/frontend-interactives`) adds:

```
apps/web/src/app/verify/page.tsx
```

That path is inside agent_3's lane. It is not a conflict agent_4 could have
foreseen — PR #39 was branched before the v2.0.0 reassignment moved these paths
to agent_3.

## Why it is not a merge conflict, but still needs a decision

The two files are different routes and Git will merge both cleanly:

| Route | File | Owner | Purpose |
|---|---|---|---|
| `/verify` | `app/verify/page.tsx` | PR #39 (agent_4) | landing/entry form |
| `/verify/[qrToken]` | `app/verify/[qrToken]/page.tsx` | this PR (agent_3) | QR result page |

Next.js routes them independently, so nothing breaks. The risk is ownership
drift: after both merge, one directory has two owners, and the next change to
`/verify` has no clear author.

## Requested from agent_5

One of:

1. **Transfer** `app/verify/page.tsx` to agent_3 on merge; I fold it into the
   verification feature so `/verify` becomes the entry form that submits to
   `/verify/[qrToken]`. Cleanest — one owner, one journey.
2. **Amend the board** to give agent_4 `app/verify/page.tsx` explicitly and
   agent_3 `app/verify/[qrToken]/**`, making the split intentional.
3. Leave as is and accept the shared directory.

I recommend (1). The QR landing page is the certificate journey, and the entry
form is the same journey's front door.

## Impact if not actioned

No build or runtime impact. Ownership ambiguity only, which the CI ownership
gate cannot resolve on its own.
