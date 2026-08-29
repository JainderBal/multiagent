# Milestone 4: Contract Lock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Freeze a set of contract files (hash them + write VERSION), enforce the freeze with a pre-commit hook and a merge-time re-hash, support versioned arbitration (bump + re-hash), and compute which agents a contract change affects.

**Architecture:** `contracts.ts` owns hashing, freeze, verify, and bump (pure fs + a `TManifest`). A pre-commit hook installed into the repo's shared hooks path blocks commits that stage contract files (fast feedback). The real guarantee is at merge: `mergeAll` re-hashes contracts after each merge and rolls back any branch that changed a frozen file. `computeAffected` maps changed contract symbols to the tasks that provide/consume them, for the orchestrator to notify. Builds on Milestones 1-3.

**Tech Stack:** TypeScript (Node 20+), node:crypto (sha256), execa (git), zod, vitest.

**Spec:** `docs/design/2026-08-28-multiagent-design.md` §5-§6. Contract *generation* (extracting declarations from the graph) is LLM-driven and lives in Milestone 7; this milestone freezes and enforces contract files that already exist.

## Global Constraints

- Platform Windows first; Node `path`, posix-normalized hash keys. No emoji.
- Contract directory default: `packages/contracts` relative to repo root (configurable).
- Hashes are SHA-256 over file bytes; keys are contract-dir-relative posix paths, and include the `VERSION` file.
- The pre-commit hook is **fast feedback only** and is bypassable (`--no-verify`); the merge-time re-hash is the real gate.
- Commit style: conventional commits ending `Task: <task-name>`.

---

### Task 1: Contract hashing, freeze, verify, bump (`contracts.ts`)

**Files:**
- Create: `src/core/contracts.ts`
- Test: `tests/core/contracts.test.ts`

**Interfaces:**
- Consumes: `loadManifest`, `saveManifest`, `TManifest` (`manifest.ts`).
- Produces:
  - `async function hashContracts(contractDir: string): Promise<Record<string, string>>` — sha256 of every file under `contractDir`, keyed by posix relative path. Missing dir → `{}`.
  - `async function freezeContracts(contractDir: string, manifestPath: string): Promise<Record<string,string>>` — writes `contractDir/VERSION` = manifest.contractVersion, then hashes (VERSION included), stores in `manifest.contractHashes`, saves manifest, returns the hashes.
  - `async function verifyContracts(contractDir: string, manifest: TManifest): Promise<{ ok: boolean; mismatches: string[] }>` — recompute and compare to `manifest.contractHashes`; mismatches = added/removed/changed keys.
  - `async function bumpContracts(contractDir: string, manifestPath: string): Promise<number>` — increment `manifest.contractVersion`, rewrite VERSION, re-hash, save; return the new version.

- [ ] **Step 1: Write the failing test**

`tests/core/contracts.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashContracts, freezeContracts, verifyContracts, bumpContracts } from '../../src/core/contracts.js';
import { loadManifest, saveManifest, type TManifest } from '../../src/core/manifest.js';

function baseManifest(): TManifest {
  return {
    run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
    agents: [], tasks: [],
  } as TManifest;
}

async function setup(): Promise<{ dir: string; contractDir: string; mPath: string }> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'ma-con-'));
  const contractDir = join(dir, 'packages', 'contracts');
  await fs.mkdir(contractDir, { recursive: true });
  await fs.writeFile(join(contractDir, 'notifications.ts'), 'export interface N { id: string }\n');
  const mPath = join(dir, 'manifest.json');
  await saveManifest(mPath, baseManifest());
  return { dir, contractDir, mPath };
}

describe('freeze + verify', () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { s = await setup(); });

  it('freeze writes VERSION and stores hashes; verify passes unchanged', async () => {
    const hashes = await freezeContracts(s.contractDir, s.mPath);
    expect(Object.keys(hashes)).toContain('notifications.ts');
    expect(Object.keys(hashes)).toContain('VERSION');
    expect((await fs.readFile(join(s.contractDir, 'VERSION'), 'utf8')).trim()).toBe('1');
    const m = await loadManifest(s.mPath);
    const v = await verifyContracts(s.contractDir, m);
    expect(v.ok).toBe(true);
    expect(v.mismatches).toEqual([]);
  });

  it('verify detects a tampered contract file', async () => {
    await freezeContracts(s.contractDir, s.mPath);
    const m = await loadManifest(s.mPath);
    await fs.writeFile(join(s.contractDir, 'notifications.ts'), 'export interface N { id: number }\n');
    const v = await verifyContracts(s.contractDir, m);
    expect(v.ok).toBe(false);
    expect(v.mismatches).toContain('notifications.ts');
  });

  it('bump increments VERSION and re-hashes so verify passes again', async () => {
    await freezeContracts(s.contractDir, s.mPath);
    const newV = await bumpContracts(s.contractDir, s.mPath);
    expect(newV).toBe(2);
    expect((await fs.readFile(join(s.contractDir, 'VERSION'), 'utf8')).trim()).toBe('2');
    const m = await loadManifest(s.mPath);
    expect(m.contractVersion).toBe(2);
    const v = await verifyContracts(s.contractDir, m);
    expect(v.ok).toBe(true);
  });
});

describe('hashContracts', () => {
  it('returns empty for a missing directory', async () => {
    expect(await hashContracts(join(tmpdir(), 'does-not-exist-xyz'))).toEqual({});
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.** `pnpm vitest run tests/core/contracts.test.ts`

- [ ] **Step 3: Implement**

`src/core/contracts.ts`:
```ts
import { promises as fs } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { loadManifest, saveManifest, type TManifest } from './manifest.js';

