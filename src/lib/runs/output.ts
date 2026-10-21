/**
 * Turns a model's answer into the agent's typed output. The prompt shows the
 * model one JSON example of the exact shape; the answer is parsed and checked
 * against the spec's output (counts, word and character limits, sections).
 * Every problem is listed, so a repair retry can say exactly what to fix.
 */
import type { Platform } from "@/lib/agents/catalog";
import type { AgentOutput } from "@/lib/agents/spec";

export type ScriptSection = { section: string; spoken: string; on_screen: string; seconds: number };
export type Caption = { platform: Platform; variants: string[] };
export type Post = { format: "post" | "thread" | "carousel" | "short"; parts: string[] };

export type RunOutput =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] | Record<string, string>[] }
  | { kind: "script"; sections: ScriptSection[] }
  | { kind: "caption_set"; captions: Caption[] }
  | { kind: "post_set"; posts: Post[] };

/** Output kinds the engine can produce now. Image, storyboard and video need media tools from a later phase. */
export const RUNNABLE_OUTPUT_KINDS = ["text", "list", "script", "caption_set", "post_set"] as const;

export function isRunnableOutput(output: AgentOutput): boolean {
  return (RUNNABLE_OUTPUT_KINDS as readonly string[]).includes(output.kind);
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const PART_LABEL = { post: "the post", thread: "post", carousel: "slide", short: "spoken line" } as const;

/* ---------- The example shown to the model ---------- */

export function outputExample(output: AgentOutput): Record<string, unknown> {
  switch (output.kind) {
    case "text":
      return { text: `<the text, max ${output.maxWords} words>` };
    case "list": {
      const limit = output.maxWordsPerItem ? `, max ${output.maxWordsPerItem} words` : "";
      const items = Array.from({ length: output.count }, (_, i) =>
        output.fields
          ? Object.fromEntries(output.fields.map((f) => [f, `<${f.replace(/_/g, " ")} for item ${i + 1}${limit}>`]))
          : `<item ${i + 1}${limit}>`,
      );
      return { items };
    }
    case "script": {
      const each = Math.max(1, Math.floor(output.maxSeconds / output.sections.length));
      return {
        sections: output.sections.map((s) => ({
          section: s,
          spoken: `<spoken lines for the ${s.replace(/_/g, " ")}>`,
          on_screen: "<what is on screen>",
          seconds: each,
        })),
      };
    }
    case "caption_set":
      return {
        captions: output.platforms.map((p) => ({
          platform: p,
          variants: Array.from({ length: output.variants }, (_, i) => `<caption ${i + 1} for ${p}, max ${output.maxChars} chars>`),
        })),
      };
    case "post_set":
      return {
        posts: output.formats.flatMap(({ format, count }) =>
          Array.from({ length: count }, () => ({
            format,
            parts:
              format === "post"
                ? [`<${PART_LABEL.post}>`]
                : [1, 2].map((n) => `<${PART_LABEL[format]} ${n}${format === "thread" ? ", max 280 chars" : ""}>`),
          })),
        ),
      };
    default:
      throw new Error(`Output kind "${output.kind}" cannot run yet.`);
  }
}

/** The output section of the system prompt. */
export function outputContract(output: AgentOutput): string {
  const rules: string[] = [];
  if (output.kind === "list") rules.push(`Exactly ${output.count} items.`);
  if (output.kind === "script") rules.push(`Sections in this order: ${output.sections.join(", ")}. Seconds add up to at most ${output.maxSeconds}.`);
  if (output.kind === "caption_set") {
    rules.push(`Only include the platforms the task asks for, from: ${output.platforms.join(", ")}. ${output.variants} variants each.`);
  }
  if (output.kind === "post_set") rules.push("Each post has one or more parts. Keep the number of posts per format as in the example.");
  return [
    "OUTPUT FORMAT",
    "Answer with one JSON object and nothing else: no text before or after it. Replace every <...> with real content.",
    ...rules,
    "```json",
    JSON.stringify(outputExample(output), null, 2),
    "```",
  ].join("\n");
}

/** Sent after an answer that did not fit, once. */
export function repairInstruction(problems: string[]): string {
  return [
    "Your answer did not match the output format:",
    ...problems.map((p) => `- ${p}`),
    "Answer again with only the JSON object, shaped exactly like the example in OUTPUT FORMAT. Keep the content, fix the shape.",
  ].join("\n");
}

/* ---------- Parsing ---------- */

export type ParseResult = { ok: true; value: RunOutput } | { ok: false; errors: string[] };

/** Reads the JSON object out of an answer, with or without a code fence around it. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error("The answer has no JSON object.");
  return JSON.parse(body.slice(start, end + 1));
}

export function parseOutput(output: AgentOutput, text: string): ParseResult {
  let data: unknown;
  try {
    data = extractJson(text);
  } catch (err) {
    return { ok: false, errors: [`Not valid JSON: ${(err as Error).message}`] };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, errors: ["The answer must be one JSON object."] };
  const o = data as Record<string, unknown>;
  const errors: string[] = [];
  const str = (v: unknown, path: string, rule?: { maxWords?: number; maxChars?: number }): string => {
    if (typeof v !== "string" || !v.trim()) {
      errors.push(`${path}: must be non-empty text.`);
      return "";
    }
    const s = v.trim();
    if (rule?.maxWords && words(s) > rule.maxWords) errors.push(`${path}: ${words(s)} words, at most ${rule.maxWords}.`);
    if (rule?.maxChars && s.length > rule.maxChars) errors.push(`${path}: ${s.length} characters, at most ${rule.maxChars}.`);
    return s;
  };
  const arr = (v: unknown, path: string): unknown[] => {
    if (!Array.isArray(v)) {
      errors.push(`${path}: must be a list.`);
      return [];
    }
    return v;
  };

  let value: RunOutput;
  switch (output.kind) {
    case "text":
      value = { kind: "text", text: str(o.text, "text", { maxWords: output.maxWords }) };
      break;
    case "list": {
      const items = arr(o.items, "items");
      if (items.length !== output.count && Array.isArray(o.items)) errors.push(`items: ${items.length} items, need exactly ${output.count}.`);
      const rule = { maxWords: output.maxWordsPerItem };
      const fields = output.fields;
      value = {
        kind: "list",
        items: fields
          ? items.map((it, i) => {
              if (!it || typeof it !== "object" || Array.isArray(it)) {
                errors.push(`items[${i}]: must be an object with ${fields.join(", ")}.`);
                return {};
              }
              const rec = it as Record<string, unknown>;
              return Object.fromEntries(fields.map((f) => [f, str(rec[f], `items[${i}].${f}`, rule)]));
            })
          : items.map((it, i) => str(it, `items[${i}]`, rule)),
      } as RunOutput;
      break;
    }
    case "script": {
      const sections = arr(o.sections, "sections").map((s, i): ScriptSection => {
        const rec = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
        const seconds = rec.seconds;
        if (typeof seconds !== "number" || !(seconds > 0)) errors.push(`sections[${i}].seconds: must be a positive number.`);
        return {
          section: str(rec.section, `sections[${i}].section`),
          spoken: str(rec.spoken, `sections[${i}].spoken`),
          on_screen: str(rec.on_screen, `sections[${i}].on_screen`),
          seconds: typeof seconds === "number" ? seconds : 0,
        };
      });
      const names = sections.map((s) => s.section);
      if (Array.isArray(o.sections) && names.join(",") !== output.sections.join(",")) {
        errors.push(`sections: must be ${output.sections.join(", ")} in that order, got ${names.join(", ") || "none"}.`);
      }
      const total = sections.reduce((t, s) => t + s.seconds, 0);
      if (total > output.maxSeconds) errors.push(`sections: ${total} seconds in total, at most ${output.maxSeconds}.`);
      value = { kind: "script", sections };
      break;
    }
    case "caption_set": {
      const seen = new Set<string>();
      const captions = arr(o.captions, "captions").map((c, i): Caption => {
        const rec = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
        const platform = rec.platform as Platform;
        if (!(output.platforms as string[]).includes(platform)) {
          errors.push(`captions[${i}].platform: ${JSON.stringify(platform)} is not one of ${output.platforms.join(", ")}.`);
        } else if (seen.has(platform)) errors.push(`captions[${i}].platform: ${platform} appears twice.`);
        seen.add(platform);
        const variants = arr(rec.variants, `captions[${i}].variants`);
        if (Array.isArray(rec.variants) && variants.length !== output.variants) {
          errors.push(`captions[${i}].variants: ${variants.length} variants, need exactly ${output.variants}.`);
        }
        return { platform, variants: variants.map((v, j) => str(v, `captions[${i}].variants[${j}]`, { maxChars: output.maxChars })) };
      });
      if (Array.isArray(o.captions) && captions.length === 0) errors.push("captions: need at least one platform.");
      value = { kind: "caption_set", captions };
      break;
    }
    case "post_set": {
      const posts = arr(o.posts, "posts").map((p, i): Post => {
        const rec = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
        const parts = arr(rec.parts, `posts[${i}].parts`);
        if (Array.isArray(rec.parts) && parts.length === 0) errors.push(`posts[${i}].parts: need at least one part.`);
        return { format: rec.format as Post["format"], parts: parts.map((t, j) => str(t, `posts[${i}].parts[${j}]`)) };
      });
      for (const { format, count } of output.formats) {
        const n = posts.filter((p) => p.format === format).length;
        if (n !== count) errors.push(`posts: ${n} ${format} posts, need exactly ${count}.`);
      }
      const known = output.formats.map((f) => f.format) as string[];
      posts.forEach((p, i) => {
        if (!known.includes(p.format)) errors.push(`posts[${i}].format: ${JSON.stringify(p.format)} is not one of ${known.join(", ")}.`);
      });
      value = { kind: "post_set", posts };
      break;
    }
    default:
      return { ok: false, errors: [`Output kind "${output.kind}" cannot run yet.`] };
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** Every piece of text in an output, for the guardrail checks. */
export function outputTexts(output: RunOutput): string[] {
  switch (output.kind) {
    case "text":
      return [output.text];
    case "list":
      return output.items.flatMap((it) => (typeof it === "string" ? [it] : Object.values(it)));
    case "script":
      return output.sections.flatMap((s) => [s.spoken, s.on_screen]);
    case "caption_set":
      return output.captions.flatMap((c) => c.variants);
    case "post_set":
      return output.posts.flatMap((p) => p.parts);
  }
}
