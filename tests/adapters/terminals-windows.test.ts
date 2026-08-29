import { describe, it, expect } from 'vitest';
import { buildWindowsTerminalArgs } from '../../src/adapters/terminals-windows.js';

describe('buildWindowsTerminalArgs', () => {
  it('locks the tab title, applies the color scheme, sets cwd, and passes argv', () => {
    const { file, args } = buildWindowsTerminalArgs({
      title: 'api-routes',
      cwd: 'C:\\repo-api-routes',
      colorScheme: 'MultiagentGreen',
      argv: ['claude', '--name', 'api-routes', '--dangerously-skip-permissions', 'do the thing'],
    });
    expect(file).toBe('wt.exe');
    expect(args).toEqual([
      '-w', '0', 'nt',
      '--title', 'api-routes',
      '--suppressApplicationTitle',
      '--colorScheme', 'MultiagentGreen',
      '-d', 'C:\\repo-api-routes',
      'claude', '--name', 'api-routes', '--dangerously-skip-permissions', 'do the thing',
    ]);
  });

  it('always locks the tab title and omits --colorScheme when none is given', () => {
    const { args } = buildWindowsTerminalArgs({
      title: 'x', cwd: 'C:\\x', argv: ['claude'],
    });
    expect(args).toContain('--suppressApplicationTitle');
    expect(args).not.toContain('--colorScheme');
  });
});
