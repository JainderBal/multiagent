import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Normalize a folder path to the key format Claude Code uses in ~/.claude.json:
 * an absolute path with a lowercase drive letter and forward slashes
 * (e.g. "c:/Users/x/repo").
 */
export function normalizeProjectKey(folder: string): string {
  const abs = resolve(folder).replace(/\\/g, '/');
  return abs.replace(/^([A-Za-z]):/, (_m, d: string) => `${d.toLowerCase()}:`);
}

/**
 * Pre-accept Claude Code's "trust this folder?" dialog for a worktree by setting
 * hasTrustDialogAccepted: true in ~/.claude.json, so a session started there
 * launches without prompting. configPath is injectable for tests.
 */
export async function trustFolder(folder: string, configPath?: string): Promise<void> {
  const path = configPath ?? join(homedir(), '.claude.json');
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(await fs.readFile(path, 'utf8')) as Record<string, unknown>;
  } catch {
    cfg = {};
  }
  const projects = (cfg.projects as Record<string, Record<string, unknown>>) ?? {};
  const key = normalizeProjectKey(folder);
  projects[key] = { ...(projects[key] ?? {}), hasTrustDialogAccepted: true };
  cfg.projects = projects;
  await fs.writeFile(path, JSON.stringify(cfg, null, 2), 'utf8');
}
