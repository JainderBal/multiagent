import { describe, it, expect } from 'vitest';
import { renderStatusTable } from '../../src/core/status.js';
import { parseManifest } from '../../src/core/manifest.js';

const m = parseManifest({
  run: 'r', spec: 's', adapter: 'typescript', interfaceVersion: 1,
  interfaceHashes: {}, agents: [],
  tasks: [
    { name: 'shared-types', branch: 'agent/shared-types', worktree: '../r-shared-types',
      sessionName: 'shared-types', dependsOn: [], provides: [], consumes: [],
      status: 'merged', builtAtInterfaceVersion: 1 },
    { name: 'api-routes', branch: 'agent/api-routes', worktree: '../r-api-routes',
      sessionName: 'api-routes', dependsOn: ['shared-types'], provides: [], consumes: [],
      status: 'running', builtAtInterfaceVersion: 1 },
    { name: 'ui-preferences', branch: 'agent/ui-preferences', worktree: '../r-ui-preferences',
      sessionName: 'ui-preferences', dependsOn: ['api-routes'], provides: [], consumes: [],
      status: 'pending', builtAtInterfaceVersion: null },
  ],
});

describe('renderStatusTable', () => {
  it('renders aligned status + name with waits hint on blocked-by-deps', () => {
    expect(renderStatusTable(m)).toBe(
      'merged    shared-types\n' +
      'running   api-routes\n' +
      'pending   ui-preferences   waits: api-routes',
    );
  });
});

describe('renderStatusTable mergeable hint', () => {
  it('marks a done task whose deps are merged as mergeable', () => {
    const mm = parseManifest({
      run: 'r', spec: 's', adapter: 'typescript', interfaceVersion: 1,
      interfaceHashes: {}, agents: [],
      tasks: [
        { name: 'a', branch: 'agent/a', worktree: '../r-a', sessionName: 'a',
          dependsOn: [], provides: [], consumes: [], status: 'merged', builtAtInterfaceVersion: 1 },
        { name: 'b', branch: 'agent/b', worktree: '../r-b', sessionName: 'b',
          dependsOn: ['a'], provides: [], consumes: [], status: 'done', builtAtInterfaceVersion: 1 },
      ],
    });
    expect(renderStatusTable(mm)).toBe(
      'merged    a\n' +
      'done      b   -> mergeable',
    );
  });
});
