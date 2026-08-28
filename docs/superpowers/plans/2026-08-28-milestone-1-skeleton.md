# Milestone 1: Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Node CLI + minimal plugin skill that materializes one git worktree and one terminal window per task from a hand-written manifest, renders a status table, and tears everything down — validated end-to-end with three fake tasks.

**Architecture:** The plugin splits into (a) a deterministic **Node CLI** that does all mechanical work (worktrees, terminals, manifest I/O, status, cleanup) and is fully unit/integration tested, and (b) a **skill** (`SKILL.md`) that drives the orchestrator Claude and, in later milestones, coordinates workers via the `SendMessage` cross-session-messaging tool. Milestone 1 builds the deterministic core plus a minimal skill; agent *messaging* is exercised only in the manual end-to-end validation, because it is Claude behavior, not Node code.

**Tech Stack:** TypeScript (Node 20+), pnpm, commander (CLI), zod (schema), execa (git/shell), vitest (tests). No `chalk`/`cli-table3` yet — status output is plain padded columns to match the spec's borderless sample and stay trivially testable.

**Spec:** `docs/design/2026-08-28-multiagent-design.md` (and origin vision `docs/original-spec.md`)

## Global Constraints

- **Platform:** Windows first. Never assume POSIX paths — use Node `path` everywhere. Terminal spawning uses `wt.exe` with a `start`/`cmd` fallback.
- **Runtime floor:** the tool targets Claude Code **v2.1.234+** on Windows (cross-session messaging). Not exercised in M1 but documented in the skill.
- **Naming rule (spec §7):** task `name` is the single source; `branch`, `worktree`, and `sessionName` are *derived* from it, never hand-typed. Branch = `agent/<name>`, worktree = `../<repoName>-<name>`, sessionName = `<name>`.
- **No emoji** in any CLI output.
- **Status enum:** exactly `pending | running | done | blocked | merged`.
- **Commit style:** conventional commits; end each commit body with `Task: <task-name>` when applicable. Frequent commits — one per completed task minimum.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.claude-plugin/plugin.json`
- Create: `src/index.ts` (temporary smoke export)
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a compiling TS project where `pnpm test` and `pnpm build` succeed. Later tasks add modules under `src/`.

- [ ] **Step 1: Write the failing test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { version } from '../src/index.js';

describe('scaffold', () => {
  it('exposes a version string', () => {
    expect(version).toBe('0.0.0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/smoke.test.ts`
Expected: FAIL — cannot resolve `../src/index.js` (module does not exist).

- [ ] **Step 3: Create the scaffold files**

`package.json`:
```json
{
  "name": "multiagent",
  "version": "0.0.0",
  "type": "module",
  "bin": { "multiagent": "dist/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "vitest"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "commander": "^12.1.0",
    "zod": "^3.23.8",
    "execa": "^9.3.0"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "@types/node": "^20.14.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

`.claude-plugin/plugin.json`:
```json
{
  "name": "multiagent",
  "description": "Run parallel Claude Code agents against a frozen contract layer.",
  "version": "0.0.0"
}
```

`src/index.ts`:
```ts
export const version = '0.0.0';
```

- [ ] **Step 4: Install and run the test**

Run: `pnpm install && pnpm vitest run tests/smoke.test.ts`
Expected: PASS. Also run `pnpm build` and expect `dist/` to be produced with no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .claude-plugin/plugin.json src/index.ts tests/smoke.test.ts pnpm-lock.yaml
git commit -m "chore: scaffold TypeScript project with vitest and plugin manifest"
```

---

### Task 2: Task-name derivation (`naming.ts`)

**Files:**
- Create: `src/core/naming.ts`
- Test: `tests/core/naming.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TaskNames = { branch: string; worktree: string; sessionName: string }`
  - `function deriveNames(name: string, repoName: string): TaskNames`
  - `function assertValidTaskName(name: string): void` — throws `Error` if `name` is not kebab-case `^[a-z0-9]+(-[a-z0-9]+)*$`.

- [ ] **Step 1: Write the failing test**

