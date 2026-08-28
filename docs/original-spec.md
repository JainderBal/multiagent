# lockstep — Build Specification

A Claude Code plugin for running multiple Claude Code agents in parallel on one
repository, with contract-locked interfaces to prevent semantic merge conflicts.

**Repo:** `lockstep`
**Plugin name:** `lockstep`
**Slash command:** `/lockstep <spec.md>`
**Marketplace:** `lockstep-marketplace` (or same repo, top level)

The name refers to moving in coordination, and to the contract lock that makes
it possible.

---

## 1. Thesis

Parallel AI coding agents fail at **coordination**, not capacity.

Git worktrees prevent *file* collisions. They do nothing about *semantic*
conflicts — two agents independently inventing incompatible versions of a shared
interface. Both branches compile. Both pass their own tests. The merge breaks.

Measured baseline (AgenticFlict dataset, arXiv 2604.03551): Claude Code PRs
conflict at ~25.9%, Copilot 15.2%, Cursor 19.8%, Devin 22.9%, Codex 31.9%.

Existing orchestrators (Augment Intent, Claude Squad, Conductor, Nimbalyst)
**detect** these problems after agents finish. This tool **prevents** them by
generating and freezing the shared interface layer before any agent starts.

**One line: Intent verifies after. This constrains before.**

---

## 2. Scope

### In scope
- Conductor agent (maps repo, decomposes spec, writes contracts, arbitrates, merges)
- Worker agents (one task each, isolated worktree)
- User-defined custom agents (no presets)
- Contract lock (generate, freeze, hash, hook-enforce, version, arbitrate)
- Dry run (agents state intent before writing)
- Dependency-ordered merging with typecheck gate
- Token/cost tracking per agent
- Plugin packaging and marketplace distribution

### Explicitly out of scope
- No TUI. Plain `console.log` output only.
- No web dashboard, no server, no database, no auth, no deployment.
- No cloud execution — requires a local filesystem and real terminals.
- No preset agent library.
- No multi-repo support.
- No automatic conflict resolution.
- No run replay.

---

## 3. Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (Node 20+) |
| CLI args | commander |
| Schema validation | zod |
| Git | execa (shelling out to `git`) |
| Frontmatter | gray-matter |
| Output | chalk, cli-table3 |
| Repo mapping | repomix (external dependency, do not reimplement) |
| Package manager | pnpm |

Target platform: **Windows first**, macOS/Linux second. Worktree paths, hook
execution, and terminal spawning all differ on Windows — do not assume POSIX.

---

## 4. Directory structure

### The plugin (this repo)

```
lockstep/
  .claude-plugin/
    plugin.json
  skills/
    lockstep/
      SKILL.md
  src/
    cli.ts
    commands/
      init.ts
      dryrun.ts
      begin.ts
      status.ts
      merge.ts
      cleanup.ts
    core/
      manifest.ts
      graph.ts
      worktree.ts
      contracts.ts
      terminals.ts
      status.ts
      cost.ts
      agents.ts
    templates/
      task.md
      pre-commit
  package.json
  tsconfig.json
  README.md
```

### What it creates in a target repo

```
<target-repo>/
  packages/contracts/          # frozen interface layer
    VERSION
    *.ts
  orchestrator/
    runs/
      2026-08-28-notifications/
        manifest.json          # canonical source of truth
        tasks/*.md             # generated view for agents
        requests/*.md          # contract change requests
        status/*.log           # append-only progress
  .vscode/tasks.json           # generated terminal definitions
```

Everything under `orchestrator/runs/` is **committed**. It is the audit trail.

---

## 5. Data models

### manifest.json

```ts
const Manifest = z.object({
  run: z.string(),                    // "2026-08-28-notifications"
  spec: z.string(),                   // path to source spec
  contractVersion: z.number().int(),  // starts at 1
  contractHashes: z.record(z.string()), // filepath -> sha256
  agents: z.array(AgentConfig),
  tasks: z.array(Task),
});

const Task = z.object({
  name: z.string(),                   // "notification-service"
  branch: z.string(),                 // "agent/notification-service"
  worktree: z.string(),               // "../repo-notification-service"
  terminalLabel: z.string(),          // matches .vscode/tasks.json
  dependsOn: z.array(z.string()),
  provides: z.array(z.string()),      // contract symbols it implements
  consumes: z.array(z.string()),      // contract symbols it uses
  status: z.enum(['pending','running','done','blocked','merged']),
  builtAtContractVersion: z.number().int().nullable(),
  tokensUsed: z.number().default(0),
});
```

Naming must be identical across task name, branch suffix, worktree suffix,
terminal label, task file, and status log. No exceptions.

### Agent config

