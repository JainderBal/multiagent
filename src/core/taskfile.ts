import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { saveManifest, type TManifest, type TTask } from './manifest.js';
import { runLayout } from './runlayout.js';

function list(items: string[]): string {
  return items.length ? items.join(', ') : '(none)';
}

export function renderTaskFile(task: TTask): string {
  return `# Task: ${task.name}

Branch: ${task.branch}
Worktree: ${task.worktree}
Depends on: ${list(task.dependsOn)}
Provides: ${list(task.provides)}
Consumes: ${list(task.consumes)}

## Scope

Implement only this task. Build against the frozen interfaces in the interfaces
directory — import the declarations, do not restate them.

Do NOT edit interface files. If you need an interface change, write a request under
requests/${task.name}.md describing what you need and why, set your status to
blocked, and stop. Wait for the orchestrator to bump the interface version and
tell you to re-read.

Coordinate only by messaging and by the committed run files. Never edit another
task's files. Messages carry signals and pointers, never code bodies.

When done, state your status in status/${task.name}.log.
`;
}

export async function writeRun(runDir: string, manifest: TManifest): Promise<void> {
  const layout = runLayout(runDir);
  for (const d of [layout.plansDir, layout.requestsDir, layout.statusDir, layout.tasksDir]) {
    await fs.mkdir(d, { recursive: true });
  }
  await saveManifest(layout.manifest, manifest);
  for (const t of manifest.tasks) {
    await fs.writeFile(join(layout.tasksDir, `${t.name}.md`), renderTaskFile(t), 'utf8');
  }
}
