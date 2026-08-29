import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseManifest, loadManifest, saveManifest } from '../../src/core/manifest.js';

const valid = {
  run: '2026-08-28-notifications',
  spec: 'notifications.md',
  adapter: 'typescript',
  contractVersion: 1,
  contractHashes: {},
  agents: [],
  tasks: [
    {
      name: 'shared-types',
      branch: 'agent/shared-types',
      worktree: '../repo-shared-types',
      sessionName: 'shared-types',
      dependsOn: [],
      provides: ['Notification'],
      consumes: [],
      status: 'pending',
      builtAtContractVersion: null,
    },
  ],
};

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    expect(parseManifest(valid).run).toBe('2026-08-28-notifications');
  });
  it('rejects an invalid status enum', () => {
    const bad = structuredClone(valid);
    bad.tasks[0].status = 'wip';
    expect(() => parseManifest(bad)).toThrow();
  });
});

describe('load/save round-trip', () => {
  it('saves and reloads identically', async () => {
    const p = join(await fs.mkdtemp(join(tmpdir(), 'ma-')), 'manifest.json');
    await saveManifest(p, parseManifest(valid));
    const back = await loadManifest(p);
    expect(back).toEqual(valid);
  });
});