Reuses Claude Code's `.claude/agents/<name>.md` format — frontmatter plus a
system prompt. Orchestrator adds four required wiring fields:

```yaml
---
name: reviewer
description: checks a branch against its task acceptance criteria
hook: pre-merge          # pre-execution | per-task | pre-merge | post-merge
blocking: true           # does failure stop the pipeline
commits: false           # does it produce code
workspace: read-only     # own | read-only
---
```

**No presets ship with the tool.** At init, the conductor *proposes* agents based
on what the spec and repo actually contain. The user edits, adds, or deletes.

---

## 6. Contract lock

The core mechanism. Everything else is plumbing.

### Generation
1. After decomposition, walk every edge in the dependency graph.
2. For each edge, determine what crosses it: what the dependent task calls,
   imports, or receives. Internal helpers never become contracts.
3. Emit **declarations only** into `packages/contracts/` — types, interfaces,
   enums, function signatures, error shapes. No implementations, no logic.
4. Record `provides` / `consumes` per task in the manifest.

Target size: under ~200 lines. If it exceeds that, the decomposition is too
fine-grained — return to checkpoint 1.

**Two failure modes to guard against:**
- *Under-specification*: declaring `send()` without its error shape or
  nullability. Agents still disagree, just later.
- *Over-specification*: anything not crossing a task boundary. Every extra line
  is a potential arbitration round.

### Freeze
- Commit to `contract/<feature>`, merge to main.
- Write `packages/contracts/VERSION` = 1.
- SHA-256 every contract file into `manifest.contractHashes`.
- Only now are worktrees created.

### Enforcement — two layers

**Hard (mechanical):** a `pre-commit` hook installed into each worktree's
`.git/hooks/`:

```sh
#!/bin/sh
if git diff --cached --name-only | grep -q '^packages/contracts/'; then
  echo "BLOCKED: contracts are frozen. File a change request instead."
  echo "  Write orchestrator/runs/<run>/requests/<task>.md and stop."
  exit 1
fi
```

Plus verification at merge time: re-hash contract files, block on mismatch.

**Soft (prompt):** scope language in every task file. This is an instruction and
can be talked past. Use hooks for anything that must hold; prompts for the rest.
Do not confuse the two.

### Arbitration flow
1. Agent needs a contract change. Hook blocks the commit.
2. Agent writes `requests/<task>.md` (what it needs, why), sets status
   `blocked`, stops.
3. Conductor surfaces the request. User approves or rejects.
4. On approval: conductor edits contracts, merges, bumps `VERSION`, re-hashes.
5. **Notify only affected agents** — those whose `consumes` or `provides`
   includes a changed symbol. Do not stop the whole run.
6. Affected agents re-read contracts and update `builtAtContractVersion`.
7. At merge, warn if `builtAtContractVersion < contractVersion`.

---

## 7. Commands

| Command | Behavior |
|---|---|
| `init <spec>` | map repo, decompose, propose agents, extract contracts, freeze, create worktrees, generate terminals |
| `dryrun` | signal all agents to state intent and wait |
| `begin` | broadcast go signal |
| `status` | print aggregate table from manifest + logs |
| `merge` | compute eligibility, merge one at a time with typecheck |
| `cleanup` | remove worktrees, delete merged branches |

### graph.ts — the only real algorithm

```ts
function getMergeable(tasks: Task[]): Task[] {
  return tasks.filter(t =>
    t.status === 'done' &&
    t.dependsOn.every(d =>
      tasks.find(x => x.name === d)?.status === 'merged'
    )
  );
}
```

Plus a cycle check on the graph at decomposition time. Reject cyclic
dependencies at checkpoint 1, not at merge time.

### Status output (no emoji)

```
merged    shared-types            12.4k tok
done      notification-service    31.1k tok   -> mergeable
running   api-routes              18.7k tok
blocked   ui-bell                  9.2k tok   request #2
pending   ui-preferences                      waits: api-routes
```

---

## 8. Git conventions

**Branches:** `agent/<task-name>`, `contract/<feature>`

**Per-worktree identity** (set during creation):
```sh
git config user.name  "orchestrator/<task-name>"
git config user.email "<task-name>@orchestrator.local"
```
Distinct author names in `git log`, `git blame`, `git shortlog`. Note: GitHub
resolves avatars from email, so all agents show the default silhouette. That is
expected and correct — do not fabricate identities that look human.

**Commit format:**
```
feat(notification-service): add retry with exponential backoff

Implements NotificationService.send per contracts/notifications.ts.
Retries 3x on transient failure, surfaces SendResult.failed otherwise.

Task: notification-service
Contract-version: 1
```

The trailers are machine-readable — `git log --grep` reconstructs a run.

