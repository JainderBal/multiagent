import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeAll } from '../../src/core/merge.js';
import { loadManifest, saveManifest, type TManifest } from '../../src/core/manifest.js';
import { TypeScriptAdapter } from '../../src/adapters/language-typescript.js';

async function repoWithBranches(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-merge-'));
  const git = (args: string[]) => execa('git', args, { cwd: root });
  await git(['init', '-q', '-b', 'main']);
  await git(['config', 'user.email', 'root@test.local']);
  await git(['config', 'user.name', 'root']);
  await fs.writeFile(join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, include: ['*.ts'],
  }));
  await fs.writeFile(join(root, 'base.ts'), 'export const base = 1;\n');
  await git(['add', '-A']);
  await git(['commit', '-q', '-m', 'base']);
  await git(['checkout', '-q', '-b', 'agent/a']);
  await fs.writeFile(join(root, 'a.ts'), 'export const a: number = 2;\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'a']);
  await git(['checkout', '-q', 'main']);
  await git(['checkout', '-q', '-b', 'agent/b']);
  await fs.writeFile(join(root, 'b.ts'), 'export const b: number = 3;\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'b']);
  // agent/bad (from main) introduces a type error that must fail the gate
  await git(['checkout', '-q', 'main']);
  await git(['checkout', '-q', '-b', 'agent/bad']);
  await fs.writeFile(join(root, 'bad.ts'), 'export const bad: number = "nope";\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'bad']);
  await git(['checkout', '-q', 'main']);
  return root;
}

function manifest(bStatus: 'done' | 'pending'): TManifest {
  const mk = (name: string, dependsOn: string[], status: TManifest['tasks'][number]['status']) => ({
    name, branch: `agent/${name}`, worktree: `../wt-${name}`, sessionName: name,
    dependsOn, provides: [], consumes: [], status, builtAtInterfaceVersion: 1,
  });
  return {
    run: 'r', spec: 's', adapter: 'typescript', interfaceVersion: 1, interfaceHashes: {},
    agents: [], tasks: [mk('a', [], 'done'), mk('b', ['a'], bStatus)],
  } as TManifest;
}

describe('mergeAll', () => {
  let root: string;
  beforeEach(async () => { root = await repoWithBranches(); });

  it('merges eligible tasks in dependency order and marks them merged', async () => {
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, manifest('done'));
    const report = await mergeAll(mPath, root, 'main', new TypeScriptAdapter());

    expect(report.merged).toEqual(['a', 'b']);
    const after = await loadManifest(mPath);
    expect(after.tasks.map((t) => t.status)).toEqual(['merged', 'merged']);
    expect((await fs.stat(join(root, 'a.ts'))).isFile()).toBe(true);
    expect((await fs.stat(join(root, 'b.ts'))).isFile()).toBe(true);
  });

  it('stops when a dependency is not yet done', async () => {
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, manifest('pending'));
    const report = await mergeAll(mPath, root, 'main', new TypeScriptAdapter());
    expect(report.merged).toEqual(['a']);
    const after = await loadManifest(mPath);
    expect(after.tasks.find((t) => t.name === 'b')!.status).toBe('pending');
  });

  it('rolls back a merge whose gate fails and leaves the base clean', async () => {
    const mPath = join(root, 'manifest.json');
    const bad: TManifest = {
      run: 'r', spec: 's', adapter: 'typescript', interfaceVersion: 1, interfaceHashes: {},
      agents: [], tasks: [{
        name: 'bad', branch: 'agent/bad', worktree: '../wt-bad', sessionName: 'bad',
        dependsOn: [], provides: [], consumes: [], status: 'done', builtAtInterfaceVersion: 1,
      }],
    };
    await saveManifest(mPath, bad);
    const report = await mergeAll(mPath, root, 'main', new TypeScriptAdapter());

    expect(report.merged).toEqual([]);
    expect(report.stoppedAt?.task).toBe('bad');
    expect(report.stoppedAt?.reason).toMatch(/gate failed/);
    // The rollback removed the bad file from the base branch.
    await expect(fs.stat(join(root, 'bad.ts'))).rejects.toThrow();
    // Task stays 'done', not 'merged'.
    const after = await loadManifest(mPath);
    expect(after.tasks[0].status).toBe('done');
    // HEAD is back to the single base commit (merge undone).
    const log = await execa('git', ['rev-list', '--count', 'HEAD'], { cwd: root });
    expect(log.stdout).toBe('1');
  });
});
