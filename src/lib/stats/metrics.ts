/**
 * The live stats math: plain arithmetic on runs and feedback events. Pure, so
 * it is tested on its own. Which runs count (real people, never the builder's
 * bench or a test workspace) is decided by the caller (service.ts).
 *
 * Every number carries what it was counted from, and below the minimum count
 * its value is null, so a screen shows "New" instead of a made-up figure.
 */
import type { Run } from "@/lib/runs/run";
import { MIN_COUNT, type CanaryThresholds, type FeedbackRow, type Mean, type PublicStats, type Rate, type StatsNumbers } from "./types";

export function rate(count: number, n: number, min = MIN_COUNT): Rate {
  const enough = n >= min && n > 0;
  return { value: enough ? count / n : null, count, n, enough };
}

export function meanOf(xs: number[], min = MIN_COUNT, digits = 0): Mean {
  const enough = xs.length >= min && xs.length > 0;
  if (!enough) return { value: null, n: xs.length, enough: false };
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const f = 10 ** digits;
  return { value: Math.round(m * f) / f, n: xs.length, enough };
}

/** The p-th percentile (0 to 1) of sorted numbers, nearest rank. */
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

/** A result that fits the format (it parsed) and broke no hard platform limit. */
export function compliant(run: Pick<Run, "status" | "quality" | "checks">): boolean {
  if (run.status !== "succeeded") return false;
  if (run.quality?.checks.some((c) => c.id === "platform_rules" && c.status === "fail")) return false;
  return !run.checks.some((c) => c.guardrail === "platform_policy" && c.status === "fail");
}

/** What the people did with one run, from its feedback events. */
export function outcomeOf(events: FeedbackRow[]) {
  const used = events.some((e) => e.action === "use");
  const edit = events.find((e) => e.action === "edit") ?? null;
  const regenerated = events.some((e) => e.action === "regenerate");
  const rating = events.find((e) => e.action === "rating")?.rating ?? null;
  return { accepted: (used || Boolean(edit)) && !regenerated, edited: Boolean(edit) && !regenerated, distance: edit?.distance ?? null, regenerated, rating };
}

type StatsRun = Pick<Run, "id" | "status" | "quality" | "checks" | "error" | "timings" | "costMicroUsd" | "withheld">;

/**
 * The numbers for a set of runs (one agent, or one version) and their
 * feedback. Feedback for other runs is ignored, so the caller may pass all of it.
 */
export function computeStats(runs: StatsRun[], feedback: FeedbackRow[], min = MIN_COUNT): StatsNumbers {
  const byRun = new Map<string, FeedbackRow[]>();
  for (const f of feedback) byRun.set(f.runId, [...(byRun.get(f.runId) ?? []), f]);

  // Outputs people got: succeeded and not taken down after a report.
  const outputs = runs.filter((r) => r.status === "succeeded" && !r.withheld);
  const failed = runs.filter((r) => r.status === "failed");
  const outcomes = outputs.map((r) => outcomeOf(byRun.get(r.id) ?? []));
  const accepted = outcomes.filter((o) => o.accepted);
  const edited = accepted.filter((o) => o.edited);
  const rated = outcomes.filter((o) => o.rating);

  // The format check: every run that got an answer to check, the ones that never fit included.
  const reached = runs.filter((r) => r.status === "succeeded" || (r.status === "failed" && r.error?.code === "output_invalid"));
  const ms = outputs.map((r) => r.timings.runMs).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  const paid = runs.filter((r) => r.status === "succeeded" || r.status === "failed");
  const total = paid.reduce((a, r) => a + r.costMicroUsd, 0);
  const last = runs.map((r) => r.timings.finishedAt).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;

  return {
    runs: outputs.length,
    failed: failed.length,
    acceptance: rate(accepted.length, outputs.length, min),
    edited: rate(edited.length, accepted.length, min),
    editSize: meanOf(edited.map((o) => o.distance ?? 0), min, 3),
    regenerate: rate(outcomes.filter((o) => o.regenerated).length, outputs.length, min),
    rating: rate(rated.filter((o) => o.rating === "up").length, rated.length, min),
    compliance: rate(reached.filter(compliant).length, reached.length, min),
    quality: meanOf(outputs.filter((r) => r.quality).map((r) => r.quality!.score), min),
    latency: { p50Ms: ms.length >= min ? percentile(ms, 0.5) : null, p90Ms: ms.length >= min ? percentile(ms, 0.9) : null, n: ms.length, enough: ms.length >= min && ms.length > 0 },
    cost: { avgMicroUsd: paid.length ? Math.round(total / paid.length) : null, totalMicroUsd: total, n: paid.length },
    isNew: outputs.length < min,
    lastRunAt: last,
  };
}

