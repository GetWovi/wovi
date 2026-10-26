/**
 * "Fill with an example" for an agent and for a pipeline. An agent's examples
 * are its golden samples. For a pipeline, each pipeline input takes a value
 * from the golden samples of the agents it feeds, for the picked Brand Brain,
 * as long as the value fits the pipeline's own input. So the templates fill
 * from the same samples the agents do, with no second set to keep up.
 * Either way the inputs that carry the sample business's facts are marked,
 * so they fill only on that business's own Brand Brain (see examples.ts).
 */
import { LAUNCH_SAMPLES, SAMPLE_FACT_INPUTS } from "@/lib/launch/samples";
import type { PipelineSpec } from "@/lib/pipelines/spec";
import { parseTemplate } from "@/lib/pipelines/values";
import { validateRunInputs } from "@/lib/runs/inputs";
import type { FormExample } from "./examples";

export type PipelineExample = FormExample;

export function agentExamples(agentId: string): FormExample[] {
  const facts = [...(SAMPLE_FACT_INPUTS[agentId] ?? [])];
  return (LAUNCH_SAMPLES[agentId] ?? []).filter((s) => s.label === "gold").map((s) => ({ brain: s.brain, inputs: s.inputs, facts }));
}

type StepInput = PipelineSpec["steps"][number]["inputs"][string];

/** Whether a step input reads the pipeline input `key`, directly or inside a template. */
function reads(m: StepInput, key: string): boolean {
  return m.from === "input" ? m.key === key : m.from === "template" ? parseTemplate(m.text).parts.some((p) => p.alternatives.some((r) => r?.kind === "input" && r.key === key)) : false;
}

export function pipelineExamples(spec: Pick<PipelineSpec, "inputs" | "steps">): PipelineExample[] {
  // Steps that always run come first, so their samples win.
  const steps = [...spec.steps].sort((a, b) => Number(Boolean(a.runIf)) - Number(Boolean(b.runIf)));
  const brains = new Set<string>();
  for (const s of steps) for (const sample of LAUNCH_SAMPLES[s.agent.id] ?? []) if (sample.label === "gold") brains.add(sample.brain);

  // A pipeline input is a fact when any step reads it into one of its agent's fact inputs.
  const facts = spec.inputs
    .map((def) => def.key)
    .filter((key) => steps.some((s) => Object.entries(s.inputs).some(([agentKey, m]) => (SAMPLE_FACT_INPUTS[s.agent.id] ?? []).includes(agentKey) && reads(m, key))));

  const out: PipelineExample[] = [];
  for (const brain of brains) {
    const inputs: Record<string, unknown> = {};
    for (const def of spec.inputs) {
      if (def.type === "profile") continue;
      for (const s of steps) {
        const sample = (LAUNCH_SAMPLES[s.agent.id] ?? []).find((x) => x.label === "gold" && x.brain === brain);
        if (!sample) continue;
        for (const [agentKey, m] of Object.entries(s.inputs)) {
          const v = sample.inputs[agentKey];
          if (!reads(m, def.key) || v === undefined || inputs[def.key] !== undefined) continue;
          const value = def.type === "choice" && !def.multiple && Array.isArray(v) ? v[0] : v;
          if (validateRunInputs({ inputs: [{ ...def, required: true }] }, { [def.key]: value }).ok) inputs[def.key] = value;
        }
      }
    }
    if (Object.keys(inputs).length) out.push({ brain, inputs, facts });
  }
  return out;
}
