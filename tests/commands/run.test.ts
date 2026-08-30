import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../../src/commands/run.js';

describe('runCommand', () => {
  it('runs a TypeScript entrypoint and returns its exit code', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ma-run-'));
    await fs.writeFile(join(dir, 'ok.ts'), 'const n: number = 2;\nprocess.exit(n === 2 ? 0 : 1);\n');
    expect(await runCommand(join(dir, 'ok.ts'), [], dir)).toBe(0);
  });

  it('propagates a non-zero exit code', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ma-run2-'));
    await fs.writeFile(join(dir, 'bad.ts'), 'process.exit(3);\n');
    expect(await runCommand(join(dir, 'bad.ts'), [], dir)).toBe(3);
  });
});
