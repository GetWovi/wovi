/**
 * How values move between steps. Every typed output can be read two ways:
 * all of it as text, or as items a step can pick from (hooks, ideas, caption
 * variants, posts). A mapping turns those, the pipeline's own inputs, fixed
 * values and small templates into one agent input. Pure, no storage, so the
 * engine, the validator and the screens share it.
 */
import type { AgentInput } from "@/lib/agents/spec";
import type { RunInputs, RunValue } from "@/lib/runs/inputs";
import type { RunOutput } from "@/lib/runs/output";
import type { Mapping } from "./spec";

const PLATFORM_NAMES: Record<string, string> = { x: "X", tiktok: "TikTok", shorts: "YouTube Shorts", reels: "Instagram Reels" };
const FORMAT_NAMES: Record<string, string> = { post: "Post", thread: "Thread", carousel: "Carousel", short: "Short" };

const human = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** One thing a step can pick: a hook, an idea, a caption variant, a post. */
export type Item = {
  /** "1", "TikTok, variant 2", "Thread 1". */
  label: string;
  /** The item as plain text. */
  text: string;
  /** The item's fields, for lists with fields (an idea's idea, format and why). */
  fields: Record<string, string> | null;
};

/** The output as items. A script or a text is one item. */
export function outputItems(output: RunOutput): Item[] {
  switch (output.kind) {
    case "text":
      return [{ label: "1", text: output.text, fields: null }];
    case "list":
      return output.items.map((it, i) =>
        typeof it === "string"
          ? { label: String(i + 1), text: it, fields: null }
          : { label: String(i + 1), text: Object.entries(it).map(([k, v]) => `${human(k)}: ${v}`).join("\n"), fields: { ...it } },
      );
    case "script":
      return [{ label: "Script", text: scriptText(output), fields: null }];
    case "caption_set":
      return output.captions.flatMap((c) =>
        c.variants.map((v, j) => ({ label: `${PLATFORM_NAMES[c.platform] ?? c.platform}${c.variants.length > 1 ? `, variant ${j + 1}` : ""}`, text: v, fields: null })),
      );
    case "post_set":
      return output.posts.map((p, i) => ({ label: `${FORMAT_NAMES[p.format] ?? p.format} ${i + 1}`, text: p.parts.join("\n\n"), fields: null }));
  }
}

function scriptText(output: Extract<RunOutput, { kind: "script" }>): string {
  return output.sections.map((s) => `${human(s.section)} (${s.seconds} s)\nSay: ${s.spoken}\nOn screen: ${s.on_screen}`).join("\n\n");
}

/** The whole output as plain text, for an agent input that takes text. */
export function outputText(output: RunOutput): string {
  switch (output.kind) {
    case "text":
      return output.text;
    case "list":
      return outputItems(output)
        .map((it) => (it.fields ? it.text : `${it.label}. ${it.text}`))
        .join(output.items.some((x) => typeof x !== "string") ? "\n\n" : "\n");
    case "script":
      return scriptText(output);
    case "caption_set":
    case "post_set":
      return outputItems(output)
        .map((it) => `${it.label}\n${it.text}`)
        .join("\n\n");
  }
}

/* ---------- Templates ---------- */

/** One {{...}} in a template: alternatives tried in order, like {{steps.ideas.picked.idea|inputs.idea}}. */
export type TemplateRef =
  | { kind: "input"; key: string }
  | { kind: "step"; step: string; take: "all" | "picked"; field?: string };

export type TemplatePart = { raw: string; alternatives: (TemplateRef | null)[] };

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Reads one reference. Null when it is not one of the known shapes. */
export function parseRef(text: string): TemplateRef | null {
  const p = text.trim().split(".");
  if (p[0] === "inputs" && p.length === 2 && p[1]) return { kind: "input", key: p[1] };
  if (p[0] === "steps" && (p.length === 3 || p.length === 4) && p[1] && (p[2] === "all" || p[2] === "picked")) {
    if (p.length === 4 && p[2] !== "picked") return null;
    return { kind: "step", step: p[1], take: p[2], ...(p[3] ? { field: p[3] } : {}) };
  }
  return null;
}

