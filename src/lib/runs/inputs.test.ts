import { describe, expect, it } from "vitest";
import { SEED_AGENTS } from "@/lib/agents/seeds";
import { validateAgentBody, type AgentBody } from "@/lib/agents/spec";
import { goodSpec } from "@/lib/agents/test-helpers";
import { validateRunInputs } from "./inputs";

function body(overrides: Parameters<typeof goodSpec>[0] = {}): AgentBody {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, status, visibility, ...b } = goodSpec(overrides);
  const r = validateAgentBody(b);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

const errorsOf = (spec: AgentBody, inputs: unknown) => {
  const r = validateRunInputs(spec, inputs);
  return r.ok ? [] : r.errors;
};

const seed = (id: string) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, status, visibility, ...b } = SEED_AGENTS.find((s) => s.id === id)!;
  const r = validateAgentBody(b);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
};

describe("run input validation", () => {
  it("accepts good values, trims text and drops empty optionals", () => {
    const r = validateRunInputs(body(), { topic: "  bread  ", tone: "" });
    expect(r).toEqual({ ok: true, value: { topic: "bread" } });
  });

  it("refuses a missing required input, an unknown key and a non-object", () => {
    expect(errorsOf(body(), {})).toEqual(["topic: Required."]);
    expect(errorsOf(body(), { topic: "x", colour: "red" })).toEqual(["colour: Unknown input. This agent takes: topic, tone."]);
    expect(errorsOf(body(), "hello")[0]).toMatch(/^Inputs must be an object/);
  });

  it("checks text length limits", () => {
    const hook = seed("hook-writer");
    expect(errorsOf(hook, { idea: "short", platform: "x" })).toEqual(["idea: Must be at least 10 characters (got 5)."]);
    expect(errorsOf(hook, { idea: "a".repeat(601), platform: "x" })).toEqual(["idea: Must be at most 600 characters (got 601)."]);
    expect(errorsOf(hook, { idea: 42, platform: "x" })).toEqual(["idea: Must be text."]);
  });

  it("checks single and multiple choices, and fills choice defaults", () => {
    const cap = seed("caption-writer");
    const post = "A long enough description of the clip.";
    expect(validateRunInputs(cap, { post, platforms: "x" })).toEqual({ ok: true, value: { post, platforms: ["x"], length: "short" } });
    expect(errorsOf(cap, { post, platforms: ["x", "myspace"] })).toEqual([
      'platforms: Unknown option "myspace". Pick from: x, tiktok, shorts, reels.',
    ]);
    expect(errorsOf(cap, { post, platforms: ["x", "x"] })).toEqual(["platforms: Options must not repeat."]);
    expect(errorsOf(seed("hook-writer"), { idea: "a good long idea", platform: ["x"] })).toEqual(["platform: Must be one option."]);
  });

  it("checks numbers against min, max, step and fills the default", () => {
    const spec = body({
      inputs: [
        { key: "topic", label: "Topic", type: "text", required: true, limits: { maxLength: 200 } },
        { key: "count", label: "Count", type: "number", required: false, limits: { min: 1, max: 10, step: 0.5 }, default: 3 },
      ],
      instructions: "Write {{count}} lines about {{topic}} in this voice: {{brand.voice}}",
    });
    expect(validateRunInputs(spec, { topic: "t" })).toEqual({ ok: true, value: { topic: "t", count: 3 } });
    expect(validateRunInputs(spec, { topic: "t", count: "2.5" })).toEqual({ ok: true, value: { topic: "t", count: 2.5 } });
    expect(errorsOf(spec, { topic: "t", count: 11 })).toEqual(["count: Must be between 1 and 10."]);
    expect(errorsOf(spec, { topic: "t", count: 1.2 })).toEqual(["count: Must go in steps of 0.5 from 1."]);
    expect(errorsOf(spec, { topic: "t", count: "many" })).toEqual(["count: Must be a number."]);
  });

  it("checks links, profiles and files", () => {
    const spec = body({
      inputs: [
        { key: "topic", label: "Topic", type: "text", required: true, limits: { maxLength: 200 } },
        { key: "link", label: "Link", type: "url", required: false },
        { key: "brand", label: "Brand", type: "profile", required: false },
        { key: "doc", label: "Doc", type: "file", required: false, limits: { maxSizeMb: 5, maxFiles: 1, accept: [".srt", "application/pdf"] } },
        { key: "clip", label: "Clip", type: "video", required: false, limits: { maxSizeMb: 100, maxFiles: 2, maxSeconds: 60 } },
      ],
    });
    const pdf = { assetId: "as_1", name: "notes.pdf", mimeType: "application/pdf", sizeMb: 1 };
    const clip = { assetId: "as_2", name: "a.mp4", mimeType: "video/mp4", sizeMb: 10, seconds: 30 };
    expect(validateRunInputs(spec, { topic: "t", link: "https://wovi.app/x", brand: "bb_default", doc: pdf, clip: [clip] })).toEqual({
      ok: true,
      value: { topic: "t", link: "https://wovi.app/x", brand: "bb_default", doc: [pdf], clip: [clip] },
    });
    expect(errorsOf(spec, { topic: "t", link: "javascript:alert(1)" })).toEqual(["link: Must be an http or https link."]);
    expect(errorsOf(spec, { topic: "t", link: "not a link" })).toEqual(["link: Must be a full link starting with https://."]);
    expect(errorsOf(spec, { topic: "t", brand: "Bad Id!" })).toEqual(["brand: Must be a Brand Brain id."]);
    expect(errorsOf(spec, { topic: "t", doc: { ...pdf, name: "x.exe", mimeType: "application/x-msdownload" } })).toEqual([
      'doc: "x.exe" is not an accepted file. Accepted: .srt, application/pdf.',
    ]);
    expect(errorsOf(spec, { topic: "t", doc: { ...pdf, sizeMb: 6 } })).toEqual(['doc: "notes.pdf" is 6 MB; the limit is 5 MB.']);
    expect(errorsOf(spec, { topic: "t", doc: [pdf, pdf] })).toEqual(["doc: At most 1 file."]);
    expect(errorsOf(spec, { topic: "t", clip: { ...clip, seconds: 90 } })).toEqual(['clip: "a.mp4" is 90 seconds; the limit is 60.']);
    expect(errorsOf(spec, { topic: "t", clip: { ...clip, mimeType: "image/png" } })).toEqual(['clip: "a.mp4" is not a video.']);
    expect(errorsOf(spec, { topic: "t", doc: "notes.pdf" })).toEqual(["doc: Must be an uploaded file with assetId, name, mimeType and sizeMb."]);
  });

  it("lists every problem at once", () => {
    expect(errorsOf(seed("hook-writer"), { platform: "fax", extra: 1 })).toHaveLength(3);
  });
});
