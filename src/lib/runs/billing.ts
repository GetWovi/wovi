/**
 * The engine's side of credits (phase 13): what a run asks of billing when it
 * is submitted and when it ends. The credits service (src/lib/credits)
 * implements it; an engine without one bills nothing, as before.
 *
 * - At submit, after every other check: reserve. A run holds its estimate
 *   from the workspace's balance, or, as a pipeline step, takes its part of
 *   the pipeline's hold. Not enough credits, or a monthly limit, refuses the
 *   run before it is queued.
 * - At the end (succeeded, failed, cancelled): settle. A finished run is
 *   charged its real price, never more than it held, and the rest comes
 *   back. A failed or cancelled run gives back everything.
 */
import type { AgentSpec } from "@/lib/agents/spec";
import type { RunCredits } from "@/lib/credits/types";
import type { Run } from "./run";

export type RunBillingRequest = {
  /** Who started the run. Their monthly limit applies and the spend counts toward it. */
  userId?: string | null;
  /** The estimate the person was shown. The run never holds or costs more than this. */
  quotedCredits?: number;
  /** A builder's bench run: it never costs credits. Only the builder's bench sets it. */
  free?: "bench";
  /** A pipeline step: charged inside the pipeline's hold, not from the balance. */
  pipeline?: { holdId: string };
};

export type BillingRefusalCode = "not_enough_credits" | "over_limit" | "hold_closed";

/** Why billing refused a run. The engine passes it on as a RunError with the same code. */
export class BillingRefusal extends Error {
  constructor(
    readonly code: BillingRefusalCode,
    message: string,
    readonly detail: { needed?: number; available?: number; limit?: number; used?: number; scope?: "workspace" | "member" } = {},
  ) {
    super(message);
    this.name = "BillingRefusal";
  }
}

export interface RunBilling {
  /** Holds the run's estimate. Throws BillingRefusal when it cannot. */
  reserveRun(input: { workspaceId: string; runId: string; spec: AgentSpec; agentWorkspaceId: string; billing: RunBillingRequest }): Promise<RunCredits>;
  /** Charges or gives back, once. Calling it again returns what was settled. */
  settleRun(run: Run): Promise<RunCredits | null>;
}
