import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installContractHook } from '../../src/core/contracthook.js';

async function repo(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-hook-'));
  const git = (a: string[]) => execa('git', a, { cwd: root });
  await git(['init', '-q', '-b', 'main']);
  await git(['config', 'user.email', 'r@t.local']);
  await git(['config', 'user.name', 'r']);
  await fs.mkdir(join(root, 'packages', 'contracts'), { recursive: true });
  await fs.writeFile(join(root, 'packages', 'contracts', 'c.ts'), 'export const x = 1;\n');
  await fs.writeFile(join(root, 'app.ts'), 'export const y = 2;\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'base']);
  return root;
}

describe('installContractHook', () => {
  let root: string;
  beforeEach(async () => { root = await repo(); });

  it('blocks a commit that stages a contract file', async () => {
    await installContractHook(root, 'packages/contracts');
    await fs.writeFile(join(root, 'packages', 'contracts', 'c.ts'), 'export const x = 2;\n');
    await execa('git', ['add', '-A'], { cwd: root });
    const res = await execa('git', ['commit', '-m', 'touch contract'], { cwd: root, reject: false });
    expect(res.exitCode).not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/BLOCKED/);
  });

  it('allows a commit that stages only non-contract files', async () => {
    await installContractHook(root, 'packages/contracts');
    await fs.writeFile(join(root, 'app.ts'), 'export const y = 3;\n');
    await execa('git', ['add', '-A'], { cwd: root });
    const res = await execa('git', ['commit', '-m', 'touch app'], { cwd: root, reject: false });
    expect(res.exitCode).toBe(0);
  });
});
