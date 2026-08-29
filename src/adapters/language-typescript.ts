import { execa } from 'execa';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { GateResult, LanguageAdapter } from './language.js';

const require = createRequire(import.meta.url);

export class TypeScriptAdapter implements LanguageAdapter {
  id = 'typescript';
  contractDir = 'packages/contracts';
  contractGlobs = ['**/*.ts'];

  async detect(repoRoot: string): Promise<boolean> {
    try {
      await fs.access(join(repoRoot, 'tsconfig.json'));
      return true;
    } catch {
      return false;
    }
  }

  async gate(dir: string): Promise<GateResult> {
    const tsc = require.resolve('typescript/bin/tsc');
    const result = await execa(process.execPath, [tsc, '--noEmit', '-p', dir], { reject: false });
    return { ok: result.exitCode === 0, output: `${result.stdout}\n${result.stderr}`.trim() };
  }
}
