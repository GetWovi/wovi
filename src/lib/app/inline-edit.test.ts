/**
 * Every result editable inline (product doc, section 7): one item at a time,
 * in place, saved through the run's existing edit (the edit distance, the
 * consent rule, the live stats). And an idea from Idea Generator chained into
 * "Idea to ready post" with the idea filled in.
 */
import { describe, expect, it } from "vitest";
import { PIPELINE_TEMPLATES } from "@/lib/pipelines/templates";
import { outputItems } from "@/lib/pipelines/values";
import type { PipelineSpec } from "@/lib/pipelines/spec";
import type { RunOutput } from "@/lib/runs/output";
import { memoryStatsStore } from "@/lib/stats/store";
import { ideaToPostHref, prefillFrom } from "./pipelines";
import { copyAll, editFields, editItem, itemText, pickedPlace, resultView } from "./results";
import { as, testApp } from "./test-helpers";

const IDEAS: RunOutput = {
  kind: "list",
  items: [
    { idea: "Gerald the starter turns nine on Saturday", format: "Talking to camera", why_it_fits: "Regulars know Gerald." },
    { idea: "The 5 a.m. shift in 30 seconds", format: "Step-by-step demo", why_it_fits: "Shows the work." },
  ],
};
const HOOKS: RunOutput = { kind: "list", items: ["Gerald is nine.", "Nobody wakes up at 5 for fun.", "One loaf, four hours."] };
const SCRIPT: RunOutput = {
  kind: "script",
  sections: [
    { section: "hook", spoken: "Gerald is nine.", on_screen: "The jar with a candle", seconds: 3 },
    { section: "setup", spoken: "He has fed every loaf since 2017.", on_screen: "Hands feeding the starter", seconds: 8 },
  ],
};
const CAPTIONS: RunOutput = {
  kind: "caption_set",
  captions: [
    { platform: "tiktok", variants: ["Gerald turns nine on Saturday.", "Cake for a starter? Yes."] },
    { platform: "x", variants: ["Hook: Gerald is nine\nCaption: Cake on Saturday", "Nine years of bread."] },
  ],
};
const POSTS: RunOutput = { kind: "post_set", posts: [{ format: "thread", parts: ["One.", "Two."] }] };

