import { execa } from 'execa';
import type { OpenOpts, Terminals } from './terminals.js';

export function buildWindowsTerminalArgs(opts: OpenOpts): { file: string; args: string[] } {
  return {
    file: 'wt.exe',
    args: [
      '-w', '0', 'nt',
      '--title', opts.title,
      '-d', opts.cwd,
      'cmd', '/k', opts.command,
    ],
  };
}

export class WindowsTerminals implements Terminals {
  async open(opts: OpenOpts): Promise<void> {
    const { file, args } = buildWindowsTerminalArgs(opts);
    try {
      await execa(file, args, { windowsHide: false });
    } catch {
      // Fallback for machines without Windows Terminal.
      await execa('cmd', ['/c', 'start', opts.title, 'cmd', '/k', opts.command], {
        cwd: opts.cwd,
        windowsHide: false,
      });
    }
  }
}
