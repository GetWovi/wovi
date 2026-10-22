/**
 * "Fill with an example" for a pipeline: each pipeline input takes a value
 * from the golden samples of the agents it feeds, for the picked Brand Brain,
 * as long as the value fits the pipeline's own input. So the templates fill
 * from the same samples the agents do, with no second set to keep up.
 */
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import type { PipelineSpec } from "@/lib/pipelines/spec";
import { parseTemplate } from "@/lib/pipelines/values";
import { validateRunInputs } from "@/lib/runs/inputs";

export type PipelineExample = { brain: string; inputs: Record<string, unknown> };

export function pipelineExamples(spec: Pick<PipelineSpec, "inputs" | "steps">): PipelineExample[] {
  // Steps that always run come first, so their samples win.
  const steps = [...spec.steps].sort((a, b) => Number(Boolean(a.runIf)) - Number(Boolean(b.runIf)));
  const brains = new Set<string>();
  for (const s of steps) for (const sample of LAUNCH_SAMPLES[s.agent.id] ?? []) if (sample.label === "gold") brains.add(sample.brain);

  const out: PipelineExample[] = [];
  for (const brain of brains) {
    const inputs: Record<string, unknown> = {};
    for (const def of spec.inputs) {
      if (def.type === "profile") continue;
      for (const s of steps) {
        const sample = (LAUNCH_SAMPLES[s.agent.id] ?? []).find((x) => x.label === "gold" && x.brain === brain);
        if (!sample) continue;
        for (const [agentKey, m] of Object.entries(s.inputs)) {
          const reads = m.from === "input" ? m.key === def.key : m.from === "template" ? parseTemplate(m.text).parts.some((p) => p.alternatives.some((r) => r?.kind === "input" && r.key === def.key)) : false;
          const v = sample.inputs[agentKey];
          if (!reads || v === undefined || inputs[def.key] !== undefined) continue;
          const value = def.type === "choice" && !def.multiple && Array.isArray(v) ? v[0] : v;
          if (validateRunInputs({ inputs: [{ ...def, required: true }] }, { [def.key]: value }).ok) inputs[def.key] = value;
        }
      }
    }
    if (Object.keys(inputs).length) out.push({ brain, inputs });
  }
  return out;
}
