# Milestone 6: Agent Config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Load user-defined custom agents from `.claude/agents/*.md` (Claude Code's frontmatter + system-prompt format, plus four wiring fields) and expose which agents run at each hook stage. No presets ship.

**Architecture:** `agents.ts` parses each agent markdown with `gray-matter`, validates the frontmatter against the existing `AgentConfig` zod schema, and returns the config plus the body (system prompt). A pure `agentsForHook` filters by stage. An `agents` CLI command lists what loaded. Builds on Milestones 1-5.

**Tech Stack:** TypeScript (Node 20+), gray-matter (new dep), zod, vitest.

**Spec:** design §5 (Agent config), §10 item 6. The four wiring fields: `hook` (pre-execution | per-task | pre-merge | post-merge), `blocking`, `commits`, `workspace` (own | read-only).

## Global Constraints

- Windows first; Node `path`. No emoji. No preset agents ship — the tool only loads what the user wrote.
- Reuse the `AgentConfig` schema already in `manifest.ts`; do not redefine it.
- Commit style: conventional commits ending `Task: <task-name>`.

---

### Task 1: Load agents from markdown (`agents.ts`)

**Files:**
- Modify: `package.json` (add `gray-matter`)
- Create: `src/core/agents.ts`
- Test: `tests/core/agents.test.ts`

**Interfaces:**
- Consumes: `AgentConfig` (`manifest.ts`), `gray-matter`.
- Produces:
  - `type LoadedAgent = { config: TAgentConfig; prompt: string }` where `TAgentConfig = z.infer<typeof AgentConfig>`.
  - `async function loadAgents(dir: string): Promise<LoadedAgent[]>` — parse every `*.md` in `dir` (missing dir → `[]`); frontmatter validated by `AgentConfig`, body trimmed as `prompt`. Sorted by name.

- [ ] **Step 1: Add the dependency**

Add to `package.json` dependencies: `"gray-matter": "^4.0.3"`. Run `pnpm install`. If a build-script approval prompt appears for gray-matter, it has none; only esbuild needed approval.

- [ ] **Step 2: Write the failing test**

`tests/core/agents.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAgents } from '../../src/core/agents.js';

async function agentsDir(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'ma-agents-'));
  for (const [name, body] of Object.entries(files)) await fs.writeFile(join(dir, name), body);
  return dir;
}

describe('loadAgents', () => {
  it('parses frontmatter and body of each agent', async () => {
    const dir = await agentsDir({
      'reviewer.md': `---
name: reviewer
description: checks a branch against acceptance criteria
hook: pre-merge
blocking: true
commits: false
workspace: read-only
---
You are a strict reviewer.
`,
    });
    const agents = await loadAgents(dir);
    expect(agents).toHaveLength(1);
    expect(agents[0].config.name).toBe('reviewer');
    expect(agents[0].config.hook).toBe('pre-merge');
    expect(agents[0].config.blocking).toBe(true);
    expect(agents[0].prompt).toBe('You are a strict reviewer.');
  });

  it('returns empty for a missing directory', async () => {
    expect(await loadAgents(join(tmpdir(), 'no-such-agents-xyz'))).toEqual([]);
  });

  it('rejects an invalid hook value', async () => {
    const dir = await agentsDir({
      'x.md': `---
name: x
hook: whenever
---
body
`,
    });
    await expect(loadAgents(dir)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run — expect FAIL.** `pnpm vitest run tests/core/agents.test.ts`

- [ ] **Step 4: Implement**

`src/core/agents.ts`:
```ts
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { AgentConfig, type TManifest } from './manifest.js';
import type { z } from 'zod';

export type TAgentConfig = z.infer<typeof AgentConfig>;
export type LoadedAgent = { config: TAgentConfig; prompt: string };

export async function loadAgents(dir: string): Promise<LoadedAgent[]> {
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }
  const agents: LoadedAgent[] = [];
  for (const name of names.sort()) {
    const raw = await fs.readFile(join(dir, name), 'utf8');
    const parsed = matter(raw);
    const config = AgentConfig.parse(parsed.data);
    agents.push({ config, prompt: parsed.content.trim() });
  }
  return agents;
}
```
(The `TManifest` import is unused here — omit it; import only `AgentConfig`.)

- [ ] **Step 5: Run — expect PASS. Commit** — `Task: load-agents`

---

### Task 2: Group agents by hook stage

**Files:**
- Modify: `src/core/agents.ts`
- Test: `tests/core/agents-hook.test.ts`

**Interfaces:**
- `type HookStage = 'pre-execution' | 'per-task' | 'pre-merge' | 'post-merge'`
- `function agentsForHook(agents: LoadedAgent[], stage: HookStage): LoadedAgent[]`

- [ ] **Step 1: Write the failing test**

`tests/core/agents-hook.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { agentsForHook, type LoadedAgent } from '../../src/core/agents.js';

