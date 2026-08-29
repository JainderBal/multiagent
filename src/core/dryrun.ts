import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { loadManifest } from './manifest.js';
import { runLayout, planPath } from './runlayout.js';

export type DryRunStatus = { task: string; stated: boolean }[];

async function hasContent(path: string): Promise<boolean> {
  try {
    const text = await fs.readFile(path, 'utf8');
    return text.trim().length > 0;
  } catch {
    return false;
  }
}

export async function collectDryRun(manifestPath: string): Promise<DryRunStatus> {
  const m = await loadManifest(manifestPath);
  const layout = runLayout(dirname(manifestPath));
  const out: DryRunStatus = [];
  for (const t of m.tasks) {
    out.push({ task: t.name, stated: await hasContent(planPath(layout, t.name)) });
  }
  return out;
}

export function renderDryRun(status: DryRunStatus): string {
  const width = Math.max(0, ...status.map((s) => s.task.length)) + 3;
  const lines = status.map((s) => `${s.task.padEnd(width)}${s.stated ? 'stated' : 'waiting'}`);
  const done = status.filter((s) => s.stated).length;
  return `${lines.join('\n')}\n\n${done}/${status.length} plans stated`;
}
