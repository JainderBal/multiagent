import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeProjectKey, trustFolder } from '../../src/core/trust.js';

describe('normalizeProjectKey', () => {
  it('preserves the drive letter and uses forward slashes', () => {
    expect(normalizeProjectKey('C:\\Users\\x\\repo-alpha')).toBe('C:/Users/x/repo-alpha');
  });
});

describe('trustFolder', () => {
  it('sets hasTrustDialogAccepted true for the folder, preserving other config', async () => {
    const p = join(await fs.mkdtemp(join(tmpdir(), 'ma-trust-')), '.claude.json');
    await fs.writeFile(p, JSON.stringify({ someTop: 1, projects: { 'c:/existing': { foo: 'bar' } } }));

    await trustFolder('C:\\Users\\x\\wt-alpha', p);

    const cfg = JSON.parse(await fs.readFile(p, 'utf8'));
    expect(cfg.someTop).toBe(1); // untouched
    expect(cfg.projects['c:/existing'].foo).toBe('bar'); // untouched
    expect(cfg.projects['C:/Users/x/wt-alpha'].hasTrustDialogAccepted).toBe(true);
  });

  it('creates the file/projects map if missing', async () => {
    const p = join(await fs.mkdtemp(join(tmpdir(), 'ma-trust2-')), '.claude.json');
    await trustFolder('C:\\a\\b', p);
    const cfg = JSON.parse(await fs.readFile(p, 'utf8'));
    expect(cfg.projects['C:/a/b'].hasTrustDialogAccepted).toBe(true);
  });
});
