import { describe, it, expect } from 'vitest';
import { buildWindowsTerminalArgs } from '../../src/adapters/terminals-windows.js';

describe('buildWindowsTerminalArgs', () => {
  it('builds a Windows Terminal new-tab invocation with title, cwd, and command', () => {
    const { file, args } = buildWindowsTerminalArgs({
      title: 'api-routes',
      cwd: 'C:\\repo-api-routes',
      command: 'claude --name api-routes',
    });
    expect(file).toBe('wt.exe');
    expect(args).toEqual([
      '-w', '0', 'nt',
      '--title', 'api-routes',
      '-d', 'C:\\repo-api-routes',
      'cmd', '/k', 'claude --name api-routes',
    ]);
  });
});
