import { loadManifest } from '../core/manifest.js';
import { renderStatusTable } from '../core/status.js';

export async function status(manifestPath: string): Promise<string> {
  return renderStatusTable(await loadManifest(manifestPath));
}