async function walk(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function posix(p: string): string {
  return p.split(sep).join('/');
}

export async function hashContracts(contractDir: string): Promise<Record<string, string>> {
  const files = await walk(contractDir);
  const out: Record<string, string> = {};
  for (const f of files.sort()) {
    const buf = await fs.readFile(f);
    out[posix(relative(contractDir, f))] = createHash('sha256').update(buf).digest('hex');
  }
  return out;
}

export async function freezeContracts(
  contractDir: string,
  manifestPath: string,
): Promise<Record<string, string>> {
  const m = await loadManifest(manifestPath);
  await fs.writeFile(join(contractDir, 'VERSION'), `${m.contractVersion}\n`, 'utf8');
  const hashes = await hashContracts(contractDir);
  m.contractHashes = hashes;
  await saveManifest(manifestPath, m);
  return hashes;
}

export async function verifyContracts(
  contractDir: string,
  manifest: TManifest,
): Promise<{ ok: boolean; mismatches: string[] }> {
  const current = await hashContracts(contractDir);
  const expected = manifest.contractHashes;
  const keys = new Set([...Object.keys(current), ...Object.keys(expected)]);
  const mismatches: string[] = [];
  for (const k of keys) {
    if (current[k] !== expected[k]) mismatches.push(k);
  }
  return { ok: mismatches.length === 0, mismatches: mismatches.sort() };
}

export async function bumpContracts(contractDir: string, manifestPath: string): Promise<number> {
  const m = await loadManifest(manifestPath);
  m.contractVersion += 1;
  await fs.writeFile(join(contractDir, 'VERSION'), `${m.contractVersion}\n`, 'utf8');
  m.contractHashes = await hashContracts(contractDir);
  await saveManifest(manifestPath, m);
  return m.contractVersion;
}
```

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Commit** — `Task: contracts`

---

### Task 2: Pre-commit hook install (`contracthook.ts`)

**Files:**
- Create: `src/core/contracthook.ts`
- Create: `templates/pre-commit` (reference copy; the installer generates the real one)
- Test: `tests/core/contracthook.test.ts`

**Interfaces:**
- Consumes: execa (`git rev-parse --git-common-dir`).
- Produces:
  - `async function installContractHook(repoRoot: string, contractDirRel: string): Promise<string>` — resolves the shared hooks dir, writes an executable `pre-commit` that blocks commits staging files under `<contractDirRel>/`, returns the hook path.

- [ ] **Step 1: Write the failing test**

`tests/core/contracthook.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installContractHook } from '../../src/core/contracthook.js';

