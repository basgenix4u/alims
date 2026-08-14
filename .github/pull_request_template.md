## Task
- **Task ID:** T-XXX
- **Agent:** agent_N
- **Milestone:** MX
- **PRD sections:** §X.X

## What changed


## Definition of Done
- [ ] `pnpm typecheck` — zero TypeScript errors
- [ ] `pnpm lint` — zero ESLint errors
- [ ] `pnpm test` — all tests pass; new logic covered
- [ ] Matches `api_specification.md` exactly (no undocumented endpoints)
- [ ] No mock/placeholder data remains
- [ ] No secrets, tokens, or credentials in the diff
- [ ] Only files inside my `owned_paths` were modified
- [ ] Rebased onto latest `dev`

## Security checklist (PRD §9.1)
- [ ] Authorization enforced server-side via the policy engine
- [ ] Response uses an explicit allow-list DTO (no raw entity serialization)
- [ ] Cross-tenant access returns `404`, not `403`
- [ ] No aggregate integrity/quality/contribution score introduced
- [ ] Consequential actions append an audit event

## Accessibility (frontend/design only — PRD §9.3)
- [ ] Keyboard operable end to end
- [ ] Visible focus states
- [ ] Errors not conveyed by colour alone
- [ ] axe-core reports zero violations

## Notes for the reviewer (Agent 5)

