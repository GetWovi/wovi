import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import type { AgentSpec } from "@/lib/agents/spec";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import type { CheckResult } from "@/lib/runs/guardrails";
import { checkForm, confirmationsFor, errorsByField, formFields, initialValues, primaryTextKey, toRunInputs, valuesFrom } from "./forms";
import { groupLineup, orderLineup } from "./lineup";
import { canReadPosts, cleanPatch, emptyOnboarding, nextStep, prevStep, progressLabel, reachableStep } from "./onboarding";
import { applyQuickEdit, splitNote } from "./quick-edits";
import { brandFitOf, copyAll, explainChecks, labelledLines, resultView, runState, runTitle } from "./results";
import { ONBOARDING_STEPS } from "./store";
import { POSTS, as, testApp } from "./test-helpers";

const launch = (id: string) => LAUNCH_AGENTS.find((a) => a.id === id)!;
const gold = (id: string) => LAUNCH_SAMPLES[id].find((s) => s.label === "gold")!;

/** A spec with one input of every type, for the form generator. */
const EVERY_INPUT: Pick<AgentSpec, "inputs" | "guardrails"> = {
  guardrails: ["rights_confirmed"],
  inputs: [
    { key: "idea", label: "Your idea", type: "long_text", required: true, limits: { minLength: 10, maxLength: 600 }, help: "What the post is about." },
    { key: "who", label: "Who it is for", type: "text", required: false, limits: { maxLength: 120 } },
    { key: "link", label: "A link", type: "url", required: false },
    { key: "count", label: "How many", type: "number", required: false, limits: { min: 1, max: 10, step: 1 }, default: 3 },
    { key: "platform", label: "Platform", type: "choice", required: true, multiple: false, options: [{ value: "x", label: "X" }, { value: "tiktok", label: "TikTok" }], default: "x" },
    { key: "to", label: "Make versions for", type: "choice", required: true, multiple: true, options: [{ value: "x", label: "X" }, { value: "reels", label: "Reels" }] },
    { key: "photo", label: "A photo", type: "image", required: false, limits: { maxSizeMb: 8, maxFiles: 2 } },
    { key: "clip", label: "The clip", type: "video", required: false, limits: { maxSizeMb: 500, maxFiles: 1, maxSeconds: 120 } },
    { key: "notes", label: "Notes file", type: "file", required: false, limits: { maxSizeMb: 2, maxFiles: 1, accept: [".txt", ".md"] } },
    { key: "brand", label: "Brand Brain", type: "profile", required: false },
  ],
};

describe("onboarding state", () => {
  it("walks the four steps of the doc in order, forwards and back", () => {
    expect(ONBOARDING_STEPS).toEqual(["welcome", "brand", "posts", "review"]);
    expect(nextStep("welcome")).toBe("brand");
    expect(nextStep("review")).toBeNull();
    expect(prevStep("brand")).toBe("welcome");
    expect(prevStep("welcome")).toBeNull();
    expect(progressLabel("posts")).toBe("Step 3 of 4");
  });

  it("needs 3 to 5 posts, none too long, before it reads them", () => {
    expect(canReadPosts(["", "", ""])).toEqual({ ok: false, reason: "Add 3 more posts to go on." });
    expect(canReadPosts(["a post", "another", ""])).toEqual({ ok: false, reason: "Add 1 more post to go on." });
    expect(canReadPosts(POSTS)).toEqual({ ok: true });
    expect(canReadPosts(["x".repeat(3001), "b", "c"]).ok).toBe(false);
  });

  it("cleans a patch to the Brand Brain's limits and drops what it does not know", () => {
    const p = cleanPatch({ step: "brand", name: "  Spoke   and Chain ", niche: "x".repeat(200), platforms: ["x", "fax", "reels"] as never, posts: ["one"] });
    expect(p.name).toBe("Spoke and Chain");
    expect(p.niche).toHaveLength(80);
    expect(p.platforms).toEqual(["x", "reels"]);
    expect(p.posts).toEqual(["one", "", ""]);
    expect(cleanPatch({ step: "nowhere" as never })).toEqual({});
  });

  it("never opens the review without a proposal", () => {
    expect(reachableStep(emptyOnboarding(), "review")).toBe("posts");
    expect(reachableStep({ ...emptyOnboarding(), proposalId: "prp_1" }, "review")).toBe("review");
  });
});

