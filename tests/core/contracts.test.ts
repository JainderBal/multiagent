import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashContracts, freezeContracts, verifyContracts, bumpContracts } from '../../src/core/contracts.js';
import { loadManifest, saveManifest, type TManifest } from '../../src/core/manifest.js';

function baseManifest(): TManifest {
  return {
    run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
    agents: [], tasks: [],
  } as TManifest;
}

async function setup(): Promise<{ dir: string; contractDir: string; mPath: string }> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'ma-con-'));
  const contractDir = join(dir, 'packages', 'contracts');
  await fs.mkdir(contractDir, { recursive: true });
  await fs.writeFile(join(contractDir, 'notifications.ts'), 'export interface N { id: string }\n');
  const mPath = join(dir, 'manifest.json');
  await saveManifest(mPath, baseManifest());
  return { dir, contractDir, mPath };
}

describe('freeze + verify', () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { s = await setup(); });

  it('freeze writes VERSION and stores hashes; verify passes unchanged', async () => {
    const hashes = await freezeContracts(s.contractDir, s.mPath);
    expect(Object.keys(hashes)).toContain('notifications.ts');
    expect(Object.keys(hashes)).toContain('VERSION');
    expect((await fs.readFile(join(s.contractDir, 'VERSION'), 'utf8')).trim()).toBe('1');
    const m = await loadManifest(s.mPath);
    const v = await verifyContracts(s.contractDir, m);
    expect(v.ok).toBe(true);
    expect(v.mismatches).toEqual([]);
  });

  it('verify detects a tampered contract file', async () => {
    await freezeContracts(s.contractDir, s.mPath);
    const m = await loadManifest(s.mPath);
    await fs.writeFile(join(s.contractDir, 'notifications.ts'), 'export interface N { id: number }\n');
    const v = await verifyContracts(s.contractDir, m);
    expect(v.ok).toBe(false);
    expect(v.mismatches).toContain('notifications.ts');
  });

  it('bump increments VERSION and re-hashes so verify passes again', async () => {
    await freezeContracts(s.contractDir, s.mPath);
    const newV = await bumpContracts(s.contractDir, s.mPath);
    expect(newV).toBe(2);
    expect((await fs.readFile(join(s.contractDir, 'VERSION'), 'utf8')).trim()).toBe('2');
    const m = await loadManifest(s.mPath);
    expect(m.contractVersion).toBe(2);
    const v = await verifyContracts(s.contractDir, m);
    expect(v.ok).toBe(true);
  });
});

describe('hashContracts', () => {
  it('returns empty for a missing directory', async () => {
    expect(await hashContracts(join(tmpdir(), 'does-not-exist-xyz'))).toEqual({});
  });
});
