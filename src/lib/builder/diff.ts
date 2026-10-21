/**
 * A readable diff between two versions of an agent. Every body field is
 * written out as lines of plain text, and the lines of the two versions are
 * compared (longest common subsequence), so the screen can show what was
 * added and what was removed, field by field.
 */
import { GUARDRAILS, TOOLS, findModelRoute } from "@/lib/agents/catalog";
import { BODY_KEYS, type AgentBody, type AgentInput, type AgentOutput } from "@/lib/agents/spec";

export type DiffLine = { type: "same" | "add" | "remove"; text: string };

/** Lines of `b` against lines of `a`. */
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");
  if (a === b) return x.map((text) => ({ type: "same", text }));
  // LCS table, bottom-up: L[i][j] is the length of the common subsequence of x[i..] and y[j..].
  const L: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      out.push({ type: "same", text: x[i] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) {
      out.push({ type: "remove", text: x[i] });
      i++;
    } else {
      out.push({ type: "add", text: y[j] });
      j++;
    }
  }
  while (i < x.length) out.push({ type: "remove", text: x[i++] });
  while (j < y.length) out.push({ type: "add", text: y[j++] });
  return out;
}

/* ---------- The body as lines ---------- */

export const FIELD_LABELS: Record<Exclude<keyof AgentBody, "id" | "version">, string> = {
  name: "Name",
  job: "Job",
  category: "Category",
  platforms: "Platforms",
  inputs: "Inputs",
  output: "Output",
  brandBrain: "Brand Brain",
  tools: "Tools",
  guardrails: "Guardrails",
  routing: "Model slot",
  instructions: "Instructions",
};

export type DiffField = keyof typeof FIELD_LABELS;
export const DIFF_FIELDS = BODY_KEYS.filter((k): k is DiffField => k !== "id" && k !== "version");

function inputLine(i: AgentInput): string {
  const limits = "limits" in i && i.limits ? Object.entries(i.limits).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("|") : v}`).join(", ") : "";
  const options = i.type === "choice" ? `options ${i.options.map((o) => o.value).join("|")}${i.multiple ? ", multiple" : ""}` : "";
  const def = "default" in i && i.default !== undefined ? `default ${Array.isArray(i.default) ? i.default.join("|") : i.default}` : "";
  const extra = [limits, options, def].filter(Boolean).join("; ");
  return `${i.key}: ${i.label} (${i.type}${i.required ? ", required" : ", optional"})${extra ? ` ${extra}` : ""}${i.help ? ` help: ${i.help}` : ""}`;
}

export function outputLines(o: AgentOutput): string[] {
  switch (o.kind) {
    case "text":
      return [`text, up to ${o.maxWords} words`];
    case "list":
      return [`list of ${o.count}${o.maxWordsPerItem ? `, up to ${o.maxWordsPerItem} words each` : ""}${o.fields ? `, fields ${o.fields.join(", ")}` : ""}`];
    case "script":
      return [`script up to ${o.maxSeconds} s`, `sections ${o.sections.join(", ")}`];
    case "caption_set":
      return [`caption set for ${o.platforms.join(", ")}`, `${o.variants} variants, up to ${o.maxChars} characters`];
    case "post_set":
      return o.formats.map((f) => `${f.count} ${f.format}`);
    case "image":
      return [`${o.count} images, ${o.aspect}`];
    case "storyboard":
      return [`storyboard up to ${o.maxFrames} frames, ${o.aspect}${o.withImages ? ", with images" : ""}`];
    case "video":
      return [`video up to ${o.maxSeconds} s, ${o.aspect}`];
  }
}

const routeText = (id: string) => {
  const r = findModelRoute(id);
  return r?.model ? `${id} (${r.model})` : id;
};

/** Each body field as lines of text, the same way for both sides of a diff. */
export function fieldLines(body: AgentBody, field: DiffField): string[] {
  switch (field) {
    case "name":
    case "job":
    case "category":
      return [body[field]];
    case "platforms":
      return body.platforms.length ? [...body.platforms] : ["none"];
    case "inputs":
      return body.inputs.map(inputLine);
    case "output":
      return outputLines(body.output);
    case "brandBrain":
      return body.brandBrain.length ? [...body.brandBrain] : ["not read"];
    case "tools":
      return body.tools.length ? body.tools.map((t) => TOOLS.find((x) => x.id === t)?.label ?? t) : ["none"];
    case "guardrails":
      return body.guardrails.length ? body.guardrails.map((g) => GUARDRAILS.find((x) => x.id === g)?.label ?? g) : ["none"];
    case "routing": {
      const r = body.routing;
      return [
        `model ${routeText(r.model)}`,
        `fallback ${routeText(r.fallback)}`,
        `temperature ${r.temperature ?? "default"}`,
        `spend cap $${r.maxCostUsd} a run`,
        `max output tokens ${r.maxOutputTokens ?? "default"}`,
      ];
    }
    case "instructions":
      return body.instructions.split("\n");
  }
}

export type FieldDiff = {
  field: DiffField;
  label: string;
  changed: boolean;
  a: string[];
  b: string[];
  lines: DiffLine[];
};

export type SpecDiff = { fields: FieldDiff[]; changed: DiffField[] };

/** The diff of two bodies, field by field. */
export function specDiff(a: AgentBody, b: AgentBody): SpecDiff {
  const fields = DIFF_FIELDS.map((field): FieldDiff => {
    const la = fieldLines(a, field);
    const lb = fieldLines(b, field);
    const lines = lineDiff(la.join("\n"), lb.join("\n"));
    return { field, label: FIELD_LABELS[field], changed: lines.some((l) => l.type !== "same"), a: la, b: lb, lines };
  });
  return { fields, changed: fields.filter((f) => f.changed).map((f) => f.field) };
}
