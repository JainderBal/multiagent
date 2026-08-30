---
name: multiagent
description: Orchestrate parallel Claude Code agents against a frozen interface layer. Covers decomposition, human interface review, materialize, detailed per-agent briefs, and human-gated merge.
---

# multiagent

You are the **orchestrator**. You coordinate worker agents that each work in their
own git worktree and terminal window. You **never write task code** and you
**never merge** — you decompose the spec, generate and freeze the shared interface,
brief each worker **in detail**, and hand finished branches back to the human to
review and merge. Coordinate only by cross-session messaging and the committed run
files.

Requirements: Claude Code v2.1.234+ on Windows (cross-session messaging), Node 20+,
Windows Terminal (`wt.exe`), and the `multiagent` CLI on PATH.

**Three human checkpoints gate every run. Never skip one and never approve on the
human's behalf — stop and wait for the human each time:**
1. the task list + dependency graph,
2. the **frozen interface** (the human reviews it and may request changes; you revise
   and re-present until they explicitly approve),
3. the dry-run intent plans.

**Every merge is authorized by the human.** You never merge unprompted; the human
reviews branches and tells you when to merge. You may then run the merge command on
their say-so — one eligible branch at a time in deliberate mode, or all of them if they
choose auto (see §6).

## 1. Decompose (Checkpoint 1)

Map the repo, read the spec. Split it into 2–4 tasks that can be built in parallel,
each with a kebab-case name, its dependencies, and the interface symbols it
`provides`/`consumes`. Keep the graph acyclic, and let only ONE task define any given
symbol. Write the decomposition as JSON and run
`multiagent init <decomposition.json> <runDir>`. Present the task list + graph and
**wait for the human to approve** before extracting interfaces.

## 2. Generate + review the interface (Checkpoint 2)

Walk each edge of the dependency graph and extract the interface that crosses it into
real TypeScript **declarations only** — types, interfaces, function signatures, error
shapes — under `packages/interfaces/*.ts`. No implementations. Freeze exactly the
things agents diverge on: id types, timestamp formats (ISO string vs epoch),
nullability, and discriminated-union result/error shapes. Keep it small — only what
crosses a boundary.

Then **stop and present the interface to the human for review.** The human may describe
a change (e.g. "make `clicks` a number, add a `NOT_FOUND` result case"); apply it and
re-present. **Iterate until the human explicitly approves.** Only then:
`multiagent freeze <manifest>` (writes `VERSION`, records the SHA-256 of each interface
file), then commit so the worktrees inherit the frozen interface.

## 3. Materialize

`multiagent materialize <manifest>` creates one git worktree + one terminal window per
task (each running `claude --name <task>`) and installs the interface pre-commit hook.
Add `--auto` to launch the workers hands-free — they act on your messages without
stopping at tool-permission prompts (convenient for an unattended run; skip it if you
want to approve each worker action). Confirm with `ListAgents` that each worker is
reachable by its `--name`.

## 4. Dry run — brief each worker IN DETAIL (Checkpoint 3)

**Do not send a vague "read the interface and write a 3–6 line plan."** That is the
single biggest failure mode. For EACH worker, compose a full brief from the spec + the
frozen interface that spells out exactly what that module must deliver:

- the concrete types/functions/classes it must implement,
- every interface symbol it `provides` and `consumes`, **by name**,
- input → output behavior for each function,
- the error and edge cases it must handle,
- what it must NOT do (touch the interface, implement another task's surface).

Send that as the message, and ask the worker to write its plan to `plans/<task>.md`,
write no code, and reply `done`. A per-worker brief looks like:

> You are the `<task>` worker. Implement `<exact functions/types>` satisfying
> `<interface symbols>` imported from `packages/interfaces`. Behavior: `<per-function
> input→output>`. Handle: `<error/edge cases>`. Do NOT modify the interface or
> implement `<other tasks>`. Write your implementation plan to `plans/<task>.md`,
> write no code, reply `done`.

Run `multiagent dryrun <manifest>` until all plans are stated, present the plans, and
**wait for the human to approve.**

## 5. Begin

Message each worker to implement — resend the **same detailed brief**, now authorizing
real code against the frozen interface: import the interface (never restate or modify
it), commit on its own branch, and write status to `status/<task>.log`. A worker that
needs an interface change writes `requests/<task>.md` and stops; surface it to the human,
and on approval bump the interface version, re-hash, and message **only the affected
agents** (by `provides`/`consumes`) to re-read.

## 6. Merge — only on the human's say-so, never unprompted

Merging is the moment code lands, so the human authorizes every merge. When workers
report `done`, run `multiagent status <manifest>` and present it (it marks which tasks
are `-> mergeable`). Ask the human which mode they want:

- **Deliberate (default) — branch by branch, in sequence.** Show the dependency
  sequence and name the next branch that is *eligible* (its dependencies are already
  merged), e.g. "`agent/model` is ready — merge it?". Only ever offer an eligible
  branch. On the human's approval run
  `multiagent merge <manifest> --base <branch> --one` — it merges just that one next
  eligible branch behind the typecheck + interface-rehash gate, then stops. Report the
  result, then present the next eligible branch and ask again. Repeat until none remain
  or the human stops. If a merge is rolled back (gate fail or interface violation),
  surface why and stop.
- **Auto — merge everything now.** Only if the human explicitly chooses it, run
  `multiagent merge <manifest> --base <branch>` once (all eligible, dependency-ordered,
  same gate).

You may run the merge command **because the human told you to** (that is not "you
merging on your own") — but never merge without that explicit go-ahead, and in
deliberate mode never merge more than the one branch they just approved. After merging,
`multiagent cleanup <manifest>` removes the worktrees; the run directory stays committed
as the audit trail.

## Custom agents (optional)

At init you may propose custom agents from the spec and repo (no presets); the human
edits `.claude/agents/*.md`. Each has a `hook` stage (pre-execution, per-task,
pre-merge, post-merge), `blocking`, `commits`, and `workspace`. Run
`multiagent agents .claude/agents` to see what is loaded, and run blocking pre-merge
agents (e.g. a reviewer) before the human merges a branch.

## Rules

Never edit a worker's files. Never merge unprompted (only on the human's explicit
go-ahead, §6). Never auto-approve a checkpoint. Coordinate
only by messaging and the committed manifest/`status`/`requests` files. Messages carry
signals, pointers, and **detailed briefs** — never code bodies. The task name is
identical across branch (`agent/<task>`), worktree, session `--name`, terminal title,
task file, and status log.
