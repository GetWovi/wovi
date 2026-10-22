import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { goodSpec } from "@/lib/agents/test-helpers";
import { defaultAnswer } from "@/lib/runs/providers/fake";
import type { CompletionRequest } from "@/lib/runs/providers/types";
import { lineDiff, specDiff } from "./diff";
import { autoScore, scorecard } from "./scoring";
import { as, testBuilder, untilBenchEnds } from "./test-helpers";
import { BENCH_LIMITS } from "./types";

const HOOK = (idea: string) => ({ inputs: { idea, platform: "tiktok" }, idealOutput: "1. Gerald is nine. He has never missed a bake.\n2. Nine years, one jar, zero days off." });
const GERALD = "Gerald, our sourdough starter, turns nine this week. He has never missed a bake.";
const CROISSANT = "We finally fixed the croissant lamination after burning forty of them.";
const WEDDING = "We stopped taking wedding cake orders so the bakery could open at six again.";
const LOAF = "The first loaf of the day goes to whoever is waiting outside at five.";

const lastUser = (req: CompletionRequest) => req.messages.filter((m) => m.role === "user").at(-1)!.content;

describe("the test bench", () => {
  it("runs a version against its samples on the fake provider and shows what builders may see", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    const s1 = await t.builder.addSample(me, "hook-writer", { title: "Gerald turns nine", ...HOOK(GERALD) });
    const s2 = await t.builder.addSample(me, "hook-writer", { title: "Forty croissants", ...HOOK(CROISSANT) });
    const s3 = await t.builder.addSample(me, "hook-writer", { label: "bad", title: "Generic", inputs: { idea: WEDDING, platform: "x" }, idealOutput: "Are you ready to level up?" });

    const estimate = await t.builder.bench.estimate(me, "hook-writer");
    expect(estimate).toMatchObject({ agentId: "hook-writer", version: "1.0.0", runs: 3, unfit: [] });
    expect(estimate.estimateMicroUsd).toBeGreaterThan(0);
    expect(estimate.capMicroUsd).toBe(3 * 50_000);

    const started = await t.builder.bench.run(me, "hook-writer");
    expect(started).toMatchObject({ agentId: "hook-writer", version: "1.0.0", kind: "samples", status: "running", total: 3 });
    const v = await untilBenchEnds(t, me, started.id);
    expect(v.status).toBe("done");
    expect(v.done).toBe(3);
    expect(v.finishedAt).not.toBeNull();
    expect(v.results.map((r) => r.sampleId)).toEqual([s1.id, s2.id, s3.id]);
    expect(v.results.map((r) => r.label)).toEqual(["gold", "gold", "bad"]);
    for (const r of v.results) {
      expect(r.status).toBe("succeeded");
      expect(r.output?.kind).toBe("list");
      expect((r.output as { items: string[] }).items).toHaveLength(10);
      expect(r.parsed).toBe("first");
      expect(r.model).toEqual({ route: "text-standard", model: "anthropic/claude-sonnet-5.5" });
      expect(r.checks.map((c) => c.guardrail)).toEqual(["banned_phrases", "no_misleading_claims", "brand_voice_check", "brand_voice_check", "specificity_check"]);
      expect(r.checks.every((c) => c.status === "pass")).toBe(true);
      expect(r.tokensIn).toBeGreaterThan(0);
      expect(r.costMicroUsd).toBeGreaterThan(0);
      expect(typeof r.ms).toBe("number");
      expect(r.autoScore).toBe(100);
      expect(r.rating).toBeNull();
    }
    expect(v.results[0].idealOutput).toBe(HOOK(GERALD).idealOutput);
    expect(v.results[2].idealOutput).toBe("Are you ready to level up?");
    expect(v.costMicroUsd).toBe(v.results.reduce((n, r) => n + r.costMicroUsd, 0));
    expect(v.scorecard).toMatchObject({ version: "1.0.0", runs: 3, passed: 3, passRate: 1, avgAuto: 100, rated: 0, avgRating: null, score: 100 });

    // The scorecard landed in the quality fields, and no version was made.
    const agent = await t.builder.getAgent(me, "hook-writer");
    expect(agent?.spec.quality).toMatchObject({ score: 100, runs: 3 });
    expect(agent?.spec.quality.lastScoredAt).not.toBeNull();
    expect(agent?.versions).toHaveLength(1);
    expect((await t.builder.bench.list(me, "hook-writer")).map((b) => b.id)).toEqual([v.id]);
    // Every run stayed in ws_wovi.
    expect((await t.engine.listRuns(PLATFORM_WORKSPACE_ID, { agentId: "hook-writer" })).length).toBe(3);
    expect(await t.engine.listRuns("ws_other")).toEqual([]);
  });

  it("is a 404 for anyone who is not a builder", async () => {
    const t = await testBuilder();
    const ada = await t.signUp("ada@example.com");
    const her = as(ada.user.id);
    await rejectsCode(t.builder.bench.run(her, "hook-writer"), "not_found");
    await rejectsCode(t.builder.bench.get(her, "bch_x"), "not_found");
    await rejectsCode(t.builder.bench.cancel(her, "bch_x"), "not_found");
    await rejectsCode(t.builder.bench.rate(her, "hook-writer", "run_x", { rating: "good" }), "not_found");
    await rejectsCode(t.builder.bench.estimate(her, "hook-writer"), "not_found");
    await rejectsCode(t.builder.bench.planBatch(her), "not_found");
    await rejectsCode(t.builder.bench.runBatch(her), "not_found");
    await rejectsCode(t.builder.bench.getBatch(her, "bat_x"), "not_found");
    await rejectsCode(t.builder.bench.tune(her, "hook-writer", { name: "X" }), "not_found");
    await rejectsCode(t.builder.versions.history(her, "hook-writer"), "not_found");
    await rejectsCode(t.builder.versions.compare(her, "hook-writer", "1.0.0", "1.0.0"), "not_found");
    await rejectsCode(t.builder.versions.rollback(her, "hook-writer", "1.0.0"), "not_found");
    const { me } = await t.joinBuilder();
    await rejectsCode(t.builder.bench.get(me, "bch_missing"), "not_found");
    await rejectsCode(t.builder.bench.run(me, "nope"), "not_found");
    await rejectsCode(t.builder.bench.run(me, "hook-writer"), "invalid_request");
  });

  it("refuses a sample that does not fit the chosen version instead of running it", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    await t.builder.addSample(me, "hook-writer", { title: "Gerald", ...HOOK(GERALD) });
    const spec = (await t.builder.getAgent(me, "hook-writer"))!.spec;
    await t.builder.saveAgent(me, "hook-writer", {
      inputs: [...spec.inputs, { key: "audience", label: "Audience", type: "text", required: true, limits: { maxLength: 100 } }],
      instructions: spec.instructions + "\nThe audience: {{audience}}",
    });
    const estimate = await t.builder.bench.estimate(me, "hook-writer");
    expect(estimate.runs).toBe(0);
    expect(estimate.unfit[0].reason).toMatch(/audience: Required/);
    const v = await untilBenchEnds(t, me, (await t.builder.bench.run(me, "hook-writer")).id);
    expect(v.status).toBe("done");
    expect(v.results[0].status).toBe("refused");
    expect(v.results[0].error).toMatch(/audience: Required/);
    expect(v.scorecard.runs).toBe(0);
    const old = await untilBenchEnds(t, me, (await t.builder.bench.run(me, "hook-writer", { version: "1.0.0" })).id);
    expect(old.version).toBe("1.0.0");
    expect(old.results[0].status).toBe("succeeded");
    await rejectsCode(t.builder.bench.run(me, "hook-writer", { sampleIds: ["smp_gone"] }), "not_found");
  });

  it("runs one ad-hoc form, and keeps the agent's confirmations for its own samples", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    const v = await untilBenchEnds(t, me, (await t.builder.bench.run(me, "hook-writer", { adhoc: { inputs: { idea: LOAF, platform: "reels" }, title: "Try it" } })).id);
    expect(v).toMatchObject({ kind: "adhoc", total: 1, done: 1 });
    expect(v.results[0]).toMatchObject({ sampleId: null, title: "Try it", label: null, idealOutput: null, status: "succeeded" });
    await rejectsCode(t.builder.bench.run(me, "hook-writer", { adhoc: { inputs: { idea: "short" } } }), "invalid_request");

    // The Repurposer needs rights confirmed before it runs; the bench confirms them for the builder's own sample.
    const source = Array.from({ length: 12 }, () => "Last spring we stopped taking wedding cake orders and opened at six again.").join(" ");
    const r = await untilBenchEnds(t, me, (await t.builder.bench.run(me, "repurposer", { adhoc: { inputs: { source } } })).id);
    expect(r.results[0].status).toBe("succeeded");
    expect(r.results[0].checks[0]).toMatchObject({ guardrail: "rights_confirmed", status: "pass" });
  });

  it("cancels a running bench, and cancelled runs count for nothing", async () => {
    const t = await testBuilder({ fake: { latencyMs: 400 } });
    const { me } = await t.joinBuilder();
    await t.builder.addSample(me, "hook-writer", { title: "A", ...HOOK(GERALD) });
    await t.builder.addSample(me, "hook-writer", { title: "B", ...HOOK(CROISSANT) });
    await t.builder.addSample(me, "hook-writer", { title: "C", ...HOOK(WEDDING) });
    const started = await t.builder.bench.run(me, "hook-writer");
    expect((await t.builder.bench.get(me, started.id)).status).toBe("running");
    const stopped = await t.builder.bench.cancel(me, started.id);
    expect(stopped.status).toBe("cancelled");
    expect(stopped.results.map((r) => r.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(stopped.results.every((r) => r.autoScore === null)).toBe(true);
    expect(stopped.scorecard.runs).toBe(0);
    expect((await t.builder.getAgent(me, "hook-writer"))?.spec.quality).toEqual({ score: null, runs: 0, lastScoredAt: null });
    expect((await t.builder.bench.cancel(me, started.id)).status).toBe("cancelled");
    await t.engine.idle();
  });

  it("scores each run from the checks and the shape, takes ratings, and rolls them up", async () => {
    const t = await testBuilder({
      fake: {
        respond(req) {
          const user = lastUser(req);
          if (user.startsWith("Your answer did not match")) return undefined;
          if (user.includes("wedding cake")) return "Sure! Here are the hooks you asked for.";
          if (user.includes("croissant lamination")) {
            const answer = JSON.parse(defaultAnswer(req)) as { items: string[] };
            answer.items[0] = "A game-changing croissant for the lamination crowd";
            return JSON.stringify(answer);
          }
          return undefined;
        },
      },
    });
    const { me } = await t.joinBuilder();
    await t.builder.addSample(me, "hook-writer", { title: "Clean", ...HOOK(GERALD) });
    await t.builder.addSample(me, "hook-writer", { title: "Banned phrase", ...HOOK(CROISSANT) });
    await t.builder.addSample(me, "hook-writer", { title: "Needs a repair", ...HOOK(WEDDING) });
    await t.builder.addSample(me, "hook-writer", { title: "Clean too", ...HOOK(LOAF) });
    const v = await untilBenchEnds(t, me, (await t.builder.bench.run(me, "hook-writer")).id);
    const [clean, banned, repaired, clean2] = v.results;
    expect(clean.autoScore).toBe(100);
    expect(banned.checks.find((c) => c.guardrail === "banned_phrases")).toMatchObject({ status: "fail", findings: ["game-changing"] });
    expect(banned.needsReview).toBe(true);
    expect(banned.autoScore).toBe(80);
    expect(repaired.parsed).toBe("repaired");
    expect(repaired.autoScore).toBe(85);
    expect(clean2.autoScore).toBe(100);
    expect(v.scorecard).toMatchObject({ runs: 4, passed: 3, passRate: 0.75, avgAuto: 91, rated: 0, score: 91 });

    const r1 = await t.builder.bench.rate(me, "hook-writer", clean.runId!, { rating: "good", note: "Every line is about Gerald." });
    expect(r1.rating).toMatchObject({ agentId: "hook-writer", version: "1.0.0", rating: "good", note: "Every line is about Gerald." });
    await t.builder.bench.rate(me, "hook-writer", repaired.runId!, { rating: "good" });
    const r3 = await t.builder.bench.rate(me, "hook-writer", banned.runId!, { rating: "ok" });
    expect(r3.scorecard.rated).toBe(3);
    // Rating again replaces the earlier rating.
    const r4 = await t.builder.bench.rate(me, "hook-writer", banned.runId!, { rating: "bad", note: "Slop." });
    expect(r4.rating.id).toBe(r3.rating.id);
    expect(r4.scorecard).toMatchObject({ rated: 3, avgRating: 67, avgAuto: 91, score: 79 });
    const again = await t.builder.bench.get(me, v.id);
    expect(again.results[1].rating).toEqual({ rating: "bad", note: "Slop." });

    const agent = await t.builder.getAgent(me, "hook-writer");
    expect(agent?.spec.quality).toMatchObject({ score: 79, runs: 4 });
    expect(agent?.versions).toHaveLength(1);
    await rejectsCode(t.builder.bench.rate(me, "hook-writer", "run_missing", { rating: "good" }), "not_found");
    await rejectsCode(t.builder.bench.rate(me, "caption-writer", clean.runId!, { rating: "good" }), "not_found");
    await rejectsCode(t.builder.bench.rate(me, "hook-writer", clean.runId!, { rating: "great" as never }), "invalid_request");
  });

  it("scorecard math on plain records", () => {
    const run = (id: string, status: "succeeded" | "failed" | "cancelled", opts: { fails?: number; repaired?: boolean; cost?: number; ms?: number } = {}) =>
      ({
        id,
        agent: { workspaceId: "ws_wovi", id: "a", version: "1.0.0" },
        status,
        needsReview: (opts.fails ?? 0) > 0,
        checks: Array.from({ length: opts.fails ?? 0 }, () => ({ guardrail: "g", check: "c", status: "fail" as const, message: "" })),
        calls: opts.repaired ? [{ purpose: "answer", ok: true }, { purpose: "repair", ok: true }] : [{ purpose: "answer", ok: true }],
        costMicroUsd: opts.cost ?? 1000,
        timings: { runMs: opts.ms ?? 100, finishedAt: "2026-10-21T12:00:00.000Z" },
      }) as never;
    expect(autoScore(run("a", "succeeded"))).toBe(100);
    expect(autoScore(run("a", "succeeded", { fails: 2, repaired: true }))).toBe(45);
    expect(autoScore(run("a", "succeeded", { fails: 6 }))).toBe(0);
    expect(autoScore(run("a", "failed"))).toBe(0);
    expect(autoScore(run("a", "cancelled"))).toBeNull();
    const card = scorecard("1.0.0", [run("a", "succeeded", { cost: 2000, ms: 300 }), run("b", "failed", { cost: 1000, ms: 100 }), run("c", "cancelled")], [
      { id: "r", workspaceId: "ws_wovi", agentId: "a", version: "1.0.0", runId: "a", rating: "ok", note: "", createdBy: "u", createdAt: "" },
    ]);
    expect(card).toMatchObject({ runs: 2, passed: 1, passRate: 0.5, avgAuto: 50, rated: 1, avgRating: 50, avgCostMicroUsd: 1500, avgMs: 200, score: 50 });
    expect(scorecard("2.0.0", [run("a", "succeeded")], [])).toMatchObject({ runs: 0, passRate: null, avgAuto: null, score: null });
  });
});

