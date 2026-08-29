import { join } from 'node:path';
import { mergeAll } from '../core/merge.js';
import { getAdapter } from '../adapters/registry.js';
import { loadManifest } from '../core/manifest.js';

export async function mergeCommand(
  manifestPath: string,
  repoRoot: string,
  baseBranch: string,
): Promise<string> {
  const m = await loadManifest(manifestPath);
  const adapter = getAdapter(m.adapter);
  const report = await mergeAll(
    manifestPath, repoRoot, baseBranch, adapter, join(repoRoot, adapter.contractDir),
  );
  const lines = [`merged ${report.merged.length}: ${report.merged.join(', ') || '(none)'}`];
  for (const w of report.warnings) lines.push(`warning: ${w}`);
  if (report.stoppedAt) lines.push(`stopped at ${report.stoppedAt.task}: ${report.stoppedAt.reason}`);
  return lines.join('\n');
}
