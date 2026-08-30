import { describe, it, expect } from 'vitest';
import { getMergeable, detectCycle } from '../../src/core/graph.js';
import type { TTask } from '../../src/core/manifest.js';

function task(name: string, status: TTask['status'], dependsOn: string[] = []): TTask {
  return {
    name, branch: `agent/${name}`, worktree: `../r-${name}`, sessionName: name,
    dependsOn, provides: [], consumes: [], status, builtAtInterfaceVersion: null,
  };
}

describe('getMergeable', () => {
  it('returns done tasks whose deps are all merged', () => {
    const tasks = [
      task('a', 'merged'),
      task('b', 'done', ['a']),
      task('c', 'done', ['b']),          // blocked: b not merged yet
      task('d', 'running'),
    ];
    expect(getMergeable(tasks).map((t) => t.name)).toEqual(['b']);
  });

  it('returns nothing when no dependency is satisfied', () => {
    const tasks = [task('a', 'done', ['x']), task('x', 'running')];
    expect(getMergeable(tasks)).toEqual([]);
  });
});

describe('detectCycle', () => {
  it('returns null for a DAG', () => {
    const tasks = [task('a', 'pending'), task('b', 'pending', ['a'])];
    expect(detectCycle(tasks)).toBeNull();
  });

  it('finds a cycle', () => {
    const tasks = [
      task('a', 'pending', ['c']),
      task('b', 'pending', ['a']),
      task('c', 'pending', ['b']),
    ];
    const cycle = detectCycle(tasks);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThan(0);
  });
});
