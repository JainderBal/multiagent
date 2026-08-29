# Milestone 2: Merge Ordering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge completed task branches into the base branch in dependency order, one at a time, running a language typecheck gate after each merge and rolling back any merge that fails the gate.

**Architecture:** A pure `graph.ts` computes cycle detection and merge eligibility from the manifest. A `LanguageAdapter` abstracts the per-language typecheck gate; the first implementation shells `tsc --noEmit`. `core/merge.ts` drives the loop: pick an eligible task, `git merge --no-ff` its branch into the base branch, run the gate, and either mark it `merged` or roll the merge back and stop. The `merge` CLI command wires these together. Builds on Milestone 1 (manifest, worktrees, status).

**Tech Stack:** TypeScript (Node 20+), pnpm, execa (git + tsc), zod, vitest. TypeScript compiler resolved from this package's own `node_modules` for the gate (Milestone 5 will prefer the target repo's own `tsc`).

**Spec:** `docs/design/2026-08-28-multiagent-design.md` (§8 graph algorithm, §9 pipeline step 10). Milestone 1 plan: `docs/superpowers/plans/2026-08-28-milestone-1-skeleton.md`.

## Global Constraints

- **Platform:** Windows first; use Node `path`, never assume POSIX. All git/tsc calls go through `execa`.
- **Merge safety:** never leave the base branch in a broken state. A merge whose gate fails is rolled back with `git reset --hard HEAD~1` (the merge is `--no-ff`, so it is always exactly one commit) before stopping.
- **One at a time:** merge exactly one eligible task per iteration, re-reading eligibility from the manifest after each success. Never batch-merge.
- **Status enum:** `pending | running | done | blocked | merged`. Only a `done` task whose dependencies are all `merged` is eligible.
- **No emoji** in output.
- **Commit style:** conventional commits ending with `Task: <task-name>`.

---

### Task 1: Dependency graph — eligibility and cycle detection (`graph.ts`)

**Files:**
- Create: `src/core/graph.ts`
- Test: `tests/core/graph.test.ts`

**Interfaces:**
- Consumes: `TTask` from `manifest.ts`.
- Produces:
  - `function getMergeable(tasks: TTask[]): TTask[]` — tasks with `status === 'done'` whose every `dependsOn` entry refers to a task that is `merged`.
  - `function detectCycle(tasks: TTask[]): string[] | null` — returns one cycle as an ordered list of task names if the `dependsOn` graph has a cycle, else `null`.

- [ ] **Step 1: Write the failing test**

`tests/core/graph.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getMergeable, detectCycle } from '../../src/core/graph.js';
import type { TTask } from '../../src/core/manifest.js';

function task(name: string, status: TTask['status'], dependsOn: string[] = []): TTask {
  return {
    name, branch: `agent/${name}`, worktree: `../r-${name}`, sessionName: name,
    dependsOn, provides: [], consumes: [], status, builtAtContractVersion: null,
  };
}

describe('getMergeable', () => {
  it('returns done tasks whose deps are all merged', () => {
    const tasks = [
      task('a', 'merged'),
      task('b', 'done', ['a']),
      task('c', 'done', ['b']),          // blocked: b not merged yet
      task('d', 'running'),
    ];
    expect(getMergeable(tasks).map((t) => t.name)).toEqual(['b']);
  });

  it('returns nothing when no dependency is satisfied', () => {
    const tasks = [task('a', 'done', ['x']), task('x', 'running')];
    expect(getMergeable(tasks)).toEqual([]);
  });
});

describe('detectCycle', () => {
  it('returns null for a DAG', () => {
    const tasks = [task('a', 'pending'), task('b', 'pending', ['a'])];
    expect(detectCycle(tasks)).toBeNull();
  });

  it('finds a cycle', () => {
    const tasks = [
      task('a', 'pending', ['c']),
      task('b', 'pending', ['a']),
      task('c', 'pending', ['b']),
    ];
    const cycle = detectCycle(tasks);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/graph.test.ts`
Expected: FAIL — module `graph.js` not found.

- [ ] **Step 3: Write minimal implementation**

