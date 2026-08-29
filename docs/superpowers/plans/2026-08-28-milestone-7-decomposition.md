# Milestone 7: Decomposition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Turn an (orchestrator-produced) decomposition into a validated run: build a cycle-checked manifest with derived names, scaffold the run directory (`plans/`, `requests/`, `status/`, `tasks/`), and generate a per-task instruction file. The spec→tasks reasoning itself is LLM work described in the skill; this milestone makes the mechanical scaffolding correct and testable.

**Architecture:** `decompose.ts` validates a `Decomposition` (kebab names, unique, cycle-free via `detectCycle`) and builds a `TManifest` with names derived by `naming.ts`. `taskfile.ts` renders a task's instruction markdown. `init` writes the manifest + run layout + task files. Builds on Milestones 1-6.

**Tech Stack:** TypeScript (Node 20+), zod, vitest.

**Spec:** design §9 (pipeline, decomposition + cycle check at Checkpoint 1), §10 item 7.

## Global Constraints

- Windows first; Node `path`. No emoji. Reject cyclic dependency graphs at build time, not merge time.
- Names are derived from the task `name` via `deriveNames` (Milestone 1) — never hand-typed.
- Commit style: conventional commits ending `Task: <task-name>`.

---

### Task 1: Build a manifest from a decomposition (`decompose.ts`)

**Files:**
- Create: `src/core/decompose.ts`
- Test: `tests/core/decompose.test.ts`

**Interfaces:**
- Consumes: `deriveNames`, `assertValidTaskName` (`naming.ts`); `detectCycle` (`graph.ts`); `TManifest`, `TTask` (`manifest.ts`).
- Produces:
  - `type DecomposedTask = { name: string; dependsOn?: string[]; provides?: string[]; consumes?: string[] }`
  - `type Decomposition = { run: string; spec: string; adapter: string; repoName: string; tasks: DecomposedTask[] }`
  - `function buildManifest(d: Decomposition): TManifest` — validates names (kebab, unique), rejects a cyclic graph (`throw` naming the cycle), derives branch/worktree/sessionName, sets each task `status: 'pending'`, `builtAtContractVersion: null`, `contractVersion: 1`, empty `contractHashes`, empty `agents`.

- [ ] **Step 1: Write the failing test**

`tests/core/decompose.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/core/decompose.js';

const base = {
  run: '2026-08-28-notifications', spec: 'notifications.md', adapter: 'typescript', repoName: 'repo',
};

describe('buildManifest', () => {
  it('derives names and sets initial state', () => {
    const m = buildManifest({
      ...base,
      tasks: [
        { name: 'shared-types', provides: ['N'] },
        { name: 'api', dependsOn: ['shared-types'], consumes: ['N'] },
      ],
    });
    expect(m.contractVersion).toBe(1);
    expect(m.tasks[1]).toMatchObject({
      name: 'api', branch: 'agent/api', worktree: '../repo-api', sessionName: 'api',
      dependsOn: ['shared-types'], consumes: ['N'], status: 'pending', builtAtContractVersion: null,
    });
  });

  it('rejects a duplicate task name', () => {
    expect(() => buildManifest({ ...base, tasks: [{ name: 'a' }, { name: 'a' }] })).toThrow(/duplicate/i);
  });

  it('rejects an invalid task name', () => {
    expect(() => buildManifest({ ...base, tasks: [{ name: 'Bad Name' }] })).toThrow();
  });

  it('rejects a cyclic dependency graph', () => {
    expect(() => buildManifest({
      ...base,
      tasks: [{ name: 'a', dependsOn: ['b'] }, { name: 'b', dependsOn: ['a'] }],
    })).toThrow(/cycle/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/core/decompose.ts`:
