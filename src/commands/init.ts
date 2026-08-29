import { promises as fs } from 'node:fs';
import { buildManifest, type Decomposition } from '../core/decompose.js';
import { writeRun } from '../core/taskfile.js';

export async function initCommand(decompositionPath: string, runDir: string): Promise<string> {
  const d = JSON.parse(await fs.readFile(decompositionPath, 'utf8')) as Decomposition;
  const manifest = buildManifest(d);
  await writeRun(runDir, manifest);
  return `initialized run ${manifest.run} with ${manifest.tasks.length} tasks at ${runDir}`;
}
