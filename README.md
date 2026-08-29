# multiagent

Run multiple Claude Code agents in parallel on one repository, with a **frozen
contract layer** that prevents semantic merge conflicts *before* any agent starts.

> Others detect conflicts after agents finish. `multiagent` prevents them by
> generating and freezing the shared interface layer before work begins.

Windows-first. Built as a Claude Code plugin.

---

## 1. The problem

Git worktrees stop *file* collisions but not *semantic* ones: two agents
independently inventing incompatible versions of a shared interface. Both
branches compile, both pass their own tests, and the **merge breaks** — or worse,
merges cleanly and is wrong.

This is measured, not hand-waved. The **AgenticFlict** dataset (arXiv 2604.03551,
ACM AIPS'26; 142K+ agent PRs across 59K+ repos) reports a **27.67% overall**
merge-conflict rate for AI-agent PRs — roughly 1.5–2× the 10–20% typical of human
PRs — with per-agent rates of Copilot 15.24%, Cursor 19.75%, Devin 22.85%,
**Claude Code 25.93%**, Codex 31.85%. Their detection method
(`git merge --no-commit --no-ff`) is exactly what `multiagent measure` uses. See
[§5 Measurements](#5-measurements) for a controlled with-vs-without experiment run
in this repo.

## 2. The claim

**Prevention at plan time beats detection at merge time.** Every existing
parallel-agent tool either isolates (worktrees), reviews overlaps, or resolves
conflicts *after* they occur. `multiagent` removes the agents' freedom to disagree
about the interface *before* they write a line:

1. Decompose the spec into tasks + a dependency graph.
2. Extract the interface that crosses each graph edge into a **contract** — real,
   typed declarations, no implementations.
3. **Freeze** the contracts (hash + VERSION). Every agent imports the same
   declarations and builds against them, in parallel.
4. Merge in dependency order behind a **typecheck gate**; re-hash contracts and
   roll back any branch that tampered with a frozen file.

Two agents may touch the same *file* — git's 3-way merge handles non-overlapping
edits — but only one may define any given contract symbol, and that symbol is
frozen. The semantic conflict has nowhere to form.

### The exact difference from every other tool

Almost every parallel-agent tool gives each agent an isolated git worktree. That
stops *file* collisions and nothing else — the agents are still free to invent
incompatible interfaces, and you find out at merge time. `multiagent` is the only
one that removes that freedom *first*, at the level of a typed, compilable interface:

| Tool / category | Isolation | Coordinates the shared interface? | When conflicts are handled |
|---|---|---|---|
| **Claude Squad, Conductor, Nimbalyst, Paseo, Emdash, Baton, Vibe Kanban** (worktree launchers) | git worktrees | **No** — agents each invent it | **After** — you resolve at merge |
| **Augment Intent** | git worktrees | Coordinates, but **verifies after** execution | After |
| **container-use** | containers | No | After |
| **wit** (closest prior art) | worktrees | Locks individual **functions** via Tree-sitter (syntactic) | Before, per-function |
| **`multiagent`** | git worktrees | **Freezes a typed interface/contract both sides compile against (semantic)** | **Before — the conflict cannot form** |

Concretely: run the same feature through Claude Squad (or any launcher) and through
`multiagent`, and you get the two rows of the experiment in §5 — **100% of parallel
changes conflict vs. 0%.** The launchers *are* the "without" condition; the contract
lock is the only thing that changes.

## 3. How the contract lock works

- **Freeze** — `multiagent freeze` writes `packages/contracts/VERSION` and records
  a SHA-256 of every contract file in the run manifest.
- **Hard enforcement (the real gate)** — at merge, contracts are re-hashed; any
  branch that changed a frozen file is rolled back (`git reset --hard HEAD~1`) and
  the run stops with a `contract violation`.
- **Fast feedback (a nudge, not a boundary)** — `materialize` installs a
  `pre-commit` hook that blocks commits staging contract files. It is bypassable
  (`git commit --no-verify`) by design; the merge-time re-hash is the guarantee.
- **Arbitration** — when an agent needs a contract change, it writes a request and
  stops. You approve, `bump` the contract version (re-hash), and only the affected
  agents (by `provides`/`consumes`) are told to re-read. The rest keep working.

## 4. Quickstart

**Requirements:** Node 20+, pnpm, Windows Terminal (`wt.exe`), and **Claude Code
v2.1.234+ on Windows** (for cross-session messaging, the coordination substrate).

```bash
git clone https://github.com/JainderBal/multiagent
cd multiagent
pnpm install
pnpm build   # produces dist/cli.js
npm link     # puts `multiagent` on PATH (npm's global bin is already on PATH;
             # `pnpm link --global` also works but needs `pnpm setup` first)
```

Install the plugin into Claude Code (so the `/multiagent` skill is available):

```
/plugin marketplace add JainderBal/multiagent
/plugin install multiagent
```

Then, from a repo you want to work on, the pipeline (each `->` is a checkpoint you
approve):

```
/multiagent <spec.md>
  init      build the run from a decomposition   -> approve tasks + graph
  freeze    hash + VERSION the contract layer     -> approve contracts
  materialize   one worktree + terminal per task, install the contract hook
  dryrun    each agent states intent, writes nothing  -> approve intent
  (begin)   agents build in parallel against frozen contracts
  merge     dependency-ordered, one at a time, typecheck gate + contract re-hash
  cleanup   remove worktrees; the run directory stays committed
```

The CLI commands (also usable directly):

| Command | Purpose |
|---|---|
| `multiagent init <decomposition.json> <runDir>` | build a cycle-checked run (manifest + task files) |
| `multiagent freeze <manifest>` | hash contracts, write VERSION |
| `multiagent materialize <manifest>` | worktrees + terminals + contract hook |
| `multiagent dryrun <manifest>` | report which agents have stated a plan |
| `multiagent status <manifest>` | status table, marks `-> mergeable` |
| `multiagent merge <manifest> --base main` | ordered merge with typecheck + contract gate |
| `multiagent verify <manifest>` | report contract drift |
| `multiagent agents <dir>` | list custom `.claude/agents/*.md` |
| `multiagent cleanup <manifest>` | remove worktrees |
| `multiagent measure <base> <branches...>` | conflict-rate experiment (see §5) |

## 5. Measurements

This is the strongest section — and it should hold **your** numbers, not borrowed
ones. `multiagent measure` reports, for a set of agent branches, how many conflict
when merged onto a base branch:

```bash
multiagent measure main agent/a agent/b agent/c
# agent/a   clean
# agent/b   text-conflict
# agent/c   clean
#
# 3 branches, 1 text-conflicts (33%)
```

### 5.1 The experiment

Take one feature spec, build it **twice** with independent Claude sub-agents — one
per module, none allowed to see the others' code (real divergence, not staged):

- **Without** the lock ("control") — each agent defines the shared types itself.
  *This is exactly what Claude Squad / Conductor / any worktree launcher gives you.*
- **With** the lock ("treatment") — a single frozen contract file is present; each
  agent imports it and may not modify it.

Then merge every agent's branch as a PR and count conflicts with
`git merge --no-commit --no-ff` (the same method AgenticFlict used), and separately
assemble all modules and run `tsc --noEmit` to catch *semantic* disagreements a
clean text-merge would hide. Harness: `scripts/exp/`; raw data:
`docs/experiments/data/results.csv`.

### 5.2 Results — 5 domains, ~60 independent agents

| Domain | Modules | Without the lock (= a worktree launcher) | With the lock (`multiagent`) |
|---|---|---|---|
| expense-tracker | 4 | 3/3 conflicts (100%), does **not** compile | 0/3 (0%), compiles |
| url-shortener | 5 | 4/4 (100%), does **not** compile (8 type errors) | 0/4 (0%), compiles |
| task-queue | 5 | 4/4 (100%), compiles* | 0/4 (0%), compiles |
| chat | 6 | 5/5 (100%), does **not** compile (6 errors) | 0/5 (0%), compiles |
| inventory | 6 | 5/5 (100%), does **not** compile (8 errors) | 0/5 (0%), compiles |
| **Total** | — | **21/21 conflicted (100%)**, 4/5 fail to compile | **0/21 (0%)**, **5/5 compile** |

\* task-queue's "without" run still conflicted 100%, but happened to compile after
picking one agent's types — those modules were loosely coupled to the shared type.

**Every single run:** without the lock, uncoordinated agents produced incompatible
interfaces — `description` vs `note`, `clicks` vs `clickCount`, `Date` vs epoch-number
vs ISO-string, free functions vs a class, sync vs async. With the lock, the conflict
had nowhere to form: **0 conflicts and a compiling, integrated system, every time.**

### 5.3 The tool can *generate* the contract, not just enforce it — PROVEN

The mechanism above assumes a good contract exists. So we tested whether the tool's
**conductor** step can write one from scratch: a conductor agent was given only a
new spec (a bank ledger) and wrote the frozen contract itself. It froze the exact
things agents diverge on — integer cents, ISO timestamps, a discriminated-union
transfer result, nullability — and proactively added an `ACCOUNT_NOT_FOUND` case.
Five independent agents then built against **that auto-generated contract**:
**0/4 conflicts, 0 type errors, a working integrated ledger.** (CSV row:
`ledger,treatment-autogen`.)

### 5.4 The CLI pipeline runs end-to-end — PROVEN

On a throwaway repo, the real commands chained:
`init` (scaffolds the run) → `freeze` (VERSION + hashes) → `status`
(`pricing -> mergeable`) → `merge` (`merged 2: pricing, api`, dependency-ordered,
typecheck-gated) → `verify` (`contracts OK`).

### 5.5 Where it does NOT help — an honest limitation

A sixth scenario forced five plugins that share a *frozen* contract to also append
to a **non-contract** shared barrel file (`registry.ts`). They still conflicted
**100%** on the barrel. The lock protects **only the surface you freeze**; genuinely
shared mutable files outside the contract collide exactly as they would without the
tool. (This is why the tool lets you freeze *any* file, not just types.)

### 5.6 What is still unproven

The **live coordination layer** — real terminal windows each running an interactive
`claude` session, coordinated by the `begin` / `dryrun` cross-session messages — has
not been demonstrated end-to-end; it needs a human-attended run with real windows.
Everything beneath it is proven (worktrees, terminal spawning, the contract hook,
merge, the CLI chain). Full methodology, prior-art survey, and threats to validity
(single model; the "without" 100% partly reflects agents each authoring the shared
file) are in
[`docs/experiments/2026-08-28-contract-lock-experiment.md`](docs/experiments/2026-08-28-contract-lock-experiment.md).

## 6. Honest limitations

- **Rigid contracts are expensive when the decomposition is wrong.** A bad split
  makes every boundary an arbitration round. This is a poor fit for exploratory
  work where the interface is still being discovered.
- **Single repo only.** No multi-repo support.
- **Windows-first.** macOS/Linux terminal spawning is not yet implemented behind
  the `Terminals` adapter.
- **Contract *generation* is LLM-driven.** It is demonstrated to work (§5.3), but
  quality tracks spec clarity — a vague spec yields a vague contract and the
  guarantee weakens.
- **The pre-commit hook is bypassable.** The merge-time re-hash is the real gate.
- **Cross-session messaging is version-gated** (Claude Code v2.1.234+ on Windows)
  and experimental; the committed manifest is the durable source of truth. The
  live end-to-end messaging handshake between terminal sessions is the one part not
  yet demonstrated (§5.6).

## 7. How coordination works (the architecture)

Worker agents are independent Claude Code sessions — one per task, each in its own
git worktree and its own terminal window, which you can watch and steer.

**Each terminal and session is named after its task.** `materialize` opens every
window with `wt.exe --title <task>` and launches `claude --name <task>`, so the
task name is both the window title *and* the Claude session's address. That naming
is what lets the orchestrator (and you) talk to a specific worker by name over
cross-session messaging — e.g. `SendMessage @notification-service "begin"` reaches
exactly the session working on `notification-service`. The names are derived from a
single source (the task name) and are identical across the branch (`agent/<task>`),
worktree (`../repo-<task>`), session, terminal title, task file, and status log.

The orchestrator coordinates the workers with Claude Code's **cross-session
messaging** (signals and pointers only — never code bodies), while a committed
`manifest.json` plus `status/` and `requests/` logs are the durable source of truth
and audit trail. The plugin splits into a deterministic **Node CLI** (worktrees,
terminals, hashing, merge, status — all unit-tested) and a **skill** that drives the
orchestrator Claude. See `docs/design/2026-08-28-multiagent-design.md`.

## 8. Credits & prior art

Read for inspiration and edge-case handling (no code copied; licenses apply
regardless):

- **Claude Squad** — tmux + worktrees TUI (launcher, no coordination layer).
- **Conductor**, **Nimbalyst** — worktree-per-agent runners / workspaces.
- **Augment Intent** — coordinator + specialist agents (verifies *after* execution).
- **container-use** — container isolation instead of worktrees.
- **wit** — the closest prior art: locks individual *functions* via Tree-sitter
  before agents write. `multiagent` differs by freezing a *typed interface/contract*
  both sides compile against (semantic), not per-function syntactic locks.

Coordination is built on Claude Code's own **agent teams** and **cross-session
messaging** features; `multiagent` adds the interface-level contract lock none of
the above have. Full survey: `docs/experiments/2026-08-28-contract-lock-experiment.md`.

## Development

```bash
pnpm test    # 58 tests: unit + real-git integration
pnpm build   # tsc -> dist/
```

Built in dependency order across 8 milestones (skeleton → merge ordering → dry run
→ contract lock → language adapter → agent config → decomposition → measurement).
Plans are under `docs/superpowers/plans/`; the design under `docs/design/`.

## License

MIT — see [LICENSE](LICENSE).
