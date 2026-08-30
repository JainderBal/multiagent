import { join } from 'node:path';
import { freezeInterfaces } from '../core/interfaces.js';
import { loadManifest } from '../core/manifest.js';

export async function freezeCommand(
  manifestPath: string,
  repoRoot: string,
  interfaceDirRel: string,
): Promise<string> {
  const interfaceDir = join(repoRoot, interfaceDirRel);
  const hashes = await freezeInterfaces(interfaceDir, manifestPath);
  const m = await loadManifest(manifestPath);
  return `frozen ${Object.keys(hashes).length} files at interface v${m.interfaceVersion}`;
}
