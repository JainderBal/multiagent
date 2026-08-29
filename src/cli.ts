#!/usr/bin/env node
import { Command } from 'commander';
import { materialize } from './commands/materialize.js';
import { cleanup } from './commands/cleanup.js';
import { status } from './commands/status.js';
import { mergeCommand } from './commands/merge.js';
import { dryrunCommand } from './commands/dryrun.js';
import { freezeCommand } from './commands/freeze.js';
import { verifyContracts } from './core/contracts.js';
import { loadManifest } from './core/manifest.js';
import { join } from 'node:path';
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
  .command('freeze <manifest>')
  .description('Hash the contract files and record VERSION + hashes in the manifest.')
  .option('--contracts <dir>', 'contract directory (relative to repo root)', 'packages/contracts')
  .action(async (manifest: string, opts: { contracts: string }) => {
    console.log(await freezeCommand(manifest, process.cwd(), opts.contracts));
  });

program
  .command('verify <manifest>')
  .description('Re-hash contracts and report any drift from the frozen hashes.')
  .option('--contracts <dir>', 'contract directory (relative to repo root)', 'packages/contracts')
  .action(async (manifest: string, opts: { contracts: string }) => {
    const m = await loadManifest(manifest);
    const v = await verifyContracts(join(process.cwd(), opts.contracts), m);
    console.log(v.ok ? 'contracts OK' : `contracts DRIFTED: ${v.mismatches.join(', ')}`);
  });

program
  .command('dryrun <manifest>')
  .description('Report which agents have stated an intent plan.')
  .action(async (manifest: string) => {
    console.log(await dryrunCommand(manifest));
  });

program
  .command('merge <manifest>')
  .description('Merge eligible task branches in dependency order with a typecheck gate.')
  .option('--base <branch>', 'base branch to merge into', 'main')
  .action(async (manifest: string, opts: { base: string }) => {
    console.log(await mergeCommand(manifest, process.cwd(), opts.base));
  });

program.parseAsync();
