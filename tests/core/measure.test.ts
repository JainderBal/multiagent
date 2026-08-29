import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureMerges, renderMeasure } from '../../src/core/measure.js';

async function repo(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-meas-'));
  const git = (a: string[]) => execa('git', a, { cwd: root });
  await git(['init', '-q', '-b', 'main']);
  await git(['config', 'user.email', 'r@t.local']);
  await git(['config', 'user.name', 'r']);
  await fs.writeFile(join(root, 'shared.txt'), 'line1\nline2\nline3\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'base']);
  await git(['checkout', '-q', '-b', 'agent/conflict']);
  await fs.writeFile(join(root, 'shared.txt'), 'line1\nCONFLICT\nline3\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'c']);
  await git(['checkout', '-q', 'main']);
  await fs.writeFile(join(root, 'shared.txt'), 'line1\nMAIN\nline3\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'main-edit']);
  await git(['checkout', '-q', '-b', 'agent/clean', 'main']);
  await fs.writeFile(join(root, 'new.txt'), 'hello\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'clean']);
  await git(['checkout', '-q', 'main']);
  return root;
}

describe('measureMerges', () => {
  let root: string;
  beforeEach(async () => { root = await repo(); });

  it('classifies each branch as clean or text-conflict and leaves base intact', async () => {
    const results = await measureMerges(root, 'main', ['agent/conflict', 'agent/clean']);
    expect(results).toEqual([
      { branch: 'agent/conflict', outcome: 'text-conflict' },
      { branch: 'agent/clean', outcome: 'clean' },
    ]);
    const { stdout } = await execa('git', ['status', '--porcelain'], { cwd: root });
    expect(stdout).toBe('');
  });
});

describe('renderMeasure', () => {
  it('summarizes the conflict rate', () => {
    const out = renderMeasure([
      { branch: 'a', outcome: 'text-conflict' },
      { branch: 'b', outcome: 'clean' },
    ]);
    expect(out).toMatch(/2 branches/);
    expect(out).toMatch(/1 text-conflicts \(50%\)/);
  });
});
