import { mergeAll } from '../core/merge.js';
import { TypeScriptAdapter } from '../adapters/language-typescript.js';

export async function mergeCommand(
  manifestPath: string,
  repoRoot: string,
  baseBranch: string,
): Promise<string> {
  const report = await mergeAll(manifestPath, repoRoot, baseBranch, new TypeScriptAdapter());
  const lines = [`merged ${report.merged.length}: ${report.merged.join(', ') || '(none)'}`];
  for (const w of report.warnings) lines.push(`warning: ${w}`);
  if (report.stoppedAt) {
    lines.push(`stopped at ${report.stoppedAt.task}: ${report.stoppedAt.reason}`);
  }
  return lines.join('\n');
}
