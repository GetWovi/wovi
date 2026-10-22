/**
 * One quality reading of a draft (phase 12): every check, the combined score
 * and whether it clears the agent's bar. Plus the slot for an optional model
 * judge, which is off unless an engine is given one.
 */
import type { CheckResult } from "@/lib/runs/guardrails";
import { runDeterministicChecks, type QualityInput } from "./checks";
import { CHECKS, FAIL_CAP } from "./data";
import type { QualityCheckId, QualityCheckResult } from "./types";

/* ---------- The judge slot ---------- */

/**
 * An optional second opinion from a model, scored against a rubric. Nothing
 * implements it yet and no engine has one by default, so no run ever calls a
 * model for quality. When one is added, the engine checks its estimate
 * against the run's spend cap first and adds its cost to the run.
 */
export interface QualityJudge {
  id: string;
  /** What one judgement may cost at most, in micro-dollars, for the spend cap. */
  estimateMicroUsd(input: QualityInput): number;
  judge(input: QualityInput, signal: AbortSignal): Promise<{ score: number; reasons: string[]; costMicroUsd: number }>;
}

/* ---------- Combining ---------- */

export type QualityReading = {
  score: number;
  checks: QualityCheckResult[];
  ready: boolean;
  /** Checks that failed or were weak. */
  failing: QualityCheckId[];
  /** Checks that failed outright. */
  failed: QualityCheckId[];
  /** Why it falls short, in plain words. Empty when ready. */
  reasons: string[];
};

/**
 * The combined score: the weighted mean of the checks that ran (skipped ones
 * drop out), capped at FAIL_CAP when any check failed outright.
 */
export function combinedScore(checks: QualityCheckResult[]): number {
  const scored = checks.filter((c) => c.status !== "skipped" && c.score !== null);
  const total = scored.reduce((s, c) => s + c.weight, 0);
  if (!total) return 0;
  const mean = scored.reduce((s, c) => s + c.weight * (c.score as number), 0) / total;
  const capped = checks.some((c) => c.status === "fail") ? Math.min(mean, FAIL_CAP) : mean;
  return Math.round(capped);
}

/** A failed check's or weak check's reasons, as one line each: "Label: reason". */
export function failingReasons(checks: QualityCheckResult[]): string[] {
  const order = (c: QualityCheckResult) => (c.status === "fail" ? 0 : 1);
  return checks
    .filter((c) => c.status === "fail" || c.status === "weak")
    .sort((a, b) => order(a) - order(b))
    .map((c) => `${c.label}: ${c.reasons.filter((r) => !r.startsWith("Closest")).join(" ")}`);
}

/**
 * Ready means both: the combined score is at or above the bar, and no check
 * failed outright. A guardrail the agent declares that failed (phase 3) also
 * keeps it from ready.
 */
export function readQuality(checks: QualityCheckResult[], bar: number, guardrails: CheckResult[] = []): QualityReading {
  const failedGuardrails = guardrails.filter((g) => g.status === "fail");
  const hard = checks.some((c) => c.status === "fail") || failedGuardrails.length > 0;
  const mean = combinedScore(checks);
  const score = hard ? Math.min(mean, FAIL_CAP) : mean;
  const ready = score >= bar && !hard;
  // A guardrail whose quality check already failed says the same thing; it is not said twice.
  const extra = failedGuardrails.filter((g) => !checks.some((c) => c.id === COVERED[g.check] && c.status === "fail"));
  const reasons = ready
    ? []
    : [...(score < bar ? [`Scored ${score}, under this agent's bar of ${bar}.`] : []), ...failingReasons(checks), ...extra.map((g) => `${g.message}${g.findings?.length ? ` ${g.findings.slice(0, 3).join(", ")}` : ""}`)];
  return { score, checks, ready, failing: checks.filter((c) => c.status === "fail" || c.status === "weak").map((c) => c.id), failed: checks.filter((c) => c.status === "fail").map((c) => c.id), reasons };
}

/** The phase 3 guardrail checks and the quality check that reports the same thing. */
const COVERED: Record<string, QualityCheckId> = {
  anti_slop_phrases: "generic_phrases",
  misleading_claim_phrases: "claims",
  testimonial_phrases: "claims",
  impersonation_phrases: "claims",
  unsafe_phrases: "claims",
  brand_banned_words: "brand_fit",
  brand_fit: "brand_fit",
  specific_to_input: "specificity",
  platform_lengths: "platform_rules",
};

/** Reads a draft with the deterministic checks. Sync and free. */
export function evaluateDraft(input: QualityInput, bar: number, guardrails: CheckResult[] = []): QualityReading {
  return readQuality(runDeterministicChecks(input), bar, guardrails);
}

/** The judge's reading as one more check. */
export function judgeCheck(score: number, reasons: string[]): QualityCheckResult {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return { id: "judge", label: CHECKS.judge.label, weight: CHECKS.judge.weight, status: s < 60 ? "weak" : "pass", score: s, reasons: reasons.length ? reasons : ["Read against the rubric."] };
}

export { gateFor } from "./data";
