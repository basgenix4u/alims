#!/usr/bin/env python3
"""Validate coordination_board.json structure and referential integrity.

Run locally before pushing:  python3 scripts/validate_board.py
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

BOARD = Path(__file__).resolve().parent.parent / "coordination_board.json"
VALID_TASK_STATUS = {"pending", "in_progress", "blocked", "in_review", "completed", "cancelled"}
VALID_PRIORITY = {"P0", "P1", "P2", "P3"}
VALID_MILESTONE_STATUS = {"pending", "in_progress", "completed", "blocked"}

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def main() -> int:
    try:
        board = json.loads(BOARD.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"FATAL: coordination_board.json is not valid JSON: {exc}")
        return 1

    for key in ("board_version", "project", "meta", "protocol",
                "milestones", "agents", "tasks", "roadblocks"):
        if key not in board:
            err(f"missing top-level key: {key}")
    if errors:
        _report()
        return 1

    agent_ids = {a["id"] for a in board["agents"]}
    milestone_ids = {m["id"] for m in board["milestones"]}
    task_ids = [t["id"] for t in board["tasks"]]

    if len(task_ids) != len(set(task_ids)):
        dupes = {t for t in task_ids if task_ids.count(t) > 1}
        err(f"duplicate task ids: {sorted(dupes)}")

    for m in board["milestones"]:
        if m["status"] not in VALID_MILESTONE_STATUS:
            err(f"{m['id']}: invalid milestone status '{m['status']}'")
        if m["owner"] not in agent_ids:
            err(f"{m['id']}: unknown owner '{m['owner']}'")

    in_progress: list[str] = []
    for t in board["tasks"]:
        tid = t["id"]
        if t["status"] not in VALID_TASK_STATUS:
            err(f"{tid}: invalid status '{t['status']}'")
        if t["priority"] not in VALID_PRIORITY:
            err(f"{tid}: invalid priority '{t['priority']}'")
        if t["assignee"] not in agent_ids:
            err(f"{tid}: unknown assignee '{t['assignee']}'")
        if t["milestone"] not in milestone_ids:
            err(f"{tid}: unknown milestone '{t['milestone']}'")
        for dep in t.get("depends_on", []):
            if dep not in task_ids:
                err(f"{tid}: depends on unknown task '{dep}'")
        if not t.get("acceptance"):
            warn(f"{tid}: no acceptance criteria defined")
        if t["status"] == "in_progress":
            in_progress.append(tid)

    # Protocol rule: at most one in-progress task PER AGENT.
    by_agent: dict[str, list[str]] = {}
    for t in board["tasks"]:
        if t["status"] == "in_progress":
            by_agent.setdefault(t["assignee"], []).append(t["id"])
    for agent, tids in by_agent.items():
        if len(tids) > 1:
            err(f"{agent} has {len(tids)} tasks in_progress ({tids}); protocol allows one")

    # Cycle detection in the dependency graph
    graph = {t["id"]: t.get("depends_on", []) for t in board["tasks"]}
    state: dict[str, int] = {}

    def visit(node: str, stack: list[str]) -> None:
        if state.get(node) == 2:
            return
        if state.get(node) == 1:
            err(f"dependency cycle: {' -> '.join(stack + [node])}")
            return
        state[node] = 1
        for nxt in graph.get(node, []):
            visit(nxt, stack + [node])
        state[node] = 2

    for node in graph:
        visit(node, [])

    # A task cannot be unblocked while its dependencies are incomplete
    status_by_id = {t["id"]: t["status"] for t in board["tasks"]}
    for t in board["tasks"]:
        if t["status"] in {"in_progress", "in_review"}:
            for dep in t.get("depends_on", []):
                if status_by_id.get(dep) != "completed":
                    warn(f"{t['id']} is {t['status']} but dependency {dep} is {status_by_id.get(dep)}")

    for a in board["agents"]:
        if not a.get("owned_paths"):
            err(f"{a['id']}: no owned_paths declared — file ownership must be explicit")

    _report()
    return 1 if errors else 0


def _report() -> None:
    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    if not errors:
        print(f"coordination_board.json OK ({len(warnings)} warning(s))")


if __name__ == "__main__":
    sys.exit(main())
