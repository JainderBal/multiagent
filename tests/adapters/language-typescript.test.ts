import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TypeScriptAdapter } from '../../src/adapters/language-typescript.js';

async function project(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'ma-ts-'));
  await fs.writeFile(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, skipLibCheck: true },
    include: ['*.ts'],
  }));
  for (const [name, body] of Object.entries(files)) {
    await fs.writeFile(join(dir, name), body);
  }
  return dir;
}

describe('TypeScriptAdapter.gate', () => {
  it('passes on valid TypeScript', async () => {
    const dir = await project({ 'ok.ts': 'export const n: number = 1;\n' });
    const r = await new TypeScriptAdapter().gate(dir);
    expect(r.ok).toBe(true);
  });

  it('fails on a type error and reports output', async () => {
    const dir = await project({ 'bad.ts': 'export const n: number = "x";\n' });
    const r = await new TypeScriptAdapter().gate(dir);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/bad\.ts/);
  });
});

describe('TypeScriptAdapter metadata', () => {
  it('exposes interface dir and globs', () => {
    const a = new TypeScriptAdapter();
    expect(a.id).toBe('typescript');
    expect(a.interfaceDir).toBe('packages/interfaces');
    expect(a.interfaceGlobs).toContain('**/*.ts');
  });
  it('detects a repo with a tsconfig', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ma-det-'));
    expect(await new TypeScriptAdapter().detect(dir)).toBe(false);
    await fs.writeFile(join(dir, 'tsconfig.json'), '{}');
    expect(await new TypeScriptAdapter().detect(dir)).toBe(true);
  });
});
