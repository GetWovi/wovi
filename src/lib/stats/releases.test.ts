/**
 * Canary releases in the builder: a live agent's save goes out as a canary,
 * runs that follow "latest stable" are routed by a stable hash of the
 * workspace (pinned runs, pipelines that pin and the builder's own runs never
 * are), publishing to everyone goes through the regression gate, a canary
 * that is clearly worse stops on its own, and every step is in the audit log.
 * All on the fake provider.
 */
import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { goodSpec } from "@/lib/agents/test-helpers";
import { as, testApp } from "@/lib/app/test-helpers";
import { testBuilder, untilBenchEnds } from "@/lib/builder/test-helpers";
import { PIPELINE_TEMPLATES } from "@/lib/pipelines/templates";
import { defaultAnswer } from "@/lib/runs/providers/fake";
import type { CompletionRequest } from "@/lib/runs/providers/types";
import type { Run } from "@/lib/runs/run";
import { Feedback } from "./feedback";
import { storeRouter } from "./releases";
import { memoryStatsStore } from "./store";
import type { ReleaseRow } from "./types";

const HOOK = { idea: "Gerald, our sourdough starter, turns nine this week. He has never missed a bake.", platform: "tiktok" };
const STOCK = "STOCK LINES ONLY";

/** The fake model, except that instructions asking for stock lines get them: every hook carries a banned phrase. */
function respond(req: CompletionRequest) {
  const text = req.messages.map((m) => m.content).join("\n");
  if (!text.includes(STOCK)) return undefined;
  const answer = JSON.parse(defaultAnswer(req)) as { items?: unknown[] };
  if (Array.isArray(answer.items)) answer.items = answer.items.map((_, i) => `A game-changing hook number ${i + 1} for you`);
  return JSON.stringify(answer);
}

async function world() {
  const statsStore = memoryStatsStore();
  const t = await testBuilder({ stats: statsStore, fake: { respond } });
  const { me, user } = await t.joinBuilder();
  const hook = (await t.registry.get(PLATFORM_WORKSPACE_ID, "hook-writer"))!;
  const feedback = new Feedback({ store: statsStore, runs: t.engine });
  /** A run from a customer's workspace that follows "latest stable". */
  const run = async (ws: string, version?: string) => t.engine.waitForRun(ws, (await t.engine.submitRun({ workspaceId: ws, agentId: "hook-writer", agentWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: HOOK, ...(version ? { version } : {}) })).id);
  const audit = async () => (await t.builder.release.audit(me, "hook-writer")).map((a) => a.kind).reverse();
  return { ...t, statsStore, me, user, hook, feedback, run, audit, releases: t.releases!, stats: t.stats! };
}

