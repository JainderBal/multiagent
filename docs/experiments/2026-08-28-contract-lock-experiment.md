# Contract-Lock Experiment: with vs. without

**Date:** 2026-08-28
**Question:** Does freezing the shared interface (contract) before parallel agents
work reduce merge conflicts — textual *and* semantic — compared to letting agents
coordinate the interface themselves?

**Answer (this experiment):** Yes, decisively. Text-conflict rate went from
**100% (3/3) to 0% (0/3)**, and the integrated system went from **failing to
compile** to **compiling cleanly**.

---

## 1. Prior art surveyed

### Open-source parallel-agent orchestrators (2026)

Surveyed via the `awesome-agent-orchestrators` list and vendor comparisons. Of
~20 tools, **exactly one prevents conflicts before agents work**, and it does so
at a different granularity than `multiagent`:

| Tool | Approach | Prevents conflicts *before*? |
|---|---|---|
| **wit** | locks individual *functions* via Tree-sitter | Yes — but syntactic, function-level, not a typed interface |
| Claude Squad | tmux + worktrees TUI | No (isolate only) |
| Conductor / Nimbalyst (Crystal) | worktree-per-agent runners | No |
| Paseo (~11.4k★, AGPL) | multi-runtime worktree runner | No |
| Emdash, Baton, Vibe Kanban, Agent Kanban | worktree runners / kanban | No |
| Archon, Crewplane, LionClaw, omnigent | control planes / validation gates | No — gates/handoffs *after* |
| guild | shared memory over SQLite | No (coordination, not prevention) |
| skillfold | lockfile pins revisions | No (drift pinning, not interfaces) |
| Augment Intent | coordinator + specialists | No — verifies *after* execution |
| container-use | container isolation | No |

**Conclusion:** no tool freezes a *typed interface / contract* before agents
start. `wit`'s function-locking is the nearest neighbor; it is syntactic and
per-function, not a semantic interface both sides compile against. `multiagent`'s
approach is distinct.

### Published datasets on AI-agent merge conflicts

| Dataset / paper | Scale | Key numbers |
|---|---|---|
| **AgenticFlict** (arXiv 2604.03551, ACM AIPS'26; GitHub `unlv-evol/AgenticFlict`; Zenodo 19396917) | 142K+ agent PRs, 59K+ repos, 107K simulated | **27.67% overall** conflict rate; per-tool below |
| AI Agent PRs on GitHub (arXiv 2607.04697) | GitHub-wide | frequency/structure/conflict rates of agent PRs |
| (human baseline, prior studies) | — | typically **10–20%** |

**AgenticFlict per-agent conflict rates (Table 2), detection via
`git merge --no-commit --no-ff`:**

| Agent | PRs | Conflict rate |
|---|---|---|
| Copilot | 16,954 | 15.24% |
| Cursor | 7,196 | 19.75% |
| Devin | 8,241 | 22.85% |
| **Claude Code** | 779 | **25.93%** |
| OpenAI Codex | 73,856 | 31.85% |

Two things matter for us: (1) these are **real field numbers** — agent PRs
conflict ~1.5–2× more than human PRs; (2) AgenticFlict's detection method is
**exactly** the method our `multiagent measure` command uses, so our experiment is
methodologically comparable.

---

## 2. Experiment design

A realistic multi-module TypeScript system (an "Expense Tracker API") where four
tasks genuinely share interfaces:

- **validation** — validate an expense → result
- **storage** — add/get/list/remove expenses
- **reporting** — total per category + overall
- **api** — integrates the three; consumes what they provide

The shared surface (where semantic conflict lives): the `Expense` type, the
`Category` type, the validation-result type, and each module's function
signatures.

**Two conditions, each run by four *independent* Claude sub-agents** (one per
module, no visibility into the others — real divergence, not authored by us):

- **Control (no contract lock):** each agent is told to define the shared types
  itself in `src/shared.ts` and implement its module. No shared interface doc.
- **Treatment (contract lock):** a single frozen `src/shared.ts` contract is
  present; each agent imports from it, must not modify it, and implements only its
  module conforming to the contract's signatures.

**Measurement:**
1. **Text conflicts** — establish the integration base from the first agent, then
   merge each remaining agent's branch as a PR (`git merge --no-commit --no-ff`,
   via `multiagent measure`) and count conflicts. Directly comparable to
   AgenticFlict.
2. **Semantic conflicts** — assemble all modules against one `shared.ts` and run
   `tsc --noEmit`. Catches disagreements that a clean text-merge hides.

---

## 3. Results

### Text-conflict rate (`multiagent measure`)

| Condition | Branches merged as PRs | Text conflicts | Rate |
|---|---|---|---|
| **Control** (no lock) | storage, reporting, api | 3 | **100%** |
| **Treatment** (lock) | storage, reporting, api | 0 | **0%** |

Every control agent independently authored `src/shared.ts`; the three PRs after
the first all collided on it. With the contract frozen, no agent touched the
shared file, so all three merged clean.

### Semantic integration (`tsc --noEmit` on the assembled system)

| Condition | Compiles? | Detail |
|---|---|---|
| **Control** | **No** — 2 type errors | api assumed `ValidationResult.errors: string[]`; validation produced `ValidationError[]`. `Type 'string[]' is not assignable to type 'ValidationError[]'`. |
| **Treatment** | **Yes** — exit 0 | all four modules compiled and wired into a working system |

