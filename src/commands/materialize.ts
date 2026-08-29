import { loadManifest, saveManifest } from '../core/manifest.js';
import { createWorktree } from '../core/worktree.js';
import { installContractHook } from '../core/contracthook.js';
import type { Terminals } from '../adapters/terminals.js';

export async function materialize(
  manifestPath: string,
  repoRoot: string,
  terminals: Terminals,
  contractDirRel = 'packages/contracts',
): Promise<void> {
  const m = await loadManifest(manifestPath);
  for (const t of m.tasks) {
    // Idempotent: if the worktree/branch already exists (a re-run), keep going
    // rather than opening a duplicate window or crashing.
    let created = true;
    try {
      await createWorktree({
        repoRoot,
        branch: t.branch,
        path: t.worktree,
        userName: `orchestrator/${t.name}`,
        userEmail: `${t.name}@orchestrator.local`,
      });
    } catch {
      created = false;
    }
    if (created) {
      const prompt =
        `You are the multiagent worker for task ${t.name} (branch ${t.branch}) in this git ` +
        `worktree. Wait for the orchestrator to message you; when told to begin, implement only ` +
        `your task, building against the frozen contracts in ${contractDirRel} — never edit ` +
        `contract files. For now reply READY and wait.`;
      await terminals.open({
        title: t.sessionName,
        cwd: t.worktree,
        colorScheme: 'Multiagent Green', // green Claude look; distinct from your main window
        argv: ['claude', '--name', t.sessionName, '--dangerously-skip-permissions', prompt],
      });
    }
    t.status = 'running';
  }
  await installContractHook(repoRoot, contractDirRel);
  await saveManifest(manifestPath, m);
}
