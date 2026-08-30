import { loadManifest, saveManifest } from '../core/manifest.js';

/**
 * Mark a task as done and stamp the interface version it was built against, so it
 * becomes eligible to merge. Lets the orchestrator translate a worker's "done"
 * message into the manifest state that `merge` reads, without hand-editing JSON.
 */
export async function doneCommand(manifestPath: string, task: string): Promise<string> {
  const m = await loadManifest(manifestPath);
  const t = m.tasks.find((x) => x.name === task);
  if (!t) return `no such task: ${task}`;
  t.status = 'done';
  t.builtAtInterfaceVersion = m.interfaceVersion;
  await saveManifest(manifestPath, m);
  return `${task} marked done (built at interface v${m.interfaceVersion})`;
}
