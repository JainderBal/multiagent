export type OpenOpts = {
  title: string;
  cwd: string;
  /** Program + args to run in the new terminal (kept as argv so multi-word
   *  arguments like an initial prompt survive Windows quoting). */
  argv: string[];
  /** Optional hex tab color (e.g. "#2ea043") to visually mark agent terminals. */
  tabColor?: string;
};

export interface Terminals {
  open(opts: OpenOpts): Promise<void>;
}
