import { promises as fs } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { loadManifest, saveManifest, type TManifest, type TTask } from './manifest.js';

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

export async function hashInterfaces(interfaceDir: string): Promise<Record<string, string>> {
  const files = await walk(interfaceDir);
  const out: Record<string, string> = {};
  for (const f of files.sort()) {
    const buf = await fs.readFile(f);
    out[posix(relative(interfaceDir, f))] = createHash('sha256').update(buf).digest('hex');
  }
  return out;
}

export async function freezeInterfaces(
  interfaceDir: string,
  manifestPath: string,
): Promise<Record<string, string>> {
  const m = await loadManifest(manifestPath);
  await fs.writeFile(join(interfaceDir, 'VERSION'), `${m.interfaceVersion}\n`, 'utf8');
  const hashes = await hashInterfaces(interfaceDir);
  m.interfaceHashes = hashes;
  await saveManifest(manifestPath, m);
  return hashes;
}

export async function verifyInterfaces(
  interfaceDir: string,
  manifest: TManifest,
): Promise<{ ok: boolean; mismatches: string[] }> {
  const current = await hashInterfaces(interfaceDir);
  const expected = manifest.interfaceHashes;
  const keys = new Set([...Object.keys(current), ...Object.keys(expected)]);
  const mismatches: string[] = [];
  for (const k of keys) {
    if (current[k] !== expected[k]) mismatches.push(k);
  }
  return { ok: mismatches.length === 0, mismatches: mismatches.sort() };
}

export async function bumpInterfaces(interfaceDir: string, manifestPath: string): Promise<number> {
  const m = await loadManifest(manifestPath);
  m.interfaceVersion += 1;
  await fs.writeFile(join(interfaceDir, 'VERSION'), `${m.interfaceVersion}\n`, 'utf8');
  m.interfaceHashes = await hashInterfaces(interfaceDir);
  await saveManifest(manifestPath, m);
  return m.interfaceVersion;
}

export function computeAffected(tasks: TTask[], changedSymbols: string[]): string[] {
  const changed = new Set(changedSymbols);
  return tasks
    .filter((t) => [...t.provides, ...t.consumes].some((s) => changed.has(s)))
    .map((t) => t.name);
}