/** What anyone may see: no cost, no failures count. */
export function publicStats(agentId: string, s: StatsNumbers, min = MIN_COUNT): PublicStats {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cost, failed, ...rest } = s;
  return { ...rest, agentId, min };
}

/** One rule of the canary comparison: both sides' numbers and whether the canary is clearly worse on it. */
export type ArmCheck = {
  id: "acceptance" | "edited" | "regenerate" | "quality";
  label: string;
  stable: number | null;
  canary: number | null;
  /** Both sides have enough behind this number. */
  counted: boolean;
  worse: boolean;
  /** The limit it was held to, in the number's own unit. */
  limit: number;
};

export type ArmComparison = { worse: boolean; checks: ArmCheck[]; reasons: string[]; counted: boolean };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Whether the canary is clearly worse than the stable version: lower
 * acceptance, more edits, more regenerates or lower quality, each by more
 * than its threshold, counted only when both sides have at least `minRuns`
 * behind that number.
 */
export function compareArms(stable: StatsNumbers, canary: StatsNumbers, t: CanaryThresholds): ArmComparison {
  const minRuns = t.minRuns;
  const has = (n: number) => n >= minRuns;
  const raw = (count: number, n: number) => (n ? count / n : null);
  const sA = raw(stable.acceptance.count, stable.acceptance.n);
  const cA = raw(canary.acceptance.count, canary.acceptance.n);
  const sE = raw(stable.edited.count, stable.edited.n);
  const cE = raw(canary.edited.count, canary.edited.n);
  const sR = raw(stable.regenerate.count, stable.regenerate.n);
  const cR = raw(canary.regenerate.count, canary.regenerate.n);
  const checks: ArmCheck[] = [
    { id: "acceptance", label: "Acceptance", stable: sA, canary: cA, counted: has(stable.acceptance.n) && has(canary.acceptance.n), worse: false, limit: t.acceptanceDrop },
    { id: "edited", label: "Edit rate", stable: sE, canary: cE, counted: has(stable.edited.n) && has(canary.edited.n), worse: false, limit: t.editRise },
    { id: "regenerate", label: "Regenerate rate", stable: sR, canary: cR, counted: has(stable.regenerate.n) && has(canary.regenerate.n), worse: false, limit: t.regenerateRise },
    // Arm stats are computed with the thresholds' minimum (armStats), so a quality mean is there once it counts.
    { id: "quality", label: "Quality", stable: stable.quality.value, canary: canary.quality.value, counted: has(stable.quality.n) && has(canary.quality.n), worse: false, limit: t.qualityDrop },
  ];
  const reasons: string[] = [];
  for (const c of checks) {
    if (!c.counted || c.stable === null || c.canary === null) continue;
    if (c.id === "acceptance" && c.stable - c.canary > c.limit) {
      c.worse = true;
      reasons.push(`Acceptance ${pct(c.canary)} against ${pct(c.stable)} on the stable version, more than ${pct(c.limit)} lower.`);
    }
    if (c.id === "edited" && c.canary - c.stable > c.limit) {
      c.worse = true;
      reasons.push(`Edited ${pct(c.canary)} of accepted outputs against ${pct(c.stable)}, more than ${pct(c.limit)} higher.`);
    }
    if (c.id === "regenerate" && c.canary - c.stable > c.limit) {
      c.worse = true;
      reasons.push(`Regenerated ${pct(c.canary)} against ${pct(c.stable)}, more than ${pct(c.limit)} higher.`);
    }
    if (c.id === "quality" && c.stable - c.canary > c.limit) {
      c.worse = true;
      reasons.push(`Quality ${Math.round(c.canary)} against ${Math.round(c.stable)}, more than ${c.limit} points lower.`);
    }
  }
  return { worse: reasons.length > 0, checks, reasons, counted: checks.some((c) => c.counted) };
}
