import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
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

function manifestFor(): { tasks: { name: string; worktree: string }[] } & Record<string, unknown> {
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
    const raw = manifestFor();
    for (const t of raw.tasks) t.worktree = join(root, '..', `${basename(root)}-wt-${t.name}`);
    await fs.writeFile(mPath, JSON.stringify(raw));

    const opened: OpenOpts[] = [];
    const fake: Terminals = { open: async (o) => { opened.push(o); } };

    await materialize(mPath, root, fake);

    expect(opened.map((o) => o.title).sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(opened.every((o) => o.argv[0] === 'claude' && o.argv[1] === '--name' && o.argv[2] === o.title)).toBe(true);
    expect(opened.every((o) => o.argv.includes('--dangerously-skip-permissions'))).toBe(true);
    expect(opened.every((o) => o.tabColor === '#2ea043')).toBe(true);
    const after = await loadManifest(mPath);
    expect(after.tasks.every((t) => t.status === 'running')).toBe(true);
    for (const t of after.tasks) {
      expect((await fs.stat(t.worktree)).isDirectory()).toBe(true);
    }
  });
});