describe("onboarding through the API", () => {
  it("saves progress, reads the posts into a proposal, and lands with the first Brand Brain made and default", async () => {
    const { api, brands, ada, team } = await testApp();
    expect(await api.needsOnboarding(as(ada.id), team.id)).toBe(true);
    let s = await api.saveOnboarding(as(ada.id), team.id, { step: "brand", name: "Spoke and Chain", niche: "Bike repair shop in Bristol", platforms: ["x", "reels"] });
    expect(s).toMatchObject({ step: "brand", name: "Spoke and Chain", status: "open", proposalId: null });
    // Coming back later finds the same answers.
    expect((await api.onboarding(as(ada.id), team.id)).niche).toBe("Bike repair shop in Bristol");

    s = await api.saveOnboarding(as(ada.id), team.id, { step: "posts", posts: POSTS });
    // The review step needs a proposal first.
    expect((await api.saveOnboarding(as(ada.id), team.id, { step: "review" })).step).toBe("posts");

    const read = await api.readOnboardingPosts(as(ada.id), team.id);
    expect(read.state.step).toBe("review");
    expect(read.proposal.profile.voice.description).toContain("sentences");
    expect(read.proposal.posts).toHaveLength(4);
    expect((await api.onboardingProposal(as(ada.id), team.id))?.id).toBe(read.proposal.id);

    const done = await api.finishOnboarding(as(ada.id), team.id, { voice: { ...read.proposal.profile.voice, description: "Dry, quick, says it once." }, idea: "Fix it today, not someday." });
    expect(done.status).toBe("done");
    const list = await brands.list(as(ada.id), team.id);
    expect(list.map((b) => [b.name, b.isDefault, b.references])).toEqual([["Spoke and Chain", true, 4]]);
    const view = await brands.get(as(ada.id), team.id, done.brainId!);
    expect(view.body.voice.description).toBe("Dry, quick, says it once.");
    expect(view.body.idea).toBe("Fix it today, not someday.");
    expect(view.body.platforms).toEqual(["x", "reels"]);
    expect(await api.needsOnboarding(as(ada.id), team.id)).toBe(false);
  });

  it("new posts drop a stale proposal, and skipping or finishing without posts still lands", async () => {
    const { api, brands, ada, team } = await testApp();
    await api.saveOnboarding(as(ada.id), team.id, { name: "Spoke and Chain", posts: POSTS });
    await api.readOnboardingPosts(as(ada.id), team.id);
    const s = await api.saveOnboarding(as(ada.id), team.id, { posts: [...POSTS.slice(0, 3), "A brand new post."] });
    expect(s.proposalId).toBeNull();
    expect(s.step).toBe("review");

    const skipped = await api.skipOnboarding(as(ada.id), team.id);
    expect(skipped.status).toBe("skipped");
    expect(await api.needsOnboarding(as(ada.id), team.id)).toBe(false);
    expect(await brands.list(as(ada.id), team.id)).toEqual([]);

    await api.restartOnboarding(as(ada.id), team.id);
    expect((await api.onboarding(as(ada.id), team.id)).name).toBe("");
    await api.saveOnboarding(as(ada.id), team.id, { name: "Spoke and Chain", niche: "Bikes" });
    const done = await api.finishOnboarding(as(ada.id), team.id);
    expect(done.brainId).toMatch(/^bb_/);
    expect((await brands.list(as(ada.id), team.id)).map((b) => [b.name, b.niche, b.references])).toEqual([["Spoke and Chain", "Bikes", 0]]);
  });

  it("refuses to read fewer than three posts, and keeps outsiders out", async () => {
    const { api, ada, eve, team } = await testApp();
    await api.saveOnboarding(as(ada.id), team.id, { posts: ["only one post"] });
    await rejectsCode(api.readOnboardingPosts(as(ada.id), team.id), "invalid_request");
    await rejectsCode(api.onboarding(as(eve.id), team.id), "not_found");
    await rejectsCode(api.saveOnboarding(as(eve.id), team.id, { name: "Mine" }), "not_found");
    await rejectsCode(api.finishOnboarding(as(eve.id), team.id), "not_found");
  });
});