`src/core/graph.ts`:
```ts
import type { TTask } from './manifest.js';

export function getMergeable(tasks: TTask[]): TTask[] {
  const byName = new Map(tasks.map((t) => [t.name, t]));
  return tasks.filter(
    (t) =>
      t.status === 'done' &&
      t.dependsOn.every((d) => byName.get(d)?.status === 'merged'),
  );
}

export function detectCycle(tasks: TTask[]): string[] | null {
  const byName = new Map(tasks.map((t) => [t.name, t]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function visit(name: string): string[] | null {
    const s = state.get(name);
    if (s === 'done') return null;
    if (s === 'visiting') {
      const start = stack.indexOf(name);
      return stack.slice(start).concat(name);
    }
    state.set(name, 'visiting');
    stack.push(name);
    for (const dep of byName.get(name)?.dependsOn ?? []) {
      if (!byName.has(dep)) continue;
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(name, 'done');
    return null;
  }

  for (const t of tasks) {
    const found = visit(t.name);
    if (found) return found;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/graph.ts tests/core/graph.test.ts
git commit -m "feat: add merge eligibility and cycle detection

Task: graph"
```

---

### Task 2: Mergeable hint in the status table (`status.ts`)

**Files:**
- Modify: `src/core/status.ts`
- Test: `tests/core/status.test.ts` (extend)

**Interfaces:**
- Consumes: `getMergeable` from `graph.ts`.
- Produces: unchanged signature `renderStatusTable(m: TManifest): string`. A `done` task that is currently mergeable gets the suffix `-> mergeable`.

- [ ] **Step 1: Write the failing test (extend existing file)**

Add to `tests/core/status.test.ts`:
```ts
describe('renderStatusTable mergeable hint', () => {
  it('marks a done task whose deps are merged as mergeable', () => {
    const mm = parseManifest({
      run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1,
      contractHashes: {}, agents: [],
      tasks: [
        { name: 'a', branch: 'agent/a', worktree: '../r-a', sessionName: 'a',
          dependsOn: [], provides: [], consumes: [], status: 'merged', builtAtContractVersion: 1 },
        { name: 'b', branch: 'agent/b', worktree: '../r-b', sessionName: 'b',
          dependsOn: ['a'], provides: [], consumes: [], status: 'done', builtAtContractVersion: 1 },
      ],
    });
    expect(renderStatusTable(mm)).toBe(
      'merged    a\n' +
      'done      b   -> mergeable',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/status.test.ts`
Expected: FAIL — the new case renders `done      b` without the hint.

- [ ] **Step 3: Update implementation**

In `src/core/status.ts`, import `getMergeable` and add the hint. Replace the map body:
```ts
import type { TManifest, TTask } from './manifest.js';
import { getMergeable } from './graph.js';

const STATUS_WIDTH = 10;

function unmetDeps(task: TTask, byName: Map<string, TTask>): string[] {
  return task.dependsOn.filter((d) => byName.get(d)?.status !== 'merged');
}

export function renderStatusTable(m: TManifest): string {
  const byName = new Map(m.tasks.map((t) => [t.name, t]));
  const mergeable = new Set(getMergeable(m.tasks).map((t) => t.name));
  return m.tasks
    .map((t) => {
      const left = `${t.status.padEnd(STATUS_WIDTH)}${t.name}`;
      if (t.status === 'pending') {
        const waits = unmetDeps(t, byName);
        if (waits.length > 0) return `${left}   waits: ${waits.join(', ')}`;
      }
      if (t.status === 'done' && mergeable.has(t.name)) return `${left}   -> mergeable`;
      return left;
    })
    .join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/status.test.ts`
Expected: PASS (both the original and new cases).

- [ ] **Step 5: Commit**

```bash
git add src/core/status.ts tests/core/status.test.ts
git commit -m "feat: mark mergeable tasks in the status table

Task: status"
```

---

### Task 3: Language gate adapter (`language.ts`, `language-typescript.ts`)

**Files:**
- Create: `src/adapters/language.ts`
- Create: `src/adapters/language-typescript.ts`
- Test: `tests/adapters/language-typescript.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type GateResult = { ok: boolean; output: string }` and `interface LanguageAdapter { id: string; gate(dir: string): Promise<GateResult> }` in `language.ts`.
  - `class TypeScriptAdapter implements LanguageAdapter` (`id = 'typescript'`) whose `gate(dir)` runs `tsc --noEmit -p <dir>` using the TypeScript compiler resolved from this package, returning `ok` on exit code 0.

- [ ] **Step 1: Write the failing test**

