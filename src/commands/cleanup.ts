import { loadManifest } from '../core/manifest.js';
import { removeWorktree } from '../core/worktree.js';

export async function cleanup(manifestPath: string, repoRoot: string): Promise<void> {
  const m = await loadManifest(manifestPath);
  for (const t of m.tasks) {
    await removeWorktree(repoRoot, t.worktree).catch(() => {});
  }
}
