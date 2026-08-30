import { describe, it, expect } from 'vitest';
import { computeAffected } from '../../src/core/interfaces.js';
import type { TTask } from '../../src/core/manifest.js';

function t(name: string, provides: string[], consumes: string[]): TTask {
  return {
    name, branch: `agent/${name}`, worktree: `../w-${name}`, sessionName: name,
    dependsOn: [], provides, consumes, status: 'running', builtAtInterfaceVersion: 1,
  };
}

describe('computeAffected', () => {
  it('returns tasks that provide or consume a changed symbol', () => {
    const tasks = [
      t('svc', ['NotificationService'], []),
      t('api', [], ['NotificationService']),
      t('ui', [], ['BellProps']),
    ];
    expect(computeAffected(tasks, ['NotificationService'])).toEqual(['svc', 'api']);
  });
  it('returns nothing when no symbol matches', () => {
    expect(computeAffected([t('a', ['X'], [])], ['Y'])).toEqual([]);
  });
});
