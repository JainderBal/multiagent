export type GateResult = { ok: boolean; output: string };

export interface LanguageAdapter {
  id: string;
  interfaceDir: string;
  interfaceGlobs: string[];
  detect(repoRoot: string): Promise<boolean>;
  gate(dir: string): Promise<GateResult>;
}
