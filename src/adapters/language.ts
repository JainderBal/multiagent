export type GateResult = { ok: boolean; output: string };

export interface LanguageAdapter {
  id: string;
  contractDir: string;
  contractGlobs: string[];
  detect(repoRoot: string): Promise<boolean>;
  gate(dir: string): Promise<GateResult>;
}