describe("saving a live agent", () => {
  it("goes out as a canary: the current version keeps serving everyone, and the builder works on the canary", async () => {
    const t = await world();
    const saved = await t.builder.saveAgent(t.me, "hook-writer", { instructions: `${t.hook.instructions}\nKeep it warm.` }, { note: "Warmer", release: { mode: "canary", share: 10 } });
    expect(saved.version).toBe("1.0.1");
    expect((await t.registry.get(PLATFORM_WORKSPACE_ID, "hook-writer"))!.version).toBe("1.0.0");
    expect((await t.builder.getAgent(t.me, "hook-writer"))!.spec.version).toBe("1.0.1");
    expect((await t.builder.bench.estimate(t.me, "hook-writer")).version).toBe("1.0.1");
    expect(await t.releases.active(PLATFORM_WORKSPACE_ID, "hook-writer")).toMatchObject({ stable: "1.0.0", canary: "1.0.1", share: 10, status: "canary", startedBy: t.user.id });

    // The next save builds on the canary, replaces it, and the stable version stays.
    const next = await t.builder.saveAgent(t.me, "hook-writer", { routing: { ...t.hook.routing, temperature: 0.5 } }, { release: { mode: "canary", share: 20 } });
    expect(next.version).toBe("1.0.2");
    expect(next.instructions).toContain("Keep it warm.");
    const history = await t.releases.history(PLATFORM_WORKSPACE_ID, "hook-writer");
    expect(history.map((r) => [r.canary, r.status])).toEqual([["1.0.2", "canary"], ["1.0.1", "replaced"]]);
    expect(history[0]).toMatchObject({ stable: "1.0.0", share: 20 });
    // Without a release choice, a save during a canary stays on the canary.
    expect((await t.builder.saveAgent(t.me, "hook-writer", { job: "Opens a post with one line people stop for." })).version).toBe("1.0.3");
    expect((await t.registry.get(PLATFORM_WORKSPACE_ID, "hook-writer"))!.version).toBe("1.0.0");

    expect(await t.audit()).toEqual(["saved", "canary_started", "saved", "canary_started", "saved", "canary_started"]);
  });

  it("refuses a canary whose form does not fit the stable one, unless it stays on the bench; drafts save as before", async () => {
    const t = await world();
    const inputs = [...t.hook.inputs, { key: "audience", label: "Who it is for", type: "text" as const, required: true, limits: { maxLength: 100 } }];
    const instructions = `${t.hook.instructions}\nWrite for: {{audience}}`;
    const err = await rejectsCode(t.builder.saveAgent(t.me, "hook-writer", { inputs, instructions }, { release: { mode: "canary", share: 10 } }), "invalid_request");
    expect(err.message).toContain('The new input "Who it is for" is required.');
    expect((await t.registry.versions(PLATFORM_WORKSPACE_ID, "hook-writer")).length).toBe(1);
    const bench = await t.builder.saveAgent(t.me, "hook-writer", { inputs, instructions }, { release: { mode: "canary", share: 0 } });
    expect(await t.releases.active(PLATFORM_WORKSPACE_ID, "hook-writer")).toMatchObject({ canary: bench.version, share: 0 });
    await rejectsCode(t.builder.release.update(t.me, "hook-writer", { share: 10 }), "invalid_request");
    // A live agent never goes to everyone straight from a save.
    await rejectsCode(t.builder.saveAgent(t.me, "hook-writer", { job: "Something else." }, { release: { mode: "everyone" } }), "invalid_request");
    // A draft has no live runs: a save is current at once.
    const draft = await t.builder.createAgent(t.me, goodSpec({ id: "caption-two", name: "Caption Two" }));
    expect((await t.builder.saveAgent(t.me, draft.id, { job: "Writes a second line." })).version).toBe("1.0.1");
    expect((await t.registry.get(PLATFORM_WORKSPACE_ID, draft.id))!.version).toBe("1.0.1");
  });
});

