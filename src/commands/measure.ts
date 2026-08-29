import { measureMerges, renderMeasure } from '../core/measure.js';

export async function measureCommand(
  repoRoot: string,
  baseBranch: string,
  branches: string[],
): Promise<string> {
  return renderMeasure(await measureMerges(repoRoot, baseBranch, branches));
}
