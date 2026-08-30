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
  autonomous = false,
): Promise<void> {
  const m = await loadManifest(manifestPath);
  // Opt-in: launch workers that act on the orchestrator's messages without
  // stopping at tool-permission prompts. The default stays interactive.
  const workerFlags = autonomous ? ' --permission-mode bypassPermissions' : '';

  // Phase 1 — create every worktree and pre-accept its folder-trust dialog
  // BEFORE launching any worker. Interleaving worktree creation with running
  // workers lets a worker's git lock the shared .git/config while the next
  // createWorktree writes it, which fails with "Permission denied" on Windows.
  for (const t of m.tasks) {
    await createWorktree({
      repoRoot,
      branch: t.branch,
      path: t.worktree,
      userName: `orchestrator/${t.name}`,
      userEmail: `${t.name}@orchestrator.local`,
    });
    await trustFolder(t.worktree);
  }

  // Phase 2 — install the contract hook once, while the repo is still quiet.
  await installContractHook(repoRoot, contractDirRel);

  // Phase 3 — now open a terminal + Claude session per task.
  for (const t of m.tasks) {
    const banner =
      `echo [${t.name}] worktree: ${t.worktree} - DRY RUN: state your plan, do not write yet`;
    await terminals.open({
      title: t.sessionName,
      cwd: t.worktree,
      command: `${banner} & claude --name ${t.sessionName}${workerFlags}`,
    });
    t.status = 'running';
  }
  await saveManifest(manifestPath, m);
}