/** Every {{...}} in a template, and the literal text around them. */
export function parseTemplate(text: string): { parts: TemplatePart[]; literal: string } {
  const parts: TemplatePart[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) parts.push({ raw: m[0], alternatives: m[1].split("|").map(parseRef) });
  return { parts, literal: text.replace(PLACEHOLDER, "").trim() };
}

/* ---------- Resolving a mapping ---------- */

/** What the engine knows about an earlier step when it resolves a mapping. */
export type StepValue = { skipped: boolean; output: RunOutput | null; picked: number | null };

export type ResolveContext = {
  /** The pipeline run's own inputs, checked. */
  inputs: RunInputs;
  /** The pipeline's input definitions, so a choice renders as its label inside a template. */
  inputDefs: AgentInput[];
  steps: Record<string, StepValue>;
};

function refValue(ref: TemplateRef, ctx: ResolveContext, inTemplate: boolean): RunValue | undefined {
  if (ref.kind === "input") {
    const v = ctx.inputs[ref.key];
    if (v === undefined || !inTemplate) return v;
    const def = ctx.inputDefs.find((i) => i.key === ref.key);
    if (def?.type === "choice") {
      const list = Array.isArray(v) ? (v as string[]) : [String(v)];
      return list.map((x) => def.options.find((o) => o.value === x)?.label ?? x).join(", ");
    }
    if (typeof v === "string" || typeof v === "number") return v;
    return undefined;
  }
  const step = ctx.steps[ref.step];
  if (!step || step.skipped || !step.output) return undefined;
  if (ref.take === "all") return outputText(step.output);
  if (step.picked === null) return undefined;
  const item = outputItems(step.output)[step.picked];
  if (!item) return undefined;
  if (ref.field) return item.fields?.[ref.field];
  return item.text;
}

const filled = (v: RunValue | undefined) => v !== undefined && !(typeof v === "string" && v.trim() === "") && !(Array.isArray(v) && v.length === 0);

/** The value a mapping gives, or undefined when its source is empty or was skipped. */
export function resolveMapping(m: Mapping, ctx: ResolveContext): RunValue | undefined {
  switch (m.from) {
    case "input":
      return refValue({ kind: "input", key: m.key }, ctx, false);
    case "value":
      return m.value;
    case "step":
      return refValue({ kind: "step", step: m.step, take: m.take, ...(m.field ? { field: m.field } : {}) }, ctx, false);
    case "template": {
      const out = m.text.replace(PLACEHOLDER, (_all, inner: string) => {
        for (const alt of inner.split("|")) {
          const ref = parseRef(alt);
          const v = ref ? refValue(ref, ctx, true) : undefined;
          if (filled(v)) return String(v);
        }
        return "";
      });
      const clean = out.replace(/\n{3,}/g, "\n\n").trim();
      return clean || undefined;
    }
  }
}

/** Every mapped input of a step, leaving out empty ones so defaults apply. */
export function resolveStepInputs(mappings: Record<string, Mapping>, ctx: ResolveContext): Record<string, RunValue> {
  const out: Record<string, RunValue> = {};
  for (const [k, m] of Object.entries(mappings)) {
    const v = resolveMapping(m, ctx);
    if (filled(v)) out[k] = typeof v === "string" ? v.trim() : v!;
  }
  return out;
}

/* ---------- The rewrite note ---------- */

export const NOTE_PREFIX = "Note for this run: ";

/** The text with a note added at the end, inside the input's limit. A note already there is replaced. */
export function withNote(text: string, note: string, maxLength: number): string {
  const i = text.lastIndexOf(`\n\n${NOTE_PREFIX}`);
  const base = i === -1 ? text : text.slice(0, i);
  let suffix = `\n\n${NOTE_PREFIX}${note}`;
  if (suffix.length > maxLength / 2) suffix = suffix.slice(0, Math.floor(maxLength / 2)).trimEnd();
  const room = Math.max(0, maxLength - suffix.length);
  const body = base.length > room ? base.slice(0, room).trimEnd() : base;
  return `${body}${suffix}`;
}
