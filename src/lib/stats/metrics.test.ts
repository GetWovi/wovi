/**
 * The live stats math, on its own: edit distance, every metric, the minimum
 * count, the canary comparison, routing buckets and the regression gate.
 */
import { describe, expect, it } from "vitest";
import type { Run } from "@/lib/runs/run";
import type { QualityReport } from "@/lib/quality/types";
import { editDistance, levenshtein, normalizeText } from "./distance";
import { latestGoldScores, regressionGate } from "./gate";
import { compareArms, compliant, computeStats, outcomeOf, percentile, publicStats, rate } from "./metrics";
import { armFor, bucketOf } from "./routing";
import { DEFAULT_THRESHOLDS, MIN_COUNT, type FeedbackRow } from "./types";

type R = Parameters<typeof computeStats>[0][number];

let n = 0;
function run(over: Partial<Run> & { score?: number; platformFail?: boolean } = {}): R & { id: string } {
  const id = over.id ?? `run_${++n}`;
  const quality = over.score === undefined ? null : ({ score: over.score, checks: over.platformFail ? [{ id: "platform_rules", status: "fail" }] : [{ id: "platform_rules", status: "pass" }] } as unknown as QualityReport);
  return {
    id,
    status: over.status ?? "succeeded",
    quality: over.quality ?? quality,
    checks: over.checks ?? [],
    error: over.error ?? null,
    timings: over.timings ?? { queuedAt: "", startedAt: "", finishedAt: `2026-10-23T10:00:${String(n % 60).padStart(2, "0")}.000Z`, queueMs: 0, runMs: 1000 },
    costMicroUsd: over.costMicroUsd ?? 1000,
    withheld: over.withheld ?? null,
  };
}

function fb(runId: string, action: FeedbackRow["action"], extra: Partial<FeedbackRow> = {}): FeedbackRow {
  return { id: `${runId}:${action}`, runId, workspaceId: "ws_c", agentWorkspaceId: "ws_wovi", agentId: "hook-writer", version: "1.0.0", action, source: "app", how: null, by: "usr_x", at: "t", updatedAt: "t", ...extra };
}

describe("edit distance", () => {
  it("is 0 for the same text, 1 for nothing in common, and ignores whitespace runs", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(editDistance("Gerald is nine.", "Gerald is nine.")).toBe(0);
    expect(editDistance("Gerald is nine.\n\nHe never misses a bake.", "Gerald is nine.  \nHe never misses a bake.")).toBe(0);
    expect(editDistance("abcd", "wxyz")).toBe(1);
    expect(editDistance("Gerald is nine", "Gerald is ten")).toBeCloseTo(3 / 14, 3);
    expect(normalizeText("  a \t b \n\n c ")).toBe("a b\nc");
  });

  it("stays cheap and bounded on very long texts", () => {
    const a = "word ".repeat(3000);
    const b = `${a}more words at the end`;
    const t = Date.now();
    const d = editDistance(a, b);
    expect(Date.now() - t).toBeLessThan(2000);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.01);
  });
});