### Qualitative divergence in the control condition (from the agents' own reports)

Four uncoordinated agents, four different interfaces:

| Decision | validation | storage | reporting | api (assumed) |
|---|---|---|---|---|
| description field | `description` | `description` | **`note`** | `description` |
| validation result | `{valid:true} \| {valid:false; errors: ValidationError[]}` | — | — | `{valid: boolean; errors: string[]}` |
| storage shape | — | free functions `addExpense/…/deleteExpense` | — | **class** `ExpenseStore` with `add/get/list/delete` |
| reporting | — | — | `summarizeExpenses → {totalsByCategory, overallTotal}` | `buildCategoryReport → Record<Category, number>` |
| shared types file | own `shared.ts` | own `shared.ts` | own `shared.ts` | own `shared.ts` |

Both branches compiled *on their own*. The disagreement only surfaced at
integration — the exact failure mode `multiagent` targets.

---

## 4. Honest limitations

- **Small N.** One system, four modules, one model driving the sub-agents. This is
  a controlled demonstration of the mechanism, not a field study. It complements
  AgenticFlict's field numbers (25.93% for Claude Code in the wild); it does not
  replace them.
- **The treatment's 0% is partly structural** — a frozen file cannot be edited, so
  text conflicts on it are impossible by construction. That *is* the mechanism; the
  meaningful additional result is that the frozen contract also produced a
  **coherent, compiling, integrated system** (the `tsc` pass), which is not
  guaranteed by freezing alone.
- **The control's 100% reflects uncoordinated agents each authoring the shared
  file** — the realistic default when there is no contract mechanism, but the rate
  would fall if agents happened to partition files differently. The semantic result
  (does-not-compile) is the more robust finding.

## 5. Reproduce

The measurement half is fully deterministic and shipped:

```bash
multiagent measure <integration-base-branch> <branch1> <branch2> ...
```

The agent half used four independent sub-agents per condition with the prompts and
frozen contract recorded in this repo's git history for 2026-08-28. Worktrees were
throwaway.

---

## 6. Scaled campaign (2026-08-29)

To test generality and variance, the experiment was repeated across multiple
domains of varying size, each run by **independent sub-agents per module per
condition** (≈40 agents total for the completed scenarios), measured with the
same harness (`scripts/exp/`). Raw data: `docs/experiments/data/results.csv`.

| Scenario | Modules | PRs measured | Control text-conflicts | Control integrates | Treatment text-conflicts | Treatment integrates |
|---|---|---|---|---|---|---|
| expense-tracker | 4 | 3 | **3/3 (100%)** | no (2 errs) | 0/3 (0%) | yes |
| url-shortener | 5 | 4 | **4/4 (100%)** | no (8 errs) | 0/4 (0%) | yes |
| task-queue | 5 | 4 | **4/4 (100%)** | yes* | 0/4 (0%) | yes |
| chat | 6 | 5 | **5/5 (100%)** | no (6 errs) | 0/5 (0%) | yes |
| **Total** | — | **16** | **16/16 (100%)** | 1/4 integrate | **0/16 (0%)** | **4/4 integrate** |

\* task-queue control produced 100% text conflicts but *did* compile after
resolving the conflict by keeping one agent's types — its modules were loosely
coupled to the shared type's exact fields. This is honest variation the harness
captures, not a rigged outcome.

### Findings

1. **The text-conflict result is universal and stark: 100% (control) vs 0%
   (treatment), 16/16 vs 0/16, across four different domains and 4–6 modules.**
   This is the metric directly comparable to AgenticFlict's field method
   (`git merge --no-commit --no-ff`).
2. **Semantic integration:** without the lock, 3 of 4 systems failed to compile
   even after resolving text conflicts (independent agents disagreed on field
   names — `description`/`note`, `clicks`/`clickCount`, `userId`/`senderId` — on
   value shapes — `Date` vs epoch-number vs ISO-string — and on API style — free
   functions vs classes, sync vs async). With the lock, **all 4 compiled into
   working integrated systems.**
3. **This is the head-to-head with the open-source tools.** Claude Squad,
   Conductor, Nimbalyst and the other worktree launchers provide *exactly* the
   control condition — independent agents in isolated worktrees with no shared
   interface. The 100%→0% gap is the value the contract lock adds on top of
   isolation.

### Not yet run (session rate limit hit 2026-08-29, resets overnight)

- **inventory** (6 modules) — agents failed mid-run on an account session limit.
- **plugin-registry limitation test** — a deliberately adversarial scenario where
  every module must also append to a *non-contract* shared barrel file. Expected
  result: treatment still conflicts on the barrel (the lock only protects the
  frozen contract surface). This honest "where it does NOT help" case is set up
  (`scripts/exp` + scenario files) and pending the limit reset.

### Threats to validity

Single model driving the agents; controlled task specs; the control condition's
100% partly reflects agents each authoring the shared types file (the realistic
uncoordinated default). The robust, model-independent claim is the **direction and
consistency**: freezing the interface eliminated the interface conflict in every
trial, and produced compiling systems where the uncoordinated baseline usually did
not.
