---
name: multiagent
description: Run parallel Claude Code agents against a frozen contract layer. Milestone 1 covers materialize/status/cleanup only.
---

# multiagent (Milestone 1)

You are the orchestrator. Milestone 1 exercises the mechanical skeleton only —
no decomposition or contracts yet.

Requirements: Claude Code v2.1.234+ on Windows (for later cross-session
messaging), Node 20+, pnpm, and Windows Terminal (`wt.exe`) on PATH.

Given a manifest path:
1. Run `multiagent materialize <manifest>` — creates one worktree + one terminal
   window per task, each running `claude --name <task>`.
2. Each worker session is instructed (by its task, in a later milestone) to wait
   for a `begin` message before writing. For now, message each worker yourself.
3. Run `multiagent status <manifest>` to see the table.
4. Run `multiagent cleanup <manifest>` to remove worktrees.

Never edit frozen contract files (introduced in a later milestone). Coordinate
by messaging and by the committed manifest, never by editing another worker's files.
