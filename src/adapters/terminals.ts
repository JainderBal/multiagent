export type OpenOpts = { title: string; cwd: string; command: string };

export interface Terminals {
  open(opts: OpenOpts): Promise<void>;
}
