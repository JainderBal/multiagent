import { execa } from 'execa';

/**
 * Run a TypeScript entrypoint with Node's native type stripping (Node 22.6+),
 * so the engineer can start the assembled app without a separate TS runner.
 * The entrypoint's relative imports must carry explicit `.ts` extensions —
 * that is what lets Node resolve them while stripping types.
 */
export async function runCommand(
  file: string,
  args: string[],
  cwd: string,
): Promise<number> {
  const res = await execa(process.execPath, [file, ...args], {
    cwd,
    stdio: 'inherit',
    reject: false,
  });
  return res.exitCode ?? 1;
}
