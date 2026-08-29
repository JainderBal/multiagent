import { execa } from 'execa';

export type MergeOutcome = 'clean' | 'text-conflict';
export type MeasureResult = { branch: string; outcome: MergeOutcome };

export async function measureMerges(
  repoRoot: string,
  baseBranch: string,
  branches: string[],
): Promise<MeasureResult[]> {
  const git = (args: string[]) => execa('git', args, { cwd: repoRoot, reject: false });
  const results: MeasureResult[] = [];
  for (const branch of branches) {
    await git(['checkout', baseBranch]);
    const res = await git(['merge', '--no-commit', '--no-ff', branch]);
    const outcome: MergeOutcome = res.exitCode === 0 ? 'clean' : 'text-conflict';
    await git(['merge', '--abort']);
    await git(['reset', '--hard']);
    results.push({ branch, outcome });
  }
  return results;
}

export function renderMeasure(results: MeasureResult[]): string {
  const conflicts = results.filter((r) => r.outcome === 'text-conflict').length;
  const pct = results.length ? Math.round((conflicts / results.length) * 100) : 0;
  const lines = results.map((r) => `${r.branch}   ${r.outcome}`);
  return `${lines.join('\n')}\n\n${results.length} branches, ${conflicts} text-conflicts (${pct}%)`;
}
