/**
 * The Run record: one execution of one exact agent version for one workspace.
 * Every field the engine learns is kept, so runs feed evaluation, the
 * scorecard and billing later. publicRunView is what users may see.
 */
import type { BrandBrainRef } from "./brand-brain";
import type { CheckResult, Confirmations } from "./guardrails";
import type { RunInputs } from "./inputs";
import type { RunOutput } from "./output";
import { publicQuality, type QualityReport } from "@/lib/quality/types";
import { chargeView, type RunCredits } from "@/lib/credits/types";
import type { ToolUse } from "./tools/types";

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
  | "internal_error"
  /** Phase 18: every draft broke a hard content rule (hate, harassment, sexual content, unsafe advice), so it was withheld. */
  | "blocked"
  /** A tool the agent declares (trend_lookup) did not answer, so the model was not asked to write without it. */
  | "tool_error";

export type ModelCall = {
  /** The first answer, a format repair, a quality-gate rewrite (phase 12), the optional judge, or a declared tool (route "tool:<id>"). */
  purpose: "answer" | "repair" | "rewrite" | "judge" | "tool";
  route: string;
  provider: string;
  model: string;
  ok: boolean;
  /** Why it failed or was skipped. */
  error?: string;
  /** A tool answer reused from the cache: nothing was paid for it on this run. */
  cached?: boolean;
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
  /** True when a guardrail failed or the quality gate kept it from ready. */
  needsReview: boolean;
  /** The quality gate's reading (phase 12). Missing on runs from before it. */
  quality?: QualityReport | null;
  /**
   * Set when the quality gate asks the model judge for a second opinion on
   * this run: bench runs, and people's runs when WOVI_JUDGE_LIVE is on.
   * Missing otherwise. Never shown to users.
   */
  judge?: boolean;

  /** The model whose answer became the output. Hidden from users. */
  model: { route: string; provider: string; model: string } | null;
  calls: ModelCall[];
  tokensIn: number;
  tokensOut: number;
  /** The run's spend cap: the agent's maxCostUsd, or lower when the caller asked. */
  capMicroUsd: number;
  costMicroUsd: number;
  costUsd: number;
  /** What the run held and was charged in credits (phase 13). Missing when the engine bills nothing. */
  credits?: RunCredits | null;

  /**
   * Phase 18: when each confirmation was given at submit (ISO time). Missing
   * on runs from before phase 18 and on runs that asked for none.
   */
  confirmedAt?: { rights?: string; voiceConsent?: string } | null;
  /**
   * Phase 18: the person's note that they will apply each platform's AI label
   * where it is required, kept with the output. Null until someone gives it.
   */
  aiLabel?: AiLabelNote | null;
  /**
   * Phase 18: the output was taken down after a report (notice and action).
   * The output stays in the store for disputes; no view shows it.
   */
  withheld?: { at: string; reportId: string; reason: string } | null;
  /**
   * Canary releases: set when the run followed "latest stable" while a canary
   * of its agent was running, with the side it went to. Missing on runs from
   * before, on pinned runs and on runs with no canary. Never shown to users.
   */
  release?: RunRelease | null;
  /**
   * The declared tools the run used (trend_lookup), with what each found and
   * its sources. Missing on runs from before the tool layer and on agents
   * that declare none.
   */
  tools?: ToolUse[] | null;
  /**
   * The builder's samples given to the model as examples (tuning level 2),
   * by id and title, and the samples kept out of this run (a bench run of a
   * sample never sees itself). Missing on runs from before, and when the
   * agent has no samples. Builders only.
   */
  examples?: RunExamples | null;

  timings: { queuedAt: string; startedAt: string | null; finishedAt: string | null; queueMs: number | null; runMs: number | null };
  createdAt: string;
  updatedAt: string;
};

/** The samples a run was given as examples. */
export type RunExamples = { gold: { id: string; title: string }[]; bad: { id: string; title: string }[]; excluded: string[] };

/** The sources a run's tools found, for every viewer: the page, its title and date, and when the search ran. */
export type RunSource = { url: string; title: string; published: string | null; searchedAt: string | null };

export function runSources(run: Pick<Run, "tools">): RunSource[] {
  const seen = new Set<string>();
  const out: RunSource[] = [];
  for (const u of run.tools ?? []) {
    if (!u.ok) continue;
    for (const f of u.findings) {
      if (seen.has(f.url)) continue;
      seen.add(f.url);
      out.push({ url: f.url, title: f.title, published: f.published, searchedAt: u.searchedAt });
    }
  }
  return out;
}

/** The release a run took part in, and its side: the stable version or the canary. */
export type RunRelease = { id: string; arm: "stable" | "canary" };

/** Who noted the AI label, when, and for which platforms. */
export type AiLabelNote = { at: string; by: string; platforms: string[] };

/** What a user, MCP client or API caller sees: no model, no calls, no internal cost. */
export function publicRunView(run: Run) {
  const withheld = run.withheld ?? null;
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    agent: { id: run.agent.id, version: run.agent.version },
    status: run.status,
    inputs: run.inputs,
    brandBrain: run.brandBrain ? { id: run.brandBrain.id, name: run.brandBrain.name ?? null } : null,
    output: withheld ? null : run.output,
    error: run.error,
    checks: run.checks,
    needsReview: run.needsReview,
    quality: publicQuality(run.quality),
    parent: run.parent,
    /** The credits it held and was charged. The guarded engine blanks it for people who may not see costs. */
    charge: chargeView(run.credits),
    createdAt: run.createdAt,
    finishedAt: run.timings.finishedAt,
    /** Phase 18: every output is written by an AI model (EU AI Act Art. 50 transparency). */
    aiGenerated: true as const,
    /** Phase 18: the AI-label note, when someone gave it. */
    aiLabel: run.aiLabel ?? null,
    /** Phase 18: set when the output was taken down after a report. */
    withheld: withheld ? { at: withheld.at, reason: withheld.reason } : null,
    /** The web sources a declared tool (trend_lookup) found for this run. Empty for agents without tools. */
    sources: withheld ? [] : runSources(run),
  };
}
