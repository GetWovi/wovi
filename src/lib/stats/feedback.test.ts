/**
 * Feedback from real use: Use, Edit, Regenerate and the rating, recorded on
 * the run screen (AppApi), the review queue (Team), pipeline picks and
 * packages, the REST API and MCP. One event per action per run, consent for
 * edit text, and which runs count for the numbers.
 */
import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { copyAll } from "@/lib/app/results";
import { as, testApp } from "@/lib/app/test-helpers";
import { testApi } from "@/lib/api/test-helpers";
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import type { Run } from "@/lib/runs/run";
import { feedbackForDecision } from "./feedback";
import { countsForStats, StatsService } from "./service";
import { memoryStatsStore } from "./store";

const gold = (id: string) => LAUNCH_SAMPLES[id].find((s) => s.label === "gold")!;

async function world(opts: { mayLearnFrom?: (userId: string) => Promise<boolean>; latencyMs?: number } = {}) {
  const stats = memoryStatsStore();
  const t = await testApp({ stats, mayLearnFrom: opts.mayLearnFrom, ...(opts.latencyMs ? { fake: { latencyMs: opts.latencyMs } } : {}) });
  const ada = as(t.ada.id);
  const hook = async (who = ada) => {
    const run = await t.api.startRun(who, t.team.id, { agentId: "hook-writer", inputs: gold("hook-writer").inputs });
    return t.engine.waitForRun(t.team.id, run.id);
  };
  return { ...t, stats, me: ada, hook };
}

