/**
 * The pipeline validator. The spec's shape is checked by zod (spec.ts); this
 * checks what the shape cannot: every agent exists at the version named,
 * every required agent input has a source, every mapping fits the input it
 * fills (a choice into a choice with the same options, text no longer than
 * the input allows, a step's text output only into text), steps only read
 * the steps before them (so a pipeline never loops), and every picked item
 * comes from a step that picks one.
 *
 * Pure, with the agents passed in through a lookup, so the builder's editor
 * runs it on every keystroke and the registry runs it again on save. The
 * engine runs it a third time at submit with the agent versions it resolved,
 * so an agent update that breaks a saved chain is refused before anything
 * runs, with a clear message.
 */
import type { AgentInput, AgentSpec, Validation } from "@/lib/agents/spec";
import { validateRunInputs } from "@/lib/runs/inputs";
import { isRunnableOutput } from "@/lib/runs/output";
import { parsePipelineBody, parsePipelineSpec, type Mapping, type PipelineBody, type PipelineSpec } from "./spec";
import { parseTemplate, type TemplateRef } from "./values";

/** What the validator needs from an agent. */
export type AgentShape = Pick<AgentSpec, "id" | "version" | "name" | "inputs" | "output" | "guardrails" | "brandBrain">;

/** An agent by id at a version ("current" or exact). Null when there is none. */
export type AgentLookup = (id: string, version: string) => AgentShape | null;

const textish = (t: string) => t === "text" || t === "long_text";

function typeWord(i: AgentInput): string {
  switch (i.type) {
    case "text":
    case "long_text":
      return "text";
    case "url":
      return "a link";
    case "choice":
      return i.multiple ? "a list of options" : "one option";
    case "number":
      return "a number";
    case "profile":
      return "a Brand Brain";
    case "image":
      return "images";
    case "video":
      return "videos";
    case "file":
      return "files";
  }
}

const hasDefault = (i: AgentInput) => (i.type === "choice" || i.type === "number") && i.default !== undefined;
/** Whether a pipeline input can be left empty by the person. */
const optional = (i: AgentInput) => !i.required && !hasDefault(i);

/** Why a pipeline input cannot fill an agent input, or null when it fits. */
export function fitProblem(src: AgentInput, dest: AgentInput): string | null {
  const mismatch = `Types do not fit: "${src.label}" is ${typeWord(src)}, and "${dest.label}" takes ${typeWord(dest)}.`;
  if (textish(dest.type)) {
    const d = dest as Extract<AgentInput, { type: "text" | "long_text" }>;
    if (src.type === "url") return d.limits.maxLength >= 2048 ? null : `"${src.label}" is a link of up to 2048 characters, and "${dest.label}" takes at most ${d.limits.maxLength}.`;
    if (!textish(src.type)) return mismatch;
    const s = src as Extract<AgentInput, { type: "text" | "long_text" }>;
    if (s.limits.maxLength > d.limits.maxLength) return `"${src.label}" can be ${s.limits.maxLength} characters, and "${dest.label}" takes at most ${d.limits.maxLength}.`;
    if (d.limits.minLength && (s.limits.minLength ?? 0) < d.limits.minLength) return `"${src.label}" can be shorter than the ${d.limits.minLength} characters "${dest.label}" needs.`;
    return null;
  }
  if (src.type !== dest.type) return mismatch;
  switch (dest.type) {
    case "choice": {
      const s = src as Extract<AgentInput, { type: "choice" }>;
      if (s.multiple && !dest.multiple) return mismatch;
      const allowed = dest.options.map((o) => o.value);
      const extra = s.options.filter((o) => !allowed.includes(o.value)).map((o) => o.value);
      return extra.length ? `"${src.label}" has options "${dest.label}" does not take: ${extra.join(", ")}.` : null;
    }
    case "number": {
      const s = src as Extract<AgentInput, { type: "number" }>;
      return s.limits.min < dest.limits.min || s.limits.max > dest.limits.max ? `"${src.label}" goes from ${s.limits.min} to ${s.limits.max}, and "${dest.label}" takes ${dest.limits.min} to ${dest.limits.max}.` : null;
    }
    case "file":
    case "image":
    case "video": {
      const s = src as Extract<AgentInput, { type: "file" | "image" | "video" }>;
      if (s.limits.maxFiles > dest.limits.maxFiles) return `"${src.label}" takes ${s.limits.maxFiles} files, and "${dest.label}" at most ${dest.limits.maxFiles}.`;
      if (s.limits.maxSizeMb > dest.limits.maxSizeMb) return `"${src.label}" takes files of ${s.limits.maxSizeMb} MB, and "${dest.label}" at most ${dest.limits.maxSizeMb} MB.`;
      return null;
    }
    default:
      return null;
  }
}

