import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashInterfaces, freezeInterfaces, verifyInterfaces, bumpInterfaces } from '../../src/core/interfaces.js';
import { loadManifest, saveManifest, type TManifest } from '../../src/core/manifest.js';

function baseManifest(): TManifest {
  return {
    run: 'r', spec: 's', adapter: 'typescript', interfaceVersion: 1, interfaceHashes: {},
    agents: [], tasks: [],
  } as TManifest;
}

async function setup(): Promise<{ dir: string; interfaceDir: string; mPath: string }> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'ma-con-'));
  const interfaceDir = join(dir, 'packages', 'interfaces');
  await fs.mkdir(interfaceDir, { recursive: true });
  await fs.writeFile(join(interfaceDir, 'notifications.ts'), 'export interface N { id: string }\n');
  const mPath = join(dir, 'manifest.json');
  await saveManifest(mPath, baseManifest());
  return { dir, interfaceDir, mPath };
}

describe('freeze + verify', () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { s = await setup(); });

  it('freeze writes VERSION and stores hashes; verify passes unchanged', async () => {
    const hashes = await freezeInterfaces(s.interfaceDir, s.mPath);
    expect(Object.keys(hashes)).toContain('notifications.ts');
    expect(Object.keys(hashes)).toContain('VERSION');
    expect((await fs.readFile(join(s.interfaceDir, 'VERSION'), 'utf8')).trim()).toBe('1');
    const m = await loadManifest(s.mPath);
    const v = await verifyInterfaces(s.interfaceDir, m);
    expect(v.ok).toBe(true);
    expect(v.mismatches).toEqual([]);
  });

  it('verify detects a tampered interface file', async () => {
    await freezeInterfaces(s.interfaceDir, s.mPath);
    const m = await loadManifest(s.mPath);
    await fs.writeFile(join(s.interfaceDir, 'notifications.ts'), 'export interface N { id: number }\n');
    const v = await verifyInterfaces(s.interfaceDir, m);
    expect(v.ok).toBe(false);
    expect(v.mismatches).toContain('notifications.ts');
  });

  it('bump increments VERSION and re-hashes so verify passes again', async () => {
    await freezeInterfaces(s.interfaceDir, s.mPath);
    const newV = await bumpInterfaces(s.interfaceDir, s.mPath);
    expect(newV).toBe(2);
    expect((await fs.readFile(join(s.interfaceDir, 'VERSION'), 'utf8')).trim()).toBe('2');
    const m = await loadManifest(s.mPath);
    expect(m.interfaceVersion).toBe(2);
    const v = await verifyInterfaces(s.interfaceDir, m);
    expect(v.ok).toBe(true);
  });
});

describe('hashInterfaces', () => {
  it('returns empty for a missing directory', async () => {
    expect(await hashInterfaces(join(tmpdir(), 'does-not-exist-xyz'))).toEqual({});
  });
});
