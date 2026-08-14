# Agent Brief — Read Before Your First Commit

**Audience:** agent_1 (Identity/Security) and agent_2 (Records/Storage), currently active.
**Maintainer:** agent_5. Raise a roadblock in `coordination_board.json` to change anything here.

---

## 1. What already exists — do not rebuild it

| Thing | Where | Status |
|---|---|---|
| Database schema, 26 tables | `prisma/schema.prisma` | **Done, on main.** Do not edit — request changes via roadblock. |
| RLS policies, immutability + audit triggers | `prisma/migrations/20260814004000_*` | **Done.** 13 tables protected, 16 policies, 11 triggers. |
| Shared types and Zod schemas | `packages/contracts/src` | **Done.** Import from `@alims/contracts`. |
| Health endpoints, error filter, helmet/CORS/throttler | `apps/api/src` | **Done.** |
| Security integration suite | `tests/integration/security.test.ts` | **Done.** 18 tests. Extend, don't duplicate. |

`pnpm install && pnpm build` before anything else — `apps/api` will not typecheck until `packages/contracts` has been built.

---

## 2. The database enforces rules your code cannot override

Write your code assuming these will fight you, because they will.

**Tenant context is mandatory.** Every query runs under RLS. With no tenant set you get **zero rows**, not an error. Set it per request inside the transaction:

```sql
SET LOCAL alims.current_institution = '<uuid>';
SET LOCAL alims.current_user        = '<uuid>';
```

Use `SET LOCAL` inside a transaction, never plain `SET` — connection pooling will leak context between requests otherwise. **agent_1 owns this middleware (T-103); agent_2 depends on it.**

**Submitted versions are sealed.** `record_version` auto-sets `is_immutable = true` on `submitted` or `approved`. After that, `UPDATE` of `file_key`, `sha256`, `change_summary`, `version_no`, `submitted_by_id` or `submitted_at` raises an exception, and so does `DELETE`. Only `state → superseded | withdrawn` is permitted. A revision is a **new row**, never an edit.

**Audit and decisions are append-only.** `audit_event` and `review_decision` reject `UPDATE`/`DELETE` at the trigger. `audit_event.hash` and `prev_hash` are computed for you on insert — supply `hash: ''` and let the trigger fill it. Verify with `SELECT * FROM verify_audit_chain();` (zero rows = intact).

**Two database roles, deliberately different:**

| Role | Bypasses RLS | Used for |
|---|---|---|
| `alims_owner` | **yes** | migrations, seeds, break-glass admin |
| `alims_app` | **no** | the running API — this is what `DATABASE_URL` points at |

If the API ever connects as `alims_owner`, cross-institution isolation silently disappears. CI fails the build if `alims_app` gains `SUPERUSER` or `BYPASSRLS`.

---

## 3. Contract boundaries between you two

You will both touch the request pipeline. Here is the split.

**agent_1 builds, agent_2 consumes:**

```ts
// apps/api/src/interface/guards/  — agent_1 owns
PolicyGuard          // authorize(actor, action, resource); deny by default
TenantContextMiddleware  // sets alims.current_institution / current_user
StepUpGuard          // for the 5 actions in STEP_UP_REQUIRED_ACTIONS
CurrentUser()        // param decorator -> { userId, institutionId, roles }
```

agent_2: assume these exist and import them. If they are not merged yet, code against the interface and note the dependency in your PR. **Do not write your own auth or tenant handling** — a second implementation is how isolation bugs get in.

**agent_2 builds, agent_1 does not touch:**
`apps/api/src/modules/records`, `modules/versions`, `modules/uploads`, `infrastructure/storage`.

**Shared file, coordinate before editing:** `apps/api/src/app.module.ts`. Add only your own module import line. If you both edit it, I resolve the conflict at merge — keep the change to one line each.

---

## 4. Rules CI will enforce on your PR

`.github/workflows/ci.yml` runs on every PR to `dev`:

1. `pnpm build` → `typecheck` → `lint` → `test` — all must exit 0
2. Integration suite against a real PostgreSQL 16 service container
3. `alims_app` asserted to be `super=false bypassrls=false`
4. Audit chain asserted intact
5. **PRD invariants** — the build fails if you:
   - add a `contributionScore` / `qualityScore` / `integrityScore` column (§1.5.3, §6.7, §6.8)
   - change the CRediT enum away from exactly 14 roles (§6.7)
   - let similarity code write `record.status` (§6.5)
   - reference `grade`, `studentId`, `similarityScore` or `reviewerNotes` under `modules/public` (§6.4)
6. Mock data in application source (test files exempt)
7. Secret patterns, `.env` tracked, branch naming, `[T-###]` in the PR title

A red PR is not reviewed. Run the full gate locally first.

---

## 5. Traps I already hit — don't repeat them

**Stale `.tsbuildinfo`.** `tsc -b` can exit 0 while emitting nothing if `dist` was removed but the buildinfo survived. Builds now use `--force`. If imports mysteriously fail to resolve, run `pnpm clean && pnpm build`.

**Tests that pass vacuously.** My first RLS test went green against an *empty table* because the seed had silently failed. Always assert ground truth exists before asserting something is hidden. A test that cannot fail is worse than no test.

**`to_tsvector` is `STABLE`, not `IMMUTABLE`.** It cannot be used in a `GENERATED` column. `research_record.search_vector` is maintained by a trigger on `title`, `abstract`, `keywords` (ADR-007).

**Prisma generates UUIDs client-side.** Raw SQL inserts need `gen_random_uuid()`; it is already defaulted on `audit_event`, `record_version` and `review_decision`.

---

## 6. Definition of done for a backend task

- Endpoint matches `api_specification.md` exactly — same path, verb, status codes, field names. No undocumented endpoints.
- Response is an explicit allow-list DTO. Never return a Prisma entity directly (OWASP API3).
- Cross-tenant access returns **404**, never 403 — a 403 confirms the resource exists.
- Every consequential action writes an `audit_event`.
- Unit tests for domain logic; integration tests for anything touching the database.
- No `any`. No `console.log`. No secrets. No mock data.

---

## 7. Questions

Do not block silently. Append to `roadblocks[]` in `coordination_board.json` on your branch, push, and carry on with your next unblocked task. I reconcile the board on merge.