```ts
import { deriveNames, assertValidTaskName } from './naming.js';
import { detectCycle } from './graph.js';
import type { TManifest, TTask } from './manifest.js';

export type DecomposedTask = {
  name: string;
  dependsOn?: string[];
  provides?: string[];
  consumes?: string[];
};

export type Decomposition = {
  run: string;
  spec: string;
  adapter: string;
  repoName: string;
  tasks: DecomposedTask[];
};

export function buildManifest(d: Decomposition): TManifest {
  const seen = new Set<string>();
  for (const t of d.tasks) {
    assertValidTaskName(t.name);
    if (seen.has(t.name)) throw new Error(`duplicate task name: ${t.name}`);
    seen.add(t.name);
  }

  const tasks: TTask[] = d.tasks.map((t) => {
    const names = deriveNames(t.name, d.repoName);
    return {
      name: t.name,
      branch: names.branch,
      worktree: names.worktree,
      sessionName: names.sessionName,
      dependsOn: t.dependsOn ?? [],
      provides: t.provides ?? [],
      consumes: t.consumes ?? [],
      status: 'pending',
      builtAtContractVersion: null,
    };
  });

  const cycle = detectCycle(tasks);
  if (cycle) throw new Error(`dependency cycle: ${cycle.join(' -> ')}`);

  return {
    run: d.run,
    spec: d.spec,
    adapter: d.adapter,
    contractVersion: 1,
    contractHashes: {},
    agents: [],
    tasks,
  };
}
```

- [ ] **Step 4: Run — expect PASS. Commit** — `Task: decompose`

---

### Task 2: Task-file rendering + run scaffolding (`taskfile.ts`)

**Files:**
- Create: `src/core/taskfile.ts`
- Test: `tests/core/taskfile.test.ts`

**Interfaces:**
- Consumes: `TManifest`, `TTask` (`manifest.ts`); `runLayout` (`runlayout.ts`).
- Produces:
  - `function renderTaskFile(task: TTask): string` — markdown with name, branch, worktree, deps, provides, consumes, and fixed scope language.
  - `async function writeRun(runDir: string, manifest: TManifest): Promise<void>` — create `plans/`, `requests/`, `status/`, `tasks/`; write `manifest.json`; write `tasks/<name>.md` for each task.

- [ ] **Step 1: Write the failing test**

`tests/core/taskfile.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTaskFile, writeRun } from '../../src/core/taskfile.js';
import { buildManifest } from '../../src/core/decompose.js';

const manifest = buildManifest({
  run: 'r', spec: 's.md', adapter: 'typescript', repoName: 'repo',
  tasks: [
    { name: 'shared-types', provides: ['N'] },
    { name: 'api', dependsOn: ['shared-types'], consumes: ['N'] },
  ],
});

describe('renderTaskFile', () => {
  it('includes name, deps, provides, consumes, and scope language', () => {
    const md = renderTaskFile(manifest.tasks[1]);
    expect(md).toMatch(/# Task: api/);
    expect(md).toMatch(/Depends on: shared-types/);
    expect(md).toMatch(/Consumes: N/);
    expect(md).toMatch(/Do NOT edit contract files/);
  });
});

describe('writeRun', () => {
  it('scaffolds the run directory and task files', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ma-run-'));
    await writeRun(dir, manifest);
    for (const sub of ['plans', 'requests', 'status', 'tasks']) {
      expect((await fs.stat(join(dir, sub))).isDirectory()).toBe(true);
    }
    expect((await fs.stat(join(dir, 'manifest.json'))).isFile()).toBe(true);
    expect((await fs.readFile(join(dir, 'tasks', 'api.md'), 'utf8'))).toMatch(/# Task: api/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/core/taskfile.ts`:
```ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { saveManifest, type TManifest, type TTask } from './manifest.js';
import { runLayout } from './runlayout.js';

function list(items: string[]): string {
  return items.length ? items.join(', ') : '(none)';
}

export function renderTaskFile(task: TTask): string {
  return `# Task: ${task.name}

Branch: ${task.branch}
Worktree: ${task.worktree}
Depends on: ${list(task.dependsOn)}
Provides: ${list(task.provides)}
Consumes: ${list(task.consumes)}

## Scope

Implement only this task. Build against the frozen contracts in the contracts
directory — import the declarations, do not restate them.

Do NOT edit contract files. If you need a contract change, write a request under
requests/${task.name}.md describing what you need and why, set your status to
blocked, and stop. Wait for the orchestrator to bump the contract version and
tell you to re-read.

Coordinate only by messaging and by the committed run files. Never edit another
task's files. Messages carry signals and pointers, never code bodies.

