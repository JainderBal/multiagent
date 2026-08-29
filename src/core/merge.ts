import { execa } from 'execa';
import { loadManifest, saveManifest } from './manifest.js';
import { getMergeable } from './graph.js';
import type { LanguageAdapter } from '../adapters/language.js';

export type MergeReport = {
  merged: string[];
  stoppedAt?: { task: string; reason: string };
};

export async function mergeAll(
  manifestPath: string,
  repoRoot: string,
  baseBranch: string,
  adapter: LanguageAdapter,
): Promise<MergeReport> {
  const merged: string[] = [];
  const git = (args: string[]) => execa('git', args, { cwd: repoRoot, reject: false });
  let checkedOut = false;

  for (;;) {
    const m = await loadManifest(manifestPath);
    const eligible = getMergeable(m.tasks);
    if (eligible.length === 0) return { merged };
    const task = eligible[0];

    if (!checkedOut) {
      await git(['checkout', baseBranch]);
      checkedOut = true;
    }

    const mergeRes = await git(['merge', '--no-ff', '-m', `merge ${task.name}`, task.branch]);
    if (mergeRes.exitCode !== 0) {
      await git(['merge', '--abort']);
      return { merged, stoppedAt: { task: task.name, reason: 'merge conflict' } };
    }

    const gate = await adapter.gate(repoRoot);
    if (!gate.ok) {
      await git(['reset', '--hard', 'HEAD~1']);
      return { merged, stoppedAt: { task: task.name, reason: `gate failed:\n${gate.output}` } };
    }

    task.status = 'merged';
    await saveManifest(manifestPath, m);
    merged.push(task.name);
  }
}
