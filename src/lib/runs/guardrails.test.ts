import { describe, expect, it } from "vitest";
import { GUARDRAILS } from "@/lib/agents/catalog";
import { SEED_AGENTS } from "@/lib/agents/seeds";
import { validateAgentBody, type AgentBody } from "@/lib/agents/spec";
import { sampleBrandBrain } from "./brand-brain";
import { GUARDRAIL_CHECKS, findPhrases, guardrailsWithoutCheck, runAfterChecks, runBeforeChecks } from "./guardrails";
import type { RunOutput } from "./output";

const seedBody = (id: string): AgentBody => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, status, visibility, ...b } = SEED_AGENTS.find((s) => s.id === id)!;
  const r = validateAgentBody(b);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
};

/** Every guardrail on, so each check can be tested alone. */
const all = (spec: AgentBody): AgentBody => ({ ...spec, guardrails: GUARDRAILS.map((g) => g.id) });
const brain = sampleBrandBrain("ws_test");
const list = (...items: string[]): RunOutput => ({ kind: "list", items });

function check(id: string, output: RunOutput, inputs: Record<string, string> = { idea: "Gerald the sourdough starter turns nine" }, b = brain) {
  return runAfterChecks({ spec: all(seedBody("hook-writer")), inputs, output, brain: b }).find((c) => c.check === id)!;
}

describe("guardrails", () => {
  it("every catalog guardrail has a check, and every check names a real guardrail", () => {
    expect(guardrailsWithoutCheck()).toEqual([]);
    const ids = GUARDRAILS.map((g) => g.id);
    for (const c of GUARDRAIL_CHECKS) expect(ids).toContain(c.guardrail);
  });

  it("only runs the checks an agent declares", () => {
    const results = runAfterChecks({ spec: seedBody("hashtag-picker"), inputs: {}, output: list("#bread"), brain });
    expect(results.map((r) => r.guardrail).sort()).toEqual(["banned_phrases", "platform_policy"]);
  });

  it("banned_phrases catches generic filler, on word boundaries and with curly quotes", () => {
    expect(check("anti_slop_phrases", list("Gerald is nine", "In today’s fast-paced world, Gerald rises"))).toMatchObject({
      status: "fail",
      findings: ["in today's fast-paced"],
    });
    expect(check("anti_slop_phrases", list("Gerald unleashed nothing", "Gerald is nine")).status).toBe("pass");
    expect(findPhrases(["DELVE into Gerald"], { phrases: ["delve"] })).toEqual(["delve"]);
  });

  it("no_misleading_claims catches phrases and number patterns", () => {
    expect(check("misleading_claim_phrases", list("Gerald: guaranteed results")).findings).toEqual(["guaranteed results"]);
    expect(check("misleading_claim_phrases", list("Make $500 a day with Gerald")).findings).toEqual(["make $500 a day"]);
    expect(check("misleading_claim_phrases", list("Lose 10 kg in a week")).status).toBe("fail");
    expect(check("misleading_claim_phrases", list("Gerald is nine years old")).status).toBe("pass");
  });

  it("no_fake_testimonials catches review language and attributed quotes", () => {
    expect(check("testimonial_phrases", list("Verified buyer says Gerald rocks")).status).toBe("fail");
    expect(check("testimonial_phrases", list('"Best sourdough in town" - Maria K.')).status).toBe("fail");
    expect(check("testimonial_phrases", list('Gerald says "rise early"')).status).toBe("pass");
  });

  it("no_impersonation and safe_content catch their phrase lists", () => {
    expect(check("impersonation_phrases", list("I am the real Gordon Ramsay")).status).toBe("fail");
    expect(check("unsafe_phrases", list("Stop taking your medication and eat bread")).status).toBe("fail");
    expect(check("unsafe_phrases", list("Gerald is nine")).status).toBe("pass");
  });

  it("brand_voice_check fails on the brand's banned words, and notes when there is no Brand Brain", () => {
    expect(check("brand_banned_words", list("Our Artisanal Gerald"))).toMatchObject({ status: "fail", findings: ["artisanal"] });
    expect(check("brand_banned_words", list("Gerald")).status).toBe("pass");
    expect(check("brand_banned_words", list("Gerald"), undefined, null as never).status).toBe("note");
  });

  it("specificity_check needs a word from the input and no repeated items", () => {
    expect(check("specific_to_input", list("Gerald turns nine", "Nine years of sourdough")).status).toBe("pass");
    expect(check("specific_to_input", list("Great things ahead", "Big news today"))).toMatchObject({
      status: "fail",
      findings: ["Nothing in the output names anything from the user's input."],
    });
    expect(check("specific_to_input", list("Gerald turns nine", "gerald turns  nine")).findings).toEqual(['Repeated: "gerald turns  nine"']);
  });

  it("specificity_check compares items with fields as whole items, so a shared field value is not a repeat", () => {
    const tags = (...xs: [string, string][]): RunOutput => ({ kind: "list", items: xs.map(([type, term]) => ({ type, term })) });
    expect(check("specific_to_input", tags(["hashtag", "#Sourdough"], ["hashtag", "#Gerald"])).status).toBe("pass");
    expect(check("specific_to_input", tags(["hashtag", "#Gerald"], ["hashtag", "#gerald"])).findings).toEqual(['Repeated: "hashtag | #gerald"']);
  });

  it("platform_policy keeps captions and thread posts inside platform limits", () => {
    const long = "g".repeat(281);
    const captions: RunOutput = { kind: "caption_set", captions: [{ platform: "x", variants: [long] }, { platform: "tiktok", variants: [long] }] };
    expect(check("platform_lengths", captions).findings).toEqual(["x caption 1 is 281 characters; x allows 280."]);
    const posts: RunOutput = { kind: "post_set", posts: [{ format: "thread", parts: ["ok", long] }] };
    expect(check("platform_lengths", posts).findings).toEqual(["Thread post 2 is 281 characters; X allows 280."]);
  });

  it("ai_disclosure always leaves a note, never a failure", () => {
    expect(check("ai_label", list("Gerald")).status).toBe("note");
  });

  it("rights_confirmed and voice_consent are checked before the run", () => {
    const spec = all(seedBody("repurposer"));
    const run = (confirmations: object) =>
      Object.fromEntries(runBeforeChecks({ spec, inputs: {}, confirmations }).map((c) => [c.guardrail, c.status]));
    expect(run({})).toEqual({ rights_confirmed: "fail", voice_consent: "fail" });
    expect(run({ rights: true, voiceConsent: true })).toEqual({ rights_confirmed: "pass", voice_consent: "pass" });
  });
});

describe("specificity on a short input", () => {
  it("counts a three-letter word of a short input, like gym, as naming the input", async () => {
    const { runAfterChecks } = await import("./guardrails");
    const { validateAgentSpec } = await import("@/lib/agents/spec");
    const { goodSpec } = await import("@/lib/agents/test-helpers");
    const r = validateAgentSpec(goodSpec({ guardrails: ["specificity_check"] }));
    if (!r.ok) throw new Error("bad spec");
    const check = (topic: string, line: string) => runAfterChecks({ spec: r.value, inputs: { topic }, output: { kind: "list", items: [line, `${line} two`, `${line} three`] }, brain: null }).find((c) => c.check === "specific_to_input")!;
    expect(check("beginner strength gym", "Film the gym door at six").status).toBe("pass");
    expect(check("beginner strength gym", "Film a door at six").status).toBe("fail");
    // "the" names nothing.
    expect(check("the bakery", "Film the door at six").status).toBe("fail");
  });
});
