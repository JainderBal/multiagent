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
  await execa('git', ['config', 'user.name', spec.userName], { cwd: spec.path });
  await execa('git', ['config', 'user.email', spec.userEmail], { cwd: spec.path });
}

export async function removeWorktree(repoRoot: string, path: string): Promise<void> {
  await execa('git', ['worktree', 'remove', '--force', path], { cwd: repoRoot });
}
