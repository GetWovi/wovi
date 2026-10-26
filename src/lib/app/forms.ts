/**
 * The agent's own form, generated from its spec: friendly labels, help text,
 * limits in words, one field per typed input. The screen renders these; the
 * engine still checks every value itself (validateRunInputs), so the form and
 * the engine can never disagree about what is valid.
 */
import { PLATFORMS } from "@/lib/agents/catalog";
import type { AgentInput, AgentSpec } from "@/lib/agents/spec";
import { validateRunInputs, type FileRef } from "@/lib/runs/inputs";

export type FormFieldKind = "text" | "long_text" | "url" | "number" | "choice" | "choices" | "file" | "image" | "video";

export type FormField = {
  key: string;
  label: string;
  kind: FormFieldKind;
  required: boolean;
  /** The spec's help, or a plain line about the limits when it has none. */
  help: string;
  /** A short line about the limits: "10 to 600 characters". */
  limits: string;
  placeholder: string;
  minLength?: number;
  maxLength?: number;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** For files: what the picker accepts, as an `accept` attribute. */
  accept?: string;
  maxFiles?: number;
  maxSizeMb?: number;
  maxSeconds?: number;
};

/** What the screen holds per field: text, a list of options, or uploaded files. */
export type FormValue = string | string[] | FileRef[];
export type FormValues = Record<string, FormValue>;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function textLimits(input: Extract<AgentInput, { type: "text" | "long_text" }>): string {
  const { minLength, maxLength } = input.limits;
  return minLength ? `${minLength} to ${maxLength} characters` : `Up to ${maxLength} characters`;
}

function fileLimits(input: Extract<AgentInput, { type: "file" | "image" | "video" }>): string {
  const parts = [`Up to ${plural(input.limits.maxFiles, input.type === "image" ? "image" : input.type)}`, `${input.limits.maxSizeMb} MB each`];
  if (input.type === "video") parts.push(`${input.limits.maxSeconds} seconds at most`);
  if (input.type === "file") parts.push(input.limits.accept.join(", "));
  return parts.join(", ");
}

/** One form field per input, except the Brand Brain picker, which the screen draws itself. */
export function formFields(spec: Pick<AgentSpec, "inputs">): FormField[] {
  const out: FormField[] = [];
  for (const input of spec.inputs) {
    if (input.type === "profile") continue;
    const base = { key: input.key, label: input.label, required: input.required, help: input.help ?? "", limits: "", placeholder: "" };
    switch (input.type) {
      case "text":
      case "long_text":
        out.push({ ...base, kind: input.type, limits: textLimits(input), minLength: input.limits.minLength, maxLength: input.limits.maxLength });
        break;
      case "url":
        out.push({ ...base, kind: "url", limits: "A full link starting with https://", placeholder: "https://" });
        break;
      case "number":
        out.push({ ...base, kind: "number", limits: `${input.limits.min} to ${input.limits.max}${input.limits.step ? `, in steps of ${input.limits.step}` : ""}`, min: input.limits.min, max: input.limits.max, step: input.limits.step });
        break;
      case "choice":
        out.push({ ...base, kind: input.multiple ? "choices" : "choice", limits: input.multiple ? "Pick one or more" : "Pick one", options: input.options });
        break;
      case "image":
        out.push({ ...base, kind: "image", limits: fileLimits(input), accept: "image/png,image/jpeg,image/webp,image/gif", maxFiles: input.limits.maxFiles, maxSizeMb: input.limits.maxSizeMb });
        break;
      case "video":
        out.push({ ...base, kind: "video", limits: fileLimits(input), accept: "video/*", maxFiles: input.limits.maxFiles, maxSizeMb: input.limits.maxSizeMb, maxSeconds: input.limits.maxSeconds });
        break;
      case "file":
        out.push({ ...base, kind: "file", limits: fileLimits(input), accept: input.limits.accept.join(","), maxFiles: input.limits.maxFiles, maxSizeMb: input.limits.maxSizeMb });
        break;
    }
    const last = out[out.length - 1];
    if (!last.help) last.help = last.limits;
  }
  return out;
}

/** Empty values, with the spec's choice and number defaults filled in. */
export function initialValues(spec: Pick<AgentSpec, "inputs">): FormValues {
  const out: FormValues = {};
  for (const input of spec.inputs) {
    if (input.type === "profile") continue;
    if (input.type === "choice") out[input.key] = input.multiple ? ((input.default as string[] | undefined) ?? []) : ((input.default as string | undefined) ?? "");
    else if (input.type === "number") out[input.key] = input.default === undefined ? "" : String(input.default);
    else if (input.type === "image" || input.type === "file" || input.type === "video") out[input.key] = [] as FileRef[];
    else out[input.key] = "";
  }
  return out;
}

