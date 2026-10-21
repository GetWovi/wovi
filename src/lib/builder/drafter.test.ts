import { describe, expect, it } from "vitest";
import { validateAgentSpec } from "@/lib/agents/spec";
import { scanTemplate } from "@/lib/agents/template";
import { fakeProvider } from "@/lib/runs/providers/fake";
import { ProviderError } from "@/lib/runs/providers/types";
import { SpecDrafter, freeId, jobLine, slugify, templateDraft } from "./drafter";

const DESCRIPTIONS = [
  "writes 10 scroll-stopping hooks for TikTok from a product idea, punchy, no clickbait",
  "Writes the caption for Reels or Shorts, two variants, under 150 words, no hashtags.",
  "turns one idea into a 30 second script for shorts with a twist in the middle",
  "picks 5 hashtags for an X post, no banned tags",
  "finds trending formats this week for a niche on TikTok and says why each works",
  "brainstorms 20 post ideas for a small bakery, playful tone, always include a question",
  "writes a 7 post thread for X from a long article, direct, no fluff",
  "drafts replies to the comments under a post, warm, never argue",
  "translates a post into another language and keeps the jokes",
  "summarizes a transcript from a long video into key points under 200 words",
  "makes 3 thumbnail covers for YouTube from the post, bold, no faces",
  "storyboards an approved script frame by frame for reels",
  "plans a weekly posting calendar from goals and ideas",
  "checks a draft against the brand voice and lists what to fix",
  "writes 10 titles for shorts, under 8 words, honest",
  "writes a bio",
  "something odd with <tags> and {{braces}} and no clear job",
  "",
];

describe("the template draft", () => {
  it("makes a valid spec for every description", () => {
    for (const d of DESCRIPTIONS) {
      const spec = templateDraft({ description: d });
      const r = validateAgentSpec(spec);
      expect(r.ok, `${JSON.stringify(d)}: ${r.ok ? "" : r.errors.join("; ")}`).toBe(true);
      expect(spec.owner).toEqual({ kind: "platform", creatorId: "creator_wovi" });
      expect(spec.status).toBe("draft");
      expect(spec.version).toBe("1.0.0");
      expect(spec.inputs.some((i) => i.type === "profile")).toBe(true);
      // Every required input is in the instructions (the validator checks this too), and the brand parts declared are the ones used.
      const { placeholders } = scanTemplate(spec.instructions);
      for (const part of spec.brandBrain ?? []) expect(placeholders).toContain(`brand.${part}`);
    }
  });

  it("is deterministic", () => {
    for (const d of DESCRIPTIONS.slice(0, 5)) {
      expect(templateDraft({ description: d })).toEqual(templateDraft({ description: d }));
    }
  });

  it("reads the job's shape out of the words", () => {
    const hooks = templateDraft({ description: DESCRIPTIONS[0] });
    expect(hooks.name).toBe("Hook Writer");
    expect(hooks.id).toBe("hook-writer");
    expect(hooks.category).toBe("writing");
    expect(hooks.platforms).toEqual(["tiktok"]);
    expect(hooks.output).toEqual({ kind: "list", count: 10, maxWordsPerItem: 12 });
    expect(hooks.instructions).toContain("Platform: TikTok.");
    expect(hooks.instructions).toMatch(/Tone: punchy/);
    expect(hooks.instructions).toMatch(/No clickbait\./);
    expect(hooks.job).toBe("Writes 10 scroll-stopping hooks for TikTok from a product idea, punchy, no clickbait.");
    // One platform: no platform choice in the form.
    expect(hooks.inputs.map((i) => i.key)).toEqual(["idea", "brand"]);

    const captions = templateDraft({ description: DESCRIPTIONS[1] });
    expect(captions.output).toMatchObject({ kind: "caption_set", platforms: ["shorts", "reels"], variants: 2 });
    expect(captions.guardrails).toContain("platform_policy");

    const script = templateDraft({ description: DESCRIPTIONS[2] });
    expect(script.output).toEqual({ kind: "script", maxSeconds: 30, sections: ["opening", "turn", "ending"] });
    expect(script.routing.model).toBe("text-strong");

    const tags = templateDraft({ description: DESCRIPTIONS[3] });
    expect(tags.output).toEqual({ kind: "list", count: 5, maxWordsPerItem: 3 });
    expect(tags.tools).toEqual(["trend_lookup"]);
    expect(tags.routing.model).toBe("text-fast");

    const ideas = templateDraft({ description: DESCRIPTIONS[5] });
    expect(ideas.category).toBe("ideation");
    expect(ideas.output).toMatchObject({ kind: "list", count: 20 });
    expect(ideas.instructions).toMatch(/Always include a question\./);
    // No platform named: all four, so the form asks which one.
    expect(ideas.platforms).toEqual(["x", "tiktok", "shorts", "reels"]);
    expect(ideas.inputs.find((i) => i.key === "platform")?.type).toBe("choice");

    const summary = templateDraft({ description: DESCRIPTIONS[9] });
    expect(summary.inputs.map((i) => i.type)).toContain("video");
    expect(summary.tools).toContain("transcription");
    expect(summary.guardrails).toContain("rights_confirmed");
    expect(summary.output).toEqual({ kind: "text", maxWords: 200 });

    const covers = templateDraft({ description: DESCRIPTIONS[10] });
    expect(covers.output).toEqual({ kind: "image", count: 3, aspect: "9:16" });
    expect(covers.brandBrain).toContain("mood_board");
    expect(covers.instructions).toContain("{{brand.mood_board}}");
  });

  it("keeps the id free of ids already taken", () => {
    const spec = templateDraft({ description: DESCRIPTIONS[0], existingIds: ["hook-writer", "hook-writer-2"] });
    expect(spec.id).toBe("hook-writer-3");
    expect(freeId("abc", [])).toBe("abc");
    expect(slugify("  Hook!! Writer ")).toBe("hook-writer");
    expect(slugify("x")).toBe("agent-x");
    expect(jobLine("make hooks. and more").endsWith(".")).toBe(true);
    expect(jobLine("a".repeat(300)).length).toBeLessThanOrEqual(120);
  });
});

