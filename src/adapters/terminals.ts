export type OpenOpts = {
  title: string;
  cwd: string;
  /** Program + args to run in the new terminal (kept as argv so multi-word
   *  arguments like an initial prompt survive Windows quoting). */
  argv: string[];
  /** Optional Windows Terminal color scheme name (e.g. "Multiagent Green"). */
  colorScheme?: string;
};

export interface Terminals {
  open(opts: OpenOpts): Promise<void>;
}