describe("the form from a spec", () => {
  it("makes one friendly field per input type, with help and limits in words", () => {
    const fields = formFields(EVERY_INPUT);
    expect(fields.map((f) => [f.key, f.kind, f.required])).toEqual([
      ["idea", "long_text", true],
      ["who", "text", false],
      ["link", "url", false],
      ["count", "number", false],
      ["platform", "choice", true],
      ["to", "choices", true],
      ["photo", "image", false],
      ["clip", "video", false],
      ["notes", "file", false],
    ]);
    const by = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(by.idea).toMatchObject({ help: "What the post is about.", limits: "10 to 600 characters", minLength: 10, maxLength: 600 });
    expect(by.who).toMatchObject({ help: "Up to 120 characters", maxLength: 120 });
    expect(by.link.placeholder).toBe("https://");
    expect(by.count).toMatchObject({ limits: "1 to 10, in steps of 1", min: 1, max: 10, step: 1 });
    expect(by.platform.options).toHaveLength(2);
    expect(by.to.limits).toBe("Pick one or more");
    expect(by.photo).toMatchObject({ accept: "image/png,image/jpeg,image/webp,image/gif", maxFiles: 2, limits: "Up to 2 images, 8 MB each" });
    expect(by.clip.limits).toBe("Up to 1 video, 500 MB each, 120 seconds at most");
    expect(by.notes).toMatchObject({ accept: ".txt,.md", limits: "Up to 1 file, 2 MB each, .txt, .md" });
    expect(fields.some((f) => f.key === "brand")).toBe(false);
  });

  it("starts from the spec's defaults, turns values into run inputs, and checks them with the engine's own rules", () => {
    const values = initialValues(EVERY_INPUT);
    expect(values).toEqual({ idea: "", who: "", link: "", count: "3", platform: "x", to: [], photo: [], clip: [], notes: [] });
    expect(toRunInputs(EVERY_INPUT, { ...values, idea: "A proper idea here", to: ["x"] }, "bb_1")).toEqual({ idea: "A proper idea here", count: 3, platform: "x", to: ["x"], brand: "bb_1" });

    const bad = checkForm(EVERY_INPUT, { ...values, idea: "short", to: [], link: "nope", count: "11" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.idea).toContain("at least 10");
      expect(bad.errors.to).toBe("Required.");
      expect(bad.errors.link).toContain("https://");
      expect(bad.errors.count).toContain("between 1 and 10");
    }
    const good = checkForm(EVERY_INPUT, { ...values, idea: "A proper idea here", to: ["x", "reels"], photo: [{ assetId: "fil_1", name: "a.png", mimeType: "image/png", sizeMb: 1 }] });
    expect(good.ok && good.inputs.photo).toEqual([{ assetId: "fil_1", name: "a.png", mimeType: "image/png", sizeMb: 1 }]);
    expect(errorsByField(["Inputs must be an object"]).form).toContain("object");
  });

  it("fills a form from a golden sample, knows the main text input and the confirmations to ask for", () => {
    const spec = launch("repurposer");
    const sample = gold("repurposer");
    const values = valuesFrom(spec as never, sample.inputs);
    expect(values.post).toBe(sample.inputs.post);
    expect(values.to).toEqual(sample.inputs.to);
    expect(primaryTextKey(spec as never)).toBe("post");
    expect(primaryTextKey(launch("hook-writer") as never)).toBe("idea");
    expect(confirmationsFor(spec as never)).toEqual({ rights: true, voice: false });
    expect(confirmationsFor(launch("hook-writer") as never)).toEqual({ rights: false, voice: false });
  });
});

