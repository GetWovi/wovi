/**
 * The regression gate (product doc, section 6): "a new version cannot publish
 * if it scores below the current version on the gold set." The gold set is
 * the agent's gold samples run on the test bench; a version's gold score is
 * the mean quality gate score of its latest bench run on each gold sample
 * (a failed run scores 0), compared on the samples both versions ran. When
 * the new version has had live traffic as a canary, it must also not be
 * clearly worse on acceptance, edits, regenerates or quality (the same rule
 * as the automatic stop).
 */
import type { Run } from "@/lib/runs/run";
import type { ArmComparison } from "./metrics";

/** How far below the current version's gold score a new one may land, in points. */
export const GATE_TOLERANCE = 0;

export type GoldScore = {
  version: string;
  /** Mean score over the samples compared, 0 to 100. Null with none. */
  score: number | null;
  /** Gold samples this version ran on the bench. */
  samples: number;
};

export type GateStatus = "pass" | "fail" | "needs_gold" | "no_gold";

export type GateResult = {
  ok: boolean;
  status: GateStatus;
  reasons: string[];
  /** Gold samples the agent has. */
  goldSamples: number;
  /** Samples both versions ran, the ones the scores are over. */
  compared: number;
  stable: GoldScore;
  candidate: GoldScore;
  live: ArmComparison | null;
};

/** A finished bench run's score for the gate. Null for runs still going or cancelled. */
export function goldRunScore(run: Pick<Run, "status" | "quality" | "checks">): number | null {
  if (run.status === "failed") return 0;
  if (run.status !== "succeeded") return null;
  if (run.quality) return run.quality.score;
  // Runs from before the quality gate: the bench's own auto score.
  return Math.max(0, 100 - 20 * run.checks.filter((c) => c.status === "fail").length);
}

/** The latest scored run of `version` on each gold sample: sample id to score. */
export function latestGoldScores(version: string, items: { sampleId: string; runId: string }[], runs: Map<string, Pick<Run, "id" | "status" | "quality" | "checks" | "createdAt" | "agent">>): Map<string, number> {
  const latest = new Map<string, { at: string; score: number }>();
  for (const it of items) {
    const r = runs.get(it.runId);
    if (!r || r.agent.version !== version) continue;
    const score = goldRunScore(r);
    if (score === null) continue;
    const have = latest.get(it.sampleId);
    if (!have || r.createdAt > have.at) latest.set(it.sampleId, { at: r.createdAt, score });
  }
  return new Map([...latest].map(([k, v]) => [k, v.score]));
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function regressionGate(input: { goldSamples: number; stable: { version: string; scores: Map<string, number> }; candidate: { version: string; scores: Map<string, number> }; live: ArmComparison | null; tolerance?: number }): GateResult {
  const { goldSamples, stable, candidate, live } = input;
  const tolerance = input.tolerance ?? GATE_TOLERANCE;
  const common = [...candidate.scores.keys()].filter((k) => stable.scores.has(k));
  const s: GoldScore = { version: stable.version, score: mean(common.map((k) => stable.scores.get(k)!)), samples: stable.scores.size };
  const c: GoldScore = { version: candidate.version, score: mean(common.map((k) => candidate.scores.get(k)!)), samples: candidate.scores.size };
  const base = { goldSamples, compared: common.length, stable: s, candidate: c, live };
  const reasons: string[] = [];

  if (goldSamples === 0) {
    reasons.push("This agent has no gold samples, so the gold set had nothing to compare. Add gold samples to the library to gate its versions.");
    if (live?.worse) return { ...base, ok: false, status: "fail", reasons: [...reasons, ...live.reasons] };
    return { ...base, ok: true, status: "no_gold", reasons };
  }
  if (!candidate.scores.size || !stable.scores.size || !common.length) {
    const missing = [!candidate.scores.size ? `v${candidate.version}` : null, !stable.scores.size ? `v${stable.version}` : null].filter(Boolean);
    reasons.push(missing.length ? `Run the gold set on ${missing.join(" and ")} first.` : "The two versions ran different gold samples. Run the gold set on both.");
    return { ...base, ok: false, status: "needs_gold", reasons };
  }
  if (c.score! < s.score! - tolerance) reasons.push(`Gold set: v${c.version} scored ${c.score} against ${s.score} for v${s.version} on the same ${common.length} sample${common.length === 1 ? "" : "s"}.`);
  if (live?.worse) reasons.push(...live.reasons);
  if (reasons.length) return { ...base, ok: false, status: "fail", reasons };
  return { ...base, ok: true, status: "pass", reasons: [`Gold set: v${c.version} scored ${c.score} against ${s.score} for v${s.version} on ${common.length} sample${common.length === 1 ? "" : "s"}.`] };
}