`tests/adapters/language-typescript.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TypeScriptAdapter } from '../../src/adapters/language-typescript.js';

async function project(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'ma-ts-'));
  await fs.writeFile(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: true },
    include: ['*.ts'],
  }));
  for (const [name, body] of Object.entries(files)) {
    await fs.writeFile(join(dir, name), body);
  }
  return dir;
}

describe('TypeScriptAdapter.gate', () => {
  it('passes on valid TypeScript', async () => {
    const dir = await project({ 'ok.ts': 'export const n: number = 1;\n' });
    const r = await new TypeScriptAdapter().gate(dir);
    expect(r.ok).toBe(true);
  });

  it('fails on a type error and reports output', async () => {
    const dir = await project({ 'bad.ts': 'export const n: number = "x";\n' });
    const r = await new TypeScriptAdapter().gate(dir);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/bad\.ts/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/adapters/language-typescript.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/adapters/language.ts`:
```ts
export type GateResult = { ok: boolean; output: string };

export interface LanguageAdapter {
  id: string;
  gate(dir: string): Promise<GateResult>;
}
```

`src/adapters/language-typescript.ts`:
```ts
import { execa } from 'execa';
import { createRequire } from 'node:module';
import type { GateResult, LanguageAdapter } from './language.js';

const require = createRequire(import.meta.url);

export class TypeScriptAdapter implements LanguageAdapter {
  id = 'typescript';

  async gate(dir: string): Promise<GateResult> {
    const tsc = require.resolve('typescript/bin/tsc');
    const result = await execa(process.execPath, [tsc, '--noEmit', '-p', dir], {
      reject: false,
    });
    return {
      ok: result.exitCode === 0,
      output: `${result.stdout}\n${result.stderr}`.trim(),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/adapters/language-typescript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/language.ts src/adapters/language-typescript.ts tests/adapters/language-typescript.test.ts
git commit -m "feat: add TypeScript typecheck gate adapter

Task: language-gate"
```

---

### Task 4: Merge loop (`core/merge.ts`)

**Files:**
- Create: `src/core/merge.ts`
- Test: `tests/core/merge.test.ts`

**Interfaces:**
- Consumes: `loadManifest`, `saveManifest`, `TManifest` (`manifest.ts`); `getMergeable` (`graph.ts`); `LanguageAdapter` (`language.ts`).
- Produces:
  - `type MergeReport = { merged: string[]; stoppedAt?: { task: string; reason: string } }`
  - `async function mergeAll(manifestPath: string, repoRoot: string, baseBranch: string, adapter: LanguageAdapter): Promise<MergeReport>` — repeatedly merges one eligible task's branch (`git merge --no-ff`) into `baseBranch`, runs `adapter.gate(repoRoot)`, and on gate failure runs `git reset --hard HEAD~1` and stops. On a git merge conflict, aborts (`git merge --abort`) and stops. Marks each merged task `merged` and saves the manifest after each success.

- [ ] **Step 1: Write the failing test**

`tests/core/merge.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeAll } from '../../src/core/merge.js';
import { loadManifest, saveManifest, type TManifest } from '../../src/core/manifest.js';
import { TypeScriptAdapter } from '../../src/adapters/language-typescript.js';

async function repoWithBranches(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-merge-'));
  const git = (args: string[]) => execa('git', args, { cwd: root });
  await git(['init', '-q', '-b', 'main']);
  await git(['config', 'user.email', 'root@test.local']);
  await git(['config', 'user.name', 'root']);
  await fs.writeFile(join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, include: ['*.ts'],
  }));
  await fs.writeFile(join(root, 'base.ts'), 'export const base = 1;\n');
  await git(['add', '-A']);
  await git(['commit', '-q', '-m', 'base']);
  // agent/a adds a valid file
  await git(['checkout', '-q', '-b', 'agent/a']);
  await fs.writeFile(join(root, 'a.ts'), 'export const a: number = 2;\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'a']);
  // agent/b (from main) adds another valid file
  await git(['checkout', '-q', 'main']);
  await git(['checkout', '-q', '-b', 'agent/b']);
  await fs.writeFile(join(root, 'b.ts'), 'export const b: number = 3;\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'b']);
  await git(['checkout', '-q', 'main']);
  return root;
}

function manifest(root: string, bStatus: 'done' | 'pending'): TManifest {
  const mk = (name: string, dependsOn: string[], status: any) => ({
    name, branch: `agent/${name}`, worktree: `../wt-${name}`, sessionName: name,
    dependsOn, provides: [], consumes: [], status, builtAtContractVersion: 1,
  });
  return {
    run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
    agents: [], tasks: [mk('a', [], 'done'), mk('b', ['a'], bStatus)],
  } as TManifest;
}

describe('mergeAll', () => {
  let root: string;
  beforeEach(async () => { root = await repoWithBranches(); });

  it('merges eligible tasks in dependency order and marks them merged', async () => {
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, manifest(root, 'done'));
    const report = await mergeAll(mPath, root, 'main', new TypeScriptAdapter());

    expect(report.merged).toEqual(['a', 'b']);
    const after = await loadManifest(mPath);
    expect(after.tasks.map((t) => t.status)).toEqual(['merged', 'merged']);
    // Both files are on main now.
    expect((await fs.stat(join(root, 'a.ts'))).isFile()).toBe(true);
    expect((await fs.stat(join(root, 'b.ts'))).isFile()).toBe(true);
  });

  it('stops when a dependency is not yet done', async () => {
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, manifest(root, 'pending'));
    const report = await mergeAll(mPath, root, 'main', new TypeScriptAdapter());
    expect(report.merged).toEqual(['a']); // b is pending, not eligible
    const after = await loadManifest(mPath);
    expect(after.tasks.find((t) => t.name === 'b')!.status).toBe('pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/merge.test.ts`
