# multiagent — System Design

**Status:** Draft for review
**Date:** 2026-08-28
**Supersedes:** the coordination model in `ORCHESTRATOR-SPEC.md` (kept in `docs/original-spec.md` as the origin vision)

A Claude Code plugin for running multiple Claude Code agents in parallel on one
repository, with a **frozen contract layer** that prevents semantic merge
conflicts before any agent starts.

---

## 1. Thesis (unchanged from the original spec)

Parallel AI coding agents fail at **coordination**, not capacity. Git worktrees
prevent *file* collisions but do nothing about *semantic* conflicts — two agents
independently inventing incompatible versions of a shared interface. Both
branches compile, both pass their own tests, the merge breaks.

Existing tools **detect** this after agents finish. `multiagent` **prevents** it
by generating and freezing the shared interface layer before any agent starts.

> One line: others verify after. This constrains before.

The numeric baselines cited in the original spec (AgenticFlict dataset, per-tool
conflict rates) are **unverified** and must be confirmed against primary sources
before they appear in the README. Treat them as claims-to-check, not facts.

---

## 2. What changed from the original spec, and why

The original spec left the single most important mechanism — **how the conductor
and workers actually communicate** — undefined. Its language ("broadcast begin,"
"signal all agents," "agents wait") assumes persistent listening agents. A Claude
Code session is not a daemon; it runs, works, and exits. It does not idle-poll a
file for permission. Research into how Claude Code actually runs multiple agents
resolved this and reshaped several decisions.

| # | Original spec | This design | Reason |
|---|---|---|---|
| 1 | Undefined IPC ("broadcast/signal/wait") | **Cross-session messaging** (native Claude Code feature) + committed filesystem manifest | Sessions don't idle-poll; native messaging delivers agent-to-agent messages by name, across separate terminals, on Windows (v2.1.234+) |
| 2 | Terminals via `.vscode/tasks.json` | **One separate OS terminal window per worktree** (`wt.exe`/`start`), each an interactive `claude --name <task>` session | User wants to watch/steer each agent in its own window; native "agent teams" can't do separate windows on Windows |
| 3 | Hard rule: "no two tasks may touch the same file" | **Softened**: freeze only the *contract* files (hook-enforced); let git 3-way-merge non-overlapping edits; gate merges on a typecheck/compile pass | Banning shared files throws away git's real strength and collapses parallelism; the actual danger is semantic, which the contract lock already covers |
| 4 | Pre-commit hook = "hard (mechanical)" enforcement | Reframed: **merge-time re-hash is the real gate**; pre-commit hook is fast feedback only | `git commit --no-verify` bypasses hooks; hooks are not a boundary against an agent that runs git |
| 5 | TypeScript assumed throughout | **Language-agnostic core** with a pluggable `LanguageAdapter`; ship the TypeScript adapter first | Target repos aren't only TS; keep TS assumptions out of the core |
| 6 | `tokensUsed` per task in the status table | **Dropped from v1** | Claude Code doesn't expose reliable per-session token counts to an external tool; not worth fragile parsing for v1 |
| 7 | Names `orchestrator` / `lockstep` / `orchestrate` used inconsistently | Project is **`multiagent`**; slash command `/multiagent` | Single consistent name |

Everything else the original spec got right is retained: per-worktree isolation
and git identity, contract lock (freeze/hash/enforce/arbitrate), dependency-ordered
merging with a typecheck gate, dry-run-before-write, the committed run directory
as an audit trail, custom (no-preset) agents, and "build in dependency order, not
pipeline order."

---

## 3. Coordination model (the core architectural decision)

**Independent sessions, coordinated by messaging + filesystem — never idle-polling.**

- **Orchestrator**: the `/multiagent` command running in the user's main terminal.
  It maps, decomposes, freezes contracts, materializes worktrees, opens worker
  terminals, and drives the pipeline. It is the only session the user talks to
  for control.
- **Workers**: one interactive `claude --name <task>` session per task, each in
  its **own git worktree** and its **own OS terminal window**. The user can watch
  and steer any of them directly.
- **Control plane = cross-session messaging.** The orchestrator addresses each
  worker by its `--name` and sends `dryrun` / `begin` / `contract bumped to vN,
  re-read` via `SendMessage`. Workers message back `done` / `blocked` / a
  change-request pointer. Messages are **signals and pointers, never code bodies**
  (see §6). This is available on native Windows in Claude Code v2.1.234+; the tool
  checks the version at `init` and refuses with a clear message if too old.
- **Source of truth = the committed filesystem manifest.** Messages are ephemeral;
  `manifest.json` + `status/*.log` + `requests/*.md` are durable, committed, and
  the audit trail. Any state the pipeline depends on lives here, not in a message.
  A worker that missed a message can always reconstruct state from disk.