describe("tuning and versions", () => {
  it("saves a tuning change as a new version and re-runs the same samples against it", async () => {
    const t = await testBuilder();
    const { me, user } = await t.joinBuilder();
    const s1 = await t.builder.addSample(me, "hook-writer", { title: "Gerald", ...HOOK(GERALD) });
    await t.builder.addSample(me, "hook-writer", { title: "Croissants", ...HOOK(CROISSANT) });
    const before = (await t.builder.getAgent(me, "hook-writer"))!.spec;
    const first = await untilBenchEnds(t, me, (await t.builder.bench.run(me, "hook-writer")).id);
    expect(first.version).toBe("1.0.0");

    const tuned = await t.builder.bench.tune(
      me,
      "hook-writer",
      { instructions: before.instructions + "\nAlways name the thing.", routing: { ...before.routing, model: "text-strong", temperature: 0.5 } },
      { note: "Name the thing, stronger model", rerun: { sampleIds: [s1.id] } },
    );
    expect(tuned.spec.version).toBe("1.0.1");
    expect(tuned.bench?.version).toBe("1.0.1");
    const rerun = await untilBenchEnds(t, me, tuned.bench!.id);
    expect(rerun.results.map((r) => r.sampleId)).toEqual([s1.id]);
    expect(rerun.results[0].model?.route).toBe("text-strong");
    expect(lastUser(t.fake.requests.at(-1)!)).toContain("Always name the thing.");
    expect(rerun.scorecard).toMatchObject({ version: "1.0.1", runs: 1 });

    const history = await t.builder.versions.history(me, "hook-writer");
    expect(history.map((v) => [v.version, v.current, v.note, v.byName, v.scorecard.runs])).toEqual([
      ["1.0.0", false, "Launch seed", null, 2],
      ["1.0.1", true, "Name the thing, stronger model", "Funkai", 1],
    ]);
    expect(history[1].by).toBe(user.id);
    expect((await t.builder.getAgent(me, "hook-writer"))?.spec.quality).toMatchObject({ runs: 1, score: 100 });
    const only = await t.builder.bench.tune(me, "hook-writer", { name: "Hook Writer 2" }, { bump: "minor" });
    expect(only).toMatchObject({ spec: { version: "1.1.0" }, bench: null });
    await rejectsCode(t.builder.bench.tune(me, "hook-writer", { name: "Hook Writer 2" }), "no_change");
  });

  it("compares two versions as a readable diff with their scorecards", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    const before = (await t.builder.getAgent(me, "hook-writer"))!.spec;
    await t.builder.saveAgent(me, "hook-writer", {
      instructions: before.instructions.replace("No generic openers, no questions that could start any post, no claims the idea does not support.", "No generic openers.\nAlways name the thing."),
      routing: { ...before.routing, model: "text-strong" },
      guardrails: [...before.guardrails, "platform_policy"],
    });
    const c = await t.builder.versions.compare(me, "hook-writer", "1.0.0", "1.0.1");
    expect(c.a.spec.version).toBe("1.0.0");
    expect(c.b.spec.version).toBe("1.0.1");
    expect(c.diff.changed).toEqual(["guardrails", "routing", "instructions"]);
    const routing = c.diff.fields.find((f) => f.field === "routing")!;
    expect(routing.lines.filter((l) => l.type !== "same")).toEqual([
      { type: "remove", text: "model text-standard (anthropic/claude-sonnet-5.5)" },
      { type: "add", text: "model text-strong (anthropic/claude-opus-5.5)" },
    ]);
    const instructions = c.diff.fields.find((f) => f.field === "instructions")!;
    expect(instructions.lines.filter((l) => l.type === "add").map((l) => l.text)).toEqual(["No generic openers.", "Always name the thing."]);
    expect(instructions.lines.filter((l) => l.type === "remove")).toHaveLength(1);
    expect(c.diff.fields.find((f) => f.field === "guardrails")!.lines.at(-1)).toEqual({ type: "add", text: "Platform policy" });
    expect(c.diff.fields.find((f) => f.field === "name")).toMatchObject({ changed: false, a: ["Hook Writer"], b: ["Hook Writer"] });
    expect(c.a.info.scorecard.runs).toBe(0);
    await rejectsCode(t.builder.versions.compare(me, "hook-writer", "1.0.0", "9.9.9"), "not_found");

    expect(lineDiff("a\nb\nc", "a\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "remove", text: "b" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
    expect(specDiff(before, before).changed).toEqual([]);
  });

  it("rolls back to an earlier version and scores it as current", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    await t.builder.addSample(me, "hook-writer", { title: "Gerald", ...HOOK(GERALD) });
    await untilBenchEnds(t, me, (await t.builder.bench.run(me, "hook-writer")).id);
    await t.builder.saveAgent(me, "hook-writer", { name: "Worse" }, { note: "Try a rename" });
    expect((await t.builder.getAgent(me, "hook-writer"))?.spec.quality.runs).toBe(0);

    const back = await t.builder.versions.rollback(me, "hook-writer", "1.0.0");
    expect(back.version).toBe("1.0.0");
    expect(back.name).toBe("Hook Writer");
    expect(back.quality).toMatchObject({ score: 100, runs: 1 });
    const history = await t.builder.versions.history(me, "hook-writer");
    expect(history.map((v) => [v.version, v.current])).toEqual([
      ["1.0.0", true],
      ["1.0.1", false],
    ]);
    expect((await t.builder.saveAgent(me, "hook-writer", { name: "Better" })).version).toBe("1.0.2");
    await rejectsCode(t.builder.versions.rollback(me, "hook-writer", "5.0.0"), "not_found");
  });
});