describe("routing live runs", () => {
  it("sends the share of workspaces to the canary by a stable hash; pinned runs and the builder's own runs are never routed", async () => {
    const t = await world();
    await t.builder.saveAgent(t.me, "hook-writer", { instructions: `${t.hook.instructions}\nKeep it warm.` }, { release: { mode: "canary", share: 30 } });
    const rel = (await t.releases.active(PLATFORM_WORKSPACE_ID, "hook-writer"))!;
    const runs: Run[] = [];
    for (let i = 0; i < 60; i++) runs.push(await t.run(`ws_customer_${i}`));
    const canary = runs.filter((r) => r.agent.version === "1.0.1");
    expect(canary.length).toBeGreaterThan(6);
    expect(canary.length).toBeLessThan(32);
    for (const r of runs) expect(r.release).toEqual({ id: rel.id, arm: r.agent.version === "1.0.1" ? "canary" : "stable" });
    // One workspace sees one version.
    const ws = canary[0].workspaceId;
    expect((await t.run(ws)).agent.version).toBe("1.0.1");
    // Pinned: exact, and not part of the release.
    const pinned = await t.run(ws, "1.0.0");
    expect(pinned.agent.version).toBe("1.0.0");
    expect(pinned.release).toBeUndefined();
    // The builder's own workspace gets the current version.
    const home = await t.run(PLATFORM_WORKSPACE_ID);
    expect(home.agent.version).toBe("1.0.0");
    expect(home.release).toBeUndefined();

    // Roll back in one step: everyone is on the stable version again.
    const back = await t.builder.release.rollBack(t.me, "hook-writer");
    expect(back).toMatchObject({ status: "rolled_back", endedBy: t.user.id });
    const after = await t.run(ws);
    expect(after.agent.version).toBe("1.0.0");
    expect(after.release).toBeUndefined();
    expect((await t.builder.getAgent(t.me, "hook-writer"))!.spec.version).toBe("1.0.0");
    expect(await t.audit()).toEqual(["saved", "canary_started", "rolled_back"]);
  });

  it("a pipeline step that follows current goes where a single run would; a pinned step stays exact", async () => {
    const stats = memoryStatsStore();
    const t = await testApp({ engine: { router: storeRouter(stats) } });
    const me = as(t.ada.id);
    const tags = (await t.registry.get(PLATFORM_WORKSPACE_ID, "hashtag-picker"))!;
    const canary = await t.registry.update(PLATFORM_WORKSPACE_ID, "hashtag-picker", { instructions: `${tags.instructions}\nPrefer short tags.` }, { keepCurrent: true });
    // Every workspace on the canary, so the test does not depend on a hash.
    const row: ReleaseRow = { id: "rel_all", workspaceId: PLATFORM_WORKSPACE_ID, agentId: "hashtag-picker", stable: tags.version, canary: canary.version, share: 100, status: "canary", thresholds: { minRuns: 20, acceptanceDrop: 0.15, editRise: 0.15, regenerateRise: 0.15, qualityDrop: 10 }, startedAt: "t", startedBy: "usr_x", endedAt: null, endedBy: null, reason: null, updatedAt: "t" };
    await stats.releases.insert(row);

    const start = async (pipelineId: string) => {
      const pr = await t.api.startPipeline(me, t.team.id, { pipelineId, inputs: { post: "We fixed forty croissants this week and Gerald the starter turned nine.", platform: "tiktok" } });
      return t.pipelineEngine.get(t.team.id, pr.id);
    };
    const template = PIPELINE_TEMPLATES.find((p) => p.id === "caption-and-tags")!;
    const routed = (await start("caption-and-tags"))!;
    expect(routed.steps.find((s) => s.agent.id === "hashtag-picker")).toMatchObject({ agent: { version: canary.version }, release: { id: "rel_all", arm: "canary" } });

    // The same chain with the tags agent pinned to the stable version.
    const pinnedSpec = structuredClone(template) as unknown as Record<string, unknown> & { steps: { agent: { id: string; version: string } }[] };
    for (const s of pinnedSpec.steps) if (s.agent.id === "hashtag-picker") s.agent.version = tags.version;
    await t.pipelineRegistry.create(t.team.id, { ...pinnedSpec, id: "pinned-tags", status: "live", visibility: "workspace", owner: { kind: "creator", creatorId: "creator_ada" } } as never);
    const pinned = (await start("pinned-tags"))!;
    const step = pinned.steps.find((s) => s.agent.id === "hashtag-picker")!;
    expect(step.agent.version).toBe(tags.version);
    expect(step.release).toBeUndefined();
    // The step's engine run carries its release, and the public view never shows it.
    await t.pipelineEngine.waitUntilSettled(t.team.id, routed.id);
    const settled = (await t.pipelineEngine.get(t.team.id, routed.id))!;
    const tagRunId = settled.steps.find((s) => s.agent.id === "hashtag-picker")!.runId;
    if (tagRunId) expect((await t.engine.getRun(t.team.id, tagRunId))!.release).toEqual({ id: "rel_all", arm: "canary" });
    expect(JSON.stringify(await t.api.pipelineRun(me, t.team.id, routed.id))).not.toContain("rel_all");
  });
});