describe("feedback on the run screen", () => {
  it("records each action once per run: a second use or regenerate changes nothing, a second edit or rating replaces the first", async () => {
    const t = await world();
    const run = await t.hook();
    expect(run.status).toBe("succeeded");

    // Use: three clicks at once and one later are one event.
    await Promise.all([1, 2, 3].map(() => t.api.giveFeedback(t.me, t.team.id, run.id, { action: "use", how: "copy" })));
    await t.api.giveFeedback(t.me, t.team.id, run.id, { action: "use", how: "copy_all" });
    let rows = await t.stats.feedback.find({ runId: run.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: `${run.id}:use`, action: "use", how: "copy", source: "app", by: t.ada.id, workspaceId: t.team.id, agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", version: run.agent.version });

    // Edit: the distance between the draft and what was kept; sent again, the latest wins and the first time stays.
    const draft = copyAll(run.output!);
    const first = await t.api.giveFeedback(t.me, t.team.id, run.id, { action: "edit", text: `${draft}\nOne line of my own.` });
    expect(first.edited!.distance).toBeGreaterThan(0);
    const editRow = (await t.stats.feedback.get(`${run.id}:edit`))!;
    const again = await t.api.giveFeedback(t.me, t.team.id, run.id, { action: "edit", text: "Completely my own words now, nothing of the draft." });
    expect(again.edited!.distance).toBeGreaterThan(first.edited!.distance);
    const edited = (await t.stats.feedback.get(`${run.id}:edit`))!;
    expect(edited.at).toBe(editRow.at);
    expect(edited.updatedAt >= editRow.updatedAt).toBe(true);
    expect(edited).toMatchObject({ draftChars: draft.length, kept: null });

    // Rating: up, then down with a note; one row.
    await t.api.giveFeedback(t.me, t.team.id, run.id, { action: "rating", rating: "up" });
    const rated = await t.api.giveFeedback(t.me, t.team.id, run.id, { action: "rating", rating: "down", note: "  Too   salesy for us.  " });
    expect(rated).toMatchObject({ rating: "down", note: "Too salesy for us." });
    rows = await t.stats.feedback.find({ runId: run.id });
    expect(rows.map((r) => r.action).sort()).toEqual(["edit", "rating", "use"]);

    // The run screen reads the state back.
    expect((await t.api.run(t.me, t.team.id, run.id))!.feedback).toMatchObject({ used: true, regenerated: false, rating: "down" });
  });

  it("an edit that changes nothing is a use, and Try again is a regenerate on the result it replaces", async () => {
    const t = await world();
    const run = await t.hook();
    const state = await t.api.giveFeedback(t.me, t.team.id, run.id, { action: "edit", text: `  ${copyAll(run.output!)}  ` });
    expect(state).toMatchObject({ used: true, edited: null });
    expect((await t.stats.feedback.get(`${run.id}:use`))!.how).toBe("kept_edit");

    const next = await t.api.regenerate(t.me, t.team.id, run.id);
    expect(next.id).not.toBe(run.id);
    expect(next.inputs).toEqual(run.inputs);
    await t.api.regenerate(t.me, t.team.id, run.id);
    const regs = await t.stats.feedback.find({ runId: run.id, action: "regenerate" });
    expect(regs).toHaveLength(1);
    expect(regs[0].how).toBe("regenerate");

    // A quick edit is a regenerate too.
    const other = await t.hook();
    await t.api.rerun(t.me, t.team.id, other.id, "shorter");
    expect((await t.stats.feedback.get(`${other.id}:regenerate`))!.how).toBe("quick_edit");
  });

  it("checks who may act and on what: viewers copy and rate, editors also edit and regenerate, nobody acts on another workspace's run or an unfinished one", async () => {
    const t = await world({ latencyMs: 150 });
    const viewer = as((await t.join("vi@example.com", "viewer")).id);
    const running = await t.api.startRun(t.me, t.team.id, { agentId: "hook-writer", inputs: gold("hook-writer").inputs });
    await rejectsCode(t.api.giveFeedback(t.me, t.team.id, running.id, { action: "use" }), "not_ready");
    const run = await t.engine.waitForRun(t.team.id, running.id);

    await t.api.giveFeedback(viewer, t.team.id, run.id, { action: "use" });
    await t.api.giveFeedback(viewer, t.team.id, run.id, { action: "rating", rating: "up" });
    await rejectsCode(t.api.giveFeedback(viewer, t.team.id, run.id, { action: "edit", text: "mine" }), "forbidden");
    await rejectsCode(t.api.giveFeedback(viewer, t.team.id, run.id, { action: "regenerate" }), "forbidden");
    await rejectsCode(t.api.giveFeedback(as(t.eve.id), t.team.id, run.id, { action: "use" }), "not_found");
    const evesWs = (await t.accounts.workspaces.create(as(t.eve.id), "Eve's")).id;
    await rejectsCode(t.api.giveFeedback(as(t.eve.id), evesWs, run.id, { action: "use" }), "not_found");
    await rejectsCode(t.api.giveFeedback(t.me, t.team.id, run.id, { action: "rating" }), "invalid_request");
    await rejectsCode(t.api.giveFeedback(t.me, t.team.id, run.id, { action: "edit", text: "x".repeat(20_001) }), "invalid_request");
    await rejectsCode(t.api.giveFeedback(t.me, t.team.id, run.id, { action: "nope" as never }), "invalid_request");
  });
});

describe("consent (phase 18)", () => {
  it("keeps edit text only from people who allow it, and shows builders only that; the counts include everyone", async () => {
    const allow = new Map<string, boolean>();
    const t = await world({ mayLearnFrom: async (id) => allow.get(id) === true });
    const ed = as((await t.join("ed@example.com", "editor")).id);
    allow.set(t.ada.id, true);
    const a = await t.hook();
    const b = await t.hook(ed);
    await t.api.giveFeedback(t.me, t.team.id, a.id, { action: "edit", text: "Ada kept her own line about Gerald." });
    await t.api.giveFeedback(ed, t.team.id, b.id, { action: "edit", text: "Ed kept his own line about Gerald." });
    await t.api.giveFeedback(t.me, t.team.id, a.id, { action: "rating", rating: "up", note: "Ada's note" });
    await t.api.giveFeedback(ed, t.team.id, b.id, { action: "rating", rating: "down", note: "Ed's note" });
    expect((await t.stats.feedback.get(`${a.id}:edit`))!.kept).toBe("Ada kept her own line about Gerald.");
    expect((await t.stats.feedback.get(`${b.id}:edit`))!.kept).toBeNull();
    expect((await t.stats.feedback.get(`${b.id}:edit`))!.distance).toBeGreaterThan(0);

    const service = new StatsService({ store: t.stats, runs: t.engine, mayLearnFrom: async (id) => allow.get(id) === true, requireBuilder: async () => undefined, min: 1 });
    const [v] = await service.versions(t.me, PLATFORM_WORKSPACE_ID, "hook-writer");
    expect(v.live.edited.count).toBe(2);
    expect(v.edits.map((e) => e.lines.map((l) => l.kept).filter(Boolean))).toEqual([["Ada kept her own line about Gerald."]]);
    expect(v.editsHidden).toBe(1);
    expect(v.notes.map((n) => n.note)).toEqual(["Ada's note"]);
    expect(v.notesHidden).toBe(1);

    // Turned off later: nothing of hers shows any more, and the numbers stay.
    allow.set(t.ada.id, false);
    const [after] = await service.versions(t.me, PLATFORM_WORKSPACE_ID, "hook-writer");
    expect(after.edits).toEqual([]);
    expect(after.editsHidden).toBe(2);
    expect(after.live.edited.count).toBe(2);
  });

  it("the builder's numbers per version are builders only", async () => {
    const t = await world();
    const service = new StatsService({ store: t.stats, runs: t.engine, requireBuilder: async () => {
      throw Object.assign(new Error("Not found."), { code: "not_found" });
    } });
    await rejectsCode(service.versions(t.me, PLATFORM_WORKSPACE_ID, "hook-writer"), "not_found");
  });
});

describe("decisions as feedback", () => {
  it("an approval in review is a use, a change request a regenerate, a rejection nothing", async () => {
    const t = await world();
    const [a, b, c] = [await t.hook(), await t.hook(), await t.hook()];
    await t.teamReview.decide(t.me, t.team.id, a.id, "approve");
    await t.teamReview.decide(t.me, t.team.id, b.id, "request_changes", "Make it shorter.");
    await t.teamReview.decide(t.me, t.team.id, c.id, "reject");
    expect(await t.stats.feedback.get(`${a.id}:use`)).toMatchObject({ source: "review", how: "approve", by: t.ada.id });
    expect(await t.stats.feedback.get(`${b.id}:regenerate`)).toMatchObject({ source: "review", how: "changes_asked" });
    expect(await t.stats.feedback.find({ runId: c.id })).toEqual([]);

    // The phase 9 approve button goes through the same rules, so it counts the same.
    const d = await t.hook();
    await t.api.review(t.me, t.team.id, d.id, "approved");
    expect(await t.stats.feedback.get(`${d.id}:use`)).toMatchObject({ how: "approve" });

    // A client link's yes counts, marked as from the client.
    const e = await t.hook();
    await feedbackForDecision(t.feedback!, { workspaceId: t.team.id, kind: "run", id: e.id, outcome: "approved", by: "link:lnk_1", via: "client" });
    expect(await t.stats.feedback.get(`${e.id}:use`)).toMatchObject({ source: "client", by: "link:lnk_1" });
    // A first yes that waits for a second is not yet a use.
    const f = await t.hook();
    expect(await feedbackForDecision(t.feedback!, { workspaceId: t.team.id, kind: "run", id: f.id, outcome: "approval_added", by: t.ada.id, via: "member" })).toEqual([]);
  });

  it("a pick in a pipeline uses that step's run, and approving the package uses every step run it used", async () => {
    const t = await world();
    await t.seedTeamBrains();
    const crumb = (await t.brandStore.brains.find({ workspaceId: t.team.id, name: "Crumb and Co" }))[0];
    const started = await t.api.startPipeline(t.me, t.team.id, { pipelineId: "idea-to-post", inputs: { start: "my_idea", idea: "Gerald the sourdough starter turns nine on Saturday and gets his own cake", platform: "tiktok", length: "s30", brand: crumb.id } });
    let pr = await t.pipelineEngine.waitUntilSettled(t.team.id, started.id);
    expect(pr.status).toBe("waiting");
    await t.api.pickInPipeline(t.me, t.team.id, pr.id, "hooks", 2);
    const hookRun = pr.steps.find((s) => s.id === "hooks")!.runId!;
    expect(await t.stats.feedback.get(`${hookRun}:use`)).toMatchObject({ source: "pipeline", how: "pick" });
    pr = await t.pipelineEngine.waitUntilSettled(t.team.id, pr.id);
    expect(pr.status).toBe("ready");

    // Copying one part of the package.
    await t.api.pipelinePartUsed(t.me, t.team.id, pr.id, "caption");
    const captionRun = pr.steps.find((s) => s.id === "caption")!.runId!;
    expect(await t.stats.feedback.get(`${captionRun}:use`)).toMatchObject({ how: "copy", source: "pipeline" });

    await t.api.decidePipeline(t.me, t.team.id, pr.id, "approved");
    const used = pr.steps.filter((s) => s.runId && (s.status === "done" || s.status === "flagged")).map((s) => s.runId!);
    expect(used.length).toBeGreaterThanOrEqual(4);
    for (const id of used) expect(await t.stats.feedback.get(`${id}:use`), id).not.toBeNull();
  });
});

describe("which runs count", () => {
  const base = (over: Partial<Run>): Run => ({ id: over.id ?? "r", workspaceId: "ws_customer", agent: { workspaceId: PLATFORM_WORKSPACE_ID, id: "hook-writer", version: "1.0.0" }, credits: null, parent: null, ...over }) as Run;
  const ctx = { excluded: new Set(["ws_test"]), builders: new Set(["usr_funkai"]), makers: new Map<string, string | null>([["by_builder", "usr_funkai"], ["pr_1", "usr_funkai"]]) };

  it("only real people's runs: never the agent's own workspace, a builder's runs, a test workspace or a free bench run", () => {
    expect(countsForStats(base({}), ctx)).toBe(true);
    expect(countsForStats(base({ workspaceId: PLATFORM_WORKSPACE_ID }), ctx)).toBe(false);
    expect(countsForStats(base({ workspaceId: "ws_test" }), ctx)).toBe(false);
    expect(countsForStats(base({ credits: { mode: "free" } as Run["credits"] }), ctx)).toBe(false);
    expect(countsForStats(base({ credits: { mode: "own", userId: "usr_funkai" } as Run["credits"] }), ctx)).toBe(false);
    expect(countsForStats(base({ id: "by_builder" }), ctx)).toBe(false);
    expect(countsForStats(base({ id: "step", parent: { pipelineRunId: "pr_1", step: 0 } }), ctx)).toBe(false);
    expect(countsForStats(base({ credits: { mode: "own", userId: "usr_maya" } as Run["credits"] }), ctx)).toBe(true);
  });

  it("public numbers leave out everything that does not count", async () => {
    const t = await world();
    const run = await t.hook();
    await t.api.giveFeedback(t.me, t.team.id, run.id, { action: "use" });
    const service = (excluded: string[]) => new StatsService({ store: t.stats, runs: t.engine, excludedWorkspaces: excluded, requireBuilder: async () => undefined, min: 1 });
    expect((await service([]).agentStats(PLATFORM_WORKSPACE_ID, "hook-writer")).acceptance).toMatchObject({ count: 1, n: 1 });
    expect((await service([t.team.id]).agentStats(PLATFORM_WORKSPACE_ID, "hook-writer")).runs).toBe(0);
    const builders = new StatsService({ store: t.stats, runs: t.engine, builders: async () => new Set([t.ada.id]), makers: async () => new Map((await t.teamStore.items.find({})).map((i) => [i.id, i.makerId])), requireBuilder: async () => undefined, min: 1 });
    expect((await builders.agentStats(PLATFORM_WORKSPACE_ID, "hook-writer")).runs).toBe(0);
  });
});

describe("feedback over the REST API and MCP", () => {
  it("POST /runs/{id}/feedback records like the app, checks the body and the key's role", async () => {
    const stats = memoryStatsStore();
    const t = await testApi({ stats });
    await t.topUp(1000);
    const key = await t.key("editor");
    const started = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: gold("hook-writer").inputs } });
    expect(started.status).toBe(202);
    await t.engine.waitForRun(t.ws, started.json.id);

    const used = await t.call("POST", `/runs/${started.json.id}/feedback`, { key, body: { action: "use" } });
    expect(used.status).toBe(200);
    expect(used.json).toMatchObject({ used: true, edited: null, regenerated: false, rating: null });
    expect(await stats.feedback.get(`${started.json.id}:use`)).toMatchObject({ source: "api", how: "api", by: expect.stringMatching(/^key:/) });

    expect((await t.call("POST", `/runs/${started.json.id}/feedback`, { key, body: { action: "edit" } })).status).toBe(422);
    expect((await t.call("POST", `/runs/${started.json.id}/feedback`, { key, body: { action: "rating", rating: "sideways" } })).status).toBe(422);
    const rated = await t.call("POST", `/runs/${started.json.id}/feedback`, { key, body: { action: "rating", rating: "up", note: "Good." } });
    expect(rated.json).toMatchObject({ rating: "up", note: "Good." });
    const viewer = await t.key("viewer");
    expect((await t.call("POST", `/runs/${started.json.id}/feedback`, { key: viewer, body: { action: "regenerate" } })).status).toBe(403);
    expect((await t.call("POST", `/runs/run_nope/feedback`, { key, body: { action: "use" } })).status).toBe(404);

    // MCP's give_feedback goes through the same call, marked as from MCP.
    const caller = (await t.accounts.apiKeys.authenticate(key))!;
    const state = await t.api.feedback(caller as never, started.json.id, { action: "edit", text: "My own hook about Gerald." }, "mcp");
    expect(state.edited!.distance).toBeGreaterThan(0);
    expect(await stats.feedback.get(`${started.json.id}:edit`)).toMatchObject({ source: "mcp" });
  });
});
