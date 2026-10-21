/**
 * Scores for the test bench, as plain arithmetic on run records.
 *
 * - autoScore: one run, 0 to 100, from the engine's own checks. A run that
 *   succeeded with every guardrail passing and an answer that parsed first
 *   time is 100. A repair costs 15, each failed guardrail 20, a failed run
 *   is 0. A cancelled run has no score.
 * - scorecard: a set of runs rolled up for one version: pass rate, average
 *   rating, average auto score, average cost and time, and the one number
 *   that goes into the spec's quality field.
 */
import type { Run } from "@/lib/runs/run";
import type { Rating, RatingValue } from "./types";

export const SCORE_RULES = { repair: 15, failedCheck: 20 } as const;

export const RATING_POINTS: Record<RatingValue, number> = { good: 100, ok: 50, bad: 0 };

/** Whether the first answer fit the output shape, or a repair was needed. Null before the run has an answer. */
export function parsedHow(run: Run): "first" | "repaired" | null {
  if (run.status !== "succeeded") return null;
  return run.calls.some((c) => c.purpose === "repair" && c.ok) ? "repaired" : "first";
}

export function autoScore(run: Run): number | null {
  if (run.status === "cancelled" || run.status === "queued" || run.status === "running") return null;
  if (run.status === "failed") return 0;
  let score = 100;
  if (parsedHow(run) === "repaired") score -= SCORE_RULES.repair;
  score -= SCORE_RULES.failedCheck * run.checks.filter((c) => c.status === "fail").length;
  return Math.max(0, score);
}

/** A run that passed: it succeeded and no guardrail failed. */
export function passed(run: Run): boolean {
  return run.status === "succeeded" && !run.needsReview;
}

export type Scorecard = {
  version: string;
  /** Finished runs, cancelled ones left out. */
  runs: number;
  passed: number;
  /** 0 to 1, or null with no runs. */
  passRate: number | null;
  /** Average auto score, 0 to 100. */
  avgAuto: number | null;
  rated: number;
  /** Average rating as points: good 100, ok 50, bad 0. */
  avgRating: number | null;
  avgCostMicroUsd: number | null;
  avgMs: number | null;
  /** The number for the spec's quality field: the average of the auto score and the rating when rated, else the auto score alone. */
  score: number | null;
  lastRunAt: string | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number | null) => (x === null ? null : Math.round(x));

/** The scorecard for the runs of one version. Runs of other versions are ignored; the caller may pass everything. */
export function scorecard(version: string, runs: Run[], ratings: Rating[]): Scorecard {
  const finished = runs.filter((r) => r.agent.version === version && (r.status === "succeeded" || r.status === "failed"));
  const byRun = new Map(ratings.map((r) => [r.runId, r.rating]));
  const autos = finished.map(autoScore).filter((s): s is number => s !== null);
  const points = finished.map((r) => byRun.get(r.id)).filter((r): r is RatingValue => r !== undefined).map((r) => RATING_POINTS[r]);
  const avgAuto = round(mean(autos));
  const avgRating = round(mean(points));
  const passedCount = finished.filter(passed).length;
  const ms = finished.map((r) => r.timings.runMs).filter((x): x is number => typeof x === "number");
  const last = finished.map((r) => r.timings.finishedAt).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  return {
    version,
    runs: finished.length,
    passed: passedCount,
    passRate: finished.length ? passedCount / finished.length : null,
    avgAuto,
    rated: points.length,
    avgRating,
    avgCostMicroUsd: round(mean(finished.map((r) => r.costMicroUsd))),
    avgMs: round(mean(ms)),
    score: avgAuto === null ? null : avgRating === null ? avgAuto : Math.round((avgAuto + avgRating) / 2),
    lastRunAt: last,
  };
}

/** An empty card for a version that never ran. */
export function emptyScorecard(version: string): Scorecard {
  return scorecard(version, [], []);
}
