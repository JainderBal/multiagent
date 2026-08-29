export type GateResult = { ok: boolean; output: string };

export interface LanguageAdapter {
  id: string;
  gate(dir: string): Promise<GateResult>;
}
