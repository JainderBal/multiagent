import { describe, it, expect } from 'vitest';
import { agentsForHook, type LoadedAgent } from '../../src/core/agents.js';

function agent(name: string, hook: string): LoadedAgent {
  return {
    config: {
      name, description: '', hook: hook as LoadedAgent['config']['hook'],
      blocking: false, commits: false, workspace: 'read-only',
    },
    prompt: '',
  };
}

describe('agentsForHook', () => {
  it('filters agents by stage', () => {
    const agents = [agent('r', 'pre-merge'), agent('l', 'per-task'), agent('r2', 'pre-merge')];
    expect(agentsForHook(agents, 'pre-merge').map((a) => a.config.name)).toEqual(['r', 'r2']);
  });
});
