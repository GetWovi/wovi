import { describe, expect, it } from "vitest";
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import { PIPELINE_TEMPLATES } from "@/lib/pipelines/templates";
import { validatePipeline } from "@/lib/pipelines/validate";
import { exampleInputs } from "./examples";
import { agentExamples, pipelineExamples } from "./pipeline-examples";

/** A template as the app has it: parsed, with its defaults filled in. */
function template(id: string) {
  const r = validatePipeline(PIPELINE_TEMPLATES.find((t) => t.id === id));
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("fill with an example", () => {
  it("fills the whole sample on the sample's own Brand Brain", () => {
    const withFacts = agentExamples("idea-generator").find((e) => typeof e.inputs.coming_up === "string")!;
    expect(LAUNCH_SAMPLES["idea-generator"].some((x) => x.brain === withFacts.brain && x.inputs === withFacts.inputs)).toBe(true);
    expect(exampleInputs([withFacts], withFacts.brain)).toEqual(withFacts.inputs);
  });

  it("never fills another business's facts into the person's own Brand Brain", () => {
    for (const [agent, key] of [
      ["idea-generator", "coming_up"],
      ["script-writer", "footage"],
      ["caption-writer", "details"],
      ["hashtag-picker", "location"],
      ["repurposer", "keep"],
    ] as const) {
      const examples = agentExamples(agent);
      // Even when the first example carries that fact, the person's form gets the rest only.
      const first = examples.findIndex((e) => e.inputs[key] !== undefined);
      expect([agent, first >= 0]).toEqual([agent, true]);
      const ordered = [examples[first], ...examples.filter((_, i) => i !== first)];
      const filled = exampleInputs(ordered, "Curl & Co")!;
      expect([agent, key in filled]).toEqual([agent, false]);
      expect(Object.keys(filled).length).toBeGreaterThan(0);
    }
    expect(exampleInputs([], "Curl & Co")).toBeNull();
  });

  it("does the same for a pipeline: facts to include and what you can film stay empty on the person's own brand", () => {
    const examples = pipelineExamples(template("idea-to-post"));
    expect(examples[0].facts.sort()).toEqual(["details", "footage"]);
    const own = examples.find((e) => e.inputs.details !== undefined)!;
    expect(exampleInputs(examples, own.brain)).toMatchObject({ details: own.inputs.details });
    const filled = exampleInputs([own], "Curl & Co")!;
    expect(filled.details).toBeUndefined();
    expect(filled.footage).toBeUndefined();
    expect(filled.idea).toBe(own.inputs.idea);
    expect(pipelineExamples(template("repurpose-post"))[0].facts).toContain("keep");
  });
});
