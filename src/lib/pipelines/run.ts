/**
 * The PipelineRun record: one run of one exact pipeline version for one
 * workspace. It holds the spec it ran (a snapshot), every step's state with
 * the ids of every run the step made, what each step picked and why, the
 * final package, the human decision and the summed cost. Types only, so
 * client code can import it.
 */
import type { CheckResult, Confirmations } from "@/lib/runs/guardrails";
import type { RunInputs } from "@/lib/runs/inputs";
import type { RunOutput } from "@/lib/runs/output";
import type { PipelineBody } from "./spec";
import type { Item } from "./values";

/**
 * running: steps are going. waiting: a step asks the person to pick.
 * ready: every step is done and the package waits for the approve step.
 * approved, rejected: the person decided. failed, cancelled: it stopped.
 */
export const PIPELINE_RUN_STATUSES = ["running", "waiting", "ready", "approved", "rejected", "failed", "cancelled"] as const;
export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number];
/** Nothing more happens on its own. */
export const SETTLED: readonly PipelineRunStatus[] = ["waiting", "ready", "approved", "rejected", "failed", "cancelled"];
export const ENDED: readonly PipelineRunStatus[] = ["approved", "rejected", "failed", "cancelled"];

export type StepStatus = "todo" | "running" | "rewriting" | "waiting" | "done" | "flagged" | "skipped" | "failed" | "cancelled";

/** One item a step could pick, with how close it reads to the Brand Brain. */
export type Candidate = Item & {
  /** 0 to 100, or null when there is no Brand Brain to read it against. */
  brandFit: number | null;
  /** Brand rules it breaks, in words. */
  flags: string[];
};

export type StepPick = { index: number; by: "rule" | "brand_fit" | "person"; at: string; userId?: string };

export type StepQuality = { score: number; threshold: number; verdict: "ready" | "needs_review"; rewrites: number; firstScore: number; reasons: string[] };

export type StepRun = {
  id: string;
  label: string;
  /** The agent and the exact version this step ran. */
  agent: { workspaceId: string; id: string; version: string; name: string };
  status: StepStatus;
  /** Every engine run this step made, in order: the first, a retry, a rewrite. */
  runIds: string[];
  /** The run whose output the step uses. */
  runId: string | null;
  /** How many times a failed run was tried again. */
  retries: number;
  /** Set when the step was rewritten once with a note. */
  rewrite: { note: string; runId: string } | null;
  /** The inputs of the step's first run. */
  inputs: RunInputs | null;
  output: RunOutput | null;
  /** The items the step can pick from, when it picks. */
  candidates: Candidate[];
  /** The best brand fit, offered first when the person picks. */
  suggested: number | null;
  picked: StepPick | null;
  /** Brand fit of the used run, when it read one. */
  brandFit: number | null;
  /** Every check of the used run. */
  checks: CheckResult[];
  /** The quality gate on the used run (phase 12): its score, the bar, the verdict, the rewrites inside the run and why it needs review. */
  quality?: StepQuality | null;
  costMicroUsd: number;
  error: { code: string; message: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
};

/** One part of the final package: a picked item, or a step's whole output. */
export type PackageItem = {
  step: string;
  label: string;
  take: "all" | "picked";
  item: Candidate | null;
  output: RunOutput | null;
  brandFit: number | null;
  /** Failed checks and broken brand rules, in words, for this part. */
  flags: string[];
};

export type PipelineDecision = { decision: "approved" | "rejected"; note: string; by: string; at: string };

export type PipelineFailure = "step_failed" | "spend_cap" | "bad_handoff" | "checks_failed" | "agent_missing" | "internal_error";

export type PipelineRun = {
  id: string;
  workspaceId: string;
  /** The pipeline and the exact version that ran. pipeline.workspaceId is where it lives. */
  pipeline: { workspaceId: string; id: string; version: string; name: string };
  /** The body that ran, so the run reads the same after later saves. */
  spec: PipelineBody;
  inputs: RunInputs;
  brandBrain: { id: string; name: string } | null;
  brandIdea: string | null;
  confirmations: Confirmations;
  idempotencyKey: string | null;
  requestHash: string;
  status: PipelineRunStatus;
  /** A step was flagged by a check, so the package needs a closer look before approving. */
  needsReview: boolean;
  steps: StepRun[];
  package: PackageItem[] | null;
  decision: PipelineDecision | null;
  error: { code: PipelineFailure; message: string; step: string | null } | null;
  capMicroUsd: number;
  costMicroUsd: number;
  costUsd: number;
  /** Who started it. */
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

/** What a person or an API caller sees: no cost and no cap. Costs go to people who may see them. */
export function publicPipelineRun(run: PipelineRun) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { capMicroUsd, costMicroUsd, costUsd, requestHash, steps, ...rest } = run;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return { ...rest, steps: steps.map(({ costMicroUsd: _c, ...s }) => s) };
}
export type PublicPipelineRun = ReturnType<typeof publicPipelineRun>;
export type PublicStepRun = PublicPipelineRun["steps"][number];