Expected: FAIL — module `merge.js` not found.

- [ ] **Step 3: Write minimal implementation**

`src/core/merge.ts`:
```ts
import { execa } from 'execa';
import { loadManifest, saveManifest } from './manifest.js';
import { getMergeable } from './graph.js';
import type { LanguageAdapter } from '../adapters/language.js';

export type MergeReport = {
  merged: string[];
  stoppedAt?: { task: string; reason: string };
};

export async function mergeAll(
  manifestPath: string,
  repoRoot: string,
  baseBranch: string,
  adapter: LanguageAdapter,
): Promise<MergeReport> {
  const merged: string[] = [];
  const git = (args: string[]) => execa('git', args, { cwd: repoRoot, reject: false });

  await git(['checkout', baseBranch]);

  for (;;) {
    const m = await loadManifest(manifestPath);
    const eligible = getMergeable(m.tasks);
    if (eligible.length === 0) return { merged };
    const task = eligible[0];

    const mergeRes = await git(['merge', '--no-ff', '-m', `merge ${task.name}`, task.branch]);
    if (mergeRes.exitCode !== 0) {
      await git(['merge', '--abort']);
      return { merged, stoppedAt: { task: task.name, reason: 'merge conflict' } };
    }

    const gate = await adapter.gate(repoRoot);
    if (!gate.ok) {
      await git(['reset', '--hard', 'HEAD~1']);
      return { merged, stoppedAt: { task: task.name, reason: `gate failed:\n${gate.output}` } };
    }

    task.status = 'merged';
    await saveManifest(manifestPath, m);
    merged.push(task.name);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/merge.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/core/merge.ts tests/core/merge.test.ts
git commit -m "feat: merge eligible branches in order with a typecheck gate

Task: merge"
```

---

### Task 5: Wire the `merge` CLI command + update skill

**Files:**
- Create: `src/commands/merge.ts`
- Modify: `src/cli.ts`
- Modify: `skills/multiagent/SKILL.md`
- Test: `tests/commands/merge-cli.test.ts`

**Interfaces:**
- Consumes: `mergeAll` (`core/merge.ts`); `TypeScriptAdapter` (`language-typescript.ts`).
- Produces:
  - `async function mergeCommand(manifestPath: string, repoRoot: string, baseBranch: string): Promise<string>` — runs `mergeAll` with a `TypeScriptAdapter` and returns a human-readable summary string.
  - `src/cli.ts` registers `merge <manifest>` with a `--base <branch>` option (default `main`).

- [ ] **Step 1: Write the failing test**

`tests/commands/merge-cli.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mergeCommand } from '../../src/commands/merge.js';

describe('mergeCommand summary', () => {
  it('reports when there is nothing to merge (empty manifest tasks)', async () => {
    // A manifest path that has no eligible tasks yields a "merged 0" summary.
    // Uses a temp manifest with a single pending task and no repo interaction
    // because pending tasks are never eligible, so git is never touched.
    const { promises: fs } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const p = join(await fs.mkdtemp(join(tmpdir(), 'ma-mc-')), 'manifest.json');
    await fs.writeFile(p, JSON.stringify({
      run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
      agents: [], tasks: [{
        name: 'a', branch: 'agent/a', worktree: '../r-a', sessionName: 'a',
        dependsOn: ['missing'], provides: [], consumes: [], status: 'done',
        builtAtContractVersion: 1,
      }],
    }));
    const summary = await mergeCommand(p, process.cwd(), 'main');
    expect(summary).toMatch(/merged 0/i);
  });
});
```

Note: this task's git-touching path is already covered by `merge.test.ts`; this test pins the summary string on the no-op path so it needs no repo.