/**
 * The person's own platform as the pick of every one-pick platform field: the
 * first of their Brand Brain's platforms (saved at onboarding) that the field
 * offers. It wins over the spec's default, which knows nothing of the person.
 */
export function platformDefaults(spec: Pick<AgentSpec, "inputs">, platforms: readonly string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!platforms?.length) return out;
  for (const input of spec.inputs) {
    if (input.type !== "choice" || input.multiple) continue;
    const offered = input.options.map((o) => o.value);
    if (!offered.every((v) => (PLATFORMS as readonly string[]).includes(v))) continue;
    const first = platforms.find((p) => offered.includes(p));
    if (first) out[input.key] = first;
  }
  return out;
}

/** Empty values with the person's platform picked, for a form that opens on a Brand Brain. */
export function initialValuesFor(spec: Pick<AgentSpec, "inputs">, platforms: readonly string[] | undefined): FormValues {
  return { ...initialValues(spec), ...platformDefaults(spec, platforms) };
}

/** Another Brand Brain picked: platform fields still on the old default follow the new one; a pick the person made stays. */
export function switchPlatformDefaults(spec: Pick<AgentSpec, "inputs">, values: FormValues, before: readonly string[] | undefined, after: readonly string[] | undefined): FormValues {
  const base = initialValues(spec);
  const was = platformDefaults(spec, before);
  const now = platformDefaults(spec, after);
  const out = { ...values };
  for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
    if (values[key] === (was[key] ?? base[key])) out[key] = now[key] ?? base[key];
  }
  return out;
}

/** Sample inputs from a golden sample as form values, so a screen can start filled in. */
export function valuesFrom(spec: Pick<AgentSpec, "inputs">, inputs: Record<string, unknown>): FormValues {
  const out = initialValues(spec);
  for (const input of spec.inputs) {
    const v = inputs[input.key];
    if (v === undefined || input.type === "profile") continue;
    if (input.type === "choice" && input.multiple) out[input.key] = Array.isArray(v) ? v.map(String) : [String(v)];
    else if (input.type === "image" || input.type === "file" || input.type === "video") out[input.key] = Array.isArray(v) ? (v as FileRef[]) : [];
    else out[input.key] = String(v);
  }
  return out;
}

/** The values as the engine takes them: empties left out, numbers as numbers, the Brand Brain picker added when given. */
export function toRunInputs(spec: Pick<AgentSpec, "inputs">, values: FormValues, brandBrainId?: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const input of spec.inputs) {
    if (input.type === "profile") {
      if (brandBrainId) out[input.key] = brandBrainId;
      continue;
    }
    const v = values[input.key];
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (input.type === "number") out[input.key] = Number(v);
    else out[input.key] = v;
  }
  return out;
}

export type FormCheck = { ok: true; inputs: Record<string, unknown> } | { ok: false; errors: Record<string, string> };

/** The engine's own validation, with each message under the field it is about. */
export function checkForm(spec: Pick<AgentSpec, "inputs">, values: FormValues, brandBrainId?: string | null): FormCheck {
  const inputs = toRunInputs(spec, values, brandBrainId);
  const r = validateRunInputs(spec, inputs);
  if (r.ok) return { ok: true, inputs: r.value };
  return { ok: false, errors: errorsByField(r.errors) };
}

/** "idea: Required." lines as { idea: "Required." }. Lines without a key go under "form". */
export function errorsByField(errors: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) {
    const m = /^([a-z][a-z0-9_]*): (.*)$/.exec(e);
    const key = m ? m[1] : "form";
    out[key] = out[key] ? `${out[key]} ${m ? m[2] : e}` : m ? m[2] : e;
  }
  return out;
}

/** The first required text input: the idea, the post, the caption. Quick edits add their note there. */
export function primaryTextKey(spec: Pick<AgentSpec, "inputs">): string | null {
  const text = (i: AgentInput) => i.type === "text" || i.type === "long_text";
  return spec.inputs.find((i) => i.required && text(i))?.key ?? spec.inputs.find(text)?.key ?? null;
}

/** Which confirmations the form must ask for, from the agent's guardrails. */
export function confirmationsFor(spec: Pick<AgentSpec, "guardrails"> & { inputs?: AgentSpec["inputs"] }): { rights: boolean; voice: boolean } {
  // Phase 18: any agent that takes files asks for the rights confirmation, whatever it declares.
  const files = (spec.inputs ?? []).some((i) => i.type === "file" || i.type === "image" || i.type === "video");
  return { rights: spec.guardrails.includes("rights_confirmed") || files, voice: spec.guardrails.includes("voice_consent") };
}
