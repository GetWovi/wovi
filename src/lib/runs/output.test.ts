import { describe, expect, it } from "vitest";
import { SEED_AGENTS } from "@/lib/agents/seeds";
import type { AgentOutput } from "@/lib/agents/spec";
import { defaultAnswer } from "./providers/fake";
import { extractJson, isRunnableOutput, outputContract, parseOutput, repairInstruction } from "./output";

const fill = (output: AgentOutput) =>
  defaultAnswer({
    model: "m",
    maxOutputTokens: 100,
    signal: new AbortController().signal,
    messages: [
      { role: "system", content: outputContract(output) },
      { role: "user", content: '<data name="idea">\nGerald the sourdough starter rises before the bakers\n</data>' },
    ],
  });

const errorsOf = (output: AgentOutput, value: unknown) => {
  const r = parseOutput(output, JSON.stringify(value));
  return r.ok ? [] : r.errors;
};

describe("output parsing", () => {
  it.each(SEED_AGENTS.filter((s) => isRunnableOutput(s.output)).map((s) => [s.id, s.output] as const))(
    "the example for %s, filled in, parses",
    (_id, output) => {
      const r = parseOutput(output, fill(output));
      expect(r.ok ? [] : r.errors).toEqual([]);
    },
  );

  it("reads JSON inside a code fence or with text around it", () => {
    expect(extractJson('Sure!\n```json\n{"text": "hi"}\n```')).toEqual({ text: "hi" });
    expect(extractJson('Here: {"text": "hi"} done')).toEqual({ text: "hi" });
    expect(() => extractJson("no json")).toThrow(/no JSON object/);
  });

  it("text: needs text within the word limit", () => {
    const out: AgentOutput = { kind: "text", maxWords: 3 };
    expect(parseOutput(out, '{"text": "one two"}')).toEqual({ ok: true, value: { kind: "text", text: "one two" } });
    expect(errorsOf(out, { text: "one two three four" })).toEqual(["text: 4 words, at most 3."]);
    expect(parseOutput(out, "not json")).toMatchObject({ ok: false, errors: [expect.stringMatching(/^Not valid JSON/)] });
  });

  it("list: exact count, words per item, and fields when set", () => {
    const out: AgentOutput = { kind: "list", count: 2, maxWordsPerItem: 2 };
    expect(errorsOf(out, { items: ["a b"] })).toEqual(["items: 1 items, need exactly 2."]);
    expect(errorsOf(out, { items: ["a b c", ""] })).toEqual(["items[0]: 3 words, at most 2.", "items[1]: must be non-empty text."]);
    expect(errorsOf(out, { list: [] })).toEqual(["items: must be a list."]);
    const withFields: AgentOutput = { kind: "list", count: 1, fields: ["format", "why_now"] };
    expect(errorsOf(withFields, { items: [{ format: "Duet" }] })).toEqual(["items[0].why_now: must be non-empty text."]);
    expect(errorsOf(withFields, { items: ["Duet"] })).toEqual(["items[0]: must be an object with format, why_now."]);
  });

  it("script: sections in order, seconds within the limit", () => {
    const out: AgentOutput = { kind: "script", maxSeconds: 30, sections: ["opening", "ending"] };
    const s = (section: string, seconds: number) => ({ section, spoken: "Line.", on_screen: "Dough.", seconds });
    expect(errorsOf(out, { sections: [s("opening", 10), s("ending", 10)] })).toEqual([]);
    expect(errorsOf(out, { sections: [s("ending", 10), s("opening", 10)] })).toEqual([
      "sections: must be opening, ending in that order, got ending, opening.",
    ]);
    expect(errorsOf(out, { sections: [s("opening", 20), s("ending", 20)] })).toEqual(["sections: 40 seconds in total, at most 30."]);
    expect(errorsOf(out, { sections: [s("opening", 0), s("ending", 5)] })).toEqual(["sections[0].seconds: must be a positive number."]);
  });

  it("caption_set: known platforms once each, exact variants, character limit", () => {
    const out: AgentOutput = { kind: "caption_set", platforms: ["x", "reels"], variants: 1, maxChars: 10 };
    expect(errorsOf(out, { captions: [{ platform: "x", variants: ["short"] }] })).toEqual([]);
    expect(errorsOf(out, { captions: [{ platform: "tiktok", variants: ["short"] }] })).toEqual([
      'captions[0].platform: "tiktok" is not one of x, reels.',
    ]);
    expect(errorsOf(out, { captions: [{ platform: "x", variants: ["short"] }, { platform: "x", variants: ["again"] }] })).toEqual([
      "captions[1].platform: x appears twice.",
    ]);
    expect(errorsOf(out, { captions: [{ platform: "x", variants: ["a", "b"] }] })).toEqual(["captions[0].variants: 2 variants, need exactly 1."]);
    expect(errorsOf(out, { captions: [{ platform: "x", variants: ["far too long here"] }] })).toEqual([
      "captions[0].variants[0]: 17 characters, at most 10.",
    ]);
    expect(errorsOf(out, { captions: [] })).toEqual(["captions: need at least one platform."]);
  });

  it("post_set: the right number of posts per format, each with parts", () => {
    const out: AgentOutput = { kind: "post_set", formats: [{ format: "thread", count: 1 }, { format: "short", count: 2 }] };
    const p = (format: string) => ({ format, parts: ["One."] });
    expect(errorsOf(out, { posts: [p("thread"), p("short"), p("short")] })).toEqual([]);
    expect(errorsOf(out, { posts: [p("thread"), p("short")] })).toEqual(["posts: 1 short posts, need exactly 2."]);
    expect(errorsOf(out, { posts: [p("thread"), p("short"), p("short"), p("carousel")] })).toEqual([
      'posts[3].format: "carousel" is not one of thread, short.',
    ]);
    expect(errorsOf(out, { posts: [{ format: "thread", parts: [] }, p("short"), p("short")] })).toEqual(["posts[0].parts: need at least one part."]);
  });

  it("image, storyboard and video outputs cannot run yet", () => {
    expect(isRunnableOutput({ kind: "video", maxSeconds: 10, aspect: "9:16" })).toBe(false);
    expect(parseOutput({ kind: "image", count: 1, aspect: "1:1" }, "{}")).toEqual({ ok: false, errors: ['Output kind "image" cannot run yet.'] });
  });

  it("the repair instruction lists each problem", () => {
    expect(repairInstruction(["a", "b"])).toContain("- a\n- b\n");
  });
});
