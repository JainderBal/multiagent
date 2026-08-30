import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doneCommand } from '../../src/commands/done.js';
import { loadManifest } from '../../src/core/manifest.js';

function manifest(): Record<string, unknown> {
  return {
    run: 'r', spec: 's', adapter: 'typescript', interfaceVersion: 2,
    interfaceHashes: {}, agents: [],
    tasks: [{
      name: 'a', branch: 'agent/a', worktree: '../a', sessionName: 'a',
      dependsOn: [], provides: [], consumes: [], status: 'running', builtAtInterfaceVersion: null,
    }],
  };
}

describe('doneCommand', () => {
  it('marks a task done and stamps the interface version', async () => {
    const p = join(await fs.mkdtemp(join(tmpdir(), 'ma-done-')), 'manifest.json');
    await fs.writeFile(p, JSON.stringify(manifest()));

    const out = await doneCommand(p, 'a');

    expect(out).toContain('marked done');
    const m = await loadManifest(p);
    expect(m.tasks[0].status).toBe('done');
    expect(m.tasks[0].builtAtInterfaceVersion).toBe(2);
  });

  it('reports an unknown task without changing the manifest', async () => {
    const p = join(await fs.mkdtemp(join(tmpdir(), 'ma-done2-')), 'manifest.json');
    await fs.writeFile(p, JSON.stringify(manifest()));

    expect(await doneCommand(p, 'nope')).toContain('no such task');
    const m = await loadManifest(p);
    expect(m.tasks[0].status).toBe('running');
  });
});