async function repo(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-hook-'));
  const git = (a: string[]) => execa('git', a, { cwd: root });
  await git(['init', '-q', '-b', 'main']);
  await git(['config', 'user.email', 'r@t.local']);
  await git(['config', 'user.name', 'r']);
  await fs.mkdir(join(root, 'packages', 'contracts'), { recursive: true });
  await fs.writeFile(join(root, 'packages', 'contracts', 'c.ts'), 'export const x = 1;\n');
  await fs.writeFile(join(root, 'app.ts'), 'export const y = 2;\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'base']);
  return root;
}

describe('installContractHook', () => {
  let root: string;
  beforeEach(async () => { root = await repo(); });

  it('blocks a commit that stages a contract file', async () => {
    await installContractHook(root, 'packages/contracts');
    await fs.writeFile(join(root, 'packages', 'contracts', 'c.ts'), 'export const x = 2;\n');
    await execa('git', ['add', '-A'], { cwd: root });
    const res = await execa('git', ['commit', '-m', 'touch contract'], { cwd: root, reject: false });
    expect(res.exitCode).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/BLOCKED/);
  });

  it('allows a commit that stages only non-contract files', async () => {
    await installContractHook(root, 'packages/contracts');
    await fs.writeFile(join(root, 'app.ts'), 'export const y = 3;\n');
    await execa('git', ['add', '-A'], { cwd: root });
    const res = await execa('git', ['commit', '-m', 'touch app'], { cwd: root, reject: false });
    expect(res.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.**

- [ ] **Step 3: Implement**

`src/core/contracthook.ts`:
```ts
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';

export async function installContractHook(
  repoRoot: string,
  contractDirRel: string,
): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--git-common-dir'], { cwd: repoRoot });
  const gitDir = isAbsolute(stdout) ? stdout : resolve(repoRoot, stdout);
  const hooksDir = join(gitDir, 'hooks');
  await fs.mkdir(hooksDir, { recursive: true });
  const rel = contractDirRel.replace(/\/+$/, '');
  const script = `#!/bin/sh
if git diff --cached --name-only | grep -q '^${rel}/'; then
  echo "BLOCKED: contracts are frozen. File a change request instead."
  echo "  Write a request under the run's requests/ directory and stop."
  exit 1
fi
`;
  const hookPath = join(hooksDir, 'pre-commit');
  await fs.writeFile(hookPath, script, { mode: 0o755 });
  await fs.chmod(hookPath, 0o755).catch(() => {});
  return hookPath;
}
```

`templates/pre-commit` (reference copy committed for readers; not used at runtime):
```sh
#!/bin/sh
if git diff --cached --name-only | grep -q '^packages/contracts/'; then
  echo "BLOCKED: contracts are frozen. File a change request instead."
  exit 1
fi
```

- [ ] **Step 4: Run test — expect PASS.** If Git for Windows does not execute the hook (no block observed), confirm the hook file has LF endings and a `#!/bin/sh` shebang; git ships its own `sh`, so no system change is needed.

- [ ] **Step 5: Commit** — `Task: contract-hook`

---

### Task 3: Affected-agent computation (`computeAffected` in `contracts.ts`)

**Files:**
- Modify: `src/core/contracts.ts`
- Test: `tests/core/affected.test.ts`

**Interfaces:**
- Consumes: `TTask` (`manifest.ts`).
- Produces: `function computeAffected(tasks: TTask[], changedSymbols: string[]): string[]` — names of tasks whose `provides` or `consumes` intersects `changedSymbols`, deduped, in task order.

- [ ] **Step 1: Write the failing test**

`tests/core/affected.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeAffected } from '../../src/core/contracts.js';
import type { TTask } from '../../src/core/manifest.js';

function t(name: string, provides: string[], consumes: string[]): TTask {
  return {
    name, branch: `agent/${name}`, worktree: `../w-${name}`, sessionName: name,
    dependsOn: [], provides, consumes, status: 'running', builtAtContractVersion: 1,
  };
}

describe('computeAffected', () => {
  it('returns tasks that provide or consume a changed symbol', () => {
    const tasks = [
      t('svc', ['NotificationService'], []),
      t('api', [], ['NotificationService']),
      t('ui', [], ['BellProps']),
    ];
    expect(computeAffected(tasks, ['NotificationService'])).toEqual(['svc', 'api']);
  });
  it('returns nothing when no symbol matches', () => {
    expect(computeAffected([t('a', ['X'], [])], ['Y'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (function not exported).

- [ ] **Step 3: Add to `src/core/contracts.ts`**

Append:
```ts
import type { TTask } from './manifest.js';

export function computeAffected(tasks: TTask[], changedSymbols: string[]): string[] {
  const changed = new Set(changedSymbols);
  return tasks
    .filter((t) => [...t.provides, ...t.consumes].some((s) => changed.has(s)))
    .map((t) => t.name);
}
```
(Adjust the existing `import` from `./manifest.js` to also bring in `TTask`, or add the separate import shown.)

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Commit** — `Task: affected`

---

### Task 4: Merge-time contract enforcement + staleness warnings (`merge.ts`)

**Files:**
- Modify: `src/core/merge.ts`
- Test: `tests/core/merge-contracts.test.ts`

**Interfaces:**
- Consumes: `verifyContracts` (`contracts.ts`).
- Produces: `mergeAll` gains an optional `contractDir` parameter (absolute; default `join(repoRoot, 'packages/contracts')`) and the report gains `warnings: string[]`:
  - `async function mergeAll(manifestPath, repoRoot, baseBranch, adapter, contractDir?): Promise<MergeReport>` where `MergeReport = { merged: string[]; warnings: string[]; stoppedAt?: { task: string; reason: string } }`.
  - After a successful git merge and before/with the gate, if `Object.keys(manifest.contractHashes).length > 0`, run `verifyContracts`; on mismatch, `git reset --hard HEAD~1` and stop with reason `contract violation: <files>`.
  - For each merged task with `builtAtContractVersion !== null && builtAtContractVersion < contractVersion`, push a warning `"<task> built at contract v<X>, current v<Y>"`.

- [ ] **Step 1: Write the failing test**

`tests/core/merge-contracts.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeAll } from '../../src/core/merge.js';
import { saveManifest, loadManifest, type TManifest } from '../../src/core/manifest.js';
import { freezeContracts } from '../../src/core/contracts.js';
import { TypeScriptAdapter } from '../../src/adapters/language-typescript.js';

async function repo(): Promise<{ root: string; contractDir: string }> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-mc-'));
  const contractDir = join(root, 'packages', 'contracts');
  const git = (a: string[]) => execa('git', a, { cwd: root });
  await git(['init', '-q', '-b', 'main']);
  await git(['config', 'user.email', 'r@t.local']);
  await git(['config', 'user.name', 'r']);
  await fs.writeFile(join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, include: ['**/*.ts'],
  }));
  await fs.mkdir(contractDir, { recursive: true });
  await fs.writeFile(join(contractDir, 'c.ts'), 'export interface C { id: string }\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'base']);
  return { root, contractDir };
}

function manifest(): TManifest {
  return {
    run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
    agents: [], tasks: [{
      name: 'bad', branch: 'agent/bad', worktree: '../w-bad', sessionName: 'bad',
      dependsOn: [], provides: [], consumes: [], status: 'done', builtAtContractVersion: 1,
    }],
  } as TManifest;
}

describe('merge-time contract enforcement', () => {
  let root: string; let contractDir: string;
  beforeEach(async () => { ({ root, contractDir } = await repo()); });

  it('rolls back a branch that modified a frozen contract', async () => {
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, manifest());
    await freezeContracts(contractDir, mPath); // stores hashes + VERSION, commit needed
    await execa('git', ['add', '-A'], { cwd: root });
    await execa('git', ['commit', '-q', '-m', 'freeze'], { cwd: root });

    // A branch that edits the frozen contract.
    await execa('git', ['checkout', '-q', '-b', 'agent/bad'], { cwd: root });
    await fs.writeFile(join(contractDir, 'c.ts'), 'export interface C { id: number }\n');
    await execa('git', ['add', '-A'], { cwd: root });
    await execa('git', ['commit', '-q', '--no-verify', '-m', 'tamper'], { cwd: root });
    await execa('git', ['checkout', '-q', 'main'], { cwd: root });

    const report = await mergeAll(mPath, root, 'main', new TypeScriptAdapter(), contractDir);
    expect(report.merged).toEqual([]);
    expect(report.stoppedAt?.reason).toMatch(/contract violation/);
    // main's contract file is unchanged.
    expect(await fs.readFile(join(contractDir, 'c.ts'), 'utf8')).toMatch(/id: string/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (mergeAll ignores contracts / signature).

- [ ] **Step 3: Update `src/core/merge.ts`**

Add the import and extend the type + loop:
```ts
import { join } from 'node:path';
import { verifyContracts } from './contracts.js';
```
Change `MergeReport`:
```ts
export type MergeReport = {
  merged: string[];
  warnings: string[];
  stoppedAt?: { task: string; reason: string };
};
```
Change the signature and body:
```ts
export async function mergeAll(
  manifestPath: string,
  repoRoot: string,
  baseBranch: string,
  adapter: LanguageAdapter,
  contractDir: string = join(repoRoot, 'packages', 'contracts'),
): Promise<MergeReport> {
  const merged: string[] = [];
  const warnings: string[] = [];
  const git = (args: string[]) => execa('git', args, { cwd: repoRoot, reject: false });
  let checkedOut = false;

  for (;;) {
    const m = await loadManifest(manifestPath);
    const eligible = getMergeable(m.tasks);
    if (eligible.length === 0) return { merged, warnings };
    const task = eligible[0];

    if (!checkedOut) { await git(['checkout', baseBranch]); checkedOut = true; }

    const mergeRes = await git(['merge', '--no-ff', '-m', `merge ${task.name}`, task.branch]);
    if (mergeRes.exitCode !== 0) {
      await git(['merge', '--abort']);
      return { merged, warnings, stoppedAt: { task: task.name, reason: 'merge conflict' } };
    }

    if (Object.keys(m.contractHashes).length > 0) {
      const v = await verifyContracts(contractDir, m);
      if (!v.ok) {
        await git(['reset', '--hard', 'HEAD~1']);
        return {
          merged, warnings,
          stoppedAt: { task: task.name, reason: `contract violation: ${v.mismatches.join(', ')}` },
        };
      }
    }

    const gate = await adapter.gate(repoRoot);
    if (!gate.ok) {
      await git(['reset', '--hard', 'HEAD~1']);
      return { merged, warnings, stoppedAt: { task: task.name, reason: `gate failed:\n${gate.output}` } };
    }

    if (task.builtAtContractVersion !== null && task.builtAtContractVersion < m.contractVersion) {
      warnings.push(`${task.name} built at contract v${task.builtAtContractVersion}, current v${m.contractVersion}`);
    }

    task.status = 'merged';
    await saveManifest(manifestPath, m);
    merged.push(task.name);
  }
}
```

- [ ] **Step 4: Run tests — expect PASS.** Run `tests/core/merge-contracts.test.ts` AND the existing `tests/core/merge.test.ts` (the 4-arg calls still work; those repos have empty `contractHashes` so the contract check is skipped). Update `merge.test.ts` assertions if they destructure `MergeReport` without `warnings` — they only read `.merged`/`.stoppedAt`, so no change needed.

- [ ] **Step 5: Commit** — `Task: merge-contracts`

---

### Task 5: CLI + skill — `freeze`, `verify`, hook install in `materialize`

**Files:**
- Create: `src/commands/freeze.ts`
- Modify: `src/commands/materialize.ts` (install the contract hook after creating worktrees)
- Modify: `src/cli.ts`
- Modify: `skills/multiagent/SKILL.md`
- Modify: `src/commands/merge.ts` (surface warnings)
- Test: `tests/commands/freeze.test.ts`

**Interfaces:**
- Produces:
  - `async function freezeCommand(manifestPath: string, repoRoot: string, contractDirRel: string): Promise<string>` — freezes contracts and returns `frozen N files at contract v<version>`.
  - `materialize` gains a `contractDirRel` param (default `packages/contracts`) and calls `installContractHook(repoRoot, contractDirRel)` once after creating worktrees.
  - `mergeCommand` appends any `warnings` to its summary.
  - CLI: `freeze <manifest> --contracts <dir>` and `verify <manifest> --contracts <dir>`.

- [ ] **Step 1: Write the failing test**

`tests/commands/freeze.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freezeCommand } from '../../src/commands/freeze.js';
import { saveManifest, type TManifest } from '../../src/core/manifest.js';

describe('freezeCommand', () => {
  it('freezes existing contract files and reports the version', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'ma-fz-'));
    const contractDir = join(root, 'packages', 'contracts');
    await fs.mkdir(contractDir, { recursive: true });
    await fs.writeFile(join(contractDir, 'c.ts'), 'export const x = 1;\n');
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, {
      run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
      agents: [], tasks: [],
    } as TManifest);

    const out = await freezeCommand(mPath, root, 'packages/contracts');
    expect(out).toMatch(/contract v1/);
    expect((await fs.readFile(join(contractDir, 'VERSION'), 'utf8')).trim()).toBe('1');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL.**

- [ ] **Step 3: Implement `freeze.ts`**

`src/commands/freeze.ts`:
```ts
import { join } from 'node:path';
import { freezeContracts } from '../core/contracts.js';

export async function freezeCommand(
  manifestPath: string,
  repoRoot: string,
  contractDirRel: string,
): Promise<string> {
  const contractDir = join(repoRoot, contractDirRel);
  const hashes = await freezeContracts(contractDir, manifestPath);
  const { loadManifest } = await import('../core/manifest.js');
  const m = await loadManifest(manifestPath);
  return `frozen ${Object.keys(hashes).length} files at contract v${m.contractVersion}`;
}
```

- [ ] **Step 4: Wire materialize + merge summary + CLI + skill**

In `src/commands/materialize.ts`, add param and hook install:
```ts
import { installContractHook } from '../core/contracthook.js';
```
Change the signature to `materialize(manifestPath, repoRoot, terminals, contractDirRel = 'packages/contracts')` and after the `for` loop (before `saveManifest`) add:
```ts
  await installContractHook(repoRoot, contractDirRel);
```
The existing `materialize.test.ts` calls `materialize(mPath, root, fake)` — the new param defaults, and `installContractHook` runs `git rev-parse` in the real temp repo, which succeeds. Keep the test as-is; it still passes.

In `src/commands/merge.ts`, append warnings:
```ts
  for (const w of report.warnings) lines.push(`warning: ${w}`);
```
(insert before `return lines.join('\n')`).

In `src/cli.ts` add imports and commands:
```ts
import { freezeCommand } from './commands/freeze.js';
import { verifyContracts } from './core/contracts.js';
import { loadManifest } from './core/manifest.js';
import { join } from 'node:path';
```
```ts
program
  .command('freeze <manifest>')
  .description('Hash the contract files and record VERSION + hashes in the manifest.')
  .option('--contracts <dir>', 'contract directory (relative to repo root)', 'packages/contracts')
  .action(async (manifest: string, opts: { contracts: string }) => {
    console.log(await freezeCommand(manifest, process.cwd(), opts.contracts));
  });

program
  .command('verify <manifest>')
  .description('Re-hash contracts and report any drift from the frozen hashes.')
  .option('--contracts <dir>', 'contract directory (relative to repo root)', 'packages/contracts')
  .action(async (manifest: string, opts: { contracts: string }) => {
    const m = await loadManifest(manifest);
    const v = await verifyContracts(join(process.cwd(), opts.contracts), m);
    console.log(v.ok ? 'contracts OK' : `contracts DRIFTED: ${v.mismatches.join(', ')}`);
  });
```

In `skills/multiagent/SKILL.md`, add after the materialize step:
```markdown
   Before agents begin, freeze the contract layer: `multiagent freeze <manifest>`
   writes VERSION and records hashes, and `materialize` installs a pre-commit
   hook blocking edits to frozen contracts. On a blocked change, the agent writes
   a request; you approve, then bump the contract version and message only the
   affected agents to re-read.
```

- [ ] **Step 5: Full suite + build + commit**

Run `pnpm test` (all green) and `pnpm build` (exit 0). Verify `node dist/cli.js --help` lists `freeze` and `verify`.
Commit — `Task: contract-cli`.

---

## Self-Review

**Spec coverage (design §5-§6):**
- Freeze (VERSION + SHA-256 into manifest) → Task 1 `freezeContracts`.
- Hard enforcement: pre-commit hook → Task 2; merge-time re-hash + block → Task 4.
- Soft enforcement (prompt scope) → skill text (Task 5).
- Arbitration: version bump + re-hash → Task 1 `bumpContracts`; notify only affected agents → Task 3 `computeAffected` (skill drives the messaging).
- `builtAtContractVersion < contractVersion` warning at merge → Task 4.
- CLI surface (`freeze`, `verify`) + hook install wired into `materialize` → Task 5.
- **Deferred (not gaps):** contract *generation*/extraction from the graph (LLM-driven) → Milestone 7; the request/approve UI is orchestrator (skill) behavior over the files `computeAffected`/`listRequests` expose.

**Placeholder scan:** none. **Type consistency:** `MergeReport` now includes `warnings` everywhere it is constructed (Task 4); `hashContracts`/`freezeContracts`/`verifyContracts`/`bumpContracts`/`computeAffected`/`installContractHook`/`freezeCommand` names consistent across tasks. `merge.test.ts` reads only `.merged`/`.stoppedAt`, unaffected by the added `warnings` field.
```
