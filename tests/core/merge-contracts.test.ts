import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeAll } from '../../src/core/merge.js';
import { saveManifest, type TManifest } from '../../src/core/manifest.js';
import { freezeContracts } from '../../src/core/contracts.js';
import { TypeScriptAdapter } from '../../src/adapters/language-typescript.js';

async function repo(): Promise<{ root: string; contractDir: string }> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-mc-'));
  const contractDir = join(root, 'packages', 'contracts');
  const git = (a: string[]) => execa('git', a, { cwd: root });
  await git(['init', '-q', '-b', 'main']);
  await git(['config', 'user.email', 'r@t.local']);
  await git(['config', 'user.name', 'r']);
  await fs.writeFile(join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, include: ['**/*.ts'],
  }));
  await fs.mkdir(contractDir, { recursive: true });
  await fs.writeFile(join(contractDir, 'c.ts'), 'export interface C { id: string }\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'base']);
  return { root, contractDir };
}

function manifest(): TManifest {
  return {
    run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
    agents: [], tasks: [{
      name: 'bad', branch: 'agent/bad', worktree: '../w-bad', sessionName: 'bad',
      dependsOn: [], provides: [], consumes: [], status: 'done', builtAtContractVersion: 1,
    }],
  } as TManifest;
}

describe('merge-time contract enforcement', () => {
  let root: string; let contractDir: string;
  beforeEach(async () => { ({ root, contractDir } = await repo()); });

  it('rolls back a branch that modified a frozen contract', async () => {
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, manifest());
    await freezeContracts(contractDir, mPath);
    await execa('git', ['add', '-A'], { cwd: root });
    await execa('git', ['commit', '-q', '-m', 'freeze'], { cwd: root });

    await execa('git', ['checkout', '-q', '-b', 'agent/bad'], { cwd: root });
    await fs.writeFile(join(contractDir, 'c.ts'), 'export interface C { id: number }\n');
    await execa('git', ['add', '-A'], { cwd: root });
    await execa('git', ['commit', '-q', '--no-verify', '-m', 'tamper'], { cwd: root });
    await execa('git', ['checkout', '-q', 'main'], { cwd: root });

    const report = await mergeAll(mPath, root, 'main', new TypeScriptAdapter(), contractDir);
    expect(report.merged).toEqual([]);
    expect(report.stoppedAt?.reason).toMatch(/contract violation/);
    expect(await fs.readFile(join(contractDir, 'c.ts'), 'utf8')).toMatch(/id: string/);
  });
});
