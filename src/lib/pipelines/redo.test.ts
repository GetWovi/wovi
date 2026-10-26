/**
 * "Try again" on one part of a finished package (product doc, section 7: the
 * run screen's Regenerate, on each part of a pipeline's package): that step
 * runs once more with the same inputs, through the same queue, inside the
 * run's cap and with its own credit hold; the steps after it keep what they
 * made; a try that does not land puts the step back as it was. Edits and
 * ratings on a part go on the step run it came from.
 */
import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { copyAll, editItem, pickedPlace } from "@/lib/app/results";
import { as, testApp } from "@/lib/app/test-helpers";
import { defaultAnswer } from "@/lib/runs/providers/fake";
import { ProviderError, type CompletionRequest } from "@/lib/runs/providers/types";
import { memoryStatsStore } from "@/lib/stats/store";

const IDEA = "Gerald the sourdough starter turns nine on Saturday and gets his own cake";
const CLIP = "Gerald the starter turns nine, with a candle on the jar";

function agentOf(req: CompletionRequest): string {
  const text = req.messages.map((m) => m.content).join("\n");
  if (text.includes("You write opening lines")) return "hook-writer";
  if (text.includes("You write short vertical video scripts")) return "script-writer";
  if (text.includes("You write captions for one small business")) return "caption-writer";
  if (text.includes("You help one post get found")) return "hashtag-picker";
  return "unknown";
}

async function bakery(opts: Parameters<typeof testApp>[0] = {}) {
  const stats = memoryStatsStore();
  const t = await testApp({ stats, ...opts });
  await t.seedTeamBrains();
  const crumb = (await t.brandStore.brains.find({ workspaceId: t.team.id, name: "Crumb and Co" }))[0];
  const me = as(t.ada.id);
  const ws = t.team.id;
  const settle = (id: string) => t.pipelineEngine.waitUntilSettled(ws, id);
  /** "Idea to ready post" through the hook pick to the package. */
  const ready = async () => {
    const started = await t.api.startPipeline(me, ws, { pipelineId: "idea-to-post", inputs: { start: "my_idea", idea: IDEA, platform: "tiktok", length: "s30", brand: crumb.id } });
    await settle(started.id);
    await t.api.pickInPipeline(me, ws, started.id, "hooks", 2);
    return settle(started.id);
  };
  return { ...t, stats, crumb, me, ws, settle, ready };
}