describe("batch runs", () => {
  it("plans a batch over the live agents, runs it, and sums the results per agent", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    await t.builder.addSample(me, "hook-writer", { title: "Gerald", ...HOOK(GERALD) });
    await t.builder.addSample(me, "hook-writer", { title: "Croissants", ...HOOK(CROISSANT) });
    await t.builder.addSample(me, "caption-writer", { inputs: { post: "Time-lapse of Gerald rising overnight next to the oven.", platforms: ["tiktok", "reels"] }, idealOutput: "Gerald rose. We did not." });
    await t.builder.addSample(me, "hashtag-picker", { inputs: { caption: "Gerald the sourdough starter turned nine today.", platform: "tiktok" }, idealOutput: "#sourdough #gerald" });

    const plan = await t.builder.bench.planBatch(me);
    expect(plan.agents.map((a) => [a.agentId, a.status, a.samples, a.runs])).toEqual([
      ["caption-writer", "live", 1, 1],
      ["hashtag-picker", "live", 1, 1],
      ["hook-writer", "live", 2, 2],
      ["repurposer", "live", 0, 0],
      ["script-writer", "live", 0, 0],
      ["trend-scout", "live", 0, 0],
    ]);
    expect(plan.runs).toBe(4);
    expect(plan.estimateMicroUsd).toBeGreaterThan(0);
    expect(plan.estimateMicroUsd).toBeLessThanOrEqual(plan.capMicroUsd);
    expect(plan.needsConfirmation).toBe(false);

    const batch = await t.builder.bench.runBatch(me);
    expect(batch.agents.map((a) => a.agentId)).toEqual(["caption-writer", "hashtag-picker", "hook-writer"]);
    let view = batch;
    for (let i = 0; i < 200 && view.status === "running"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      view = await t.builder.bench.getBatch(me, batch.id);
    }
    expect(view.status).toBe("done");
    expect(view).toMatchObject({ runs: 4, done: 4 });
    expect(view.agents.map((a) => [a.agentId, a.total, a.done, a.passed, a.failedChecks, a.refused])).toEqual([
      ["caption-writer", 1, 1, 1, 0, 0],
      ["hashtag-picker", 1, 1, 1, 0, 0],
      ["hook-writer", 2, 2, 2, 0, 0],
    ]);
    expect(view.agents.every((a) => a.avgAuto === 100 && a.costMicroUsd > 0 && typeof a.avgMs === "number")).toBe(true);
    expect(view.costMicroUsd).toBe(view.agents.reduce((n, a) => n + a.costMicroUsd, 0));
    expect((await t.builder.bench.listBatches(me)).map((b) => b.id)).toEqual([batch.id]);
    // Each agent's bench is an ordinary bench, and each agent got its quality fields.
    const hook = await t.builder.bench.get(me, view.agents[2].benchId);
    expect(hook).toMatchObject({ kind: "batch", batchId: batch.id, total: 2 });
    expect((await t.builder.getAgent(me, "hashtag-picker"))?.spec.quality.runs).toBe(1);
    await rejectsCode(t.builder.bench.runBatch(me, ["trend-scout"]), "invalid_request");
    await rejectsCode(t.builder.bench.runBatch(me, ["nope"]), "not_found");
    await rejectsCode(t.builder.bench.getBatch(me, "bat_missing"), "not_found");
  });

  it("needs a confirmation above the cost threshold, and respects the spend caps", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    // A pricey agent: the strong model with every output token allowed, so one run is estimated above the threshold.
    await t.builder.createAgent(me, { ...goodSpec(), id: "pricey", routing: { model: "text-strong", fallback: "text-standard", maxCostUsd: 10, maxOutputTokens: 32000 } });
    await t.builder.addSample(me, "pricey", { inputs: { topic: "Gerald the sourdough starter turns nine" }, idealOutput: "A line about Gerald." });
    // A tight agent: a cap lower than its first call could cost, so the engine refuses the run up front.
    await t.builder.createAgent(me, { ...goodSpec(), id: "tight", routing: { model: "text-standard", fallback: "text-fast", maxCostUsd: 0.001, maxOutputTokens: 2000 } });
    await t.builder.addSample(me, "tight", { inputs: { topic: "Gerald the sourdough starter turns nine" }, idealOutput: "A line about Gerald." });

    const plan = await t.builder.bench.planBatch(me, ["pricey", "tight"]);
    expect(plan.thresholdMicroUsd).toBe(BENCH_LIMITS.batchConfirmUsd * 1_000_000);
    expect(plan.estimateMicroUsd).toBeGreaterThan(plan.thresholdMicroUsd);
    expect(plan.needsConfirmation).toBe(true);
    const err = await rejectsCode(t.builder.bench.runBatch(me, ["pricey", "tight"]), "confirmation_required");
    expect(err.message).toMatch(/would cost about \$0\.6\d/);
    expect(await t.builder.bench.listBatches(me)).toEqual([]);

    const batch = await t.builder.bench.runBatch(me, ["pricey", "tight"], { confirmed: true });
    let view = batch;
    for (let i = 0; i < 200 && view.status === "running"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      view = await t.builder.bench.getBatch(me, batch.id);
    }
    expect(view.status).toBe("done");
    expect(view.agents.map((a) => [a.agentId, a.done, a.passed, a.refused])).toEqual([
      ["pricey", 1, 1, 0],
      ["tight", 1, 0, 1],
    ]);
    const tight = await t.builder.bench.get(me, view.agents[1].benchId);
    expect(tight.results[0].status).toBe("refused");
    expect(tight.results[0].error).toMatch(/above its cap of \$0\.001/);
    // The pricey run cost far less than its estimate: the fake answers short, and the cap was never reached.
    expect(view.costMicroUsd).toBeLessThan(plan.estimateMicroUsd);
  });

  it("goes through the engine's queue, so the concurrency limits hold", async () => {
    let active = 0;
    let most = 0;
    const t = await testBuilder({
      engine: { concurrency: { global: 1, perWorkspace: 1 } },
      fake: {
        async respond() {
          active++;
          most = Math.max(most, active);
          await new Promise((r) => setTimeout(r, 15));
          active--;
          return undefined;
        },
      },
    });
    const { me } = await t.joinBuilder();
    for (const idea of [GERALD, CROISSANT, WEDDING, LOAF]) await t.builder.addSample(me, "hook-writer", HOOK(idea));
    await t.builder.addSample(me, "hashtag-picker", { inputs: { caption: "Gerald the sourdough starter turned nine today.", platform: "tiktok" }, idealOutput: "#sourdough" });
    const batch = await t.builder.bench.runBatch(me, ["hook-writer", "hashtag-picker"]);
    let view = batch;
    for (let i = 0; i < 400 && view.status === "running"; i++) {
      await new Promise((r) => setTimeout(r, 10));
      view = await t.builder.bench.getBatch(me, batch.id);
    }
    expect(view.status).toBe("done");
    expect(view.done).toBe(5);
    expect(most).toBe(1);
  });

  it("cancels a whole batch", async () => {
    const t = await testBuilder({ fake: { latencyMs: 400 } });
    const { me } = await t.joinBuilder();
    for (const idea of [GERALD, CROISSANT, WEDDING]) await t.builder.addSample(me, "hook-writer", HOOK(idea));
    const batch = await t.builder.bench.runBatch(me, ["hook-writer"]);
    expect(batch.status).toBe("running");
    const stopped = await t.builder.bench.cancelBatch(me, batch.id);
    expect(stopped.status).toBe("cancelled");
    expect(stopped.done).toBe(3);
    expect(stopped.agents[0].passed).toBe(0);
    await t.engine.idle();
  });
});
