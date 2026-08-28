# multiagent

Run multiple Claude Code agents in parallel on one repository, with a **frozen
contract layer** that prevents semantic merge conflicts *before* any agent starts.

> Others detect conflicts after agents finish. `multiagent` prevents them by
> generating and freezing the shared interface layer before work begins.

**Status:** early development. The system design is in
[`docs/design/2026-08-28-multiagent-design.md`](docs/design/2026-08-28-multiagent-design.md);
the origin vision is preserved in [`docs/original-spec.md`](docs/original-spec.md).

## The idea

Git worktrees stop *file* collisions but not *semantic* ones: two agents
independently inventing incompatible versions of a shared interface. Both
branches compile, both pass their own tests, the merge breaks. `multiagent`
freezes the interface (a "contract") first, so every agent builds against the
same declarations, in parallel — and a typecheck gate verifies the merge.

## How it coordinates

- One interactive Claude Code session per task, each in its own git worktree and
  its own terminal window — you watch and steer each agent directly.
- The orchestrator coordinates them with Claude Code's **cross-session messaging**
  (signals and pointers only, never code bodies).
- A committed `manifest.json` + status logs are the durable source of truth and
  audit trail.

## Requirements

- Node 20+, pnpm
- Claude Code **v2.1.234+** on Windows (cross-session messaging)
- Windows first; macOS/Linux second

## Status

Under construction, built in dependency order (skeleton → merge ordering → dry run
→ contract lock → language adapter → agent config → decomposition). Not yet usable.