describe("try again on one part of a package", () => {
  it("runs just that step again with the same inputs; the steps after it keep what they made", async () => {
    let round = 0;
    const t = await bakery({
      fake: {
        respond: (req) => {
          if (agentOf(req) !== "caption-writer") return undefined;
          round += 1;
          return JSON.stringify({ captions: [{ platform: "tiktok", variants: [`Gerald turns nine on Saturday, take ${round}. Come and see the cake.`, `The starter is called Gerald, take ${round}. Gerald is nine on Saturday.`] }] });
        },
      },
    });
    const before = await t.ready();
    expect(before.status).toBe("ready");
    const caption = before.steps[3];
    const tags = before.steps[4];
    expect(before.package!.find((p) => p.step === "caption")!.item!.text).toContain("take 1");
    expect(caption.picked?.by).toBe("brand_fit");

    const going = await t.api.redoPipelineStep(t.me, t.ws, before.id, "caption");
    expect(going.status).toBe("running");
    expect(going.steps[3].status).toBe("todo");
    const after = await t.settle(before.id);

    expect(after.status).toBe("ready");
    const again = after.steps[3];
    // A new run with exactly the inputs the step had, under its own key.
    expect(again.runId).not.toBe(caption.runId);
    expect(again.runIds).toEqual([...caption.runIds, again.runId]);
    const run = (await t.engine.getRun(t.ws, again.runId!))!;
    expect(run.inputs).toEqual((await t.engine.getRun(t.ws, caption.runId!))!.inputs);
    expect(run.parent).toEqual({ pipelineRunId: before.id, step: 3 });
    expect(run.idempotencyKey).toBe(`${before.id}.caption.again1.0`);
    expect(run.brandBrain?.id).toBe(t.crumb.id);
    // The package has the new caption; the tags made from the first caption stay as they were.
    expect(after.package!.find((p) => p.step === "caption")!.item!.text).toContain("take 2");
    expect(after.steps[4]).toMatchObject({ runId: tags.runId, runIds: tags.runIds, output: tags.output });
    expect(after.steps.slice(0, 3).map((s) => s.runIds)).toEqual(before.steps.slice(0, 3).map((s) => s.runIds));
    // Its cost is counted, inside the run's cap.
    expect(after.costMicroUsd).toBeGreaterThan(before.costMicroUsd);
    expect(after.costMicroUsd).toBeLessThanOrEqual(after.capMicroUsd);
    // The result it replaced counts a regenerate, from the pipeline.
    const rows = await t.feedback!.forRun(t.ws, caption.runId!);
    expect(rows.find((r) => r.action === "regenerate")).toMatchObject({ source: "pipeline", how: "regenerate" });
    // The public view never carries the earlier state.
    expect(after.steps[3].redo).toEqual({ count: 1, before: null });
    expect(JSON.stringify((await t.api.pipelineRun(t.me, t.ws, before.id))!.run.steps)).not.toContain('"redo"');
  });

  it("asks for the pick again when the step asks the person, then goes back to the package", async () => {
    const t = await bakery();
    const before = await t.ready();
    await t.api.redoPipelineStep(t.me, t.ws, before.id, "hooks");
    const waiting = await t.settle(before.id);
    expect(waiting.status).toBe("waiting");
    expect(waiting.steps[1].status).toBe("waiting");
    expect(waiting.steps[1].candidates.length).toBeGreaterThan(1);
    await t.api.pickInPipeline(t.me, t.ws, before.id, "hooks", 4);
    const after = await t.settle(before.id);
    expect(after.status).toBe("ready");
    expect(after.steps[1].picked).toMatchObject({ index: 4, by: "person" });
    expect(after.package!.find((p) => p.step === "hooks")!.item!.text).toBe(after.steps[1].candidates[4].text);
    // The script written from the first hook is kept.
    expect(after.steps[2].runIds).toEqual(before.steps[2].runIds);
  });

  it("puts the step back as it was when the new try fails or is stopped", async () => {
    let broken = false;
    const t = await bakery({ fake: { respond: (req) => (broken && agentOf(req) === "hashtag-picker" ? new ProviderError("unavailable", "Down for a moment.") : undefined) }, engine: { maxAttempts: 1 } });
    const before = await t.ready();
    broken = true;
    await t.api.redoPipelineStep(t.me, t.ws, before.id, "tags");
    const after = await t.settle(before.id);
    // Tried twice like any step, then back to the package as it was: the run never fails over a try again.
    expect(after.status).toBe("ready");
    expect(after.steps[4].runIds).toHaveLength(before.steps[4].runIds.length + 2);
    expect(after.steps[4]).toMatchObject({ status: before.steps[4].status, runId: before.steps[4].runId, output: before.steps[4].output });
    expect(after.steps[4].error?.message).toMatch(/did not finish/);
    expect(after.package).toEqual(before.package);

    // Stopped while it goes: the same.
    broken = false;
    const slow = await bakery({ fake: { latencyMs: 60 } });
    const done = await slow.ready();
    await slow.api.redoPipelineStep(slow.me, slow.ws, done.id, "script");
    const stopped = await slow.api.cancelPipeline(slow.me, slow.ws, done.id);
    expect(stopped.status).toBe("ready");
    await slow.pipelineEngine.idle();
    await slow.engine.idle();
    const back = (await slow.api.pipelineRun(slow.me, slow.ws, done.id))!.run;
    expect(back.status).toBe("ready");
    expect(back.steps[2]).toMatchObject({ status: done.steps[2].status, runId: done.steps[2].runId, error: null });
    expect(back.package).toEqual(done.package);
  });

  it("is only for a package that waits for its yes or no, by people who can run agents, inside the cap", async () => {
    const t = await bakery();
    const run = await t.ready();
    const vic = await t.join("vic@example.com", "viewer");
    await rejectsCode(t.api.redoPipelineStep(as(vic.id), t.ws, run.id, "caption"), "forbidden");
    await rejectsCode(t.api.redoPipelineStep(t.me, t.ws, run.id, "nope"), "not_found");
    // A skipped step has nothing to try again.
    await rejectsCode(t.api.redoPipelineStep(t.me, t.ws, run.id, "ideas"), "not_ready");
    await t.api.decidePipeline(t.me, t.ws, run.id, "approved", "");
    await rejectsCode(t.api.redoPipelineStep(t.me, t.ws, run.id, "caption"), "not_ready");

    // A run that used its whole cap cannot run a step again.
    const capped = await t.pipelines.submit(t.me, { workspaceId: t.ws, pipelineId: "caption-and-tags", pipelineWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: { post: CLIP, platform: "tiktok" }, maxCostUsd: 0.02 });
    await t.settle(capped.id);
    await t.api.pickInPipeline(t.me, t.ws, capped.id, "caption", 0);
    const full = await t.settle(capped.id);
    expect(full.status).toBe("ready");
    const stored = (await t.pipelineEngine.get(t.ws, capped.id))!;
    stored.costMicroUsd = stored.capMicroUsd;
    await t.pipelineStore.pipelineRuns.update(stored);
    const err = await rejectsCode(t.api.redoPipelineStep(t.me, t.ws, capped.id, "tags"), "invalid_request");
    expect(err.message).toMatch(/budget is used up/);
  });

  it("holds and charges credits for the new try like any step", async () => {
    const t = await bakery({ credits: true });
    await t.guardedCredits!.topUp(t.me, t.ws, 2500);
    const before = await t.ready();
    const charged = before.credits!.charged!;
    const balance = (await t.credits!.balance(t.ws)).available;
    await t.api.redoPipelineStep(t.me, t.ws, before.id, "caption");
    const after = await t.settle(before.id);
    expect(after.credits!.holdIds).toHaveLength(2);
    expect(after.credits!.state).toBe("settled");
    const run = (await t.engine.getRun(t.ws, after.steps[3].runId!))!;
    expect(run.credits).toMatchObject({ mode: "pipeline", holdId: after.credits!.holdId, state: "charged" });
    expect(after.credits!.charged).toBe(charged + run.credits!.charged!);
    expect((await t.credits!.balance(t.ws))).toMatchObject({ available: balance - run.credits!.charged!, held: 0 });
  });
});

