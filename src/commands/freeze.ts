import { join } from 'node:path';
import { freezeContracts } from '../core/contracts.js';
import { loadManifest } from '../core/manifest.js';

export async function freezeCommand(
  manifestPath: string,
  repoRoot: string,
  contractDirRel: string,
): Promise<string> {
  const contractDir = join(repoRoot, contractDirRel);
  const hashes = await freezeContracts(contractDir, manifestPath);
  const m = await loadManifest(manifestPath);
  return `frozen ${Object.keys(hashes).length} files at contract v${m.contractVersion}`;
}
