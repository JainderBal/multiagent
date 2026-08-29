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

**The experiment (2026-08-28):** a 4-module TypeScript system (validation, storage,
reporting, api) built two ways by **four independent Claude sub-agents per
condition** — control (each invents the shared interface) vs. treatment (a frozen
contract they import). Full methodology and prior-art survey in
[`docs/experiments/2026-08-28-contract-lock-experiment.md`](docs/experiments/2026-08-28-contract-lock-experiment.md).

Scaled across **five domains** (expense tracker, URL shortener, task queue, chat,
inventory; 4–6 modules each), each built by **independent sub-agents per module per
condition** (~60 agents), measured with the shipped harness (`scripts/exp/`, data
in `docs/experiments/data/results.csv`):

| Condition | Text-conflict rate (`multiagent measure`) | Integrated `tsc --noEmit` |
|---|---|---|
| **Without** contract lock | **100%** — 21/21 PRs conflicted across all 5 domains | **fails in 4/5** (agents disagreed on field names, value shapes, sync/async, class vs functions) |
| **With** contract lock | **0%** — 0/21 | **passes in 5/5** — working integrated systems |

**This is the head-to-head with the open-source tools:** Claude Squad, Conductor,
Nimbalyst and the other worktree launchers provide *exactly* the "without" row —
independent agents in isolated worktrees, no shared interface. The 100%→0% gap is
what the contract lock adds on top of isolation.

**Where it does NOT help (an honest limitation test):** a sixth scenario forced
five plugins that share a *frozen* contract to also edit a *non-contract* shared
barrel file. They still conflicted **100%** on the barrel — the lock only protects
the surface you freeze; genuinely shared mutable files outside the contract still
collide. Full analysis, prior-art survey, and threats to validity (single model;
the "without" 100% partly reflects agents each authoring the shared file) in
[`docs/experiments/2026-08-28-contract-lock-experiment.md`](docs/experiments/2026-08-28-contract-lock-experiment.md).

## 6. Honest limitations

- **Rigid contracts are expensive when the decomposition is wrong.** A bad split
  makes every boundary an arbitration round. This is a poor fit for exploratory
  work where the interface is still being discovered.
- **Single repo only.** No multi-repo support.
- **Windows-first.** macOS/Linux terminal spawning is not yet implemented behind
  the `Terminals` adapter.
- **Contract *generation* is LLM-driven** and is the fuzziest step; the tool
  freezes and enforces contracts, but proposing good ones is prompt engineering.
- **The pre-commit hook is bypassable.** The merge-time re-hash is the real gate.
- **Cross-session messaging is version-gated** (Claude Code v2.1.234+ on Windows)
  and experimental; the committed manifest is the durable source of truth.

## 7. How coordination works (the architecture)

Worker agents are independent Claude Code sessions — one per task, each in its own
git worktree and its own terminal window, which you can watch and steer. The
orchestrator coordinates them with Claude Code's **cross-session messaging**
(signals and pointers only — never code bodies), while a committed `manifest.json`
plus `status/` and `requests/` logs are the durable source of truth and audit
trail. The plugin splits into a deterministic **Node CLI** (worktrees, terminals,
hashing, merge, status — all unit-tested) and a **skill** that drives the
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
