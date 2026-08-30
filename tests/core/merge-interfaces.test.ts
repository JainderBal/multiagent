import { describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeAll } from '../../src/core/merge.js';
import { saveManifest, type TManifest } from '../../src/core/manifest.js';
import { freezeInterfaces } from '../../src/core/interfaces.js';
import { TypeScriptAdapter } from '../../src/adapters/language-typescript.js';

async function repo(): Promise<{ root: string; interfaceDir: string }> {
  const root = await fs.mkdtemp(join(tmpdir(), 'ma-mc-'));
  const interfaceDir = join(root, 'packages', 'interfaces');
  const git = (a: string[]) => execa('git', a, { cwd: root });
  await git(['init', '-q', '-b', 'main']);
  await git(['config', 'user.email', 'r@t.local']);
  await git(['config', 'user.name', 'r']);
  await fs.writeFile(join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, include: ['**/*.ts'],
  }));
  await fs.mkdir(interfaceDir, { recursive: true });
  await fs.writeFile(join(interfaceDir, 'c.ts'), 'export interface C { id: string }\n');
  await git(['add', '-A']); await git(['commit', '-q', '-m', 'base']);
  return { root, interfaceDir };
}

function manifest(): TManifest {
  return {
    run: 'r', spec: 's', adapter: 'typescript', interfaceVersion: 1, interfaceHashes: {},
    agents: [], tasks: [{
      name: 'bad', branch: 'agent/bad', worktree: '../w-bad', sessionName: 'bad',
      dependsOn: [], provides: [], consumes: [], status: 'done', builtAtInterfaceVersion: 1,
    }],
  } as TManifest;
}

describe('merge-time interface enforcement', () => {
  let root: string; let interfaceDir: string;
  beforeEach(async () => { ({ root, interfaceDir } = await repo()); });

  it('rolls back a branch that modified a frozen interface', async () => {
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, manifest());
    await freezeInterfaces(interfaceDir, mPath);
    await execa('git', ['add', '-A'], { cwd: root });
    await execa('git', ['commit', '-q', '-m', 'freeze'], { cwd: root });

    await execa('git', ['checkout', '-q', '-b', 'agent/bad'], { cwd: root });
    await fs.writeFile(join(interfaceDir, 'c.ts'), 'export interface C { id: number }\n');
    await execa('git', ['add', '-A'], { cwd: root });
    await execa('git', ['commit', '-q', '--no-verify', '-m', 'tamper'], { cwd: root });
    await execa('git', ['checkout', '-q', 'main'], { cwd: root });

    const report = await mergeAll(mPath, root, 'main', new TypeScriptAdapter(), interfaceDir);
    expect(report.merged).toEqual([]);
    expect(report.stoppedAt?.reason).toMatch(/interface violation/);
    expect(await fs.readFile(join(interfaceDir, 'c.ts'), 'utf8')).toMatch(/id: string/);
  });
});
