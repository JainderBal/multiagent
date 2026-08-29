import { describe, it, expect } from 'vitest';
import { deriveNames, assertValidTaskName } from '../../src/core/naming.js';

describe('deriveNames', () => {
  it('derives branch, worktree, and session name from a task name', () => {
    expect(deriveNames('notification-service', 'repo')).toEqual({
      branch: 'agent/notification-service',
      worktree: '../repo-notification-service',
      sessionName: 'notification-service',
    });
  });
});

describe('assertValidTaskName', () => {
  it('accepts kebab-case', () => {
    expect(() => assertValidTaskName('ui-bell')).not.toThrow();
  });
  it('rejects spaces and uppercase', () => {
    expect(() => assertValidTaskName('UI Bell')).toThrow();
    expect(() => assertValidTaskName('Ui-Bell')).toThrow();
  });
});