**Why not native "agent teams"?** They exist and provide a mailbox + shared task
list, but on Windows they run only *in-process* (all teammates inside one
terminal; separate windows need tmux/iTerm2, unsupported on Windows Terminal / VS
Code), they're experimental, and they can't be resumed. Separate managed windows —
the stated requirement — point to independent sessions + cross-session messaging
instead. The coordination layer is nonetheless kept behind an interface (§4,
`Coordinator`) so a teams-based backend could be added later without touching the
rest.

---

## 4. Components

Core is language- and transport-agnostic. Concrete choices (TypeScript, Windows
Terminal, cross-session messaging) live behind interfaces.

```
multiagent/
  .claude-plugin/plugin.json
  skills/multiagent/SKILL.md          # what the /multiagent conductor does
  src/
    cli.ts                            # commander entry
    commands/                         # init, dryrun, begin, status, merge, cleanup
    core/
      manifest.ts                     # read/write/validate manifest.json (zod)
      graph.ts                        # cycle check + merge eligibility (the one real algorithm)
      worktree.ts                     # create/remove worktrees, per-worktree git identity
      contracts.ts                    # freeze, hash, verify, arbitrate (adapter-driven)
      status.ts                       # aggregate manifest + logs into the table
      agents.ts                       # load custom .claude/agents/*.md, wiring fields
    adapters/
      coordinator.ts                  # interface: send/recv between sessions
      coordinator-xsession.ts         # cross-session-messaging implementation
      terminals.ts                    # interface: open a titled terminal running a command
      terminals-windows.ts            # wt.exe / start implementation
      language.ts                     # LanguageAdapter interface
      language-typescript.ts          # tsc gate + .ts declaration contracts
    templates/task.md, pre-commit
  package.json, tsconfig.json, README.md
```

### Key interfaces

```ts
// Coordination transport — cross-session messaging today, teams later.
interface Coordinator {
  send(sessionName: string, message: string): Promise<void>;
  // Inbound is filesystem-driven: workers write status/requests; the
  // orchestrator reads them. Messaging is the nudge; disk is the truth.
}

// One terminal window per worker.
interface Terminals {
  open(opts: { title: string; cwd: string; command: string }): Promise<void>;
}

// Everything language-specific lives here. Core imports none of it directly.
interface LanguageAdapter {
  id: string;                                   // "typescript"
  detect(repoRoot: string): Promise<boolean>;
  contractDir: string;                          // e.g. "packages/contracts"
  contractGlobs: string[];                      // files treated as frozen
  proposeContracts(input: DecompositionInput): Promise<ContractFile[]>; // declarations only
  gate(worktree: string): Promise<{ ok: boolean; output: string }>;     // typecheck/compile
}
```

---

## 5. Contract lock

Unchanged in intent from the original spec; generalized behind `LanguageAdapter`.

