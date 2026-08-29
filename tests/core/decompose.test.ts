import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/core/decompose.js';

const base = {
  run: '2026-08-28-notifications', spec: 'notifications.md', adapter: 'typescript', repoName: 'repo',
};

describe('buildManifest', () => {
  it('derives names and sets initial state', () => {
    const m = buildManifest({
      ...base,
      tasks: [
        { name: 'shared-types', provides: ['N'] },
        { name: 'api', dependsOn: ['shared-types'], consumes: ['N'] },
      ],
    });
    expect(m.contractVersion).toBe(1);
    expect(m.tasks[1]).toMatchObject({
      name: 'api', branch: 'agent/api', worktree: '../repo-api', sessionName: 'api',
      dependsOn: ['shared-types'], consumes: ['N'], status: 'pending', builtAtContractVersion: null,
    });
  });

  it('rejects a duplicate task name', () => {
    expect(() => buildManifest({ ...base, tasks: [{ name: 'a' }, { name: 'a' }] })).toThrow(/duplicate/i);
  });

  it('rejects an invalid task name', () => {
    expect(() => buildManifest({ ...base, tasks: [{ name: 'Bad Name' }] })).toThrow();
  });

  it('rejects a cyclic dependency graph', () => {
    expect(() => buildManifest({
      ...base,
      tasks: [{ name: 'a', dependsOn: ['b'] }, { name: 'b', dependsOn: ['a'] }],
    })).toThrow(/cycle/i);
  });
});
