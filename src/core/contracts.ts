import { promises as fs } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { loadManifest, saveManifest, type TManifest } from './manifest.js';

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function posix(p: string): string {
  return p.split(sep).join('/');
}

export async function hashContracts(contractDir: string): Promise<Record<string, string>> {
  const files = await walk(contractDir);
  const out: Record<string, string> = {};
  for (const f of files.sort()) {
    const buf = await fs.readFile(f);
    out[posix(relative(contractDir, f))] = createHash('sha256').update(buf).digest('hex');
  }
  return out;
}

export async function freezeContracts(
  contractDir: string,
  manifestPath: string,
): Promise<Record<string, string>> {
  const m = await loadManifest(manifestPath);
  await fs.writeFile(join(contractDir, 'VERSION'), `${m.contractVersion}\n`, 'utf8');
  const hashes = await hashContracts(contractDir);
  m.contractHashes = hashes;
  await saveManifest(manifestPath, m);
  return hashes;
}

export async function verifyContracts(
  contractDir: string,
  manifest: TManifest,
): Promise<{ ok: boolean; mismatches: string[] }> {
  const current = await hashContracts(contractDir);
  const expected = manifest.contractHashes;
  const keys = new Set([...Object.keys(current), ...Object.keys(expected)]);
  const mismatches: string[] = [];
  for (const k of keys) {
    if (current[k] !== expected[k]) mismatches.push(k);
  }
  return { ok: mismatches.length === 0, mismatches: mismatches.sort() };
}

export async function bumpContracts(contractDir: string, manifestPath: string): Promise<number> {
  const m = await loadManifest(manifestPath);
  m.contractVersion += 1;
  await fs.writeFile(join(contractDir, 'VERSION'), `${m.contractVersion}\n`, 'utf8');
  m.contractHashes = await hashContracts(contractDir);
  await saveManifest(manifestPath, m);
  return m.contractVersion;
}