When done, state your status in status/${task.name}.log.
`;
}

export async function writeRun(runDir: string, manifest: TManifest): Promise<void> {
  const layout = runLayout(runDir);
  for (const d of [layout.plansDir, layout.requestsDir, layout.statusDir, layout.tasksDir]) {
    await fs.mkdir(d, { recursive: true });
  }
  await saveManifest(layout.manifest, manifest);
  for (const t of manifest.tasks) {
    await fs.writeFile(join(layout.tasksDir, `${t.name}.md`), renderTaskFile(t), 'utf8');
  }
}
```

- [ ] **Step 4: Run — expect PASS. Commit** — `Task: taskfile`

---

### Task 3: `init` command + decomposition skill guidance

**Files:**
- Create: `src/commands/init.ts`
- Modify: `src/cli.ts`
- Modify: `skills/multiagent/SKILL.md`
- Test: `tests/commands/init.test.ts`

**Interfaces:**
- `async function initCommand(decompositionPath: string, runDir: string): Promise<string>` — read a `Decomposition` JSON, `buildManifest`, `writeRun`, return `initialized run <run> with N tasks at <runDir>`.

- [ ] **Step 1: Write the failing test**

`tests/commands/init.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from '../../src/commands/init.js';
import { loadManifest } from '../../src/core/manifest.js';

describe('initCommand', () => {
  it('builds a run from a decomposition file', async () => {
    const base = await fs.mkdtemp(join(tmpdir(), 'ma-init-'));
    const decomp = join(base, 'decomp.json');
    await fs.writeFile(decomp, JSON.stringify({
      run: 'r1', spec: 's.md', adapter: 'typescript', repoName: 'repo',
      tasks: [{ name: 'a' }, { name: 'b', dependsOn: ['a'] }],
    }));
    const runDir = join(base, 'run');
    const out = await initCommand(decomp, runDir);
    expect(out).toMatch(/2 tasks/);
    const m = await loadManifest(join(runDir, 'manifest.json'));
    expect(m.tasks.map((t) => t.name)).toEqual(['a', 'b']);
    expect((await fs.stat(join(runDir, 'tasks', 'b.md'))).isFile()).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/commands/init.ts`:
```ts
import { promises as fs } from 'node:fs';
import { buildManifest, type Decomposition } from '../core/decompose.js';
import { writeRun } from '../core/taskfile.js';

export async function initCommand(decompositionPath: string, runDir: string): Promise<string> {
  const d = JSON.parse(await fs.readFile(decompositionPath, 'utf8')) as Decomposition;
  const manifest = buildManifest(d);
  await writeRun(runDir, manifest);
  return `initialized run ${manifest.run} with ${manifest.tasks.length} tasks at ${runDir}`;
}
```

Wire `src/cli.ts`:
```ts
import { initCommand } from './commands/init.js';
```
```ts
program
  .command('init <decomposition> <runDir>')
  .description('Build a run (manifest + task files) from a decomposition JSON.')
  .action(async (decomposition: string, runDir: string) => {
    console.log(await initCommand(decomposition, runDir));
  });
```

In `skills/multiagent/SKILL.md`, add a decomposition section near the top:
```markdown
## Decomposition (Checkpoint 1)

Map the repo (repomix), then split the spec into tasks that can be built in
parallel. Each task gets a kebab-case name, its dependencies, and the contract
symbols it `provides`/`consumes`. Keep the graph acyclic. Two tasks may touch the
same file, but only ONE may define any given contract symbol — freeze the shared
interface so the rest can proceed in parallel. Write the decomposition as JSON and
run `multiagent init <decomposition.json> <runDir>`; the user approves the task
list and graph before you extract and freeze contracts.
```

- [ ] **Step 4: Full suite + build. Commit** — `Task: init`

---

## Self-Review

**Spec coverage (design §9 decomposition + Checkpoint 1, §10 item 7):** manifest build with derived names + cycle rejection at build time → Task 1; run scaffolding + per-task instruction files with scope language → Task 2; `init` command + decomposition prompt guidance → Task 3. The LLM reasoning (spec → task split) is skill guidance, consistent with the Node-vs-skill split. **Placeholder scan:** none. **Type consistency:** `Decomposition`/`DecomposedTask`, `buildManifest`, `renderTaskFile`/`writeRun`, `initCommand` consistent; names derived via `deriveNames`, cycle via `detectCycle`, both from earlier milestones.
```
