import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';

export async function installInterfaceHook(
  repoRoot: string,
  interfaceDirRel: string,
): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--git-common-dir'], { cwd: repoRoot });
  const gitDir = isAbsolute(stdout) ? stdout : resolve(repoRoot, stdout);
  const hooksDir = join(gitDir, 'hooks');
  await fs.mkdir(hooksDir, { recursive: true });
  const rel = interfaceDirRel.replace(/\/+$/, '');
  const script = `#!/bin/sh
if git diff --cached --name-only | grep -q '^${rel}/'; then
  echo "BLOCKED: interfaces are frozen. File a change request instead."
  echo "  Write a request under the run's requests/ directory and stop."
  exit 1
fi
`;
  const hookPath = join(hooksDir, 'pre-commit');
  await fs.writeFile(hookPath, script, { mode: 0o755 });
  await fs.chmod(hookPath, 0o755).catch(() => {});
  return hookPath;
}