describe("the lineup", () => {
  it("shows the doc's six live agents in order, Trend Scout as coming, and nothing hidden", async () => {
    const { api, ada, team } = await testApp();
    const lineup = await api.lineup(as(ada.id), team.id);
    expect(lineup.map((a) => [a.id, a.status])).toEqual([
      ["trend-scout", "coming"],
      ["idea-generator", "live"],
      ["hook-writer", "live"],
      ["script-writer", "live"],
      ["caption-writer", "live"],
      ["hashtag-picker", "live"],
      ["repurposer", "live"],
    ]);
    expect(lineup.find((a) => a.id === "hashtag-picker")?.name).toBe("Hashtag Optimizer");
    expect(lineup.find((a) => a.id === "repurposer")?.spec).not.toHaveProperty("instructions");
    expect(groupLineup(lineup).map((g) => [g.title, g.agents.map((a) => a.id)])).toEqual([
      ["Get ideas", ["idea-generator", "trend-scout"]],
      ["Write the post", ["hook-writer", "script-writer", "caption-writer"]],
      ["Make it travel", ["hashtag-picker", "repurposer"]],
    ]);
    expect(await api.agent(as(ada.id), team.id, "trend-scout")).toBeNull();
    expect((await api.agent(as(ada.id), team.id, "hook-writer"))?.agentWorkspaceId).toBe(PLATFORM_WORKSPACE_ID);
    expect(orderLineup([])).toHaveLength(1);
  });
});

