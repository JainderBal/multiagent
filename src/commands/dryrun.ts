import { collectDryRun, renderDryRun } from '../core/dryrun.js';

export async function dryrunCommand(manifestPath: string): Promise<string> {
  return renderDryRun(await collectDryRun(manifestPath));
}
