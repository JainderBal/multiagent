import type { TTask } from './manifest.js';

export function getMergeable(tasks: TTask[]): TTask[] {
  const byName = new Map(tasks.map((t) => [t.name, t]));
  return tasks.filter(
    (t) =>
      t.status === 'done' &&
      t.dependsOn.every((d) => byName.get(d)?.status === 'merged'),
  );
}

export function detectCycle(tasks: TTask[]): string[] | null {
  const byName = new Map(tasks.map((t) => [t.name, t]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function visit(name: string): string[] | null {
    const s = state.get(name);
    if (s === 'done') return null;
    if (s === 'visiting') {
      const start = stack.indexOf(name);
      return stack.slice(start).concat(name);
    }
    state.set(name, 'visiting');
    stack.push(name);
    for (const dep of byName.get(name)?.dependsOn ?? []) {
      if (!byName.has(dep)) continue;
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(name, 'done');
    return null;
  }

  for (const t of tasks) {
    const found = visit(t.name);
    if (found) return found;
  }
  return null;
}