describe("the spec drafter on the provider layer", () => {
  it("returns the template unchanged on the fake provider, with the call recorded", async () => {
    const fake = fakeProvider();
    const drafter = new SpecDrafter({ providers: { fake }, providerOverride: "fake" });
    const r = await drafter.draft({ description: DESCRIPTIONS[0] });
    expect(r.source).toBe("fake");
    expect(r.spec).toEqual(templateDraft({ description: DESCRIPTIONS[0] }));
    expect(r.model).toMatchObject({ route: "text-strong", provider: "fake" });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].messages[1].content).toContain('<data name="description">');
    expect(r.tokensIn).toBeGreaterThan(0);
    expect(r.costMicroUsd).toBeGreaterThan(0);
  });

  it("takes a real model's valid answer, forcing owner, status and a free id", async () => {
    const answer = { ...templateDraft({ description: "writes a bio" }), id: "hook-writer", name: "Bio Buddy", owner: { kind: "creator", creatorId: "evil" }, status: "live", version: "9.9.9" };
    const fake = fakeProvider({ id: "stub-model", respond: () => "Here you go:\n```json\n" + JSON.stringify(answer) + "\n```" });
    const drafter = new SpecDrafter({ providers: { "stub-model": fake }, providerOverride: "stub-model" });
    const r = await drafter.draft({ description: "writes a bio", existingIds: ["hook-writer"] });
    expect(r.source).toBe("model");
    expect(r.spec.name).toBe("Bio Buddy");
    expect(r.spec.id).toBe("hook-writer-2");
    expect(r.spec.owner).toEqual({ kind: "platform", creatorId: "creator_wovi" });
    expect(r.spec.status).toBe("draft");
    expect(r.spec.version).toBe("1.0.0");
  });

  it("asks for one repair, then falls back to the template", async () => {
    const good = templateDraft({ description: "writes a bio" });
    const fake = fakeProvider({ id: "m", respond: (_req, n) => (n === 1 ? "not json at all" : JSON.stringify({ ...good, tools: ["web_scrape"] })) });
    const drafter = new SpecDrafter({ providers: { m: fake }, providerOverride: "m" });
    const r = await drafter.draft({ description: "writes a bio" });
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1].messages.at(-1)?.content).toContain("did not pass validation");
    expect(r.source).toBe("template");
    expect(r.spec).toEqual(good);
    expect(r.notes.join(" ")).toMatch(/repair/);

    const fixed = fakeProvider({ id: "m", respond: (_req, n) => (n === 1 ? "{}" : JSON.stringify(good)) });
    const r2 = await new SpecDrafter({ providers: { m: fixed }, providerOverride: "m" }).draft({ description: "writes a bio" });
    expect(r2.source).toBe("model");
  });

  it("falls back to the template when the model fails or nothing serves the route", async () => {
    const down = fakeProvider({ id: "m", respond: () => new ProviderError("unavailable", "down") });
    const r = await new SpecDrafter({ providers: { m: down }, providerOverride: "m" }).draft({ description: "writes a bio" });
    expect(r.source).toBe("template");
    expect(r.notes[0]).toMatch(/did not answer/);

    const none = await new SpecDrafter({ providers: {} }).draft({ description: "writes a bio" });
    expect(none.source).toBe("template");
    expect(none.model).toBeNull();
  });
});
