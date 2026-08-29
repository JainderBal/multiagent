import { describe, it, expect } from 'vitest';
import { buildWindowsTerminalArgs } from '../../src/adapters/terminals-windows.js';

describe('buildWindowsTerminalArgs', () => {
  it('builds a Windows Terminal new-tab invocation with title, green tab, cwd, and argv', () => {
    const { file, args } = buildWindowsTerminalArgs({
      title: 'api-routes',
      cwd: 'C:\\repo-api-routes',
      tabColor: '#2ea043',
      argv: ['claude', '--name', 'api-routes', '--dangerously-skip-permissions', 'do the thing'],
    });
    expect(file).toBe('wt.exe');
    expect(args).toEqual([
      '-w', '0', 'nt',
      '--title', 'api-routes',
      '--tabColor', '#2ea043',
      '-d', 'C:\\repo-api-routes',
      'claude', '--name', 'api-routes', '--dangerously-skip-permissions', 'do the thing',
    ]);
  });

  it('omits --tabColor when no color is given', () => {
    const { args } = buildWindowsTerminalArgs({
      title: 'x', cwd: 'C:\\x', argv: ['claude'],
    });
    expect(args).not.toContain('--tabColor');
  });
});