/** The semantic problems of a parsed pipeline body. Empty when it is good. */
export function checkPipeline(spec: PipelineBody, lookup?: AgentLookup): string[] {
  const errors: string[] = [];
  const inputs = new Map<string, AgentInput>();
  spec.inputs.forEach((i, n) => {
    if (inputs.has(i.key)) errors.push(`inputs[${n}].key: "${i.key}" is used twice.`);
    inputs.set(i.key, i);
  });

  if (spec.brand.input) {
    const b = inputs.get(spec.brand.input);
    if (!b) errors.push(`brand.input: No pipeline input "${spec.brand.input}".`);
    else if (b.type !== "profile") errors.push(`brand.input: "${b.label}" must be a Brand Brain picker (type profile).`);
  }
  if (spec.brand.idea) {
    const b = inputs.get(spec.brand.idea);
    if (!b) errors.push(`brand.idea: No pipeline input "${spec.brand.idea}".`);
    else if (!textish(b.type)) errors.push(`brand.idea: "${b.label}" must be text.`);
  }

  const ids = spec.steps.map((s) => s.id);
  ids.forEach((id, n) => {
    if (ids.indexOf(id) !== n) errors.push(`steps[${n}].id: "${id}" is used twice.`);
  });
  const agents = spec.steps.map((s) => (lookup ? lookup(s.agent.id, s.agent.version) : null));

  /** Problems with a reference to an earlier step's output, from step `at`. */
  const stepRef = (ref: { step: string; take: "all" | "picked"; field?: string }, at: number): string | null => {
    const idx = ids.indexOf(ref.step);
    if (idx === -1) return `No step "${ref.step}".`;
    if (idx === at) return `Reads its own output. A step only reads the steps before it, so a pipeline never loops.`;
    if (idx > at) return `Reads step "${ref.step}", which runs after it. A step only reads the steps before it, so a pipeline never loops.`;
    if (ref.take === "picked" && !spec.steps[idx].choose) return `Takes the item step "${ref.step}" picked, but that step does not pick one. Give it a choice, or take all of it.`;
    if (ref.field) {
      if (ref.take !== "picked") return `A field needs the picked item.`;
      const out = agents[idx]?.output;
      if (out) {
        const fields = out.kind === "list" ? out.fields : undefined;
        if (!fields) return `Step "${ref.step}" gives items without fields, so there is no "${ref.field}".`;
        if (!fields.includes(ref.field)) return `Step "${ref.step}" has no field "${ref.field}". Its fields: ${fields.join(", ")}.`;
      }
    }
    return null;
  };
  const skippable = (step: string) => Boolean(spec.steps.find((s) => s.id === step)?.runIf);

  spec.steps.forEach((step, n) => {
    const at = `steps[${n}]`;
    if (step.runIf) {
      const c = inputs.get(step.runIf.input);
      if (!c) errors.push(`${at}.runIf.input: No pipeline input "${step.runIf.input}".`);
      else if (c.type !== "choice" || c.multiple) errors.push(`${at}.runIf.input: "${c.label}" must be a choice of one option.`);
      else if (!c.options.some((o) => o.value === step.runIf!.equals)) errors.push(`${at}.runIf.equals: "${step.runIf.equals}" is not an option of "${c.label}".`);
    }

    const agent = agents[n];
    if (!lookup) return;
    if (!agent) {
      errors.push(`${at}.agent: No agent "${step.agent.id}"${step.agent.version === "current" ? "" : ` at version ${step.agent.version}`} that this pipeline can use.`);
      return;
    }
    if (!isRunnableOutput(agent.output)) errors.push(`${at}.agent: ${agent.name} makes ${agent.output.kind}, which needs the media tools of a later phase.`);

    for (const k of Object.keys(step.inputs)) {
      if (!agent.inputs.some((i) => i.key === k)) errors.push(`${at}.inputs.${k}: ${agent.name} has no input "${k}". It takes: ${agent.inputs.map((i) => i.key).join(", ")}.`);
    }
    for (const dest of agent.inputs) {
      const m = step.inputs[dest.key];
      if (!m) {
        if (dest.required && !hasDefault(dest) && !(dest.type === "profile" && spec.brand.input)) errors.push(`${at}.inputs.${dest.key}: "${dest.label}" is required by ${agent.name}, and nothing is mapped to it.`);
        continue;
      }
      const problem = mappingProblem(m, dest, n);
      if (problem) errors.push(`${at}.inputs.${dest.key}: ${problem}`);
    }

    if (step.choose?.kind === "item") {
      const o = agent.output;
      const count = o.kind === "list" ? o.count : o.kind === "script" || o.kind === "text" ? 1 : null;
      if (count !== null && step.choose.index >= count) errors.push(`${at}.choose.index: ${agent.name} gives ${count} item${count === 1 ? "" : "s"}, so item ${step.choose.index + 1} never exists.`);
    }
    if (step.onFail?.when === "brand" && !agent.guardrails.includes("brand_voice_check")) {
      errors.push(`${at}.onFail.when: ${agent.name} does not check brand fit, so a brand check never fails. Use any check instead.`);
    }
  });

  spec.package.forEach((p, n) => {
    const idx = ids.indexOf(p.step);
    if (idx === -1) errors.push(`package[${n}].step: No step "${p.step}".`);
    else if (p.take === "picked" && !spec.steps[idx].choose) errors.push(`package[${n}].take: Step "${p.step}" does not pick an item. Show all of it, or give it a choice.`);
  });

  return errors;

  function mappingProblem(m: Mapping, dest: AgentInput, n: number): string | null {
    switch (m.from) {
      case "input": {
        const src = inputs.get(m.key);
        if (!src) return `No pipeline input "${m.key}".`;
        const fit = fitProblem(src, dest);
        if (fit) return fit;
        if (dest.required && !hasDefault(dest) && optional(src)) return `"${src.label}" is optional, and "${dest.label}" is required. Make it required, or map something that is always there.`;
        return null;
      }
      case "value": {
        const r = validateRunInputs({ inputs: [dest] }, { [dest.key]: m.value });
        return r.ok ? null : r.errors.map((e) => e.replace(/^[a-z0-9_]+: /, "")).join(" ");
      }
      case "step": {
        if (!textish(dest.type)) return `Types do not fit: step "${m.step}" gives text, and "${dest.label}" takes ${typeWord(dest)}.`;
        const p = stepRef(m, n);
        if (p) return p;
        if (dest.required && skippable(m.step)) return `Step "${m.step}" may be skipped, and "${dest.label}" is required. Use a template with a fallback, like {{steps.${m.step}.${m.take}|inputs.idea}}.`;
        return null;
      }
      case "template": {
        if (!textish(dest.type)) return `Types do not fit: a template gives text, and "${dest.label}" takes ${typeWord(dest)}.`;
        const { parts, literal } = parseTemplate(m.text);
        if (!parts.length) return `The template has no {{...}} in it. Use a fixed value instead.`;
        let allMayBeEmpty = true;
        for (const part of parts) {
          let partMayBeEmpty = true;
          for (const ref of part.alternatives) {
            if (!ref) return `${part.raw} is not a reference. Use {{inputs.key}}, {{steps.id.all}}, {{steps.id.picked}} or {{steps.id.picked.field}}.`;
            const p = refProblem(ref, n);
            if (p) return `${part.raw}: ${p}`;
            if (!refMayBeEmpty(ref)) partMayBeEmpty = false;
          }
          if (!partMayBeEmpty) allMayBeEmpty = false;
        }
        if (dest.required && !literal && allMayBeEmpty) return `Every reference in the template may be empty, and "${dest.label}" is required. Add a fallback that is always there.`;
        return null;
      }
    }
  }

  function refProblem(ref: TemplateRef, n: number): string | null {
    if (ref.kind === "input") return inputs.has(ref.key) ? null : `No pipeline input "${ref.key}".`;
    return stepRef(ref, n);
  }

  function refMayBeEmpty(ref: TemplateRef): boolean {
    if (ref.kind === "input") {
      const i = inputs.get(ref.key);
      return !i || optional(i);
    }
    return skippable(ref.step);
  }
}

/** The whole spec: its shape, then its references and types. */
export function validatePipeline(input: unknown, lookup?: AgentLookup): Validation<PipelineSpec> {
  const parsed = parsePipelineSpec(input);
  if (!parsed.ok) return parsed;
  const errors = checkPipeline(parsed.value, lookup);
  return errors.length ? { ok: false, errors } : parsed;
}

/** The body only, for a save. */
export function validatePipelineBody(input: unknown, lookup?: AgentLookup): Validation<PipelineBody> {
  const parsed = parsePipelineBody(input);
  if (!parsed.ok) return parsed;
  const errors = checkPipeline(parsed.value, lookup);
  return errors.length ? { ok: false, errors } : parsed;
}

/** The confirmations a pipeline must ask for, from its agents' guardrails. */
export function pipelineConfirmations(agents: (Pick<AgentShape, "guardrails"> | null)[]): { rights: boolean; voice: boolean } {
  return {
    rights: agents.some((a) => a?.guardrails.includes("rights_confirmed")),
    voice: agents.some((a) => a?.guardrails.includes("voice_consent")),
  };
}
