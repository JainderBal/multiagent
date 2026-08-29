import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { runLayout, planPath } from '../../src/core/runlayout.js';

describe('runLayout', () => {
  it('locates subdirectories relative to the run dir', () => {
    const l = runLayout('/runs/r1');
    expect(l.manifest).toBe(join('/runs/r1', 'manifest.json'));
    expect(l.plansDir).toBe(join('/runs/r1', 'plans'));
    expect(l.requestsDir).toBe(join('/runs/r1', 'requests'));
    expect(l.statusDir).toBe(join('/runs/r1', 'status'));
    expect(l.tasksDir).toBe(join('/runs/r1', 'tasks'));
  });
  it('builds a plan path for a task', () => {
    expect(planPath(runLayout('/runs/r1'), 'api')).toBe(join('/runs/r1', 'plans', 'api.md'));
  });
});
