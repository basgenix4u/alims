#!/usr/bin/env python3
"""Enforce agent file ownership declared in coordination_board.json.

Parallel agents were each editing coordination_board.json, which only
agent_5 owns, guaranteeing three-way merge conflicts. Convention did not
survive contact with concurrent work, so ownership is now a build gate.

Usage:
    python3 scripts/check_ownership.py <branch-name> <changed-file>...

The agent is derived from the branch name (`<type>/agent-<n>/<slug>`).
Exit 1 on violation, 0 when clean.
"""
from __future__ import annotations

import fnmatch
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOARD = ROOT / "coordination_board.json"

# Fallback if the board omits shared_paths. The board is authoritative.
FALLBACK_SHARED = [
    "pnpm-lock.yaml",
    "package.json",
    ".gitignore",
]

# Files only agent_5 may ever modify, regardless of owned_paths globs.
COORDINATOR_ONLY = [
    "coordination_board.json",
    "api_specification.md",
    "prisma/schema.prisma",
    ".github/workflows/*",
    "docs/ARCHITECTURE.md",
    "docs/TASKBOARD.md",
    "docs/AGENT_BRIEF.md",
]


def matches(path: str, patterns: list[str]) -> bool:
    for pat in patterns:
        # Treat "a/b/**" as covering everything beneath a/b
        if pat.endswith("/**"):
            if path.startswith(pat[:-3].rstrip("/") + "/"):
                return True
        if fnmatch.fnmatch(path, pat):
            return True
    return False


def content_matches_base(path: str, base_ref: str) -> bool:
    """True when the file's final content equals the base branch's.

    A path can appear in a PR diff yet end up byte-identical to base — for
    example a coordinator-owned file that was touched and then reverted, or
    a branch that simply predates a change which landed on base. Blaming the
    author for a no-op edit is noise, so treat it as unmodified.
    """
    if not base_ref:
        return False
    try:
        head = subprocess.run(["git", "hash-object", path], capture_output=True,
                              text=True, check=True).stdout.strip()
        base = subprocess.run(["git", "rev-parse", f"{base_ref}:{path}"],
                              capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False
    return bool(head) and head == base


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: check_ownership.py <branch> <file>...", file=sys.stderr)
        return 2

    branch, files = argv[1], [f for f in argv[2:] if f.strip()]
    base_ref = os.environ.get("OWNERSHIP_BASE_REF", "")
    if not files:
        print("No changed files to check.")
        return 0

    m = re.match(r"^(?:feat|fix|chore|docs|test|refactor|design)/agent-([1-6])/", branch)
    if not m:
        print(f"Branch '{branch}' does not encode an agent; skipping ownership check.")
        return 0

    agent = f"agent_{m.group(1)}"
    board = json.loads(BOARD.read_text(encoding="utf-8"))
    owners = {a["id"]: a.get("owned_paths", []) for a in board["agents"]}

    # Cross-cutting registration (a global guard, a Prisma module) cannot be
    # done from inside one agent's module tree. shared_paths keeps the gate
    # satisfiable; see ADR-009.
    shared = board.get("shared_paths", {}).get("paths", FALLBACK_SHARED)

    if agent not in owners:
        print(f"::error::Unknown agent '{agent}' in branch name.")
        return 1

    is_coordinator = agent == "agent_5"
    violations: list[tuple[str, str]] = []

    for f in files:
        if matches(f, shared):
            continue

        if matches(f, COORDINATOR_ONLY) and not is_coordinator:
            if content_matches_base(f, base_ref):
                # Appears in the diff but is byte-identical to base: the
                # author touched it and reverted, so there is nothing to
                # blame. Surfaced so a reviewer can still see it happened.
                print(f"  note: {f} appears in the diff but matches base — treated as unmodified")
                continue
            violations.append((f, "coordinator-owned file"))
            continue

        if is_coordinator:
            continue

        if matches(f, owners[agent]):
            continue

        if content_matches_base(f, base_ref):
            continue

        # Identify who does own it, to make the error actionable.
        claimed = [other for other, pats in owners.items() if other != agent and matches(f, pats)]
        reason = f"owned by {', '.join(claimed)}" if claimed else "outside your owned_paths"
        violations.append((f, reason))

    if violations:
        print(f"::error::{agent} modified {len(violations)} file(s) outside its lane.")
        print()
        for f, why in violations:
            print(f"  {f}")
            print(f"      -> {why}")
        print()
        print(f"{agent} owns:")
        for p in owners[agent]:
            print(f"  {p}")
        print()
        print("Revert those files, or raise a roadblock:")
        print("  create roadblocks/RB-<agent>-<slug>.md on your branch (all agents own roadblocks/**)")
        print("  or open a GitHub issue labelled 'roadblock'.")
        print("Never edit coordination_board.json. See docs/AGENT_BRIEF.md section 3.")
        return 1

    print(f"{agent}: all {len(files)} changed file(s) are within its owned_paths.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
