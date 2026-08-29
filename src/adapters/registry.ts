import type { LanguageAdapter } from './language.js';
import { TypeScriptAdapter } from './language-typescript.js';

const ADAPTERS: LanguageAdapter[] = [new TypeScriptAdapter()];

export function getAdapter(id: string): LanguageAdapter {
  const a = ADAPTERS.find((x) => x.id === id);
  if (!a) throw new Error(`unknown adapter: ${id}`);
  return a;
}

export async function detectAdapter(repoRoot: string): Promise<LanguageAdapter | null> {
  for (const a of ADAPTERS) {
    if (await a.detect(repoRoot)) return a;
  }
  return null;
}