describe("the regression gate", () => {
  it("needs the gold set on both versions, refuses a version that scores lower, and publishes one that does not", async () => {
    const t = await world();
    for (const idea of [HOOK.idea, "We finally fixed the croissant lamination after burning forty of them."]) {
      await t.builder.addSample(t.me, "hook-writer", { title: idea.slice(0, 30), inputs: { idea, platform: "tiktok" }, idealOutput: "1. Gerald is nine. He has never missed a bake.\n2. Forty croissants later, the layers finally hold." });
    }
    // A worse version: its instructions ask for stock lines.
    await t.builder.saveAgent(t.me, "hook-writer", { instructions: `${t.hook.instructions}\n${STOCK}` }, { release: { mode: "canary", share: 10 } });
    const needs = await rejectsCode(t.builder.release.promote(t.me, "hook-writer"), "gate");
    expect(needs.message).toBe("Run the gold set on v1.0.1 and v1.0.0 first.");

    const benches = await t.builder.release.runGoldSet(t.me, "hook-writer");
    expect(benches.map((b) => b.version)).toEqual(["1.0.1", "1.0.0"]);
    for (const b of benches) await untilBenchEnds(t, t.me, b.id);
    // Nothing to run again: both have their gold scores.
    expect(await t.builder.release.runGoldSet(t.me, "hook-writer")).toEqual([]);

    const view = await t.builder.release.view(t.me, "hook-writer");
    expect(view.gate).toMatchObject({ ok: false, status: "fail", goldSamples: 2, compared: 2 });
    expect(view.gate!.candidate.score!).toBeLessThan(view.gate!.stable.score!);
    const refused = await rejectsCode(t.builder.release.promote(t.me, "hook-writer"), "gate");
    expect((refused as unknown as { issues: string[] }).issues[0]).toMatch(/^Gold set: v1\.0\.1 scored \d+ against \d+ for v1\.0\.0 on the same 2 samples\.$/);
    expect((await t.registry.get(PLATFORM_WORKSPACE_ID, "hook-writer"))!.version).toBe("1.0.0");

    // A good version: gold set on it alone (the stable one has its scores), then it goes to everyone.
    await t.builder.saveAgent(t.me, "hook-writer", { instructions: `${t.hook.instructions}\nKeep it warm.` }, { release: { mode: "canary", share: 10 } });
    const again = await t.builder.release.runGoldSet(t.me, "hook-writer");
    expect(again.map((b) => b.version)).toEqual(["1.0.2"]);
    await untilBenchEnds(t, t.me, again[0].id);
    const out = await t.builder.release.promote(t.me, "hook-writer");
    expect(out.gate).toMatchObject({ ok: true, status: "pass" });
    expect(out.release).toMatchObject({ status: "promoted", canary: "1.0.2" });
    expect((await t.registry.get(PLATFORM_WORKSPACE_ID, "hook-writer"))!.version).toBe("1.0.2");
    expect(await t.releases.active(PLATFORM_WORKSPACE_ID, "hook-writer")).toBeNull();
    expect((await t.run("ws_customer_1")).agent.version).toBe("1.0.2");

    const log = await t.builder.release.audit(t.me, "hook-writer");
    expect(log.map((a) => a.kind).reverse()).toEqual(["saved", "canary_started", "gate_refused", "gate_refused", "saved", "canary_started", "promoted"]);
    expect(log[0]).toMatchObject({ kind: "promoted", version: "1.0.2", from: "1.0.0", byName: "Funkai" });
    expect(log[0].data).toMatchObject({ gate: "pass" });
  });
});

