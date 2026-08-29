# Milestone 5: Language Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Formalize the `LanguageAdapter` so the core selects the typecheck gate and contract directory from a registry keyed by `manifest.adapter`, instead of hardcoding TypeScript, and can auto-detect the adapter for a repo.

**Architecture:** Extend `LanguageAdapter` with `contractDir`, `contractGlobs`, and `detect(repoRoot)`. A small registry maps id → adapter and detects the adapter for a repo. `mergeCommand` selects the adapter by `manifest.adapter` and drives `mergeAll` with the adapter's contract directory. Builds on Milestones 1-4.

**Tech Stack:** TypeScript (Node 20+), execa, vitest.

**Spec:** design §3-§4 (language-agnostic core), §10 item 5.

## Global Constraints

- Windows first; Node `path`. No emoji. The TypeScript adapter stays the only shipped adapter; the point is that the core no longer names it directly.
- Commit style: conventional commits ending `Task: <task-name>`.

---

### Task 1: Extend the adapter interface and TypeScript adapter

**Files:**
- Modify: `src/adapters/language.ts`
- Modify: `src/adapters/language-typescript.ts`
- Test: `tests/adapters/language-typescript.test.ts` (extend)

**Interfaces:**
- `interface LanguageAdapter { id: string; contractDir: string; contractGlobs: string[]; detect(repoRoot: string): Promise<boolean>; gate(dir: string): Promise<GateResult> }`
- `TypeScriptAdapter`: `contractDir = 'packages/contracts'`, `contractGlobs = ['**/*.ts']`, `detect` true when `tsconfig.json` exists at repo root.

- [ ] **Step 1: Write the failing test (extend)**

Append to `tests/adapters/language-typescript.test.ts`:
```ts
import { promises as fsp } from 'node:fs';

describe('TypeScriptAdapter metadata', () => {
  it('exposes contract dir and globs', () => {
    const a = new TypeScriptAdapter();
    expect(a.id).toBe('typescript');
    expect(a.contractDir).toBe('packages/contracts');
    expect(a.contractGlobs).toContain('**/*.ts');
  });
  it('detects a repo with a tsconfig', async () => {
    const dir = await fsp.mkdtemp(join(tmpdir(), 'ma-det-'));
    expect(await new TypeScriptAdapter().detect(dir)).toBe(false);
    await fsp.writeFile(join(dir, 'tsconfig.json'), '{}');
    expect(await new TypeScriptAdapter().detect(dir)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm vitest run tests/adapters/language-typescript.test.ts`

- [ ] **Step 3: Implement**

`src/adapters/language.ts`:
```ts
export type GateResult = { ok: boolean; output: string };

export interface LanguageAdapter {
  id: string;
  contractDir: string;
  contractGlobs: string[];
  detect(repoRoot: string): Promise<boolean>;
  gate(dir: string): Promise<GateResult>;
}
```

`src/adapters/language-typescript.ts` — add fields and `detect`:
```ts
import { execa } from 'execa';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { GateResult, LanguageAdapter } from './language.js';

const require = createRequire(import.meta.url);

export class TypeScriptAdapter implements LanguageAdapter {
  id = 'typescript';
  contractDir = 'packages/contracts';
  contractGlobs = ['**/*.ts'];

  async detect(repoRoot: string): Promise<boolean> {
    try {
      await fs.access(join(repoRoot, 'tsconfig.json'));
      return true;
    } catch {
      return false;
    }
  }

  async gate(dir: string): Promise<GateResult> {
    const tsc = require.resolve('typescript/bin/tsc');
    const result = await execa(process.execPath, [tsc, '--noEmit', '-p', dir], { reject: false });
    return { ok: result.exitCode === 0, output: `${result.stdout}\n${result.stderr}`.trim() };
  }
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** — `Task: adapter-interface`

---

### Task 2: Adapter registry (`registry.ts`)

**Files:**
- Create: `src/adapters/registry.ts`
- Test: `tests/adapters/registry.test.ts`

**Interfaces:**
- `function getAdapter(id: string): LanguageAdapter` — throws `Error` for an unknown id.
- `async function detectAdapter(repoRoot: string): Promise<LanguageAdapter | null>` — first registered adapter whose `detect` is true, else null.

- [ ] **Step 1: Write the failing test**

`tests/adapters/registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAdapter, detectAdapter } from '../../src/adapters/registry.js';