describe("the metrics", () => {
  it("counts acceptance, edits, regenerates, ratings, compliance, quality, latency and cost from runs and events", () => {
    const runs = Array.from({ length: 20 }, (_, i) => run({ score: 60 + i, timings: { queuedAt: "", startedAt: "", finishedAt: "2026-10-23T10:00:00.000Z", queueMs: 0, runMs: (i + 1) * 100 }, costMicroUsd: 1000 + i }));
    const events: FeedbackRow[] = [];
    // 10 used as they were, 4 edited (and kept), 3 regenerated, one used then regenerated (not accepted).
    for (const r of runs.slice(0, 10)) events.push(fb(r.id, "use"));
    for (const [i, r] of runs.slice(10, 14).entries()) events.push(fb(r.id, "edit", { distance: 0.1 * (i + 1) }));
    for (const r of runs.slice(14, 17)) events.push(fb(r.id, "regenerate"));
    events.push(fb(runs[17].id, "use"), fb(runs[17].id, "regenerate"));
    // Ratings: 15 up, 5 down.
    for (const [i, r] of runs.entries()) events.push(fb(r.id, "rating", { rating: i < 15 ? "up" : "down" }));

    const s = computeStats(runs, events);
    expect(s.runs).toBe(20);
    expect(s.isNew).toBe(false);
    expect(s.acceptance).toEqual({ value: 14 / 20, count: 14, n: 20, enough: true });
    expect(s.regenerate).toEqual({ value: 4 / 20, count: 4, n: 20, enough: true });
    // Edit rate is over accepted outputs: 4 of 14, under the minimum, so no number.
    expect(s.edited).toEqual({ value: null, count: 4, n: 14, enough: false });
    expect(s.editSize).toEqual({ value: null, n: 4, enough: false });
    expect(s.rating).toEqual({ value: 0.75, count: 15, n: 20, enough: true });
    expect(s.compliance.value).toBe(1);
    expect(s.quality.value).toBe(Math.round((60 + 79) / 2));
    expect(s.latency).toEqual({ p50Ms: 1000, p90Ms: 1800, n: 20, enough: true });
    expect(s.cost).toEqual({ avgMicroUsd: Math.round((20 * 1000 + 190) / 20), totalMicroUsd: 20 * 1000 + 190, n: 20 });

    // With a lower minimum the edit numbers show.
    const low = computeStats(runs, events, 4);
    expect(low.edited.value).toBeCloseTo(4 / 14);
    expect(low.editSize.value).toBeCloseTo(0.25, 3);
  });

  it("shows New below the minimum count and never a figure", () => {
    const runs = Array.from({ length: MIN_COUNT - 1 }, () => run({ score: 90 }));
    const s = computeStats(runs, runs.map((r) => fb(r.id, "use")));
    expect(s.isNew).toBe(true);
    for (const k of ["acceptance", "regenerate", "rating", "compliance"] as const) expect(s[k].value).toBeNull();
    expect(s.quality.value).toBeNull();
    expect(s.latency.p50Ms).toBeNull();
    expect(s.acceptance.count).toBe(MIN_COUNT - 1);
    const pub = publicStats("hook-writer", s);
    expect(pub).not.toHaveProperty("cost");
    expect(pub.min).toBe(MIN_COUNT);
    expect(rate(0, 0)).toEqual({ value: null, count: 0, n: 0, enough: false });
  });

  it("leaves failed, cancelled and taken-down runs out of the outputs, and counts format failures against compliance", () => {
    const ok = Array.from({ length: 18 }, () => run({ score: 80 }));
    const platform = run({ score: 50, platformFail: true });
    const guard = run({ checks: [{ guardrail: "platform_policy", check: "caption_length", status: "fail", message: "too long" }] });
    const invalid = run({ status: "failed", error: { code: "output_invalid", message: "no" } });
    const provider = run({ status: "failed", error: { code: "provider_error", message: "down" } });
    const cancelled = run({ status: "cancelled" });
    const taken = run({ withheld: { at: "t", reportId: "r", reason: "x" } });
    const s = computeStats([...ok, platform, guard, invalid, provider, cancelled, taken], []);
    expect(s.runs).toBe(20);
    expect(s.failed).toBe(2);
    // The format check: 21 succeeded (the taken-down one too) and 1 that never fit; 19 compliant.
    expect(s.compliance).toMatchObject({ count: 19, n: 22 });
    expect(compliant(platform)).toBe(false);
    expect(compliant(guard)).toBe(false);
    expect(compliant(ok[0])).toBe(true);
  });

  it("reads one run's outcome: accepted means used or edited without a regenerate", () => {
    expect(outcomeOf([fb("a", "use")])).toMatchObject({ accepted: true, edited: false, regenerated: false });
    expect(outcomeOf([fb("a", "edit", { distance: 0.3 })])).toMatchObject({ accepted: true, edited: true, distance: 0.3 });
    expect(outcomeOf([fb("a", "use"), fb("a", "regenerate")])).toMatchObject({ accepted: false, regenerated: true });
    expect(outcomeOf([fb("a", "rating", { rating: "down" })])).toMatchObject({ accepted: false, rating: "down" });
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("the canary comparison", () => {
  const side = (accepted: number, regenerated: number, total: number, score = 80) => {
    const runs = Array.from({ length: total }, () => run({ score }));
    const events = [...runs.slice(0, accepted).map((r) => fb(r.id, "use")), ...runs.slice(accepted, accepted + regenerated).map((r) => fb(r.id, "regenerate"))];
    return computeStats(runs, events, DEFAULT_THRESHOLDS.minRuns);
  };

  it("calls a canary clearly worse past the minimum count, by each rule", () => {
    const stable = side(16, 2, 20);
    const worse = side(9, 9, 20);
    const c = compareArms(stable, worse, DEFAULT_THRESHOLDS);
    expect(c.worse).toBe(true);
    expect(c.checks.find((x) => x.id === "acceptance")).toMatchObject({ counted: true, worse: true, stable: 0.8, canary: 0.45 });
    expect(c.checks.find((x) => x.id === "regenerate")).toMatchObject({ counted: true, worse: true });
    expect(c.reasons[0]).toBe("Acceptance 45% against 80% on the stable version, more than 15% lower.");

    // Quality alone.
    expect(compareArms(side(16, 2, 20, 85), side(16, 2, 20, 70), DEFAULT_THRESHOLDS).reasons).toEqual(["Quality 70 against 85, more than 10 points lower."]);
    // A small difference is not clearly worse.
    expect(compareArms(stable, side(14, 3, 20), DEFAULT_THRESHOLDS).worse).toBe(false);
  });

  it("never stops below the minimum count, and the thresholds are configurable", () => {
    const stable = side(16, 2, 20);
    const few = side(1, 9, 10);
    expect(compareArms(stable, few, DEFAULT_THRESHOLDS)).toMatchObject({ worse: false, counted: false });
    const strict = { ...DEFAULT_THRESHOLDS, minRuns: 10, acceptanceDrop: 0.05 };
    expect(compareArms(side(16, 2, 20), side(14, 3, 20), strict).worse).toBe(true);
  });
});

describe("routing", () => {
  it("puts about the share of workspaces on the canary, the same workspace always on the same side", () => {
    const rel = { id: "rel_a", share: 10 };
    const ws = Array.from({ length: 4000 }, (_, i) => `ws_customer_${i}`);
    const canary = ws.filter((w) => armFor(rel, w) === "canary").length;
    expect(canary / ws.length).toBeGreaterThan(0.08);
    expect(canary / ws.length).toBeLessThan(0.12);
    for (const w of ws.slice(0, 50)) expect(armFor(rel, w)).toBe(armFor(rel, w));
    expect(bucketOf("rel_a", "ws_1")).toBe(bucketOf("rel_a", "ws_1"));
    // Raising the share only moves workspaces onto the canary.
    const at10 = new Set(ws.filter((w) => armFor(rel, w) === "canary"));
    const at25 = new Set(ws.filter((w) => armFor({ ...rel, share: 25 }, w) === "canary"));
    for (const w of at10) expect(at25.has(w)).toBe(true);
    expect(ws.every((w) => armFor({ ...rel, share: 0 }, w) === "stable")).toBe(true);
    // Another release picks another cohort.
    const other = new Set(ws.filter((w) => armFor({ id: "rel_b", share: 10 }, w) === "canary"));
    expect([...at10].filter((w) => other.has(w)).length).toBeLessThan(at10.size);
  });
});

describe("the regression gate", () => {
  const scores = (pairs: [string, number][]) => new Map(pairs);

  it("passes when the new version scores at least the current one on the same gold samples", () => {
    const g = regressionGate({ goldSamples: 3, stable: { version: "1.0.0", scores: scores([["s1", 80], ["s2", 90], ["s3", 70]]) }, candidate: { version: "1.0.1", scores: scores([["s1", 85], ["s2", 90]]) }, live: null });
    expect(g).toMatchObject({ ok: true, status: "pass", compared: 2, stable: { score: 85 }, candidate: { score: 88 } });
  });

  it("refuses a lower gold score, a missing gold run, and a canary that is clearly worse live", () => {
    const low = regressionGate({ goldSamples: 2, stable: { version: "1.0.0", scores: scores([["s1", 90], ["s2", 90]]) }, candidate: { version: "1.0.1", scores: scores([["s1", 60], ["s2", 90]]) }, live: null });
    expect(low).toMatchObject({ ok: false, status: "fail" });
    expect(low.reasons[0]).toBe("Gold set: v1.0.1 scored 75 against 90 for v1.0.0 on the same 2 samples.");
    const missing = regressionGate({ goldSamples: 2, stable: { version: "1.0.0", scores: scores([["s1", 90]]) }, candidate: { version: "1.0.1", scores: new Map() }, live: null });
    expect(missing).toMatchObject({ ok: false, status: "needs_gold", reasons: ["Run the gold set on v1.0.1 first."] });
    const live = regressionGate({ goldSamples: 1, stable: { version: "1.0.0", scores: scores([["s1", 80]]) }, candidate: { version: "1.0.1", scores: scores([["s1", 80]]) }, live: { worse: true, counted: true, checks: [], reasons: ["Acceptance 40% against 80% on the stable version, more than 15% lower."] } });
    expect(live).toMatchObject({ ok: false, status: "fail" });
    const none = regressionGate({ goldSamples: 0, stable: { version: "1.0.0", scores: new Map() }, candidate: { version: "1.0.1", scores: new Map() }, live: null });
    expect(none).toMatchObject({ ok: true, status: "no_gold" });
  });

  it("scores each gold sample by the version's latest run on it, a failed run as 0", () => {
    type G = Pick<Run, "id" | "status" | "quality" | "checks" | "createdAt" | "agent">;
    const mk = (id: string, version: string, at: string, status: Run["status"], score: number | null): [string, G] => [id, { id, status, quality: score === null ? null : ({ score } as QualityReport), checks: [], createdAt: at, agent: { workspaceId: "ws_wovi", id: "hook-writer", version } }];
    const runs = new Map([mk("a", "1.0.0", "1", "succeeded", 50), mk("b", "1.0.0", "2", "succeeded", 90), mk("c", "1.0.0", "3", "failed", null), mk("d", "1.0.1", "1", "cancelled", null)]);
    const got = latestGoldScores("1.0.0", [{ sampleId: "s1", runId: "a" }, { sampleId: "s1", runId: "b" }, { sampleId: "s2", runId: "c" }, { sampleId: "s3", runId: "d" }], runs);
    expect([...got]).toEqual([["s1", 90], ["s2", 0]]);
  });
});
