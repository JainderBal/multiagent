import { promises as fs } from 'node:fs';
import { z } from 'zod';

export const AgentConfig = z.object({
  name: z.string(),
  description: z.string().default(''),
  hook: z.enum(['pre-execution', 'per-task', 'pre-merge', 'post-merge']).optional(),
  blocking: z.boolean().default(false),
  commits: z.boolean().default(false),
  workspace: z.enum(['own', 'read-only']).default('read-only'),
});

export const Task = z.object({
  name: z.string(),
  branch: z.string(),
  worktree: z.string(),
  sessionName: z.string(),
  dependsOn: z.array(z.string()),
  provides: z.array(z.string()),
  consumes: z.array(z.string()),
  status: z.enum(['pending', 'running', 'done', 'blocked', 'merged']),
  builtAtContractVersion: z.number().int().nullable(),
});

export const Manifest = z.object({
  run: z.string(),
  spec: z.string(),
  adapter: z.string(),
  contractVersion: z.number().int(),
  contractHashes: z.record(z.string()),
  agents: z.array(AgentConfig),
  tasks: z.array(Task),
});

export type TTask = z.infer<typeof Task>;
export type TManifest = z.infer<typeof Manifest>;

export function parseManifest(data: unknown): TManifest {
  return Manifest.parse(data);
}

export async function loadManifest(path: string): Promise<TManifest> {
  const raw = await fs.readFile(path, 'utf8');
  return parseManifest(JSON.parse(raw));
}

export async function saveManifest(path: string, m: TManifest): Promise<void> {
  await fs.writeFile(path, JSON.stringify(m, null, 2) + '\n', 'utf8');
}
