import { deriveNames, assertValidTaskName } from './naming.js';
import { detectCycle } from './graph.js';
import type { TManifest, TTask } from './manifest.js';

export type DecomposedTask = {
  name: string;
  dependsOn?: string[];
  provides?: string[];
  consumes?: string[];
};

export type Decomposition = {
  run: string;
  spec: string;
  adapter: string;
  repoName: string;
  tasks: DecomposedTask[];
};

export function buildManifest(d: Decomposition): TManifest {
  const seen = new Set<string>();
  for (const t of d.tasks) {
    assertValidTaskName(t.name);
    if (seen.has(t.name)) throw new Error(`duplicate task name: ${t.name}`);
    seen.add(t.name);
  }

  const tasks: TTask[] = d.tasks.map((t) => {
    const names = deriveNames(t.name, d.repoName);
    return {
      name: t.name,
      branch: names.branch,
      worktree: names.worktree,
      sessionName: names.sessionName,
      dependsOn: t.dependsOn ?? [],
      provides: t.provides ?? [],
      consumes: t.consumes ?? [],
      status: 'pending',
      builtAtContractVersion: null,
    };
  });

  const cycle = detectCycle(tasks);
  if (cycle) throw new Error(`dependency cycle: ${cycle.join(' -> ')}`);

  return {
    run: d.run,
    spec: d.spec,
    adapter: d.adapter,
    contractVersion: 1,
    contractHashes: {},
    agents: [],
    tasks,
  };
}
