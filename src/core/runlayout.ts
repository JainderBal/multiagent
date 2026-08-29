import { join } from 'node:path';

export type RunLayout = {
  runDir: string;
  manifest: string;
  plansDir: string;
  requestsDir: string;
  statusDir: string;
  tasksDir: string;
};

export function runLayout(runDir: string): RunLayout {
  return {
    runDir,
    manifest: join(runDir, 'manifest.json'),
    plansDir: join(runDir, 'plans'),
    requestsDir: join(runDir, 'requests'),
    statusDir: join(runDir, 'status'),
    tasksDir: join(runDir, 'tasks'),
  };
}

export function planPath(layout: RunLayout, task: string): string {
  return join(layout.plansDir, `${task}.md`);
}
