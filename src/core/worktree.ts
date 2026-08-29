import { execa } from 'execa';

export type WorktreeSpec = {
  repoRoot: string;
  branch: string;
  path: string;
  userName: string;
  userEmail: string;
};

export async function createWorktree(spec: WorktreeSpec): Promise<void> {
  await execa('git', ['worktree', 'add', '-b', spec.branch, spec.path], { cwd: spec.repoRoot });
  // Worktrees share the main repo config by default, so a plain `git config
  // user.name` in one worktree would overwrite every other worktree's identity.
  // Enable per-worktree config and write the identity into this worktree only.
  await execa('git', ['config', 'extensions.worktreeConfig', 'true'], { cwd: spec.repoRoot });
  await execa('git', ['config', '--worktree', 'user.name', spec.userName], { cwd: spec.path });
  await execa('git', ['config', '--worktree', 'user.email', spec.userEmail], { cwd: spec.path });
}

export async function removeWorktree(repoRoot: string, path: string): Promise<void> {
  await execa('git', ['worktree', 'remove', '--force', path], { cwd: repoRoot });
}
