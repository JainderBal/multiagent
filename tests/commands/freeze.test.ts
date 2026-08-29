import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freezeCommand } from '../../src/commands/freeze.js';
import { saveManifest, type TManifest } from '../../src/core/manifest.js';

describe('freezeCommand', () => {
  it('freezes existing contract files and reports the version', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'ma-fz-'));
    const contractDir = join(root, 'packages', 'contracts');
    await fs.mkdir(contractDir, { recursive: true });
    await fs.writeFile(join(contractDir, 'c.ts'), 'export const x = 1;\n');
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, {
      run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
      agents: [], tasks: [],
    } as TManifest);

    const out = await freezeCommand(mPath, root, 'packages/contracts');
    expect(out).toMatch(/contract v1/);
    expect((await fs.readFile(join(contractDir, 'VERSION'), 'utf8')).trim()).toBe('1');
  });
});