**PR body** — generated from the task file plus status log: agent name, task
scope, contracts consumed, what was built, acceptance criteria checklist,
contract change requests, dependencies.

---

## 9. Pipeline

```
0.  /orchestrate <spec.md>            conductor session opens at repo root
1.  Map                               repomix over the repo
2.  Decompose                         write manifest.json, cycle-check the graph
    -> CHECKPOINT 1: user approves task list and dependency graph
3.  Propose agents                    conductor suggests; user edits/adds/deletes
4.  Extract contracts                 declarations only, per graph edge
    -> CHECKPOINT 2: user approves contract layer
5.  Freeze                            merge to main, VERSION=1, hash into manifest
6.  Materialize                       worktrees, task files, git identity,
                                      pre-commit hooks, .vscode/tasks.json
7.  Dry run                           each agent states its plan, writes nothing
    -> CHECKPOINT 3: user approves intent summaries
8.  Execute                           broadcast begin; agents work, log, report tokens
9.  Arbitrate (as needed)             blocked agent files request; user decides;
                                      contracts bump; only consumers notified
10. Merge                             eligibility from graph, one at a time,
                                      typecheck after each
11. Teardown                          remove worktrees, delete branches;
                                      run directory stays committed
```

Hard rule enforced at step 2: **no two tasks may touch the same file.** If they
would, merge them into one task.

---

## 10. Build order

Do not build in pipeline order. Build in dependency order:

1. **Skeleton** — worktrees, terminals, status, merge. Validate with three fake
   tasks: "create `hello-<name>.txt`, wait for begin, log done." No contracts,
   no decomposition. This surfaces Windows problems early.
2. **Merge ordering** — graph.ts, eligibility, typecheck gate.
3. **Dry run** — cheap, high value.
4. **Contract lock** — generation, freeze, hooks, versioning, arbitration.
5. **Agent config** — hook points, custom agent loading.
6. **Cost tracking** — token counts into the status table.
7. **Decomposition** — last, because its quality depends on everything above
   working. This is prompt engineering, not code: expect several iterations of
   run → observe a bad split → adjust the prompt.

Estimated: 60–70 hours including packaging and README.

---

## 11. Packaging and distribution

1. Structure as a plugin: `.claude-plugin/plugin.json`, `skills/orchestrate/SKILL.md`,
   `scripts/`. The manifest is optional — omitted, Claude Code auto-discovers
   components and derives the name from the directory.
2. Test locally: `claude --plugin-dir <path>`.
3. Marketplace: `.claude-plugin/marketplace.json` at the top level of the
   marketplace repo (separate file, separate folder from the plugin manifest).
   Push to GitHub. Others install via `/plugin marketplace add <repo>`.
4. Optional: run the community validator, then submit via the in-app form.

Reserved marketplace names (cannot be used): claude-code-marketplace,
claude-code-plugins, claude-plugins-official, claude-plugins-community,
anthropic-marketplace, anthropic-plugins, agent-skills, and others that
impersonate official sources.

---

## 12. README (treat as a real deliverable, budget one day)

1. The problem — semantic conflicts, with the AgenticFlict numbers
2. The claim — prevention at plan time beats detection at merge time
3. How contract lock works — freeze, hook, request flow
4. Quickstart — install, `/orchestrate spec.md`, what each checkpoint asks
5. **Measurements** — conflict counts on a real repo, with and without contract
   lock. Nobody in this category has published this. It is the strongest section.
6. Terminal recording of a full run (asciinema)
7. Honest limitations — rigid contracts are expensive when decomposition is
   wrong; poor fit for exploratory work; single-repo only
8. Credits — prior art read for inspiration (Claude Squad, Batty, container-use)

---

## 13. Prior art

| Tool | Approach | Gap |
|---|---|---|
| Augment Intent | coordinator/implementor/verifier, living specs, worktrees | verifies after execution; macOS-only; paid |
| Claude Squad | tmux + worktrees, Go TUI | launcher only; no coordination |
| Batty | persistent worktree per agent, merge serialization | no contract layer |
| container-use | container isolation instead of worktrees | heavier; same coordination gap |
| Conductor / Nimbalyst | desktop app, worktree per agent | launcher; macOS |

Read these for **edge case handling**: orphaned worktree cleanup, agent death
mid-task, port collisions between parallel dev servers. Do not copy code —
different languages, and licenses apply regardless of the project being open
source. Credit inspirations in the README.

---

## 14. Bootstrap note

This tool cannot build itself. For the first build, run the manual version:
`git worktree add` per task, open Claude Code in each, coordinate by hand.

That is the point. Building it manually is the experiment — log every semantic
conflict encountered. Those numbers go in README section 5.
