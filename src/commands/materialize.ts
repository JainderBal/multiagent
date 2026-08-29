import { loadManifest, saveManifest } from '../core/manifest.js';
import { createWorktree } from '../core/worktree.js';
import { installContractHook } from '../core/contracthook.js';
import { trustFolder } from '../core/trust.js';
import type { Terminals } from '../adapters/terminals.js';

export async function materialize(
  manifestPath: string,
  repoRoot: string,
  terminals: Terminals,
  contractDirRel = 'packages/contracts',
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
    // Pre-accept the folder-trust dialog for this worktree so the session
    // starts without prompting.
    await trustFolder(t.worktree);
    // Short banner shown in the tab before Claude starts: the task, its
    // worktree, and that this is the dry-run stage.
    const banner =
      `echo [${t.name}] worktree: ${t.worktree} - DRY RUN: state your plan, do not write yet`;
    await terminals.open({
      title: t.sessionName,
      cwd: t.worktree,
      command: `${banner} & claude --name ${t.sessionName}`,
    });
    t.status = 'running';
  }
  await installContractHook(repoRoot, contractDirRel);
  await saveManifest(manifestPath, m);
}