`tests/core/naming.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveNames, assertValidTaskName } from '../../src/core/naming.js';

describe('deriveNames', () => {
  it('derives branch, worktree, and session name from a task name', () => {
    expect(deriveNames('notification-service', 'repo')).toEqual({
      branch: 'agent/notification-service',
      worktree: '../repo-notification-service',
      sessionName: 'notification-service',
    });
  });
});

describe('assertValidTaskName', () => {
  it('accepts kebab-case', () => {
    expect(() => assertValidTaskName('ui-bell')).not.toThrow();
  });
  it('rejects spaces and uppercase', () => {
    expect(() => assertValidTaskName('UI Bell')).toThrow();
    expect(() => assertValidTaskName('Ui-Bell')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/naming.test.ts`
Expected: FAIL — module `naming.js` not found.

- [ ] **Step 3: Write minimal implementation**

`src/core/naming.ts`:
```ts
export type TaskNames = {
  branch: string;
  worktree: string;
  sessionName: string;
};

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function assertValidTaskName(name: string): void {
  if (!KEBAB.test(name)) {
    throw new Error(
      `Invalid task name "${name}": must be kebab-case (lowercase letters, digits, hyphens).`,
    );
  }
}

export function deriveNames(name: string, repoName: string): TaskNames {
  assertValidTaskName(name);
  return {
    branch: `agent/${name}`,
    worktree: `../${repoName}-${name}`,
    sessionName: name,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/naming.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/naming.ts tests/core/naming.test.ts
git commit -m "feat: derive branch/worktree/session names from task name"
```

---

### Task 3: Manifest schema and I/O (`manifest.ts`)

**Files:**
- Create: `src/core/manifest.ts`
- Test: `tests/core/manifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Zod schemas `Task`, `AgentConfig`, `Manifest` and inferred types `TTask`, `TManifest`.
  - `function parseManifest(data: unknown): TManifest` — throws on invalid.
  - `async function loadManifest(path: string): Promise<TManifest>`
  - `async function saveManifest(path: string, m: TManifest): Promise<void>` (pretty JSON, trailing newline).

- [ ] **Step 1: Write the failing test**

`tests/core/manifest.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseManifest, loadManifest, saveManifest } from '../../src/core/manifest.js';

const valid = {
  run: '2026-08-28-notifications',
  spec: 'notifications.md',
  adapter: 'typescript',
  contractVersion: 1,
  contractHashes: {},
  agents: [],
  tasks: [
    {
      name: 'shared-types',
      branch: 'agent/shared-types',
      worktree: '../repo-shared-types',
      sessionName: 'shared-types',
      dependsOn: [],
      provides: ['Notification'],
      consumes: [],
      status: 'pending',
      builtAtContractVersion: null,
    },
  ],
};

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    expect(parseManifest(valid).run).toBe('2026-08-28-notifications');
  });
  it('rejects an invalid status enum', () => {
    const bad = structuredClone(valid);
    bad.tasks[0].status = 'wip';
    expect(() => parseManifest(bad)).toThrow();
  });
});