describe("runs through the API on the fake provider", () => {
  it("starts a run with the workspace's default Brand Brain, waits, and reads it back ready", async () => {
    const t = await testApp();
    await t.seedTeamBrains();
    const sample = gold("hook-writer");
    const run = await t.api.startRun(as(t.ada.id), t.team.id, { agentId: "hook-writer", inputs: sample.inputs });
    expect(run.status).toBe("queued");
    await t.engine.waitForRun(t.team.id, run.id);
    const view = (await t.api.run(as(t.ada.id), t.team.id, run.id))!;
    expect(view.state).toBe("ready");
    expect(view.agent?.name).toBe("Hook Writer");
    expect(view.run.brandBrain?.name).toBe("Crumb and Co");
    expect(view.run.output?.kind).toBe("list");
    expect(view.note).toBeNull();
    expect(brandFitOf(view.run)).toBeTypeOf("number");
    expect(runTitle(view.run, launch("hook-writer") as never)).toContain("Margaret");
  });

  it("lists every field problem by key, and refuses a missing rights confirmation", async () => {
    const { api, ada, team } = await testApp();
    const err = await rejectsCode(api.startRun(as(ada.id), team.id, { agentId: "hook-writer", inputs: { idea: "short" } }), "invalid_request");
    expect(errorsByField((err as unknown as { issues: string[] }).issues)).toMatchObject({ idea: expect.stringContaining("at least 10"), platform: "Required." });
    const sample = gold("repurposer");
    await rejectsCode(api.startRun(as(ada.id), team.id, { agentId: "repurposer", inputs: sample.inputs }), "invalid_request");
    const ok = await api.startRun(as(ada.id), team.id, { agentId: "repurposer", inputs: sample.inputs, confirmations: { rights: true } });
    expect(ok.status).toBe("queued");
    await rejectsCode(api.startRun(as(ada.id), team.id, { agentId: "trend-scout", inputs: { niche: "bakery", platform: "x" } }), "not_found");
  });

  it("runs again with a quick edit's note on the main input, and the view shows the note", async () => {
    const t = await testApp();
    await t.seedTeamBrains();
    const first = await t.api.startRun(as(t.ada.id), t.team.id, { agentId: "hook-writer", inputs: gold("hook-writer").inputs });
    await t.engine.waitForRun(t.team.id, first.id);
    const again = await t.api.rerun(as(t.ada.id), t.team.id, first.id, "shorter");
    expect(again.id).not.toBe(first.id);
    expect(String(again.inputs.idea)).toContain("Note for this run: Make every line shorter.");
    expect(again.brandBrain?.id).toBe(first.brandBrain?.id);
    await t.engine.waitForRun(t.team.id, again.id);
    const view = (await t.api.run(as(t.ada.id), t.team.id, again.id))!;
    expect(view.note).toBe("Make every line shorter. Cut words, keep the point.");
    expect(runTitle(view.run, launch("hook-writer") as never)).not.toContain("Note for this run");
    // A second edit replaces the note rather than piling up.
    const third = await t.api.rerun(as(t.ada.id), t.team.id, again.id, "punchier");
    expect((String(third.inputs.idea).match(/Note for this run/g) ?? []).length).toBe(1);
    await rejectsCode(t.api.rerun(as(t.ada.id), t.team.id, first.id, "nothing"), "invalid_request");
  });

  it("marks a flagged run as needing review, and approve or reject with a note decides it", async () => {
    const t = await testApp({
      fake: {
        respond: (req) => (req.messages[1].content.includes("plumbing services") ? JSON.stringify({ items: Array.from({ length: 10 }, (_, i) => `Unlock your home's full potential ${i}`) }) : undefined),
      },
    });
    await t.seedTeamBrains();
    const ed = await t.join("ed@example.com", "editor");
    const run = await t.api.startRun(as(ed.id), t.team.id, { agentId: "hook-writer", inputs: { idea: "A video about our plumbing services, nothing more.", platform: "tiktok" } });
    await t.engine.waitForRun(t.team.id, run.id);
    let view = (await t.api.run(as(ed.id), t.team.id, run.id))!;
    expect(view.state).toBe("needs_review");
    const explained = explainChecks(view.run.checks);
    expect(explained[0].tone).toBe("fail");
    expect(explained.map((e) => e.title)).toContain("Uses filler phrases");
    expect(explained.find((e) => e.title === "Uses filler phrases")?.findings).toContain("unlock your");

    const decided = await t.api.review(as(ed.id), t.team.id, run.id, "rejected", "Too generic, run it again with the real job in it.");
    expect(decided).toMatchObject({ runId: run.id, decision: "rejected", by: ed.id });
    view = (await t.api.run(as(ed.id), t.team.id, run.id))!;
    expect(view.state).toBe("rejected");
    expect(view.review?.note).toBe("Too generic, run it again with the real job in it.");
    await t.api.review(as(t.ada.id), t.team.id, run.id, "approved");
    expect((await t.api.run(as(t.ada.id), t.team.id, run.id))!.state).toBe("approved");
    await t.api.clearReview(as(t.ada.id), t.team.id, run.id);
    expect((await t.api.run(as(t.ada.id), t.team.id, run.id))!.state).toBe("needs_review");
    await rejectsCode(t.api.review(as(t.ada.id), t.team.id, run.id, "maybe" as never), "invalid_request");
  });

  it("only finished runs can be decided", async () => {
    const t = await testApp({ fake: { latencyMs: 300 } });
    const run = await t.api.startRun(as(t.ada.id), t.team.id, { agentId: "hook-writer", inputs: gold("hook-writer").inputs });
    await rejectsCode(t.api.review(as(t.ada.id), t.team.id, run.id, "approved"), "not_ready");
    await t.api.cancelRun(as(t.ada.id), t.team.id, run.id);
    expect((await t.api.run(as(t.ada.id), t.team.id, run.id))!.state).toBe("cancelled");
  });

  it("searches and filters the history", async () => {
    const t = await testApp();
    await t.seedTeamBrains();
    const a = await t.api.startRun(as(t.ada.id), t.team.id, { agentId: "hook-writer", inputs: gold("hook-writer").inputs });
    const b = await t.api.startRun(as(t.ada.id), t.team.id, { agentId: "caption-writer", inputs: gold("caption-writer").inputs });
    await t.engine.waitForRun(t.team.id, a.id);
    await t.engine.waitForRun(t.team.id, b.id);
    await t.api.review(as(t.ada.id), t.team.id, b.id, "approved", "Good.");
    const all = await t.api.runs(as(t.ada.id), t.team.id);
    expect(all.map((v) => [v.run.id, v.state])).toEqual([
      [b.id, "approved"],
      [a.id, "ready"],
    ]);
    expect((await t.api.runs(as(t.ada.id), t.team.id, { state: "approved" })).map((v) => v.run.id)).toEqual([b.id]);
    expect((await t.api.runs(as(t.ada.id), t.team.id, { state: "open" })).map((v) => v.run.id)).toEqual([a.id]);
    expect((await t.api.runs(as(t.ada.id), t.team.id, { q: "margaret" })).map((v) => v.run.id)).toEqual([a.id]);
    expect((await t.api.runs(as(t.ada.id), t.team.id, { q: "caption writer" })).map((v) => v.run.id)).toEqual([b.id]);
    expect((await t.api.runs(as(t.ada.id), t.team.id, { agentId: "hook-writer" })).map((v) => v.run.id)).toEqual([a.id]);
    expect(await t.api.openCount(as(t.ada.id), t.team.id)).toBe(1);
  });

  it("lets viewers look but not run or decide, and gives outsiders nothing", async () => {
    const t = await testApp();
    const vi = await t.join("vi@example.com", "viewer");
    const run = await t.api.startRun(as(t.ada.id), t.team.id, { agentId: "hook-writer", inputs: gold("hook-writer").inputs });
    await t.engine.waitForRun(t.team.id, run.id);
    expect((await t.api.run(as(vi.id), t.team.id, run.id))?.state).toBe("ready");
    expect((await t.api.lineup(as(vi.id), t.team.id)).length).toBe(7);
    await rejectsCode(t.api.startRun(as(vi.id), t.team.id, { agentId: "hook-writer", inputs: gold("hook-writer").inputs }), "forbidden");
    await rejectsCode(t.api.review(as(vi.id), t.team.id, run.id, "approved"), "forbidden");
    await rejectsCode(t.api.rerun(as(vi.id), t.team.id, run.id, "shorter"), "forbidden");

    await rejectsCode(t.api.run(as(t.eve.id), t.team.id, run.id), "not_found");
    await rejectsCode(t.api.runs(as(t.eve.id), t.team.id), "not_found");
    await rejectsCode(t.api.lineup(as(t.eve.id), t.team.id), "not_found");
    await rejectsCode(t.api.review(as(t.eve.id), t.team.id, run.id, "approved"), "not_found");
    // Her own workspace never sees the team's run either.
    expect(await t.api.run(as(t.eve.id), t.eve.personalWorkspaceId, run.id)).toBeNull();
  });
});