describe("editing one item in place", () => {
  it("gives each kind of item its own boxes: a line, each field of an idea, a beat's lines, a caption or its labelled parts", () => {
    expect(editFields(HOOKS, 0, 1)).toEqual([{ key: "text", label: "Your version", value: "Nobody wakes up at 5 for fun." }]);
    expect(editFields(IDEAS, 0, 0).map((f) => f.label)).toEqual(["Idea", "Format", "Why it fits"]);
    expect(editFields(SCRIPT, 0, 1)).toEqual([
      { key: "spoken", label: "Say", value: "He has fed every loaf since 2017." },
      { key: "on_screen", label: "On screen", value: "Hands feeding the starter" },
    ]);
    expect(editFields(CAPTIONS, 0, 1)).toEqual([{ key: "text", label: "Your version", value: "Cake for a starter? Yes." }]);
    expect(editFields(CAPTIONS, 1, 0).map((f) => [f.label, f.value])).toEqual([
      ["Hook", "Gerald is nine"],
      ["Caption", "Cake on Saturday"],
    ]);
    expect(editFields(POSTS, 0, 1)[0].value).toBe("Two.");
    expect(editFields({ kind: "text", text: "Hi" }, 0, 0)[0].value).toBe("Hi");
    // Out of range: nothing to edit.
    expect(editFields(HOOKS, 0, 9)).toEqual([]);
    expect(editFields(CAPTIONS, 5, 0)).toEqual([]);
  });

  it("changes only that item and keeps the output's shape, so the rest of the result counts as unchanged", () => {
    const hooks = editItem(HOOKS, 0, 1, { text: "  Nobody bakes at 5 for fun.  " });
    expect(hooks).toEqual({ kind: "list", items: ["Gerald is nine.", "Nobody bakes at 5 for fun.", "One loaf, four hours."] });
    // The original is left alone.
    expect((HOOKS as { items: string[] }).items[1]).toBe("Nobody wakes up at 5 for fun.");

    const ideas = editItem(IDEAS, 0, 1, { format: "Voiceover over footage" });
    expect((ideas as { items: Record<string, string>[] }).items[1]).toEqual({ idea: "The 5 a.m. shift in 30 seconds", format: "Voiceover over footage", why_it_fits: "Shows the work." });
    expect((ideas as { items: Record<string, string>[] }).items[0]).toEqual((IDEAS as { items: Record<string, string>[] }).items[0]);

    const script = editItem(SCRIPT, 0, 0, { spoken: "Gerald is nine today." });
    expect(script.kind === "script" && script.sections[0]).toEqual({ section: "hook", spoken: "Gerald is nine today.", on_screen: "The jar with a candle", seconds: 3 });

    const labelled = editItem(CAPTIONS, 1, 0, { part1: "Cake on Saturday at 10" });
    expect(labelled.kind === "caption_set" && labelled.captions[1].variants[0]).toBe("Hook: Gerald is nine\nCaption: Cake on Saturday at 10");
    expect(editItem(CAPTIONS, 0, 0, {})).toEqual(CAPTIONS);

    expect(editItem(POSTS, 0, 0, { text: "Uno." })).toEqual({ kind: "post_set", posts: [{ format: "thread", parts: ["Uno.", "Two."] }] });
    // Whole-result text changes only where the item was.
    expect(copyAll(editItem(SCRIPT, 0, 1, { spoken: "Since 2017." }))).toBe(copyAll(SCRIPT).replace("He has fed every loaf since 2017.", "Since 2017."));
  });

  it("copies one item the way its card does, and finds a pipeline's picked item in the result", () => {
    expect(itemText(resultView(IDEAS), 0, 0)).toBe("Idea: Gerald the starter turns nine on Saturday\nFormat: Talking to camera\nWhy it fits: Regulars know Gerald.");
    expect(itemText(resultView(HOOKS), 0, 2)).toBe("One loaf, four hours.");
    expect(itemText(resultView(SCRIPT), 0, 1)).toBe("Say: He has fed every loaf since 2017.\nOn screen: Hands feeding the starter");
    expect(itemText(resultView(CAPTIONS), 1, 1)).toBe("Nine years of bread.");

    // The step's items in order (outputItems) map onto the result's blocks.
    expect(pickedPlace(CAPTIONS, 3)).toEqual({ block: 1, item: 1 });
    expect(outputItems(CAPTIONS)[3].text).toBe(itemText(resultView(CAPTIONS), 1, 1));
    expect(pickedPlace(HOOKS, 2)).toEqual({ block: 0, item: 2 });
    expect(pickedPlace(HOOKS, 3)).toBeNull();
    expect(pickedPlace(CAPTIONS, 4)).toBeNull();
    expect(pickedPlace(SCRIPT, 0)).toBeNull();
  });

  it("saves one changed item through the run's edit: a small distance, the stats, and the kept text only with consent", async () => {
    const stats = memoryStatsStore();
    const t = await testApp({ stats, mayLearnFrom: async () => true });
    const me = as(t.ada.id);
    const started = await t.api.startRun(me, t.team.id, { agentId: "idea-generator", inputs: { topic: "Our sourdough starter Gerald turns nine", goal: "trust", platform: "tiktok" } });
    const run = await t.engine.waitForRun(t.team.id, started.id);
    expect(run.status).toBe("succeeded");
    const one = editItem(run.output!, 0, 3, { idea: "Gerald blows out a candle on Saturday at 10" });
    const state = await t.api.giveFeedback(me, t.team.id, run.id, { action: "edit", text: copyAll(one) });
    expect(state.edited!.distance).toBeGreaterThan(0);
    expect(state.edited!.distance).toBeLessThan(0.2);
    // A second item later: the whole version so far replaces the first edit.
    const two = editItem(one, 0, 5, { format: "Voiceover over footage" });
    const again = await t.api.giveFeedback(me, t.team.id, run.id, { action: "edit", text: copyAll(two) });
    expect(again.edited!.distance).toBeGreaterThan(state.edited!.distance);
    const rows = (await t.feedback!.forRun(t.team.id, run.id)).filter((r) => r.action === "edit");
    expect(rows).toHaveLength(1);
    expect(rows[0].kept).toBe(copyAll(two));
  });
});

describe("an idea into a post", () => {
  const spec = PIPELINE_TEMPLATES.find((p) => p.id === "idea-to-post")! as unknown as PipelineSpec;

  it("links to Idea to ready post with the idea, the platform and the Brand Brain", () => {
    const href = ideaToPostHref("Gerald turns nine & gets cake", { inputs: { platform: "tiktok", topic: "x" }, brandBrain: { id: "bb_1" } });
    expect(href.startsWith("/app/pipelines/idea-to-post?")).toBe(true);
    const q = new URLSearchParams(href.split("?")[1]);
    expect(Object.fromEntries(q)).toEqual({ idea: "Gerald turns nine & gets cake", platform: "tiktok", brand: "bb_1" });
    expect(ideaToPostHref("An idea", { inputs: {}, brandBrain: null })).toBe("/app/pipelines/idea-to-post?idea=An+idea");
  });

  it("fills only what fits the pipeline's form: text as given, a choice only when it is one of its options", () => {
    expect(prefillFrom(spec, { idea: "Gerald turns nine", platform: "reels", brand: "bb_1", nope: "x" })).toEqual({ idea: "Gerald turns nine", platform: "reels" });
    // X is not a platform this template makes videos for; the form keeps its own pick.
    expect(prefillFrom(spec, { idea: "Gerald turns nine", platform: "x" })).toEqual({ idea: "Gerald turns nine" });
    expect(prefillFrom(spec, { idea: ["First", "Second"], start: "ideas", length: "s90" })).toEqual({ idea: "First", start: "ideas" });
    expect(prefillFrom(spec, { idea: "   " })).toEqual({});
  });
});
