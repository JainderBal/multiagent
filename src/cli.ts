#!/usr/bin/env node
import { Command } from 'commander';
import { materialize } from './commands/materialize.js';
import { cleanup } from './commands/cleanup.js';
import { status } from './commands/status.js';
import { mergeCommand } from './commands/merge.js';
import { dryrunCommand } from './commands/dryrun.js';
import { freezeCommand } from './commands/freeze.js';
import { agentsCommand } from './commands/agents.js';
import { initCommand } from './commands/init.js';
import { measureCommand } from './commands/measure.js';
import { doneCommand } from './commands/done.js';
import { runCommand } from './commands/run.js';
import { verifyInterfaces } from './core/interfaces.js';
import { loadManifest } from './core/manifest.js';
import { getAdapter } from './adapters/registry.js';
import { join } from 'node:path';
import { WindowsTerminals } from './adapters/terminals-windows.js';

const program = new Command();
program.name('multiagent').description('Parallel Claude Code agents with a frozen interface layer.');

program
  .command('materialize <manifest>')
  .description('Create a worktree and terminal per task.')
  .option('--auto', 'launch workers in autonomous (bypassPermissions) mode', false)
  .action(async (manifest: string, opts: { auto: boolean }) => {
    // Take the interface directory from the run's adapter so the pre-commit hook
    // protects the same files that freeze/verify/merge hash.
    const m = await loadManifest(manifest);
    const interfaceDir = getAdapter(m.adapter).interfaceDir;
    await materialize(manifest, process.cwd(), new WindowsTerminals(), interfaceDir, opts.auto);
  });

program
  .command('status <manifest>')
  .description('Print the run status table.')
  .action(async (manifest: string) => {
    console.log(await status(manifest));
  });

program
  .command('done <manifest> <task>')
  .description('Mark a task done (built at the current interface version) so it can be merged.')
  .action(async (manifest: string, task: string) => {
    console.log(await doneCommand(manifest, task));
  });

program
  .command('run <entrypoint> [args...]')
  .description('Run the assembled app: a TS entrypoint via Node type-stripping (imports need .ts extensions).')
  .action(async (entrypoint: string, args: string[]) => {
    process.exit(await runCommand(entrypoint, args ?? [], process.cwd()));
  });

program
  .command('cleanup <manifest>')
  .description('Remove all task worktrees.')
  .action(async (manifest: string) => {
    await cleanup(manifest, process.cwd());
  });

program
  .command('init <decomposition> <runDir>')
  .description('Build a run (manifest + task files) from a decomposition JSON.')
  .action(async (decomposition: string, runDir: string) => {
    console.log(await initCommand(decomposition, runDir));
  });

program
  .command('freeze <manifest>')
  .description('Hash the interface files and record VERSION + hashes in the manifest.')
  .option('--interfaces <dir>', 'interface directory (relative to repo root)', 'packages/interfaces')
  .action(async (manifest: string, opts: { interfaces: string }) => {
    console.log(await freezeCommand(manifest, process.cwd(), opts.interfaces));
  });

program
  .command('verify <manifest>')
  .description('Re-hash interfaces and report any drift from the frozen hashes.')
  .option('--interfaces <dir>', 'interface directory (relative to repo root)', 'packages/interfaces')
  .action(async (manifest: string, opts: { interfaces: string }) => {
    const m = await loadManifest(manifest);
    const v = await verifyInterfaces(join(process.cwd(), opts.interfaces), m);
    console.log(v.ok ? 'interfaces OK' : `interfaces DRIFTED: ${v.mismatches.join(', ')}`);
  });

program
  .command('agents <dir>')
  .description('List custom agents loaded from a .claude/agents directory.')
  .action(async (dir: string) => {
    console.log(await agentsCommand(dir));
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
  .option('--one', 'merge only the next eligible branch, then stop (deliberate mode)', false)
  .action(async (manifest: string, opts: { base: string; one: boolean }) => {
    console.log(await mergeCommand(manifest, process.cwd(), opts.base, opts.one));
  });

program
  .command('measure <baseBranch> [branches...]')
  .description('Measure how many of the given branches conflict when merged onto base.')
  .action(async (baseBranch: string, branches: string[]) => {
    console.log(await measureCommand(process.cwd(), baseBranch, branches ?? []));
  });

program.parseAsync();
