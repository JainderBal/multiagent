import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTaskFile, writeRun } from '../../src/core/taskfile.js';
import { buildManifest } from '../../src/core/decompose.js';

const manifest = buildManifest({
  run: 'r', spec: 's.md', adapter: 'typescript', repoName: 'repo',
  tasks: [
    { name: 'shared-types', provides: ['N'] },
    { name: 'api', dependsOn: ['shared-types'], consumes: ['N'] },
  ],
});

describe('renderTaskFile', () => {
  it('includes name, deps, provides, consumes, and scope language', () => {
    const md = renderTaskFile(manifest.tasks[1]);
    expect(md).toMatch(/# Task: api/);
    expect(md).toMatch(/Depends on: shared-types/);
    expect(md).toMatch(/Consumes: N/);
    expect(md).toMatch(/Do NOT edit interface files/);
  });
});

describe('writeRun', () => {
  it('scaffolds the run directory and task files', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ma-run-'));
    await writeRun(dir, manifest);
    for (const sub of ['plans', 'requests', 'status', 'tasks']) {
      expect((await fs.stat(join(dir, sub))).isDirectory()).toBe(true);
    }
    expect((await fs.stat(join(dir, 'manifest.json'))).isFile()).toBe(true);
    expect(await fs.readFile(join(dir, 'tasks', 'api.md'), 'utf8')).toMatch(/# Task: api/);
  });
});
