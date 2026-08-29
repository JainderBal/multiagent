import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAdapter, detectAdapter } from '../../src/adapters/registry.js';

describe('getAdapter', () => {
  it('returns the typescript adapter', () => {
    expect(getAdapter('typescript').id).toBe('typescript');
  });
  it('throws on unknown id', () => {
    expect(() => getAdapter('cobol')).toThrow(/unknown adapter/i);
  });
});

describe('detectAdapter', () => {
  it('detects typescript by tsconfig', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ma-reg-'));
    expect(await detectAdapter(dir)).toBeNull();
    await fs.writeFile(join(dir, 'tsconfig.json'), '{}');
    expect((await detectAdapter(dir))?.id).toBe('typescript');
  });
});
