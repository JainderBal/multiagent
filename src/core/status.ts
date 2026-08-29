import type { TManifest, TTask } from './manifest.js';

const STATUS_WIDTH = 10;

function unmetDeps(task: TTask, byName: Map<string, TTask>): string[] {
  return task.dependsOn.filter((d) => byName.get(d)?.status !== 'merged');
}

export function renderStatusTable(m: TManifest): string {
  const byName = new Map(m.tasks.map((t) => [t.name, t]));
  return m.tasks
    .map((t) => {
      const left = `${t.status.padEnd(STATUS_WIDTH)}${t.name}`;
      if (t.status === 'pending') {
        const waits = unmetDeps(t, byName);
        if (waits.length > 0) return `${left}   waits: ${waits.join(', ')}`;
      }
      return left;
    })
    .join('\n');
}
