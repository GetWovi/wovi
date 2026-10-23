/**
 * The tool layer's small types. A tool is something an agent's run may use
 * besides the model: today only `trend_lookup`. The engine calls a tool
 * itself, before the model writes, and only when the agent's spec declares
 * it; the model never gets a tool to call. What a tool returns reaches the
 * model as material in a data block, never as instructions.
 */

/** One thing a tool found, with the source it came from. */
export type ToolFinding = {
  /** The format, sound or topic in a few words. */
  trend: string;
  /** What it looks like and what the source says about it. */
  detail: string;
  /** The web page it comes from. Always one of the search results. */
  url: string;
  /** The page's title, as the search returned it. */
  title: string;
  /** When the source was published (YYYY-MM-DD), when it says. */
  published: string | null;
};

/** One call of a tool on a run, as kept on the run. */
export type ToolUse = {
  tool: string;
  /** The arguments it was called with, as plain text. */
  args: Record<string, string>;
  ok: boolean;
  /** Why it failed. */
  error?: string;
  /** True when the answer came from the cache: nothing was paid for it on this run. */
  cached: boolean;
  /** When the search ran. On a cache hit, the time of the search that is reused. */
  searchedAt: string | null;
  findings: ToolFinding[];
  /** What this call cost this run, in micro-dollars. Zero on a cache hit. */
  costMicroUsd: number;
  ms: number;
  at: string;
};

/** What a tool answers. */
export type ToolAnswer = {
  findings: ToolFinding[];
  searchedAt: string;
  costMicroUsd: number;
  tokensIn: number;
  tokensOut: number;
};

/** A tool the engine can call. One file per tool; tests use a fake. */
export interface AgentTool {
  /** The catalog id, like "trend_lookup". */
  readonly id: string;
  /** Who serves it ("openrouter", "fake"), for the run's call list. */
  readonly provider: string;
  /** The model or service behind it, for the run's call list. */
  readonly model: string;
  /** The most one call may cost, in micro-dollars, for the spend cap and estimates. */
  estimateMicroUsd(): number;
  call(args: Record<string, string>, ctx: { signal: AbortSignal; now: () => Date }): Promise<ToolAnswer>;
}

/** The tools an engine can run, by catalog id. */
export type ToolSet = Readonly<Record<string, AgentTool>>;
