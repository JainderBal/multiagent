# Milestone 1 — Manual E2E Validation

Prerequisites: a throwaway git repo with at least one commit; `multiagent` built
(`pnpm build`) and run via `node <path>/dist/cli.js`; Windows Terminal installed.

1. Copy `fixtures/three-fake-tasks/manifest.json` into the throwaway repo root.
2. From the repo root, run: `node <path>/dist/cli.js materialize manifest.json`
3. **Expect:** three new terminal windows titled `alpha`, `beta`, `gamma`, each
   opened in `../<repo>-<name>`, each launching `claude --name <name>`.
4. In each worker window, type: "wait until I message you `begin`, then create
   `hello-<name>.txt` with the text `done` and stop." Confirm they wait.
5. From your orchestrator session, message each worker `begin` (e.g. via
   `SendMessage` / `@<name>` mention). **Expect:** each worker creates its file.
6. Run `node <path>/dist/cli.js status manifest.json`. **Expect:** all `running`.
7. Run `node <path>/dist/cli.js cleanup manifest.json`. **Expect:** the three
   worktree directories are gone.
8. Record any Windows-specific friction (paths, wt.exe, hook shell) as issues —
   surfacing these early is the whole point of the skeleton.

## Automated coverage

Everything mechanical below the interactive layer is covered by `pnpm test`:
worktree create/remove against a real git repo, manifest round-trip, status
rendering, the Windows Terminal command builder, and `materialize` against a
temp repo with an injected fake terminal (no real windows opened). Steps 4–5
(an agent waiting for a `begin` message and acting on it) are inherently
interactive and must be run by hand until automated coordination lands in a
later milestone.
