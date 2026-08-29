import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDryRun, renderDryRun } from '../../src/core/dryrun.js';

async function setup(plansPresent: string[]): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'ma-dry-'));
  const mk = (name: string) => ({
    name, branch: `agent/${name}`, worktree: `../wt-${name}`, sessionName: name,
    dependsOn: [], provides: [], consumes: [], status: 'running', builtAtContractVersion: null,
  });
  await fs.writeFile(join(dir, 'manifest.json'), JSON.stringify({
    run: 'r', spec: 's', adapter: 'typescript', contractVersion: 1, contractHashes: {},
    agents: [], tasks: ['api', 'ui'].map(mk),
  }));
  await fs.mkdir(join(dir, 'plans'), { recursive: true });
  for (const p of plansPresent) await fs.writeFile(join(dir, 'plans', `${p}.md`), 'my plan\n');
  return join(dir, 'manifest.json');
}

describe('collectDryRun', () => {
  it('reports which tasks have stated a plan', async () => {
    const m = await setup(['api']);
    const status = await collectDryRun(m);
    expect(status).toEqual([{ task: 'api', stated: true }, { task: 'ui', stated: false }]);
  });
  it('treats an empty plan file as not stated', async () => {
    const m = await setup([]);
    const dir = m.replace(/manifest\.json$/, '');
    await fs.writeFile(join(dir, 'plans', 'api.md'), '   \n');
    const status = await collectDryRun(m);
    expect(status.find((s) => s.task === 'api')!.stated).toBe(false);
  });
});

describe('renderDryRun', () => {
  it('renders lines and a summary', () => {
    const out = renderDryRun([{ task: 'api', stated: true }, { task: 'ui', stated: false }]);
    expect(out).toBe('api   stated\nui    waiting\n\n1/2 plans stated');
  });
});
