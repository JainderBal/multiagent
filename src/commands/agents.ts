import { loadAgents } from '../core/agents.js';

export async function agentsCommand(dir: string): Promise<string> {
  const agents = await loadAgents(dir);
  if (agents.length === 0) return `no custom agents in ${dir}`;
  return agents
    .map((a) => {
      const c = a.config;
      return `${c.name}   hook=${c.hook ?? '(none)'} blocking=${c.blocking} commits=${c.commits} workspace=${c.workspace}`;
    })
    .join('\n');
}
