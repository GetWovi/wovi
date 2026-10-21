import { describe, expect, it } from "vitest";
import { publicView, validateAgentSpec } from "./spec";
import { goodSpec } from "./test-helpers";

function errorsOf(input: unknown): string[] {
  const r = validateAgentSpec(input);
  if (r.ok) throw new Error("expected the spec to be invalid");
  return r.errors;
}

describe("agent spec validator", () => {
  it("accepts a good spec and fills defaults", () => {
    const r = validateAgentSpec(goodSpec());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.quality).toEqual({ score: null, runs: 0, lastScoredAt: null });
    const tone = r.value.inputs[1];
    expect(tone.type === "choice" && tone.multiple).toBe(false);
  });

  it("rejects an unknown tool", () => {
    const errors = errorsOf(goodSpec({ tools: ["web_scrape"] }));
    expect(errors).toEqual([expect.stringMatching(/^tools\[0\]: Unknown tool "web_scrape"\. Allowed tools: trend_lookup/)]);
  });

  it("rejects an unknown guardrail", () => {
    const errors = errorsOf(goodSpec({ guardrails: ["be_nice"] }));
    expect(errors[0]).toMatch(/^guardrails\[0\]: Unknown guardrail "be_nice"/);
  });

  it("rejects a placeholder without an input", () => {
    const errors = errorsOf(goodSpec({ instructions: "Write about {{topic}} for {{audience}}." }));
    expect(errors).toEqual(["instructions: Placeholder {{audience}} has no input with that key."]);
  });

  it("rejects a Brand Brain placeholder that is not declared", () => {
    const errors = errorsOf(goodSpec({ instructions: "Write about {{topic}}. Look: {{brand.mood_board}}" }));
    expect(errors).toEqual([
      'instructions: Placeholder {{brand.mood_board}} reads the Brand Brain part "mood_board", which is not declared in brandBrain.',
    ]);
  });

  it("rejects a required input the instructions never use", () => {
    const errors = errorsOf(goodSpec({ instructions: "Write three lines in this voice: {{brand.voice}}" }));
    expect(errors).toEqual(['inputs[0]: Required input "topic" is never used in instructions. Add {{topic}}.']);
  });

  it("allows an optional input the instructions do not use", () => {
    expect(validateAgentSpec(goodSpec()).ok).toBe(true);
  });

  it("rejects malformed placeholders", () => {
    const errors = errorsOf(goodSpec({ instructions: "Write about {{topic}} and {{Bad Name}} and {{ unclosed" }));
    expect(errors).toContain('instructions: Placeholder "{{Bad Name}}" is not a valid name. Use {{input_key}} or {{brand.part}}.');
    expect(errors).toContain("instructions: Template has an unclosed or stray {{ or }}.");
  });

  it.each(["1.0", "v1.0.0", "1.0.0-beta", "01.0.0", ""])("rejects the bad version %j", (version) => {
    const errors = errorsOf(goodSpec({ version }));
    expect(errors).toEqual([`version: Version ${JSON.stringify(version)} is not a semver version like 1.0.0.`]);
  });

  it("rejects duplicate input keys", () => {
    const spec = goodSpec();
    spec.inputs = [spec.inputs[0], { ...spec.inputs[0], required: false }];
    expect(errorsOf(spec)).toContain('inputs[1].key: Input key "topic" is used twice.');
  });

  it("rejects an unknown input type and a missing field", () => {
    const spec = goodSpec() as Record<string, unknown>;
    spec.inputs = [{ key: "topic", label: "Topic", type: "essay", required: true }];
    delete spec.name;
    const errors = errorsOf(spec);
    expect(errors).toContain("name: Required.");
    expect(errors).toContain(
      'inputs[0].type: Unknown input type "essay". Use one of: text, long_text, url, file, image, video, choice, number, profile.',
    );
  });

  it("rejects unknown fields so typos do not pass", () => {
    expect(errorsOf({ ...goodSpec(), requried: true })).toEqual(['Unrecognized key: "requried"']);
  });

  it("rejects an unknown model route and a fallback equal to the model", () => {
    expect(errorsOf(goodSpec({ routing: { model: "gpt-x", fallback: "text-fast", maxCostUsd: 0.1 } }))[0]).toMatch(
      /^routing\.model: Unknown model route "gpt-x"\. Known routes: text-fast/,
    );
    expect(errorsOf(goodSpec({ routing: { model: "text-fast", fallback: "text-fast", maxCostUsd: 0.1 } }))).toEqual([
      "routing.fallback: Fallback must be a different model route than the main one.",
    ]);
    expect(errorsOf(goodSpec({ routing: { model: "text-fast", fallback: "image-standard", maxCostUsd: 0.1 } }))).toEqual([
      'routing.fallback: Fallback "image-standard" is image but the main route "text-fast" is text.',
    ]);
  });

  it("rejects a run cost cap above the limit", () => {
    expect(errorsOf(goodSpec({ routing: { model: "text-fast", fallback: "text-standard", maxCostUsd: 50 } }))).toEqual([
      "routing.maxCostUsd: maxCostUsd must be at most 10 per run.",
    ]);
  });

  it("checks choice defaults and number limits", () => {
    const spec = goodSpec();
    spec.inputs = [
      spec.inputs[0],
      { key: "tone", label: "Tone", type: "choice", required: false, options: [{ value: "calm", label: "Calm" }, { value: "loud", label: "Loud" }], default: "quiet" },
      { key: "count", label: "Count", type: "number", required: false, limits: { min: 5, max: 1 } },
    ];
    const errors = errorsOf(spec);
    expect(errors).toContain('inputs[1].default: Default "quiet" is not an option of "tone".');
    expect(errors).toContain('inputs[2].limits: min is larger than max on "count".');
  });

  it("rejects a bad id and a multi-line job", () => {
    const errors = errorsOf(goodSpec({ id: "Hook Writer", job: "Line one\nline two" }));
    expect(errors).toContain("id: Id must be lowercase words joined by hyphens, like hook-writer.");
    expect(errors).toContain("job: Must be one line.");
  });

  it("hides routing and instructions in the public view", () => {
    const r = validateAgentSpec(goodSpec());
    if (!r.ok) throw new Error("invalid");
    const view = publicView(r.value);
    expect(view).not.toHaveProperty("routing");
    expect(view).not.toHaveProperty("instructions");
    expect(view.name).toBe("Test Agent");
  });
});
