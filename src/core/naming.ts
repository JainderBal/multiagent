export type TaskNames = {
  branch: string;
  worktree: string;
  sessionName: string;
};

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function assertValidTaskName(name: string): void {
  if (!KEBAB.test(name)) {
    throw new Error(
      `Invalid task name "${name}": must be kebab-case (lowercase letters, digits, hyphens).`,
    );
  }
}

export function deriveNames(name: string, repoName: string): TaskNames {
  assertValidTaskName(name);
  return {
    branch: `agent/${name}`,
    worktree: `../${repoName}-${name}`,
    sessionName: name,
  };
}
