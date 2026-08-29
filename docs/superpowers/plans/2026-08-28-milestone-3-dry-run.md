# Milestone 3: Dry Run — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Before agents write code, each states its plan into `plans/<task>.md` and the orchestrator reports which agents have stated intent and which are still pending, so the user can approve at Checkpoint 3.

**Architecture:** The mechanical, testable part is (a) a run-directory layout helper that locates `plans/`, `requests/`, `status/`, `tasks/` relative to the manifest, and (b) a `dryrun` command that reports per-task whether a plan file exists. The act of an agent *writing* its plan is Claude behavior driven by the skill (via a `dryrun` message); the CLI reports completeness. Builds on Milestones 1-2.

**Tech Stack:** TypeScript (Node 20+), pnpm, zod, vitest.

**Spec:** `docs/design/2026-08-28-multiagent-design.md` (§9 step 7, Checkpoint 3).

## Global Constraints

- Platform Windows first; Node `path` only. No emoji. Status enum unchanged.
- The run directory is the directory containing `manifest.json`; `plans/`, `requests/`, `status/`, `tasks/` are siblings under it.
- Commit style: conventional commits ending `Task: <task-name>`.

---

### Task 1: Run-directory layout (`runlayout.ts`)

**Files:**
- Create: `src/core/runlayout.ts`
- Test: `tests/core/runlayout.test.ts`

**Interfaces:**
- Produces:
  - `type RunLayout = { runDir: string; manifest: string; plansDir: string; requestsDir: string; statusDir: string; tasksDir: string }`
  - `function runLayout(runDir: string): RunLayout`
  - `function planPath(layout: RunLayout, task: string): string` — `<plansDir>/<task>.md`

- [ ] **Step 1: Write the failing test**

`tests/core/runlayout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { runLayout, planPath } from '../../src/core/runlayout.js';

describe('runLayout', () => {
  it('locates subdirectories relative to the run dir', () => {
    const l = runLayout('/runs/r1');
    expect(l.manifest).toBe(join('/runs/r1', 'manifest.json'));
    expect(l.plansDir).toBe(join('/runs/r1', 'plans'));
    expect(l.requestsDir).toBe(join('/runs/r1', 'requests'));
    expect(l.statusDir).toBe(join('/runs/r1', 'status'));
    expect(l.tasksDir).toBe(join('/runs/r1', 'tasks'));
  });
  it('builds a plan path for a task', () => {
    expect(planPath(runLayout('/runs/r1'), 'api')).toBe(join('/runs/r1', 'plans', 'api.md'));
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing).** `pnpm vitest run tests/core/runlayout.test.ts`

- [ ] **Step 3: Implement**

`src/core/runlayout.ts`:
```ts
import { join } from 'node:path';

export type RunLayout = {
  runDir: string;
  manifest: string;
  plansDir: string;
  requestsDir: string;
  statusDir: string;
  tasksDir: string;
};

export function runLayout(runDir: string): RunLayout {
  return {
    runDir,
    manifest: join(runDir, 'manifest.json'),
    plansDir: join(runDir, 'plans'),
    requestsDir: join(runDir, 'requests'),
    statusDir: join(runDir, 'status'),
    tasksDir: join(runDir, 'tasks'),
  };
}

export function planPath(layout: RunLayout, task: string): string {
  return join(layout.plansDir, `${task}.md`);
}
```

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat: add run-directory layout helper\n\nTask: runlayout"`

---

### Task 2: Dry-run reporting (`dryrun.ts`)

**Files:**
- Create: `src/core/dryrun.ts`
- Test: `tests/core/dryrun.test.ts`

**Interfaces:**
- Consumes: `loadManifest` (`manifest.ts`), `runLayout`/`planPath` (`runlayout.ts`).
- Produces:
  - `type DryRunStatus = { task: string; stated: boolean }[]`
  - `async function collectDryRun(manifestPath: string): Promise<DryRunStatus>` — runDir = dirname(manifestPath); for each task, `stated` = a non-empty `plans/<task>.md` exists.
  - `function renderDryRun(status: DryRunStatus): string` — one line per task, `stated` or `waiting`, plus a final summary `N/M plans stated`.

- [ ] **Step 1: Write the failing test**

