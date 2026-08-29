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