describe('load/save round-trip', () => {
  it('saves and reloads identically', async () => {
    const p = join(await fs.mkdtemp(join(tmpdir(), 'ma-')), 'manifest.json');
    await saveManifest(p, parseManifest(valid));
    const back = await loadManifest(p);
    expect(back).toEqual(valid);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/manifest.test.ts`
Expected: FAIL — module `manifest.js` not found.

- [ ] **Step 3: Write minimal implementation**

`src/core/manifest.ts`:
```ts
import { promises as fs } from 'node:fs';
import { z } from 'zod';

export const AgentConfig = z.object({
  name: z.string(),
  description: z.string().default(''),
  hook: z.enum(['pre-execution', 'per-task', 'pre-merge', 'post-merge']).optional(),
  blocking: z.boolean().default(false),
  commits: z.boolean().default(false),
  workspace: z.enum(['own', 'read-only']).default('read-only'),
});

export const Task = z.object({
  name: z.string(),
  branch: z.string(),
  worktree: z.string(),
  sessionName: z.string(),
  dependsOn: z.array(z.string()),
  provides: z.array(z.string()),
  consumes: z.array(z.string()),
  status: z.enum(['pending', 'running', 'done', 'blocked', 'merged']),
  builtAtContractVersion: z.number().int().nullable(),
});

export const Manifest = z.object({
  run: z.string(),
  spec: z.string(),
  adapter: z.string(),
  contractVersion: z.number().int(),
  contractHashes: z.record(z.string()),
  agents: z.array(AgentConfig),
  tasks: z.array(Task),
});

export type TTask = z.infer<typeof Task>;
export type TManifest = z.infer<typeof Manifest>;

export function parseManifest(data: unknown): TManifest {
  return Manifest.parse(data);
}

export async function loadManifest(path: string): Promise<TManifest> {
  const raw = await fs.readFile(path, 'utf8');
  return parseManifest(JSON.parse(raw));
}

export async function saveManifest(path: string, m: TManifest): Promise<void> {
  await fs.writeFile(path, JSON.stringify(m, null, 2) + '\n', 'utf8');
}
```

Note: the round-trip test uses default-free fields so `toEqual(valid)` holds. Zod `.default()` on optional agent fields only applies when agents are present; the fixture has none.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/manifest.ts tests/core/manifest.test.ts
git commit -m "feat: add zod manifest schema with load/save"
```

---

### Task 4: Status table rendering (`status.ts`)

**Files:**
- Create: `src/core/status.ts`
- Test: `tests/core/status.test.ts`

**Interfaces:**
- Consumes: `TManifest`, `TTask` from `manifest.ts`.
- Produces: `function renderStatusTable(m: TManifest): string` — one line per task, columns `status` (pad 9) and `name`, plus a trailing hint: `-> mergeable` handled in a later milestone, so for M1 append `waits: <deps>` when a pending task has unmet dependencies (any dep not `merged`), else nothing. No emoji.

- [ ] **Step 1: Write the failing test**

`tests/core/status.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderStatusTable } from '../../src/core/status.js';
import { parseManifest } from '../../src/core/manifest.js';

const m = parseManifest({
  run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1,
  contractHashes: {}, agents: [],
  tasks: [
    { name: 'shared-types', branch: 'agent/shared-types', worktree: '../r-shared-types',
      sessionName: 'shared-types', dependsOn: [], provides: [], consumes: [],
      status: 'merged', builtAtContractVersion: 1 },
    { name: 'api-routes', branch: 'agent/api-routes', worktree: '../r-api-routes',
      sessionName: 'api-routes', dependsOn: ['shared-types'], provides: [], consumes: [],
      status: 'running', builtAtContractVersion: 1 },
    { name: 'ui-preferences', branch: 'agent/ui-preferences', worktree: '../r-ui-preferences',
      sessionName: 'ui-preferences', dependsOn: ['api-routes'], provides: [], consumes: [],
      status: 'pending', builtAtContractVersion: null },
  ],
});

describe('renderStatusTable', () => {
  it('renders aligned status + name with waits hint on blocked-by-deps', () => {
    expect(renderStatusTable(m)).toBe(
      'merged    shared-types\n' +
      'running   api-routes\n' +
      'pending   ui-preferences   waits: api-routes',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/core/status.ts`:
```ts
import type { TManifest, TTask } from './manifest.js';

function unmetDeps(task: TTask, byName: Map<string, TTask>): string[] {
  return task.dependsOn.filter((d) => byName.get(d)?.status !== 'merged');
}

export function renderStatusTable(m: TManifest): string {
  const byName = new Map(m.tasks.map((t) => [t.name, t]));
  return m.tasks
    .map((t) => {
      const left = `${t.status.padEnd(9)}${t.name}`;
      if (t.status === 'pending') {
        const waits = unmetDeps(t, byName);
        if (waits.length > 0) return `${left.padEnd(20)}   waits: ${waits.join(', ')}`;
      }
      return left;
    })
    .join('\n');
}
```

Note: `padEnd(20)` aligns the hint column for the sample data; the exact width only affects spacing, and the test pins it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/status.ts tests/core/status.test.ts
git commit -m "feat: render plain-text status table from manifest"
```

---

### Task 5: Terminal spawning adapter (`terminals.ts`, `terminals-windows.ts`)

**Files:**
- Create: `src/adapters/terminals.ts`
- Create: `src/adapters/terminals-windows.ts`
- Test: `tests/adapters/terminals-windows.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Terminals { open(opts: OpenOpts): Promise<void> }` and `type OpenOpts = { title: string; cwd: string; command: string }` in `terminals.ts`.
  - `function buildWindowsTerminalArgs(opts: OpenOpts): { file: string; args: string[] }` in `terminals-windows.ts` (pure, tested).
  - `class WindowsTerminals implements Terminals` whose `open` shells out via execa using the args from `buildWindowsTerminalArgs` (not unit-tested; exercised in E2E).

- [ ] **Step 1: Write the failing test**

`tests/adapters/terminals-windows.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildWindowsTerminalArgs } from '../../src/adapters/terminals-windows.js';

describe('buildWindowsTerminalArgs', () => {
  it('builds a Windows Terminal new-tab invocation with title, cwd, and command', () => {
    const { file, args } = buildWindowsTerminalArgs({
      title: 'api-routes',
      cwd: 'C:\\repo-api-routes',
      command: 'claude --name api-routes',
    });
    expect(file).toBe('wt.exe');
    expect(args).toEqual([
      '-w', '0', 'nt',
      '--title', 'api-routes',
      '-d', 'C:\\repo-api-routes',
      'cmd', '/k', 'claude --name api-routes',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/adapters/terminals-windows.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/adapters/terminals.ts`:
```ts
export type OpenOpts = { title: string; cwd: string; command: string };

export interface Terminals {
  open(opts: OpenOpts): Promise<void>;
}
```

`src/adapters/terminals-windows.ts`:
```ts
import { execa } from 'execa';
import type { OpenOpts, Terminals } from './terminals.js';

export function buildWindowsTerminalArgs(opts: OpenOpts): { file: string; args: string[] } {
  return {
    file: 'wt.exe',
    args: [
      '-w', '0', 'nt',
      '--title', opts.title,
      '-d', opts.cwd,
      'cmd', '/k', opts.command,
    ],
  };
}

export class WindowsTerminals implements Terminals {
  async open(opts: OpenOpts): Promise<void> {
    const { file, args } = buildWindowsTerminalArgs(opts);
    try {
      await execa(file, args, { windowsHide: false });
    } catch {
      // Fallback for machines without Windows Terminal.
      await execa('cmd', ['/c', 'start', opts.title, 'cmd', '/k', opts.command], {
        cwd: opts.cwd,
        windowsHide: false,
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/adapters/terminals-windows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/terminals.ts src/adapters/terminals-windows.ts tests/adapters/terminals-windows.test.ts
git commit -m "feat: build Windows Terminal spawn command with cmd fallback"
```

---

### Task 6: Worktree creation and teardown (`worktree.ts`)

**Files:**
- Create: `src/core/worktree.ts`
- Test: `tests/core/worktree.test.ts`

**Interfaces:**
- Consumes: nothing (takes explicit params).
- Produces:
  - `type WorktreeSpec = { repoRoot: string; branch: string; path: string; userName: string; userEmail: string }`
  - `async function createWorktree(spec: WorktreeSpec): Promise<void>` — runs `git worktree add -b <branch> <path>` then sets `user.name`/`user.email` **inside that worktree**.
  - `async function removeWorktree(repoRoot: string, path: string): Promise<void>` — `git worktree remove --force <path>`.

This is an **integration test** against a real temp git repo.

- [ ] **Step 1: Write the failing test**

`tests/core/worktree.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorktree, removeWorktree } from '../../src/core/worktree.js';

async function initRepo(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-repo-'));
  await execa('git', ['init', '-q'], { cwd: root });
  await execa('git', ['config', 'user.email', 'root@test.local'], { cwd: root });
  await execa('git', ['config', 'user.name', 'root'], { cwd: root });
  await fs.writeFile(join(root, 'README.md'), '# temp\n');
  await execa('git', ['add', '-A'], { cwd: root });
  await execa('git', ['commit', '-q', '-m', 'init'], { cwd: root });
  return root;
}

describe('worktree lifecycle', () => {
  let root: string;
  beforeEach(async () => { root = await initRepo(); });

  it('creates a worktree with its own branch and git identity, then removes it', async () => {
    const wt = join(root, '..', 'wt-alpha');
    await createWorktree({
      repoRoot: root, branch: 'agent/alpha', path: wt,
      userName: 'orchestrator/alpha', userEmail: 'alpha@orchestrator.local',
    });

    expect((await fs.stat(wt)).isDirectory()).toBe(true);
    const { stdout: name } = await execa('git', ['config', 'user.name'], { cwd: wt });
    expect(name).toBe('orchestrator/alpha');
    const { stdout: branches } = await execa('git', ['branch', '--list', 'agent/alpha'], { cwd: root });
    expect(branches).toContain('agent/alpha');

    await removeWorktree(root, wt);
    await expect(fs.stat(wt)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/worktree.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/core/worktree.ts`:
```ts
import { execa } from 'execa';

export type WorktreeSpec = {
  repoRoot: string;
  branch: string;
  path: string;
  userName: string;
  userEmail: string;
};

export async function createWorktree(spec: WorktreeSpec): Promise<void> {
  await execa('git', ['worktree', 'add', '-b', spec.branch, spec.path], { cwd: spec.repoRoot });
  await execa('git', ['config', 'user.name', spec.userName], { cwd: spec.path });
  await execa('git', ['config', 'user.email', spec.userEmail], { cwd: spec.path });
}

export async function removeWorktree(repoRoot: string, path: string): Promise<void> {
  await execa('git', ['worktree', 'remove', '--force', path], { cwd: repoRoot });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/worktree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/worktree.ts tests/core/worktree.test.ts
git commit -m "feat: create and remove worktrees with per-worktree git identity"
```

---

### Task 7: CLI wiring — `materialize`, `status`, `cleanup`

**Files:**
- Create: `src/cli.ts`
- Create: `src/commands/materialize.ts`
- Create: `src/commands/status.ts`
- Create: `src/commands/cleanup.ts`
- Create: `fixtures/three-fake-tasks/manifest.json`
- Test: `tests/commands/materialize.test.ts`

**Interfaces:**
- Consumes: `loadManifest`, `saveManifest` (`manifest.ts`); `renderStatusTable` (`status.ts`); `createWorktree`, `removeWorktree` (`worktree.ts`); `Terminals` (`terminals.ts`); `deriveNames` (`naming.ts`).
- Produces:
  - `async function materialize(manifestPath: string, repoRoot: string, terminals: Terminals): Promise<void>` — for each task: create its worktree (identity `orchestrator/<name>` / `<name>@orchestrator.local`), open its terminal running `claude --name <sessionName>`, and set the task `status` to `running`, saving the manifest.
  - `async function cleanup(manifestPath: string, repoRoot: string): Promise<void>` — remove every task worktree.
  - `src/cli.ts` registers `materialize <manifest>`, `status <manifest>`, `cleanup <manifest>` via commander; `status` prints `renderStatusTable`.

The test injects a **fake `Terminals`** so no real windows open.

- [ ] **Step 1: Write the failing test**

`tests/commands/materialize.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materialize } from '../../src/commands/materialize.js';
import { loadManifest } from '../../src/core/manifest.js';
import type { Terminals, OpenOpts } from '../../src/adapters/terminals.js';

async function initRepo(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-repo-'));
  await execa('git', ['init', '-q'], { cwd: root });
  await execa('git', ['config', 'user.email', 'root@test.local'], { cwd: root });
  await execa('git', ['config', 'user.name', 'root'], { cwd: root });
  await fs.writeFile(join(root, 'README.md'), '# temp\n');
  await execa('git', ['add', '-A'], { cwd: root });
  await execa('git', ['commit', '-q', '-m', 'init'], { cwd: root });
  return root;
}

function manifestFor(): unknown {
  const mk = (name: string) => ({
    name, branch: `agent/${name}`, worktree: `../wt-${name}`, sessionName: name,
    dependsOn: [], provides: [], consumes: [], status: 'pending', builtAtContractVersion: null,
  });
  return {
    run: 'fake', spec: 'fake.md', adapter: 'typescript', contractVersion: 1,
    contractHashes: {}, agents: [], tasks: [mk('alpha'), mk('beta'), mk('gamma')],
  };
}

describe('materialize', () => {
  let root: string;
  beforeEach(async () => { root = await initRepo(); });

  it('creates a worktree + terminal per task and marks each running', async () => {
    const mPath = join(root, 'manifest.json');
    // Rewrite worktree paths to absolute temp locations to avoid clutter.
    const raw: any = manifestFor();
    for (const t of raw.tasks) t.worktree = join(root, '..', `wt-${t.name}`);
    await fs.writeFile(mPath, JSON.stringify(raw));

    const opened: OpenOpts[] = [];
    const fake: Terminals = { open: async (o) => { opened.push(o); } };

    await materialize(mPath, root, fake);

    expect(opened.map((o) => o.title).sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(opened.every((o) => o.command === `claude --name ${o.title}`)).toBe(true);
    const after = await loadManifest(mPath);
    expect(after.tasks.every((t) => t.status === 'running')).toBe(true);
    for (const t of after.tasks) {
      expect((await fs.stat(t.worktree)).isDirectory()).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/commands/materialize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/commands/materialize.ts`:
```ts
import { loadManifest, saveManifest } from '../core/manifest.js';
import { createWorktree } from '../core/worktree.js';
import type { Terminals } from '../adapters/terminals.js';

export async function materialize(
  manifestPath: string,
  repoRoot: string,
  terminals: Terminals,
): Promise<void> {
  const m = await loadManifest(manifestPath);
  for (const t of m.tasks) {
    await createWorktree({
      repoRoot,
      branch: t.branch,
      path: t.worktree,
      userName: `orchestrator/${t.name}`,
      userEmail: `${t.name}@orchestrator.local`,
    });
    await terminals.open({
      title: t.sessionName,
      cwd: t.worktree,
      command: `claude --name ${t.sessionName}`,
    });
    t.status = 'running';
  }
  await saveManifest(manifestPath, m);
}
```

`src/commands/cleanup.ts`:
```ts
import { loadManifest } from '../core/manifest.js';
import { removeWorktree } from '../core/worktree.js';

export async function cleanup(manifestPath: string, repoRoot: string): Promise<void> {
  const m = await loadManifest(manifestPath);
  for (const t of m.tasks) {
    await removeWorktree(repoRoot, t.worktree).catch(() => {});
  }
}
```

`src/commands/status.ts`:
```ts
import { loadManifest } from '../core/manifest.js';
import { renderStatusTable } from '../core/status.js';

export async function status(manifestPath: string): Promise<string> {
  return renderStatusTable(await loadManifest(manifestPath));
}
```

`src/cli.ts`:
```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { materialize } from './commands/materialize.js';
import { cleanup } from './commands/cleanup.js';
import { status } from './commands/status.js';
import { WindowsTerminals } from './adapters/terminals-windows.js';

const program = new Command();
program.name('multiagent').description('Parallel Claude Code agents with a frozen contract layer.');

program
  .command('materialize <manifest>')
  .description('Create a worktree and terminal per task.')
  .action(async (manifest: string) => {
    await materialize(manifest, process.cwd(), new WindowsTerminals());
  });

program
  .command('status <manifest>')
  .description('Print the run status table.')
  .action(async (manifest: string) => {
    console.log(await status(manifest));
  });

program
  .command('cleanup <manifest>')
  .description('Remove all task worktrees.')
  .action(async (manifest: string) => {
    await cleanup(manifest, process.cwd());
  });

program.parseAsync();
```

`fixtures/three-fake-tasks/manifest.json`:
```json
{
  "run": "fake-run",
  "spec": "fake.md",
  "adapter": "typescript",
  "contractVersion": 1,
  "contractHashes": {},
  "agents": [],
  "tasks": [
    { "name": "alpha", "branch": "agent/alpha", "worktree": "../multiagent-alpha", "sessionName": "alpha", "dependsOn": [], "provides": [], "consumes": [], "status": "pending", "builtAtContractVersion": null },
    { "name": "beta", "branch": "agent/beta", "worktree": "../multiagent-beta", "sessionName": "beta", "dependsOn": [], "provides": [], "consumes": [], "status": "pending", "builtAtContractVersion": null },
    { "name": "gamma", "branch": "agent/gamma", "worktree": "../multiagent-gamma", "sessionName": "gamma", "dependsOn": [], "provides": [], "consumes": [], "status": "pending", "builtAtContractVersion": null }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/commands/materialize.test.ts`
Expected: PASS. Then run the whole suite: `pnpm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/commands/ fixtures/ tests/commands/materialize.test.ts
git commit -m "feat: wire materialize/status/cleanup CLI commands"
```

---

### Task 8: Minimal skill + manual end-to-end validation

**Files:**
- Create: `skills/multiagent/SKILL.md`
- Create: `docs/validation/milestone-1-e2e.md`

**Interfaces:**
- Consumes: the CLI from Task 7.
- Produces: a runnable manual validation proving worktrees + real terminals + the "wait for begin, then log done" loop work on Windows. Messaging is exercised by hand here (the orchestrator human/Claude sends `begin`), since automated `SendMessage` coordination arrives in a later milestone.

- [ ] **Step 1: Write the skill**

`skills/multiagent/SKILL.md`:
```markdown
---
name: multiagent
description: Run parallel Claude Code agents against a frozen contract layer. Milestone 1 covers materialize/status/cleanup only.
---

# multiagent (Milestone 1)

You are the orchestrator. Milestone 1 exercises the mechanical skeleton only —
no decomposition or contracts yet.

Requirements: Claude Code v2.1.234+ on Windows (for later cross-session
messaging), Node 20+, pnpm, and Windows Terminal (`wt.exe`) on PATH.

Given a manifest path:
1. Run `multiagent materialize <manifest>` — creates one worktree + one terminal
   window per task, each running `claude --name <task>`.
2. Each worker session is instructed (by its task, in a later milestone) to wait
   for a `begin` message before writing. For now, message each worker yourself.
3. Run `multiagent status <manifest>` to see the table.
4. Run `multiagent cleanup <manifest>` to remove worktrees.

Never edit frozen contract files (introduced in a later milestone). Coordinate
by messaging and by the committed manifest, never by editing another worker's files.
```

- [ ] **Step 2: Write the validation procedure**

`docs/validation/milestone-1-e2e.md`:
```markdown
# Milestone 1 — Manual E2E Validation

Prerequisites: a throwaway git repo with at least one commit; `multiagent` built
(`pnpm build`) and linked (`pnpm link --global`) or run via `node dist/cli.js`;
Windows Terminal installed.

1. Copy `fixtures/three-fake-tasks/manifest.json` into the throwaway repo root.
2. From the repo root, run: `node <path>/dist/cli.js materialize manifest.json`
3. **Expect:** three new terminal windows titled `alpha`, `beta`, `gamma`, each
   opened in `../multiagent-<name>`, each launching `claude --name <name>`.
4. In each worker window, type: "wait until I message you `begin`, then create
   `hello-<name>.txt` with the text `done` and stop." Confirm they wait.
5. From your orchestrator session, message each worker `begin` (e.g. via
   `SendMessage` / `@<name>` mention). **Expect:** each worker creates its file.
6. Run `node <path>/dist/cli.js status manifest.json`. **Expect:** all `running`.
7. Run `node <path>/dist/cli.js cleanup manifest.json`. **Expect:** the three
   worktree directories are gone.
8. Record any Windows-specific friction (paths, wt.exe, hook shell) as issues —
   surfacing these early is the whole point of the skeleton.
```

- [ ] **Step 3: Run the full automated suite**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 4: Perform the manual E2E once and note results**

Follow `docs/validation/milestone-1-e2e.md` against a throwaway repo. Fix any
blocking Windows issues discovered; file the rest.

- [ ] **Step 5: Commit**

```bash
git add skills/multiagent/SKILL.md docs/validation/milestone-1-e2e.md
git commit -m "docs: add Milestone 1 skill and manual E2E validation"
```

---

## Self-Review

**Spec coverage (Milestone 1 scope = design §10 item 1, "Skeleton"):**
- Worktrees → Task 6. Terminals → Task 5. Manifest (source of truth) → Task 3.
- Status → Task 4. Per-worktree git identity (spec §8) → Task 6 + Task 7.
- Naming identity rule (spec §7) → Task 2, applied in Task 7.
- Cleanup/teardown → Task 7. Skill + E2E "3 fake tasks, wait for begin, log done"
  (spec §10.1) → Task 8.
- **Deferred by design (not gaps):** `graph.ts` eligibility + typecheck gate
  (Milestone 2), dry run (M3), contract lock/hooks/hashing (M4), language adapter
  (M5), agent config (M6), decomposition (M7), token tracking (dropped), automated
  `SendMessage` coordination (M2+). Merge is intentionally *not* in M1 because it
  depends on the graph algorithm and the language gate; M1 proves the
  worktree/terminal/status/cleanup loop only.

**Placeholder scan:** no TBD/TODO; every code and test step contains real content.

**Type consistency:** `TaskNames`, `OpenOpts`/`Terminals`, `WorktreeSpec`,
`TManifest`/`TTask`, and the function signatures (`deriveNames`, `parseManifest`,
`renderStatusTable`, `createWorktree`/`removeWorktree`, `materialize`/`cleanup`/
`status`, `buildWindowsTerminalArgs`) are used consistently across tasks.

**Note for later milestones:** Task 4's `renderStatusTable` will gain a
`-> mergeable` hint in Milestone 2 when `graph.ts` lands; the M1 test pins only
current behavior and will be extended, not rewritten.
```
