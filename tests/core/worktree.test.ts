import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createWorktree, removeWorktree } from '../../src/core/worktree.js';

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

describe('worktree lifecycle', () => {
  let root: string;
  beforeEach(async () => { root = await initRepo(); });

  it('creates a worktree with its own branch and git identity, then removes it', async () => {
    const wt = join(root, '..', `${basename(root)}-wt-alpha`);
    await createWorktree({
      repoRoot: root, branch: 'agent/alpha', path: wt,
      userName: 'orchestrator/alpha', userEmail: 'alpha@orchestrator.local',
    });

    expect((await fs.stat(wt)).isDirectory()).toBe(true);
    const { stdout: name } = await execa('git', ['config', 'user.name'], { cwd: wt });
    expect(name).toBe('orchestrator/alpha');
    const { stdout: branches } = await execa('git', ['branch', '--list', 'agent/alpha'], { cwd: root });
    expect(branches).toContain('agent/alpha');

    await removeWorktree(root, wt);
    await expect(fs.stat(wt)).rejects.toThrow();
  });

  it('gives each worktree its own identity when several exist', async () => {
    const wtA = join(root, '..', `${basename(root)}-wt-a`);
    const wtB = join(root, '..', `${basename(root)}-wt-b`);
    await createWorktree({
      repoRoot: root, branch: 'agent/a', path: wtA,
      userName: 'orchestrator/a', userEmail: 'a@orchestrator.local',
    });
    await createWorktree({
      repoRoot: root, branch: 'agent/b', path: wtB,
      userName: 'orchestrator/b', userEmail: 'b@orchestrator.local',
    });

    const nameA = (await execa('git', ['config', 'user.name'], { cwd: wtA })).stdout;
    const nameB = (await execa('git', ['config', 'user.name'], { cwd: wtB })).stdout;
    expect(nameA).toBe('orchestrator/a');
    expect(nameB).toBe('orchestrator/b');

    await removeWorktree(root, wtA);
    await removeWorktree(root, wtB);
  });
});