Wait — `mergeAll` calls `git checkout main` before the loop even when nothing is eligible. To keep this test repo-free, `mergeCommand`/`mergeAll` must compute eligibility before the checkout. Adjust `mergeAll` in Task 4 so the initial `git checkout baseBranch` happens only when there is at least one eligible task. Apply this refinement now.

- [ ] **Step 2: Refine `mergeAll` so an empty run touches no git**

Edit `src/core/merge.ts`: move the `await git(['checkout', baseBranch]);` line from before the loop to just after the `const task = eligible[0];` selection but before the first merge, guarded so it runs once:
```ts
  let checkedOut = false;
  for (;;) {
    const m = await loadManifest(manifestPath);
    const eligible = getMergeable(m.tasks);
    if (eligible.length === 0) return { merged };
    const task = eligible[0];
    if (!checkedOut) { await git(['checkout', baseBranch]); checkedOut = true; }
    // ...merge as before
  }
```
Re-run `pnpm vitest run tests/core/merge.test.ts` — still PASS.

- [ ] **Step 3: Write the command + wire CLI**

`src/commands/merge.ts`:
```ts
import { mergeAll } from '../core/merge.js';
import { TypeScriptAdapter } from '../adapters/language-typescript.js';

export async function mergeCommand(
  manifestPath: string,
  repoRoot: string,
  baseBranch: string,
): Promise<string> {
  const report = await mergeAll(manifestPath, repoRoot, baseBranch, new TypeScriptAdapter());
  const lines = [`merged ${report.merged.length}: ${report.merged.join(', ') || '(none)'}`];
  if (report.stoppedAt) {
    lines.push(`stopped at ${report.stoppedAt.task}: ${report.stoppedAt.reason}`);
  }
  return lines.join('\n');
}
```

In `src/cli.ts`, add the import and command:
```ts
import { mergeCommand } from './commands/merge.js';
```
```ts
program
  .command('merge <manifest>')
  .description('Merge eligible task branches in dependency order with a typecheck gate.')
  .option('--base <branch>', 'base branch to merge into', 'main')
  .action(async (manifest: string, opts: { base: string }) => {
    console.log(await mergeCommand(manifest, process.cwd(), opts.base));
  });
```

- [ ] **Step 4: Run the new test and the full suite**

Run: `pnpm vitest run tests/commands/merge-cli.test.ts` — PASS.
Run: `pnpm test` — all green. Run `pnpm build` — exit 0.

- [ ] **Step 5: Update the skill and commit**

In `skills/multiagent/SKILL.md`, add a line under the numbered steps:
```markdown
5. Run `multiagent merge <manifest> --base main` to merge completed tasks in
   dependency order, one at a time, with a typecheck gate after each.
```

```bash
git add src/commands/merge.ts src/cli.ts skills/multiagent/SKILL.md src/core/merge.ts tests/commands/merge-cli.test.ts
git commit -m "feat: wire merge CLI command with base-branch option

Task: merge-cli"
```

---

## Self-Review

**Spec coverage (Milestone 2 = design §10 item 2, "Merge ordering"):**
- `graph.ts` eligibility → Task 1 (`getMergeable`, the spec §8 algorithm verbatim).
- Cycle check → Task 1 (`detectCycle`); wired into decomposition in Milestone 7.
- Typecheck gate at merge → Task 3 (`TypeScriptAdapter`) + Task 4 (gate after each merge).
- One-at-a-time dependency-ordered merge (§9 step 10) → Task 4.
- Status `-> mergeable` hint (deferred from Milestone 1) → Task 2.
- CLI surface → Task 5.
- **Deferred (not gaps):** contract re-hash at merge (Milestone 4 — no contracts exist yet), `builtAtContractVersion < contractVersion` warning (Milestone 4), full `LanguageAdapter` with `detect`/`proposeContracts` and target-repo `tsc` resolution (Milestone 5), dry run (Milestone 3).

**Placeholder scan:** none — all code and test steps are concrete.

**Type consistency:** `TTask`, `GateResult`/`LanguageAdapter`, `TypeScriptAdapter`, `MergeReport`, and signatures (`getMergeable`, `detectCycle`, `gate`, `mergeAll`, `mergeCommand`) are consistent across tasks. `renderStatusTable` keeps its Milestone 1 signature and existing test.

**Note:** Task 5 Step 2 refines `mergeAll` from Task 4 (defer the base-branch checkout until a task is actually eligible) so an empty run touches no git — an intentional, tested refinement, not a contradiction.
```
