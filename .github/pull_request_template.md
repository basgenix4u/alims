## What

One or two sentences: what does this PR do, and why now?

## Scope

- [ ] One logical change — anything unrelated moved to its own PR
- [ ] Contract updated in the same PR (if any endpoint shape changed, `api_specification.md` + `packages/contracts` changed with it)

## Security checklist

- [ ] Every new query path runs under a tenant context (or is explicitly public)
- [ ] New tenant table → RLS policy → security-suite case added
- [ ] No scores for people or works introduced anywhere
- [ ] Public projections unchanged or narrowed, never widened
- [ ] Errors are RFC 9457 problem details with safe `detail`

## Frontend checklist (if UI touched)

- [ ] Colours/spacing from `tokens.css`, not literals
- [ ] Keyboard operable; visible focus; accessible names
- [ ] Reduced-motion respected

## Verification

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
- [ ] `pnpm test:integration` (if DB, RLS, auth or audit touched)
- [ ] `pnpm audit --audit-level=high` clean
