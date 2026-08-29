import { execa } from 'execa';
import { join } from 'node:path';
import { loadManifest, saveManifest } from './manifest.js';
import { getMergeable } from './graph.js';
import { verifyContracts } from './contracts.js';
import type { LanguageAdapter } from '../adapters/language.js';

export type MergeReport = {
  merged: string[];
  warnings: string[];
  stoppedAt?: { task: string; reason: string };
};

export async function mergeAll(
  manifestPath: string,
  repoRoot: string,
  baseBranch: string,
  adapter: LanguageAdapter,
  contractDir: string = join(repoRoot, 'packages', 'contracts'),
): Promise<MergeReport> {
  const merged: string[] = [];
  const warnings: string[] = [];
  const git = (args: string[]) => execa('git', args, { cwd: repoRoot, reject: false });
  let checkedOut = false;

  for (;;) {
    const m = await loadManifest(manifestPath);
    const eligible = getMergeable(m.tasks);
    if (eligible.length === 0) return { merged, warnings };
    const task = eligible[0];

    if (!checkedOut) {
      await git(['checkout', baseBranch]);
      checkedOut = true;
    }

    const mergeRes = await git(['merge', '--no-ff', '-m', `merge ${task.name}`, task.branch]);
    if (mergeRes.exitCode !== 0) {
      await git(['merge', '--abort']);
      return { merged, warnings, stoppedAt: { task: task.name, reason: 'merge conflict' } };
    }

    if (Object.keys(m.contractHashes).length > 0) {
      const v = await verifyContracts(contractDir, m);
      if (!v.ok) {
        await git(['reset', '--hard', 'HEAD~1']);
        return {
          merged, warnings,
          stoppedAt: { task: task.name, reason: `contract violation: ${v.mismatches.join(', ')}` },
        };
      }
    }

    const gate = await adapter.gate(repoRoot);
    if (!gate.ok) {
      await git(['reset', '--hard', 'HEAD~1']);
      return { merged, warnings, stoppedAt: { task: task.name, reason: `gate failed:\n${gate.output}` } };
    }

    if (task.builtAtContractVersion !== null && task.builtAtContractVersion < m.contractVersion) {
      warnings.push(
        `${task.name} built at contract v${task.builtAtContractVersion}, current v${m.contractVersion}`,
      );
    }

    task.status = 'merged';
    await saveManifest(manifestPath, m);
    merged.push(task.name);
  }
}
