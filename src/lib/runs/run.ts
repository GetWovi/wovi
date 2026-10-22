/**
 * The Run record: one execution of one exact agent version for one workspace.
 * Every field the engine learns is kept, so runs feed evaluation, the
 * scorecard and billing later. publicRunView is what users may see.
 */
import type { BrandBrainRef } from "./brand-brain";
import type { CheckResult, Confirmations } from "./guardrails";
import type { RunInputs } from "./inputs";
import type { RunOutput } from "./output";

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const FINISHED: readonly RunStatus[] = ["succeeded", "failed", "cancelled"];

export type RunFailureCode =
  /** Every model on the route failed, and retries ran out. */
  | "provider_error"
  /** The next call would pass the run's spend cap, or the last one did. */
  | "spend_cap"
  /** The answer did not fit the output shape, even after one repair. */
  | "output_invalid"
  /** The run took longer than the engine allows. */
  | "timeout"
  /** The agent version could not be loaded any more. */
  | "agent_missing"
  /** A bug in the engine. Logged. */
  | "internal_error";

export type ModelCall = {
  purpose: "answer" | "repair";
  route: string;
  provider: string;
  model: string;
  ok: boolean;
  /** Why it failed or was skipped. */
  error?: string;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  ms: number;
  at: string;
};

/** What a run asked for: a Brand Brain by id (null for the profile input or the default) and its own idea. */
export type BrandPick = { id: string | null; idea: string | null };

export type Run = {
  id: string;
  workspaceId: string;
  /** The agent and the exact version that ran. agent.workspaceId is where the agent lives. */
  agent: { workspaceId: string; id: string; version: string };
  inputs: RunInputs;
  confirmations: Confirmations;
  /** The Brand Brain used, by reference, with a hash of the parts as filled in. */
  brandBrain: BrandBrainRef | null;
  /** The Brand Brain and idea the request named. Missing on runs from before phase 7. */
  brandPick?: BrandPick | null;
  /** Set when a pipeline started this run. Pipelines are phase 10. */
  parent: { pipelineRunId: string; step: number } | null;
  idempotencyKey: string | null;
  /** Hash of the request, so a reused idempotency key with a different request is refused. */
  requestHash: string;

  status: RunStatus;
  attempts: number;
  /** When a queued retry may start. */
  nextAttemptAt: string | null;
  output: RunOutput | null;
  error: { code: RunFailureCode; message: string } | null;
  /** Guardrail results. Any failure sets needsReview. */
  checks: CheckResult[];
  needsReview: boolean;

  /** The model whose answer became the output. Hidden from users. */
  model: { route: string; provider: string; model: string } | null;
  calls: ModelCall[];
  tokensIn: number;
  tokensOut: number;
  /** The run's spend cap: the agent's maxCostUsd, or lower when the caller asked. */
  capMicroUsd: number;
  costMicroUsd: number;
  costUsd: number;

  timings: { queuedAt: string; startedAt: string | null; finishedAt: string | null; queueMs: number | null; runMs: number | null };
  createdAt: string;
  updatedAt: string;
};

/** What a user, MCP client or API caller sees: no model, no calls, no internal cost. */
export function publicRunView(run: Run) {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    agent: { id: run.agent.id, version: run.agent.version },
    status: run.status,
    inputs: run.inputs,
    brandBrain: run.brandBrain ? { id: run.brandBrain.id, name: run.brandBrain.name ?? null } : null,
    output: run.output,
    error: run.error,
    checks: run.checks,
    needsReview: run.needsReview,
    parent: run.parent,
    createdAt: run.createdAt,
    finishedAt: run.timings.finishedAt,
  };
}
