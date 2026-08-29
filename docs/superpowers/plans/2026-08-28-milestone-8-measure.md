# Milestone 8: Conflict-Measurement Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Measure, for a repo with N agent branches, how many conflict when merged onto a base branch — the empirical number that shows whether the contract lock reduces conflicts (spec §5, §14). The experiment (producing a with-lock vs without-lock repo) is operational; this milestone builds the deterministic measurement.

**Architecture:** `measure.ts` attempts a no-commit merge of each branch onto the base, records `clean` vs `text-conflict`, and aborts so measurements are independent. A `measure` CLI command renders a summary with a conflict rate. Builds on Milestones 1-7.

**Tech Stack:** TypeScript (Node 20+), execa (git), vitest.

## Global Constraints

- Windows first; Node `path`. No emoji. Never leave the repo mid-merge — always abort/reset after measuring each branch.
- Commit style: conventional commits ending `Task: <task-name>`.

---

### Task 1: Measure per-branch merge conflicts (`measure.ts`)

**Files:**
- Create: `src/core/measure.ts`
- Test: `tests/core/measure.test.ts`

**Interfaces:**
- `type MergeOutcome = 'clean' | 'text-conflict'`
- `type MeasureResult = { branch: string; outcome: MergeOutcome }`
- `async function measureMerges(repoRoot: string, baseBranch: string, branches: string[]): Promise<MeasureResult[]>` — for each branch: checkout base, `git merge --no-commit --no-ff`, classify (`text-conflict` if merge exits non-zero or leaves conflicts), then `git merge --abort` (and `git reset --hard`) so the next measurement starts clean.
- `function renderMeasure(results: MeasureResult[]): string` — `N branches, M text-conflicts (P%)` plus one line per branch.

- [ ] **Step 1: Write the failing test**

`tests/core/measure.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureMerges, renderMeasure } from '../../src/core/measure.js';

async function repo(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-meas-'));
  const git = (a: string[]) => execa('git', a, { cwd: root });
  await git(['init', '-q', '-b', 'main']);
  await git(['config', 'user.email', 'r@t.local']);
  await git(['config', 'user.name', 'r']);
  await fs.writeFile(join(root, 'shared.txt'), 'line1\nline2\nline3\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'base']);
  // conflict branch: edits line2
  await git(['checkout', '-q', '-b', 'agent/conflict']);
  await fs.writeFile(join(root, 'shared.txt'), 'line1\nCONFLICT\nline3\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'c']);
  // base also edits line2 so the branch conflicts
  await git(['checkout', '-q', 'main']);
  await fs.writeFile(join(root, 'shared.txt'), 'line1\nMAIN\nline3\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'main-edit']);
  // clean branch: edits a NEW file
  await git(['checkout', '-q', '-b', 'agent/clean', 'main']);
  await fs.writeFile(join(root, 'new.txt'), 'hello\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'clean']);
  await git(['checkout', '-q', 'main']);
  return root;
}

describe('measureMerges', () => {
  let root: string;
  beforeEach(async () => { root = await repo(); });

  it('classifies each branch as clean or text-conflict and leaves base intact', async () => {
    const results = await measureMerges(root, 'main', ['agent/conflict', 'agent/clean']);
    expect(results).toEqual([
      { branch: 'agent/conflict', outcome: 'text-conflict' },
      { branch: 'agent/clean', outcome: 'clean' },
    ]);
    // base unchanged (still the main-edit commit, no merge left behind)
    const { stdout } = await execa('git', ['status', '--porcelain'], { cwd: root });
    expect(stdout).toBe('');
  });
});

describe('renderMeasure', () => {
  it('summarizes the conflict rate', () => {
    const out = renderMeasure([
      { branch: 'a', outcome: 'text-conflict' },
      { branch: 'b', outcome: 'clean' },
    ]);
    expect(out).toMatch(/2 branches/);
    expect(out).toMatch(/1 text-conflicts \(50%\)/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/core/measure.ts`:
```ts
import { execa } from 'execa';

export type MergeOutcome = 'clean' | 'text-conflict';
export type MeasureResult = { branch: string; outcome: MergeOutcome };

export async function measureMerges(
  repoRoot: string,
  baseBranch: string,
  branches: string[],
): Promise<MeasureResult[]> {
  const git = (args: string[]) => execa('git', args, { cwd: repoRoot, reject: false });
  const results: MeasureResult[] = [];
  for (const branch of branches) {
    await git(['checkout', baseBranch]);
    const res = await git(['merge', '--no-commit', '--no-ff', branch]);
    const outcome: MergeOutcome = res.exitCode === 0 ? 'clean' : 'text-conflict';
    await git(['merge', '--abort']);
    await git(['reset', '--hard']);
    results.push({ branch, outcome });
  }
  return results;
}

export function renderMeasure(results: MeasureResult[]): string {
  const conflicts = results.filter((r) => r.outcome === 'text-conflict').length;
  const pct = results.length ? Math.round((conflicts / results.length) * 100) : 0;
  const lines = results.map((r) => `${r.branch}   ${r.outcome}`);
  return `${lines.join('\n')}\n\n${results.length} branches, ${conflicts} text-conflicts (${pct}%)`;
}
```

Note: a clean `--no-commit` merge leaves the merge staged; `git merge --abort` unwinds it. For the clean case `--abort` may report nothing to abort, which is why `reset --hard` follows to guarantee a clean tree. Both run with `reject: false`.

- [ ] **Step 4: Run — expect PASS.** If `merge --abort` errors on the clean (already-staged) case and leaves state, confirm the trailing `reset --hard` clears it (the test asserts a clean `status --porcelain`).

- [ ] **Step 5: Commit** — `Task: measure`

---

### Task 2: `measure` CLI command

**Files:**
- Create: `src/commands/measure.ts`
- Modify: `src/cli.ts`
- Test: covered by Task 1 (`measureMerges`/`renderMeasure`); the command is a thin wrapper.

**Interfaces:**
- `async function measureCommand(repoRoot: string, baseBranch: string, branches: string[]): Promise<string>` — returns `renderMeasure(await measureMerges(...))`.

- [ ] **Step 1: Implement**

`src/commands/measure.ts`:
```ts
import { measureMerges, renderMeasure } from '../core/measure.js';

export async function measureCommand(
  repoRoot: string,
  baseBranch: string,
  branches: string[],
): Promise<string> {
  return renderMeasure(await measureMerges(repoRoot, baseBranch, branches));
}
```

Wire `src/cli.ts`:
```ts
import { measureCommand } from './commands/measure.js';
```
```ts
program
  .command('measure <baseBranch> [branches...]')
  .description('Measure how many of the given branches conflict when merged onto base.')
  .action(async (baseBranch: string, branches: string[]) => {
    console.log(await measureCommand(process.cwd(), baseBranch, branches ?? []));
  });
```

- [ ] **Step 2: Full suite + build. Commit** — `Task: measure-cli`

---

## Self-Review

**Spec coverage (spec §5 measurements, §14 bootstrap experiment):** deterministic per-branch conflict measurement + a conflict-rate summary → Tasks 1-2. The with-lock vs without-lock comparison is run by pointing `measure` at each repo's branches. **Placeholder scan:** none. **Type consistency:** `MergeOutcome`, `MeasureResult`, `measureMerges`, `renderMeasure`, `measureCommand` consistent.
```
