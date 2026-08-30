import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freezeCommand } from '../../src/commands/freeze.js';
import { saveManifest, type TManifest } from '../../src/core/manifest.js';

describe('freezeCommand', () => {
  it('freezes existing interface files and reports the version', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'ma-fz-'));
    const interfaceDir = join(root, 'packages', 'interfaces');
    await fs.mkdir(interfaceDir, { recursive: true });
    await fs.writeFile(join(interfaceDir, 'c.ts'), 'export const x = 1;\n');
    const mPath = join(root, 'manifest.json');
    await saveManifest(mPath, {
      run: 'r', spec: 's', adapter: 'typescript', interfaceVersion: 1, interfaceHashes: {},
      agents: [], tasks: [],
    } as TManifest);

    const out = await freezeCommand(mPath, root, 'packages/interfaces');
    expect(out).toMatch(/interface v1/);
    expect((await fs.readFile(join(interfaceDir, 'VERSION'), 'utf8')).trim()).toBe('1');
  });
});
