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
