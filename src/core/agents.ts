import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { z } from 'zod';
import { AgentConfig } from './manifest.js';

export type TAgentConfig = z.infer<typeof AgentConfig>;
export type LoadedAgent = { config: TAgentConfig; prompt: string };
export type HookStage = 'pre-execution' | 'per-task' | 'pre-merge' | 'post-merge';

export async function loadAgents(dir: string): Promise<LoadedAgent[]> {
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }
  const agents: LoadedAgent[] = [];
  for (const name of names.sort()) {
    const raw = await fs.readFile(join(dir, name), 'utf8');
    const parsed = matter(raw);
    const config = AgentConfig.parse(parsed.data);
    agents.push({ config, prompt: parsed.content.trim() });
  }
  return agents;
}

export function agentsForHook(agents: LoadedAgent[], stage: HookStage): LoadedAgent[] {
  return agents.filter((a) => a.config.hook === stage);
}
