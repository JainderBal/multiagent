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