- **Generation** — after decomposition, walk each edge of the dependency graph and
  emit **declarations only** (types, interfaces, signatures, error shapes) for
  what crosses the edge, via `adapter.proposeContracts`. Guard both failure modes:
  under-specification (a signature without its error/null shape) and
  over-specification (anything that doesn't cross a boundary). Target: small.
  This step is **LLM-assisted inference, not mechanical graph-walking** — the
  implementing code doesn't exist yet — and is intentionally built last.
- **Freeze** — commit contracts to `contract/<feature>`, merge to main, write
  `contractDir/VERSION = 1`, SHA-256 each contract file into
  `manifest.contractHashes`. Only then are worktrees created.
- **Enforcement — two layers, honestly labeled:**
  - *Merge-time re-hash (the real gate):* recompute contract hashes before every
    merge; block on mismatch. This is what actually holds.
  - *Pre-commit hook (fast feedback):* installed via the worktrees' shared hooks
    path; blocks a commit that stages a contract file and tells the agent to file
    a request. Bypassable with `--no-verify` — by design it is a nudge, not a
    boundary. (Worktrees share the main repo's hooks; the rule is identical for
    every worker, so one shared hook suffices.)
- **Arbitration** — agent needs a contract change → hook blocks → agent writes
  `requests/<task>.md`, sets status `blocked`, stops → orchestrator surfaces it →
  user approves/rejects → on approval, orchestrator edits contracts, merges, bumps
  `VERSION`, re-hashes, and **messages only affected agents** ("contract is vN,
  re-read") → affected agents update `builtAtContractVersion`. Merge warns if
  `builtAtContractVersion < contractVersion`.

---

## 6. Anti-conflict strategy (freeze-contract, not code-handoff)

Two agents may touch the same *file*; they may not redefine the same *contract*.

- **Shared interface**: frozen as real declarations both agents import. No
  paraphrase, no handoff — both build against identical types **in parallel**.
- **Non-contract edits to a shared file**: git's 3-way merge combines
  non-overlapping edits; the **merge-time typecheck/compile gate** proves they
  still fit.
- **The mailbox carries signals and pointers only** — `begin`, `done`,
  `you're unblocked, it landed at X`, a change-*request* — **never code bodies**.
  Mailing code would serialize work, is lossy (LLM re-typing plain text), and
  relocates the semantic conflict into prose. Freezing the contract avoids all
  three.

---

## 7. Data models

`manifest.json` is canonical. Changes from the original: `terminalLabel` →
`sessionName` (the worker's `--name`), `tokensUsed` removed, `adapter` added.

```ts
const Manifest = z.object({
  run: z.string(),                        // "2026-08-28-notifications"
  spec: z.string(),
  adapter: z.string(),                    // "typescript"
  contractVersion: z.number().int(),      // starts at 1
  contractHashes: z.record(z.string()),   // filepath -> sha256
  agents: z.array(AgentConfig),
  tasks: z.array(Task),
});

const Task = z.object({
  name: z.string(),                       // "notification-service"
  branch: z.string(),                     // "agent/notification-service"
  worktree: z.string(),                   // "../repo-notification-service"
  sessionName: z.string(),                // claude --name value; addresses messages
  dependsOn: z.array(z.string()),
  provides: z.array(z.string()),
  consumes: z.array(z.string()),
  status: z.enum(['pending','running','done','blocked','merged']),
  builtAtContractVersion: z.number().int().nullable(),
});
```

Naming stays identical across task name, branch suffix, worktree suffix, session
name, task file, and status log — derived programmatically from `name`, not
hand-typed.

Custom agents reuse Claude Code's `.claude/agents/<name>.md` format plus four
wiring fields (`hook`, `blocking`, `commits`, `workspace`). **No presets ship.**
At init the conductor *proposes* agents from the spec and repo; the user edits.
Hook-stage agents (e.g. a `pre-merge` reviewer) run as orchestrator-invoked
subagents at the right pipeline stage; worker agents are the separate-terminal
sessions.

---

## 8. Commands & pipeline

| Command | Behavior |
|---|---|
| `init <spec>` | version-check, map (repomix), decompose + cycle-check, propose agents, extract + freeze contracts, create worktrees + identities + hooks, open terminals |
| `dryrun` | message each worker to state intent and write nothing |
| `begin` | message each worker to start |
| `status` | print the table from manifest + logs |
| `merge` | compute eligibility from the graph, merge one at a time, re-hash contracts + run the language gate after each |
| `cleanup` | remove worktrees, delete merged branches; the run directory stays committed |

Merge eligibility (the one real algorithm) and a decomposition-time cycle check
are unchanged from the spec. Status output stays plain text, no emoji, minus the
token column.

Pipeline checkpoints (user approves): **(1)** task list + dependency graph,
**(2)** contract layer, **(3)** dry-run intent summaries.

---

## 9. Windows specifics

Windows-first, macOS/Linux second. Concrete risk points, each behind an adapter:

- **Terminals**: `wt.exe -w 0 nt --title <name> -d <worktree> claude --name <name>`,
  falling back to `start`/`cmd`. `terminals-windows.ts`.
- **Worktree hooks**: worktrees share the main repo's hooks; install one
  `pre-commit` there (or set `core.hooksPath`). Template is portable `sh` run by
  git's bundled shell; avoid GNU-only flags.
- **Messaging**: named-pipe transport on native Windows; requires v2.1.234+.
- **Paths**: never assume POSIX separators; use Node `path` throughout.

---

## 10. Build order (dependency order, per the original spec §10)

1. **Skeleton** — worktree.ts, terminals-windows.ts, coordinator-xsession.ts,
   manifest.ts, status.ts, merge. Validate with three fake tasks: "create
   `hello-<name>.txt`, wait for a `begin` message, log done." No contracts, no
   decomposition. **Surfaces Windows + messaging problems first.**
2. **Merge ordering** — graph.ts eligibility + the language gate at merge.
3. **Dry run** — cheap, high value.
4. **Contract lock** — freeze, hooks, versioning, arbitration.
5. **Language adapter** — formalize `LanguageAdapter`; TypeScript first.
6. **Agent config** — hook points, custom agent loading.
7. **Decomposition** — last; prompt engineering, expect iteration.

Then: packaging (plugin + marketplace) and the README (its own deliverable;
verify all cited numbers first).

---

## 11. Risks & deferred

- **Cross-session messaging is version-gated** (Windows v2.1.234+) and could change.
  Mitigation: filesystem manifest is the real source of truth; messaging is only a
  nudge, and it sits behind `Coordinator`.
- **Contract extraction quality** is the hard, fuzzy, LLM-driven part; built last,
  expect several prompt iterations. Poor decomposition makes rigid contracts
  expensive — an honest README limitation.
- **Pre-commit hook is bypassable**; the merge-time re-hash is the guarantee.
- **Original spec's conflict-rate numbers are unverified** — confirm before publishing.
- **Deferred to post-v1**: token tracking, non-TS language adapters, native-teams
  coordinator backend, multi-repo, run replay.
```
