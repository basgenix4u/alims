# Contributing — Git-Ops Collaboration Protocol

ALIMS is built by six agents working asynchronously in isolated environments.
**`coordination_board.json` is the single source of orders. Read it at the start of every turn.**

## 1. Roles

| Agent | Role | Merge rights |
|---|---|---|
| agent_5 | Lead Architect · SRE · Coordinator | **Yes — sole authority** |
| agent_1 | Backend — Identity, Tenancy, Security | No |
| agent_2 | Backend — Records, Versions, Storage | No |
| agent_3 | Backend — Workflow, Verification, Discovery | No |
| agent_4 | Frontend — Web Application | No |
| agent_6 | UI/UX — Design System & Accessibility | No |

## 2. Branching

```
main   ← release-ready. Agent 5 only.
dev    ← integration. Agent 5 only.
<type>/agent-<n>/<slug>   ← your work. Target dev.
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `design`.

```bash
git fetch origin
git checkout -b feat/agent-2/record-versioning origin/dev
# ...work...
git add -A
git commit -m "feat(records): append-only version history [T-201]"
git fetch origin && git rebase origin/dev
git push -u origin feat/agent-2/record-versioning
```

## 3. Hard rules

1. Never commit directly to `main` or `dev`.
2. Never force-push a shared branch.
3. Never self-merge — even if permissions allow it.
4. Never edit files outside your `owned_paths`. Raise a roadblock instead.
5. Never commit secrets. `.env` is local; only `.env.example` is tracked.
6. Never implement an endpoint that is not in `api_specification.md`.
7. One PR per `task_id`; reference it in the title.

## 4. Commits — Conventional Commits

```
feat(records): add append-only version history [T-201]
fix(auth): prevent refresh token reuse across families [T-100]
test(rls): assert cross-tenant reads return zero rows [T-103]
```

## 5. Blocked?

Append to `roadblocks[]` in `coordination_board.json` **on your feature branch**, push, and continue with your next unblocked task. Agent 5 reconciles the board on merge.

## 6. Before you open a PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four must pass. CI enforces them; a red PR is not reviewed.