function agent(name: string, hook: string): LoadedAgent {
  return {
    config: { name, description: '', hook: hook as any, blocking: false, commits: false, workspace: 'read-only' },
    prompt: '',
  };
}

describe('agentsForHook', () => {
  it('filters agents by stage', () => {
    const agents = [agent('r', 'pre-merge'), agent('l', 'per-task'), agent('r2', 'pre-merge')];
    expect(agentsForHook(agents, 'pre-merge').map((a) => a.config.name)).toEqual(['r', 'r2']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Add to `src/core/agents.ts`**

```ts
export type HookStage = 'pre-execution' | 'per-task' | 'pre-merge' | 'post-merge';

export function agentsForHook(agents: LoadedAgent[], stage: HookStage): LoadedAgent[] {
  return agents.filter((a) => a.config.hook === stage);
}
```

- [ ] **Step 4: Run — expect PASS. Commit** — `Task: agents-hook`

---

### Task 3: `agents` CLI command + skill

**Files:**
- Create: `src/commands/agents.ts`
- Modify: `src/cli.ts`
- Modify: `skills/multiagent/SKILL.md`
- Test: `tests/commands/agents-cli.test.ts`

**Interfaces:**
- `async function agentsCommand(dir: string): Promise<string>` — lists `name  hook  blocking  commits  workspace` per loaded agent, or `no custom agents in <dir>` when none.

- [ ] **Step 1: Write the failing test**

`tests/commands/agents-cli.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentsCommand } from '../../src/commands/agents.js';

describe('agentsCommand', () => {
  it('lists loaded agents', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ma-ac-'));
    await fs.writeFile(join(dir, 'reviewer.md'), `---
name: reviewer
hook: pre-merge
blocking: true
commits: false
workspace: read-only
---
prompt
`);
    const out = await agentsCommand(dir);
    expect(out).toMatch(/reviewer/);
    expect(out).toMatch(/pre-merge/);
  });

  it('reports when there are none', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ma-ac0-'));
    expect(await agentsCommand(dir)).toMatch(/no custom agents/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/commands/agents.ts`:
```ts
import { loadAgents } from '../core/agents.js';

export async function agentsCommand(dir: string): Promise<string> {
  const agents = await loadAgents(dir);
  if (agents.length === 0) return `no custom agents in ${dir}`;
  return agents
    .map((a) => {
      const c = a.config;
      return `${c.name}   hook=${c.hook ?? '(none)'} blocking=${c.blocking} commits=${c.commits} workspace=${c.workspace}`;
    })
    .join('\n');
}
```

- [ ] **Step 4: Wire CLI + skill**

In `src/cli.ts`:
```ts
import { agentsCommand } from './commands/agents.js';
```
```ts
program
  .command('agents <dir>')
  .description('List custom agents loaded from a .claude/agents directory.')
  .action(async (dir: string) => {
    console.log(await agentsCommand(dir));
  });
```

In `skills/multiagent/SKILL.md`, add:
```markdown
- Custom agents: at init, propose agents based on the spec and repo (no presets).
  The user edits `.claude/agents/*.md`. Each has a `hook` stage (pre-execution,
  per-task, pre-merge, post-merge), `blocking`, `commits`, and `workspace`.
  Run `multiagent agents .claude/agents` to see what is loaded. Run blocking
  pre-merge agents (e.g. a reviewer) before merging a branch.
```

- [ ] **Step 5: Full suite + build + commit**

`pnpm test` green; `pnpm build` exit 0; `node dist/cli.js --help` lists `agents`. Commit — `Task: agents-cli`.

---

## Self-Review

**Spec coverage (design §5, §10 item 6):** custom agent loading from `.claude/agents/*.md` with the four wiring fields → Task 1 (reusing the `AgentConfig` schema); hook-stage grouping → Task 2; CLI surface + skill guidance (no presets; propose-then-edit) → Task 3. **Placeholder scan:** none. **Type consistency:** `LoadedAgent`, `TAgentConfig`, `HookStage`, `loadAgents`, `agentsForHook`, `agentsCommand` consistent across tasks; `AgentConfig` schema reused, not redefined.
```