describe("results per output kind", () => {
  it("lays out hooks as lines, ideas and tags as cards, a script as beats, and captions per platform", () => {
    const hooks = resultView({ kind: "list", items: ["One line", "Two lines"] });
    expect(hooks).toMatchObject({ layout: "lines", count: 2 });
    expect(hooks.blocks[0].items[1]).toEqual({ label: "2", text: "Two lines", fields: [] });
    expect(copyAll({ kind: "list", items: ["One line", "Two lines"] })).toBe("1. One line\n\n2. Two lines");

    const tags = resultView({ kind: "list", items: [{ type: "hashtag", term: "#SourdoughStarter", where: "End of the caption", why: "Names the subject" }] });
    expect(tags.layout).toBe("cards");
    expect(tags.blocks[0].items[0]).toMatchObject({ text: "#SourdoughStarter", meta: "hashtag", fields: [{ label: "Type", value: "hashtag" }, { label: "Term", value: "#SourdoughStarter" }, { label: "Where it goes", value: "End of the caption" }, { label: "Why", value: "Names the subject" }] });

    const script = resultView({ kind: "script", sections: [{ section: "hook", spoken: "Three days.", on_screen: "A croissant", seconds: 3 }] });
    expect(script.layout).toBe("beats");
    expect(script.blocks[0].items[0]).toMatchObject({ label: "Hook", meta: "3 s", fields: [{ label: "Say", value: "Three days." }, { label: "On screen", value: "A croissant" }] });

    const captions = resultView({ kind: "caption_set", captions: [{ platform: "x", variants: ["A", "B"] }, { platform: "reels", variants: ["Hook: Go.\nScript: Lines.\nOn screen: Hands.\nCaption: The caption."] }] });
    expect(captions.layout).toBe("platforms");
    expect(captions.blocks.map((b) => [b.title, b.items.length])).toEqual([["X", 2], ["Instagram Reels", 1]]);
    expect(captions.blocks[1].items[0].fields.map((f) => f.label)).toEqual(["Hook", "Script", "On screen", "Caption"]);
    expect(labelledLines("Just a caption")).toBeNull();

    const posts = resultView({ kind: "post_set", posts: [{ format: "thread", parts: ["1", "2"] }, { format: "short", parts: ["a"] }, { format: "short", parts: ["b"] }] });
    expect(posts.blocks.map((b) => b.title)).toEqual(["Thread", "Short 1", "Short 2"]);
    expect(resultView({ kind: "text", text: "Hello" }).count).toBe(1);
  });

  it("explains flagged checks in plain words and reads the brand fit", () => {
    const checks: CheckResult[] = [
      { guardrail: "banned_phrases", check: "anti_slop_phrases", status: "fail", message: "Found generic filler phrases.", findings: ["unlock your"] },
      { guardrail: "brand_voice_check", check: "brand_fit", status: "note", message: "Brand fit 61.", score: 61, findings: ['Closest sample line: "x"'] },
      { guardrail: "ai_disclosure", check: "ai_label", status: "note", message: "Label it." },
      { guardrail: "specificity_check", check: "specific_to_input", status: "pass", message: "Fine." },
    ];
    const out = explainChecks(checks);
    expect(out.map((e) => [e.title, e.tone])).toEqual([
      ["Uses filler phrases", "fail"],
      ["Reads a little unlike your voice", "note"],
      ["Label it as AI where the platform asks", "note"],
    ]);
    expect(brandFitOf({ checks })).toBe(61);
    expect(brandFitOf({ checks: [] })).toBeNull();
    expect(runState({ status: "succeeded", needsReview: true }, null)).toBe("needs_review");
    expect(runState({ status: "succeeded", needsReview: true }, { decision: "approved" })).toBe("approved");
    expect(runState({ status: "running", needsReview: false }, null)).toBe("running");
  });

  it("puts a quick edit's note on the main input inside its limit, once", () => {
    const spec = launch("hook-writer") as never;
    const long = "x".repeat(600);
    const r = applyQuickEdit(spec, { idea: long, platform: "x" }, "brand")!;
    expect((r.inputs.idea as string).length).toBeLessThanOrEqual(600);
    expect(r.inputs.idea).toContain("Note for this run: Stay closer to my Brand Brain");
    expect(splitNote(r.inputs.idea as string).note).toBe(r.note);
    expect(applyQuickEdit(spec, { idea: "a" }, "nope")).toBeNull();
  });
});
