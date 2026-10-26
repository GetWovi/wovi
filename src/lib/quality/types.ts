/**
 * The quality system's record shapes (phase 12). No logic and no storage
 * here, so client components can import them.
 *
 * Every run gets one QualityReport: the score of each check, one combined
 * score from 0 to 100, the agent's bar, and the verdict. Below the bar a run
 * is rewritten with the reasons as notes (at most twice, inside the run's
 * spend cap); if it is still below, it goes to review with the reasons.
 */
import type { RunOutput } from "@/lib/runs/output";

export const QUALITY_CHECK_IDS = ["specificity", "generic_phrases", "reference_anchoring", "brand_fit", "claims", "platform_rules", "judge"] as const;
export type QualityCheckId = (typeof QUALITY_CHECK_IDS)[number];

/**
 * - pass: fine.
 * - weak: lowers the score, but does not stop a run on its own.
 * - fail: a hard problem (a generic phrase, a claim, a broken platform rule,
 *   a broken brand rule, nothing from the input). Never "ready" with one.
 * - skipped: nothing to check against (no Brand Brain, no references).
 */
export type QualityStatus = "pass" | "weak" | "fail" | "skipped";

export type QualityCheckResult = {
  id: QualityCheckId;
  /** The check's name in plain words. */
  label: string;
  status: QualityStatus;
  /** 0 to 100, or null when skipped. */
  score: number | null;
  /** Its share of the combined score, before skipped checks drop out. */
  weight: number;
  /** What it found, in plain words. The first one is the summary. */
  reasons: string[];
};

export type QualityVerdict = "ready" | "needs_review";

/** One draft the gate scored: the first answer or a rewrite. */
export type QualityAttempt = {
  /** 0 for the first draft, then 1 and 2 for rewrites. */
  n: number;
  score: number;
  ready: boolean;
  /** The checks that failed or were weak. */
  failing: QualityCheckId[];
  /** The checks that failed outright. */
  failed: QualityCheckId[];
  /** Why it fell short, in plain words. Empty when ready. */
  reasons: string[];
  /** Kept for drafts that were not used, so a builder can see what failed. Null on the draft that was used. */
  output: RunOutput | null;
  /** Set when the rewrite did not give a usable answer. */
  error?: string;
};

/** Why the gate stopped rewriting while the draft was still below the bar. */
export type GateStop = "cap" | "budget" | "error" | "off";

export type QualityReport = {
  version: 1;
  /** The combined score of the draft that was used, 0 to 100. */
  score: number;
  /** The agent's bar. */
  threshold: number;
  verdict: QualityVerdict;
  /** The checks of the draft that was used. */
  checks: QualityCheckResult[];
  /** Why it needs review, in plain words. Empty when ready. */
  reasons: string[];
  /** Rewrites the gate ran. */
  rewrites: number;
  /** The agent's rewrite cap. */
  maxRewrites: number;
  /** The first draft's score, before any rewrite. */
  firstScore: number;
  /** Every draft, in order. */
  attempts: QualityAttempt[];
  /** Which attempt was used. */
  used: number;
  /** Why rewriting stopped short, when the draft is still below the bar. */
  stopped: GateStop | null;
  /** Whether the model judge's second opinion is in the used draft's checks. Bench runs ask for it; people's runs only when WOVI_JUDGE_LIVE is on. */
  judge: boolean;
  /** The used draft's score without the second opinion, when it has one, so the regression gate can compare a judged version with one that was not. */
  withoutJudge?: number;
};

/** The agent's gate: its bar and how many rewrites it may run. */
export type GateSettings = { minScore: number; maxRewrites: number };

/** What the user sees of a run's quality: everything but the drafts that were not used. */
export type PublicQuality = Omit<QualityReport, "attempts"> & {
  attempts: Omit<QualityAttempt, "output">[];
};

export function publicQuality(q: QualityReport | null | undefined): PublicQuality | null {
  if (!q) return null;
  return { ...q, attempts: q.attempts.map(({ output, ...rest }) => (void output, rest)) };
}
