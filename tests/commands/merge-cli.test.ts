import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeCommand } from '../../src/commands/merge.js';

describe('mergeCommand summary', () => {
  it('reports when there is nothing to merge', async () => {
    // A done task with an unsatisfiable dependency is never eligible, so
    // mergeAll returns before touching git — no repo needed.
    const p = join(await fs.mkdtemp(join(tmpdir(), 'ma-mc-')), 'manifest.json');
    await fs.writeFile(p, JSON.stringify({
      run: 'r', spec: 's', adapter: 'typescript', interfaceVersion: 1, interfaceHashes: {},
      agents: [], tasks: [{
        name: 'a', branch: 'agent/a', worktree: '../r-a', sessionName: 'a',
        dependsOn: ['missing'], provides: [], consumes: [], status: 'done',
        builtAtInterfaceVersion: 1,
      }],
    }));
    const summary = await mergeCommand(p, process.cwd(), 'main');
    expect(summary).toMatch(/merged 0/i);
  });
});
