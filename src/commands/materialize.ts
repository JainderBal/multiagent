import { loadManifest, saveManifest } from '../core/manifest.js';
import { createWorktree } from '../core/worktree.js';
import type { Terminals } from '../adapters/terminals.js';

export async function materialize(
  manifestPath: string,
  repoRoot: string,
  terminals: Terminals,
): Promise<void> {
  const m = await loadManifest(manifestPath);
  for (const t of m.tasks) {
    await createWorktree({
      repoRoot,
      branch: t.branch,
      path: t.worktree,
      userName: `orchestrator/${t.name}`,
      userEmail: `${t.name}@orchestrator.local`,
    });
    await terminals.open({
      title: t.sessionName,
      cwd: t.worktree,
      command: `claude --name ${t.sessionName}`,
    });
    t.status = 'running';
  }
  await saveManifest(manifestPath, m);
}
