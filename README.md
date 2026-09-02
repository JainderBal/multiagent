# multiagent

Run multiple Claude Code agents in parallel on one repository, coordinated by a
**frozen interface layer** that prevents semantic merge conflicts *before* any agent
starts.

> Others detect conflicts after agents finish. `multiagent` prevents them by
> generating and freezing the shared interface — the types both sides compile against —
> before work begins.

Windows-first. Shipped as a Claude Code plugin (`/multiagent`).

## Install

**Needs:** Windows · Claude Code v2.1.234+ · Node 20+ (22.6+ for `multiagent run`) ·
Windows Terminal · git.

Two parts — the **CLI** (so `multiagent` is on your PATH) and the **plugin** (the
`/multiagent` skill). Both are required; the skill calls the CLI.

```bash
# 1) the CLI
git clone https://github.com/JainderBal/multiagent
cd multiagent && pnpm install && pnpm build && npm link   # `multiagent` now on PATH
```

```text
# 2) the plugin — run these inside Claude Code, then restart Claude Code
/plugin marketplace add JainderBal/multiagent
/plugin install multiagent
```

Then, from a repo you want to build in, run `/multiagent <spec.md>` — see
[§4 Quickstart](#4-quickstart).

---

## 1. The problem

Git worktrees stop *file* collisions but not *semantic* ones: two agents
independently inventing incompatible versions of a shared interface. Both branches
compile, both pass their own tests, and the **merge breaks** — or worse, merges
cleanly and is wrong.

This is measured, not hand-waved. The **AgenticFlict** dataset (arXiv 2604.03551,
ACM AIPS'26; 142K+ agent PRs across 59K+ repos) reports a **27.67% overall**
merge-conflict rate for AI-agent PRs — with **Claude Code at 25.93%**, and larger PRs
worst of all. Independent write-ups agree the sharpest failures are (a) **semantic
interface divergence** in shared data models — the textbook case being *money*, where
one agent adds a `currency` argument and another doesn't — and (b) **shared
registries/config/catalogs** many features touch at once.

## 2. The claim

**Prevention at plan time beats detection at merge time.** `multiagent` removes the
agents' freedom to disagree about the interface *before* they write a line:

1. Decompose the spec into tasks + a dependency graph.
2. Extract the interface that crosses each graph edge into real, typed **declarations**
   (interfaces, types, signatures, error shapes) — no implementations.
3. **Freeze** the interface (hash + VERSION). Every agent imports the same declarations
   and builds against them, in parallel.
4. Merge in dependency order behind a **typecheck gate**; re-hash the interface and roll
   back any branch that tampered with a frozen file.

Two agents may touch the same *file* — git's 3-way merge handles non-overlapping edits —
but only one may define any given interface symbol, and that symbol is frozen. The
semantic conflict has nowhere to form.

### The difference from every other tool

| Tool / category | Isolation | Coordinates the shared interface? | When conflicts are handled |
|---|---|---|---|
| **Claude Squad, Conductor, Vibe Kanban, …** (worktree launchers) | git worktrees | **No** — agents each invent it | **After** — you resolve at merge |
| **Augment Intent** | git worktrees | Coordinates, but **verifies after** execution | After |
| **container-use** | containers | No | After |
| **wit** (closest prior art) | worktrees | Locks individual **functions** (Tree-sitter, syntactic) | Before, per-function |
| **`multiagent`** | git worktrees | **Freezes a typed interface both sides compile against (semantic)** | **Before — the conflict cannot form** |

## 3. How the interface lock works

- **Freeze** — `multiagent freeze` writes `packages/interfaces/VERSION` and records a
  SHA-256 of every interface file in the run manifest.
- **Hard enforcement (the real gate)** — at merge, interfaces are re-hashed; any branch
  that changed a frozen file is rolled back (`git reset --hard HEAD~1`) and the run stops
  with an `interface violation`.
- **Fast feedback (a nudge)** — `materialize` installs a `pre-commit` hook that blocks
  commits staging interface files. Bypassable by design; the merge-time re-hash is the
  guarantee.
- **Arbitration** — when an agent needs an interface change, it writes a request and
  stops. You approve, bump the interface version (re-hash), and only the affected agents
  (by `provides`/`consumes`) are told to re-read.

## 4. Quickstart

After [installing](#install), run `/multiagent <spec.md>` from the repo you want to work
on. You are the **engineer**; the orchestrator drives the pipeline and stops at three
checkpoints for you. Each `->` is a point you control:

```
/multiagent <spec.md>
  decompose   tasks + dependency graph            -> you approve
  freeze      generate + FREEZE the interface     -> you review it; ask for changes; approve
  materialize one worktree + terminal per task    (add --auto for hands-free workers)
  dryrun      detailed brief per worker; they state a plan  -> you approve
  begin       agents build in parallel against the frozen interface
  merge       YOU authorize each merge (deliberate: one branch at a time, or auto)
  run         wire a small entrypoint and start the app: multiagent run main.ts
  cleanup     remove worktrees; the run directory stays committed
```

**The orchestrator never merges on its own.** When branches are ready it asks
*deliberate or auto?* — in deliberate mode it names the next *eligible* branch
(dependencies already merged) and merges it only on your go-ahead, one at a time.

The CLI (also usable directly):

| Command | Purpose |
|---|---|
| `multiagent init <decomposition.json> <runDir>` | build a cycle-checked run (manifest + task files) |
| `multiagent freeze <manifest> [--interfaces <dir>]` | hash interfaces, write VERSION |
| `multiagent materialize <manifest> [--auto]` | worktrees + terminals + pre-commit hook (`--auto` = hands-free workers) |
| `multiagent dryrun <manifest>` | report which agents have stated a plan |
| `multiagent status <manifest>` | status table, marks `-> mergeable` |
| `multiagent done <manifest> <task>` | mark a task built + ready to merge |
| `multiagent merge <manifest> [--base <b>] [--one]` | gated merge in dependency order (`--one` = just the next eligible branch) |
| `multiagent verify <manifest> [--interfaces <dir>]` | report interface drift |
| `multiagent run <entrypoint> [args...]` | run the assembled app (a TS entrypoint via Node type-stripping) |
| `multiagent cleanup <manifest>` | remove worktrees |
| `multiagent measure <base> <branches...>` | conflict-rate experiment (see §5) |

## 5. Evidence

### 5.1 Controlled experiment — 5 domains, ~60 independent agents

One feature spec, built **twice** with independent Claude sub-agents (none allowed to
see the others' code): **without** the lock (each agent defines the shared types
itself — what a worktree launcher gives you) vs. **with** a single frozen interface.
Conflicts counted with `git merge --no-commit --no-ff` (the AgenticFlict method), plus a
`tsc --noEmit` over the assembled modules to catch semantic breaks a clean text-merge
hides.

| Domain | Modules | Without the lock | With the lock |
|---|---|---|---|
| expense-tracker | 4 | 3/3 conflicts, does **not** compile | 0/3, compiles |
| url-shortener | 5 | 4/4, does **not** compile (8 type errors) | 0/4, compiles |
| task-queue | 5 | 4/4, compiles* | 0/4, compiles |
| chat | 6 | 5/5, does **not** compile | 0/5, compiles |
| inventory | 6 | 5/5, does **not** compile | 0/5, compiles |
| **Total** | — | **21/21 conflicted (100%)**, 4/5 fail to compile | **0/21 (0%)**, **5/5 compile** |

Every uncoordinated run produced incompatible interfaces — `description` vs `note`,
`Date` vs epoch vs ISO string, free functions vs a class. With the lock: **0 conflicts
and a compiling, integrated system, every time.**

### 5.2 The tool can *generate* the interface, not just enforce it

A conductor agent was given only a spec (a bank ledger) and wrote the frozen interface
itself — integer cents, ISO timestamps, a discriminated-union transfer result,
nullability — and proactively added an `ACCOUNT_NOT_FOUND` case. Five agents built
against **that auto-generated interface**: **0/4 conflicts, 0 type errors, a working
ledger.**

### 5.3 The live coordination layer works end-to-end — now demonstrated

Earlier this was the one unproven part. It has now been run, human-attended, twice:

- **To-do app (3 modules).** `/multiagent` froze a `Todo` / `TodoStore` / `TodoApi`
  interface; three worker windows built the store, the service (dependency-injected),
  and the view, coordinated purely by cross-session messages; merged in order through
  the gate; **the app ran** (add / toggle / delete / clear all correct).
- **E-commerce checkout (6 modules) — the hard case from the research.** A frozen
  interface over money (integer cents), an 8% rounded tax, stock invariants, and an
  order state machine. Six independent agents built catalog, inventory, cart, pricing,
  orders, and the view; merged **one branch at a time** through the typecheck gate; the
  running shop priced a cart to the exact cent (2×$12.99 + $25.00 → **$55.06**),
  moved an order `pending → paid`, and **rejected an over-stock checkout** with
  reservation rollback. Zero interface conflicts across all six.

### 5.4 Where it does NOT help — an honest limit

Five plugins sharing a *frozen* interface but also appending to a **non-interface**
shared barrel file still conflicted **100%** on the barrel. The lock protects **only the
surface you freeze**; genuinely shared mutable files outside it collide as they would
without the tool. (This is why you can freeze *any* file, not just types.)

## 6. Honest limitations

- **Rigid interfaces are expensive when the decomposition is wrong.** A bad split makes
  every boundary an arbitration round. Poor fit for exploratory work where the interface
  is still being discovered.
- **Windows-first.** macOS/Linux terminal spawning isn't implemented yet (it sits behind
  the `Terminals` adapter).
- **Interface *generation* is LLM-driven.** Demonstrated to work (§5.2), but quality
  tracks spec clarity.
- **`--auto` runs workers with permission prompts bypassed** — convenient and hands-free,
  but it lets an agent act without asking; use it deliberately.
- **The pre-commit hook is bypassable.** The merge-time re-hash is the real gate.
- **Wiring the app is the engineer's step.** The tool produces modules; you write a
  small entrypoint that injects the dependencies (the frozen interface makes it a few
  lines), then `multiagent run main.ts` starts it. Its imports need explicit `.ts`
  extensions, and `run` needs Node 22.6+ (native type stripping).

## 7. Architecture

Worker agents are independent Claude Code sessions — one per task, each in its own git
worktree and its own terminal window you can watch and steer. **Each terminal and
session is named after its task** (`wt.exe --title <task>` + `claude --name <task>`), so
the orchestrator addresses a specific worker by name over cross-session messaging.

The plugin splits into a deterministic **Node CLI** (worktrees, terminals, hashing,
merge, status — all unit-tested, 63 tests) and a **skill** (`skills/multiagent/SKILL.md`)
that drives the orchestrator Claude: it decomposes, generates and freezes the interface,
briefs each worker **in detail** (exact types, every `provides`/`consumes` symbol by
name, error cases), and coordinates via `SendMessage`. Human checkpoints gate
decomposition, the frozen interface, and the dry-run plans; **you** authorize every
merge. A committed `manifest.json` plus `status/` and `requests/` logs are the durable
source of truth.

> Design notes and the original experiment write-ups are under `docs/` — those predate
> this rename and use the earlier term "contract" for the same frozen-interface concept.

## 8. Credits & prior art

Claude Squad (tmux + worktrees TUI), Conductor / Vibe Kanban (worktree runners),
Augment Intent (coordinator that verifies *after*), container-use (containers), and
**wit** — the closest prior art, which locks individual *functions* via Tree-sitter.
`multiagent` differs by freezing a *typed interface* both sides compile against
(semantic), not per-function syntactic locks. Coordination is built on Claude Code's own
cross-session messaging.

## Development

```bash
pnpm test    # 63 tests: unit + real-git integration
pnpm build   # tsc -> dist/
```

## License

MIT — see [LICENSE](LICENSE).