`tests/core/dryrun.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDryRun, renderDryRun } from '../../src/core/dryrun.js';

async function setup(plansPresent: string[]): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'ma-dry-'));
  const mk = (name: string) => ({
    name, branch: `agent/${name}`, worktree: `../wt-${name}`, sessionName: name,
    dependsOn: [], provides: [], consumes: [], status: 'running', builtAtContractVersion: null,
  });
  await fs.writeFile(join(dir, 'manifest.json'), JSON.stringify({
    run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
    agents: [], tasks: ['api', 'ui'].map(mk),
  }));
  await fs.mkdir(join(dir, 'plans'), { recursive: true });
  for (const p of plansPresent) await fs.writeFile(join(dir, 'plans', `${p}.md`), 'my plan\n');
  return join(dir, 'manifest.json');
}

describe('collectDryRun', () => {
  it('reports which tasks have stated a plan', async () => {
    const m = await setup(['api']);
    const status = await collectDryRun(m);
    expect(status).toEqual([{ task: 'api', stated: true }, { task: 'ui', stated: false }]);
  });
  it('treats an empty plan file as not stated', async () => {
    const m = await setup([]);
    const dir = m.replace(/manifest\.json$/, '');
    await fs.writeFile(join(dir, 'plans', 'api.md'), '   \n');
    const status = await collectDryRun(m);
    expect(status.find((s) => s.task === 'api')!.stated).toBe(false);
  });
});

describe('renderDryRun', () => {
  it('renders lines and a summary', () => {
    const out = renderDryRun([{ task: 'api', stated: true }, { task: 'ui', stated: false }]);
    expect(out).toBe('api   stated\nui    waiting\n\n1/2 plans stated');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.**

- [ ] **Step 3: Implement**

`src/core/dryrun.ts`:
```ts
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { loadManifest } from './manifest.js';
import { runLayout, planPath } from './runlayout.js';

export type DryRunStatus = { task: string; stated: boolean }[];

async function hasContent(path: string): Promise<boolean> {
  try {
    const text = await fs.readFile(path, 'utf8');
    return text.trim().length > 0;
  } catch {
    return false;
  }
}

export async function collectDryRun(manifestPath: string): Promise<DryRunStatus> {
  const m = await loadManifest(manifestPath);
  const layout = runLayout(dirname(manifestPath));
  const out: DryRunStatus = [];
  for (const t of m.tasks) {
    out.push({ task: t.name, stated: await hasContent(planPath(layout, t.name)) });
  }
  return out;
}

export function renderDryRun(status: DryRunStatus): string {
  const width = Math.max(0, ...status.map((s) => s.task.length)) + 3;
  const lines = status.map((s) => `${s.task.padEnd(width)}${s.stated ? 'stated' : 'waiting'}`);
  const done = status.filter((s) => s.stated).length;
  return `${lines.join('\n')}\n\n${done}/${status.length} plans stated`;
}
```

Note: the test's expected column width is `max task length (3: "api","ui" -> 3) + 3 = 6`, so `api` + 3 spaces = `api   ` and `ui` + 4 spaces = `ui    `. Confirm against the literal in the test; adjust the test if the deterministic output differs (whitespace is cosmetic).

- [ ] **Step 4: Run test — expect PASS.** If the width literal differs, align the test to the actual output.

- [ ] **Step 5: Commit** — `Task: dryrun`

---

### Task 3: CLI wiring + skill

**Files:**
- Create: `src/commands/dryrun.ts`
- Modify: `src/cli.ts`
- Modify: `skills/multiagent/SKILL.md`
- Test: covered by Task 2 (`collectDryRun`/`renderDryRun`); the command is a thin wrapper.

**Interfaces:**
- Produces: `async function dryrunCommand(manifestPath: string): Promise<string>` returning `renderDryRun(await collectDryRun(manifestPath))`.

- [ ] **Step 1: Implement the command**

`src/commands/dryrun.ts`:
```ts
import { collectDryRun, renderDryRun } from '../core/dryrun.js';

export async function dryrunCommand(manifestPath: string): Promise<string> {
  return renderDryRun(await collectDryRun(manifestPath));
}
```

- [ ] **Step 2: Wire CLI**

In `src/cli.ts` add:
```ts
import { dryrunCommand } from './commands/dryrun.js';
```
```ts
program
  .command('dryrun <manifest>')
  .description('Report which agents have stated an intent plan.')
  .action(async (manifest: string) => {
    console.log(await dryrunCommand(manifest));
  });
```

- [ ] **Step 3: Update the skill**

In `skills/multiagent/SKILL.md`, add before the merge step:
```markdown
- Dry run: message each worker "state your plan into plans/<task>.md, write no
  code, then stop." Run `multiagent dryrun <manifest>` to see who has stated
  intent. This is Checkpoint 3 — the user approves before you send `begin`.
```

- [ ] **Step 4: Full suite + build**

Run `pnpm test` (all green) and `pnpm build` (exit 0). Verify `node dist/cli.js --help` lists `dryrun`.

- [ ] **Step 5: Commit** — `Task: dryrun-cli`

---

## Self-Review

**Spec coverage (design §10 item 3 "Dry run", §9 step 7, Checkpoint 3):** run layout → Task 1; plan collection + reporting → Task 2; CLI + skill protocol → Task 3. The agent *writing* a plan is skill-driven (messaging), reported by the CLI — consistent with the Node-CLI-vs-skill split in the design.

**Placeholder scan:** none. **Type consistency:** `RunLayout`, `DryRunStatus`, `runLayout`/`planPath`/`collectDryRun`/`renderDryRun`/`dryrunCommand` consistent across tasks.
```