describe("the automatic stop", () => {
  async function canaryWithTraffic(thresholds?: Partial<ReleaseRow["thresholds"]>) {
    const t = await world();
    await t.builder.saveAgent(t.me, "hook-writer", { instructions: `${t.hook.instructions}\nKeep it warm.` }, { release: { mode: "canary", share: 50, thresholds } });
    const runs: Run[] = [];
    for (let i = 0; i < 90; i++) runs.push(await t.run(`ws_shop_${i}`));
    return { ...t, runs, canary: runs.filter((r) => r.release?.arm === "canary"), stable: runs.filter((r) => r.release?.arm === "stable") };
  }

  it("stops a canary that is clearly worse past the minimum count, logs the numbers, and routes everyone back", async () => {
    const t = await canaryWithTraffic();
    expect(t.canary.length).toBeGreaterThanOrEqual(20);
    expect(t.stable.length).toBeGreaterThanOrEqual(20);
    // People keep the stable version's results and ask for another try on the canary's.
    for (const r of t.stable) await t.feedback.record({ workspaceId: r.workspaceId, runId: r.id, action: "use", by: "usr_someone", source: "app" });
    for (const r of t.canary.slice(0, 5)) await t.feedback.record({ workspaceId: r.workspaceId, runId: r.id, action: "use", by: "usr_someone", source: "app" });
    for (const r of t.canary.slice(5)) await t.feedback.record({ workspaceId: r.workspaceId, runId: r.id, action: "regenerate", by: "usr_someone", source: "app" });

    const arms = await t.releases.arms(PLATFORM_WORKSPACE_ID, "hook-writer");
    expect(arms.comparison.worse).toBe(true);
    const out = await t.releases.check(PLATFORM_WORKSPACE_ID, "hook-writer");
    expect(out.stopped).toBe(true);
    expect(out.release).toMatchObject({ status: "stopped", endedBy: "system" });
    expect(out.release!.reason).toMatch(/^Stopped automatically: Acceptance \d+% against 100% on the stable version, more than 15% lower\./);
    // Checking again changes nothing.
    expect((await t.releases.check(PLATFORM_WORKSPACE_ID, "hook-writer")).stopped).toBe(false);
    const next = await t.run(t.canary[0].workspaceId);
    expect(next.agent.version).toBe("1.0.0");
    const log = await t.builder.release.audit(t.me, "hook-writer");
    expect(log[0]).toMatchObject({ kind: "auto_stopped", by: "system", byName: "WOVI (automatic)", version: "1.0.1", from: "1.0.0" });
    expect(log[0].data).toMatchObject({ acceptanceStable: 1 });
  });

  it("never stops below the minimum count, and the stop rules are the builder's to set", async () => {
    const t = await canaryWithTraffic({ minRuns: 200 });
    for (const r of t.canary) await t.feedback.record({ workspaceId: r.workspaceId, runId: r.id, action: "regenerate", by: "usr_someone", source: "app" });
    for (const r of t.stable) await t.feedback.record({ workspaceId: r.workspaceId, runId: r.id, action: "use", by: "usr_someone", source: "app" });
    expect((await t.releases.check(PLATFORM_WORKSPACE_ID, "hook-writer")).stopped).toBe(false);
    const changed = await t.builder.release.update(t.me, "hook-writer", { thresholds: { minRuns: 20 } });
    expect(changed.thresholds.minRuns).toBe(20);
    expect((await t.releases.check(PLATFORM_WORKSPACE_ID, "hook-writer")).stopped).toBe(true);
    expect((await t.builder.release.audit(t.me, "hook-writer")).map((a) => a.kind).reverse()).toEqual(["saved", "canary_started", "canary_share", "auto_stopped"]);
  });
});

describe("the audit log", () => {
  it("keeps every publish, canary start, share change, promotion and rollback, with who, for builders only", async () => {
    const t = await world();
    const draft = await t.builder.createAgent(t.me, goodSpec({ id: "caption-three", name: "Caption Three" }));
    await t.builder.publish(t.me, draft.id);
    await t.builder.saveAgent(t.me, draft.id, { job: "Writes a third line." }, { release: { mode: "canary", share: 5 } });
    await t.builder.release.update(t.me, draft.id, { share: 25 });
    await t.builder.versions.rollback(t.me, draft.id, "1.0.0");
    await t.builder.release.start(t.me, draft.id, { version: "1.0.1", share: 10 });
    await t.builder.release.rollBack(t.me, draft.id);
    await t.builder.unpublish(t.me, draft.id);
    await t.builder.hide(t.me, draft.id);
    await t.builder.unhide(t.me, draft.id);
    const log = await t.builder.release.audit(t.me, draft.id);
    expect(log.map((a) => a.kind).reverse()).toEqual(["published", "saved", "canary_started", "canary_share", "version_rollback", "canary_started", "rolled_back", "unpublished", "hidden", "unhidden"]);
    expect(log.every((a) => a.byName === "Funkai")).toBe(true);
    expect(log.find((a) => a.kind === "version_rollback")!.detail).toBe("v1.0.0 serves everyone again in place of v1.0.0. The canary of v1.0.1 ended.");
    expect((await t.releases.history(PLATFORM_WORKSPACE_ID, draft.id)).map((r) => r.status)).toEqual(["rolled_back", "replaced"]);
    // Every agent's log at once.
    expect((await t.builder.release.audit(t.me)).length).toBeGreaterThanOrEqual(log.length);
    // Nobody else sees it.
    const someone = await t.signUp("someone@example.com");
    await rejectsCode(t.builder.release.audit(as(someone.user.id)), "not_found");
    await rejectsCode(t.builder.release.view(as(someone.user.id), draft.id), "not_found");
    await rejectsCode(t.builder.release.start(t.me, draft.id, { version: "1.0.1", share: 10 }), "invalid_request");
    expect(JSON.stringify(log)).not.toContain("\u2014");
  });
});
