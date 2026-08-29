#!/usr/bin/env node
import { Command } from 'commander';
import { materialize } from './commands/materialize.js';
import { cleanup } from './commands/cleanup.js';
import { status } from './commands/status.js';
import { mergeCommand } from './commands/merge.js';
import { WindowsTerminals } from './adapters/terminals-windows.js';

const program = new Command();
program.name('multiagent').description('Parallel Claude Code agents with a frozen contract layer.');

program
  .command('materialize <manifest>')
  .description('Create a worktree and terminal per task.')
  .action(async (manifest: string) => {
    await materialize(manifest, process.cwd(), new WindowsTerminals());
  });

program
  .command('status <manifest>')
  .description('Print the run status table.')
  .action(async (manifest: string) => {
    console.log(await status(manifest));
  });

program
  .command('cleanup <manifest>')
  .description('Remove all task worktrees.')
  .action(async (manifest: string) => {
    await cleanup(manifest, process.cwd());
  });

program
  .command('merge <manifest>')
  .description('Merge eligible task branches in dependency order with a typecheck gate.')
  .option('--base <branch>', 'base branch to merge into', 'main')
  .action(async (manifest: string, opts: { base: string }) => {
    console.log(await mergeCommand(manifest, process.cwd(), opts.base));
  });

program.parseAsync();