describe("edit and rate one part of a package", () => {
  it("records an edit of the picked item and a rating on the step run the part came from", async () => {
    const t = await bakery();
    const run = await t.ready();
    const hooks = run.steps[1];
    const place = pickedPlace(hooks.output!, hooks.picked!.index)!;
    expect(place).toEqual({ block: 0, item: 2 });
    const kept = editItem(hooks.output!, place.block, place.item, { text: "Gerald is nine. He gets cake. You get bread." });
    const state = await t.api.pipelinePartFeedback(t.me, t.ws, run.id, "hooks", { action: "edit", text: copyAll(kept) });
    expect(state.edited!.distance).toBeGreaterThan(0);
    expect(state.edited!.distance).toBeLessThan(0.3);
    const rated = await t.api.pipelinePartFeedback(t.me, t.ws, run.id, "script", { action: "rating", rating: "up", note: "The ending is us" });
    expect(rated).toMatchObject({ rating: "up", note: "The ending is us" });

    const rows = await t.feedback!.forRun(t.ws, hooks.runId!);
    expect(rows.find((r) => r.action === "edit")).toMatchObject({ source: "pipeline", agentId: "hook-writer" });
    // The run page reads back what was done with each part.
    const view = (await t.api.pipelineRun(t.me, t.ws, run.id))!;
    expect(view.feedback!.hooks.edited).not.toBeNull();
    expect(view.feedback!.script.rating).toBe("up");
    expect(view.feedback!.caption).toMatchObject({ edited: null, rating: null });

    // Only edits and ratings go this way, and only by people who may.
    await rejectsCode(t.api.pipelinePartFeedback(t.me, t.ws, run.id, "hooks", { action: "regenerate" }), "invalid_request");
    await rejectsCode(t.api.pipelinePartFeedback(t.me, t.ws, run.id, "ideas", { action: "rating", rating: "up" }), "not_ready");
    const vic = await t.join("vic@example.com", "viewer");
    await rejectsCode(t.api.pipelinePartFeedback(as(vic.id), t.ws, run.id, "hooks", { action: "edit", text: "Mine" }), "forbidden");
    expect(await t.api.pipelinePartFeedback(as(vic.id), t.ws, run.id, "hooks", { action: "rating", rating: "down" })).toMatchObject({ rating: "down" });
  });

  it("keeps a script edit to one beat small: the rest of the script counts as unchanged", async () => {
    const t = await bakery({ fake: { respond: (req) => (agentOf(req) === "script-writer" ? defaultAnswer(req) : undefined) } });
    const run = await t.ready();
    const script = run.steps[2].output!;
    const kept = editItem(script, 0, 1, { spoken: "Gerald is nine. He has a candle." });
    const state = await t.api.pipelinePartFeedback(t.me, t.ws, run.id, "script", { action: "edit", text: copyAll(kept) });
    expect(state.edited!.distance).toBeGreaterThan(0);
    expect(state.edited!.distance).toBeLessThan(0.5);
  });
});