describe('getAdapter', () => {
  it('returns the typescript adapter', () => {
    expect(getAdapter('typescript').id).toBe('typescript');
  });
  it('throws on unknown id', () => {
    expect(() => getAdapter('cobol')).toThrow(/unknown adapter/i);
  });
});

describe('detectAdapter', () => {
  it('detects typescript by tsconfig', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ma-reg-'));
    expect(await detectAdapter(dir)).toBeNull();
    await fs.writeFile(join(dir, 'tsconfig.json'), '{}');
    expect((await detectAdapter(dir))?.id).toBe('typescript');
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/adapters/registry.ts`:
```ts
import type { LanguageAdapter } from './language.js';
import { TypeScriptAdapter } from './language-typescript.js';

const ADAPTERS: LanguageAdapter[] = [new TypeScriptAdapter()];

export function getAdapter(id: string): LanguageAdapter {
  const a = ADAPTERS.find((x) => x.id === id);
  if (!a) throw new Error(`unknown adapter: ${id}`);
  return a;
}

export async function detectAdapter(repoRoot: string): Promise<LanguageAdapter | null> {
  for (const a of ADAPTERS) {
    if (await a.detect(repoRoot)) return a;
  }
  return null;
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** — `Task: registry`

---

### Task 3: Select the adapter in the merge command

**Files:**
- Modify: `src/commands/merge.ts`
- Test: `tests/commands/merge-cli.test.ts` (still passes; adapter resolved from manifest)

**Interfaces:**
- `mergeCommand` loads the manifest, resolves `getAdapter(manifest.adapter)`, and calls `mergeAll(manifestPath, repoRoot, baseBranch, adapter, join(repoRoot, adapter.contractDir))`.

- [ ] **Step 1: Update `src/commands/merge.ts`**

```ts
import { join } from 'node:path';
import { mergeAll } from '../core/merge.js';
import { getAdapter } from '../adapters/registry.js';
import { loadManifest } from '../core/manifest.js';

export async function mergeCommand(
  manifestPath: string,
  repoRoot: string,
  baseBranch: string,
): Promise<string> {
  const m = await loadManifest(manifestPath);
  const adapter = getAdapter(m.adapter);
  const report = await mergeAll(
    manifestPath, repoRoot, baseBranch, adapter, join(repoRoot, adapter.contractDir),
  );
  const lines = [`merged ${report.merged.length}: ${report.merged.join(', ') || '(none)'}`];
  for (const w of report.warnings) lines.push(`warning: ${w}`);
  if (report.stoppedAt) lines.push(`stopped at ${report.stoppedAt.task}: ${report.stoppedAt.reason}`);
  return lines.join('\n');
}
```

- [ ] **Step 2: Run the merge-cli test and full suite**

`pnpm vitest run tests/commands/merge-cli.test.ts` — PASS (manifest.adapter is `typescript`).
`pnpm test` — all green. `pnpm build` — exit 0.

- [ ] **Step 3: Commit** — `Task: merge-adapter`

---

## Self-Review

**Spec coverage (design §10 item 5):** adapter interface formalized with `detect`/`contractDir`/`contractGlobs` → Task 1; registry + detection → Task 2; core selects adapter by `manifest.adapter` rather than naming TypeScript → Task 3. `proposeContracts` (LLM-driven contract generation) remains Milestone 7. **Placeholder scan:** none. **Type consistency:** `LanguageAdapter` gains fields used by `TypeScriptAdapter`, `getAdapter`, `detectAdapter`, and `mergeCommand` consistently.
```
