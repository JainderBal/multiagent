import { execa } from 'execa';
import type { OpenOpts, Terminals } from './terminals.js';

export function buildWindowsTerminalArgs(opts: OpenOpts): { file: string; args: string[] } {
  const scheme = opts.colorScheme ? ['--colorScheme', opts.colorScheme] : [];
  return {
    file: 'wt.exe',
    args: [
      '-w', '0', 'nt',
      '--title', opts.title,
      // Lock the tab title to the task name so the running program can't
      // overwrite it — the task stays visible at a glance, any time.
      '--suppressApplicationTitle',
      ...scheme,
      '-d', opts.cwd,
      // Program + args passed as separate tokens so a multi-word prompt survives.
      ...opts.argv,
    ],
  };
}

export class WindowsTerminals implements Terminals {
  async open(opts: OpenOpts): Promise<void> {
    const { file, args } = buildWindowsTerminalArgs(opts);
    try {
      await execa(file, args, { windowsHide: false });
    } catch {
      // Fallback for machines without Windows Terminal: a plain start window.
      await execa('cmd', ['/c', 'start', opts.title, ...opts.argv], {
        cwd: opts.cwd,
        windowsHide: false,
      });
    }
  }
}
