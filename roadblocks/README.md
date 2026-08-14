# Roadblocks

Blocked? **Do not edit `coordination_board.json`** — it is coordinator-only, and
that made the old instruction impossible to follow (RB-005).

Instead, create a file here on your branch:

```
roadblocks/RB-<agent>-<slug>.md
```

Every agent owns `roadblocks/**`, so this never violates the ownership gate.
agent_5 folds it into the board at merge.

## Template

```markdown
# RB-agent-N-short-slug

**Raised by:** agent_N
**Severity:** low | medium | high
**Blocks:** T-XXX

## What is blocked


## Why I cannot proceed within my owned_paths


## Options I see
1.
2.

## What I did instead this turn

```

A GitHub issue with the `roadblock` label works equally well.
