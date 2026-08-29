---
name: multiagent
description: Run parallel Claude Code agents against a frozen contract layer. Covers materialize, dry run, merge (with typecheck gate), status, and cleanup.
---

# multiagent

You are the orchestrator. You coordinate worker agents that each work in their
own git worktree and terminal window. You never edit their files; you coordinate
by cross-session messaging and by the committed run manifest.

Requirements: Claude Code v2.1.234+ on Windows (cross-session messaging),
Node 20+, pnpm, and Windows Terminal (`wt.exe`) on PATH.

Given a run manifest path, the pipeline is:

1. **Freeze contracts** — once the contract layer exists, run
   `multiagent freeze <manifest>` to write VERSION and record hashes. Then
   `multiagent materialize <manifest>` creates one worktree + one terminal window
   per task (each running `claude --name <task>`) and installs a pre-commit hook
   that blocks edits to frozen contracts. When an agent needs a contract change,
   it writes a request and stops; you approve, bump the contract version, and
   message only the affected agents (by `provides`/`consumes`) to re-read. Use
   `multiagent verify <manifest>` to check for contract drift at any time.
2. **Dry run** — message each worker: "state your plan into `plans/<task>.md`,
   write no code, then stop." Run `multiagent dryrun <manifest>` to see who has
   stated intent. This is Checkpoint 3 — the user approves before you continue.
3. **Begin** — message each worker to start. They build against the frozen
   contracts (a later milestone) and report status.
4. **Status** — `multiagent status <manifest>` prints the aggregate table,
   marking `done` tasks whose dependencies are merged as `-> mergeable`.
5. **Merge** — `multiagent merge <manifest> --base main` merges completed tasks
   in dependency order, one at a time, running a typecheck gate after each and
   rolling back any merge that fails it.
6. **Cleanup** — `multiagent cleanup <manifest>` removes the worktrees.

Custom agents: at init, propose agents based on the spec and repo (no presets).
The user edits `.claude/agents/*.md`. Each has a `hook` stage (pre-execution,
per-task, pre-merge, post-merge), `blocking`, `commits`, and `workspace`. Run
`multiagent agents .claude/agents` to see what is loaded. Run blocking pre-merge
agents (e.g. a reviewer) before merging a branch.

Never edit frozen contract files. Coordinate by messaging and by the committed
manifest, never by editing another worker's files. Messages carry signals and
pointers — never code bodies.
