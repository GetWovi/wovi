/**
 * The quality checks (phase 12): deterministic and cheap, no model calls.
 * Each one reads a draft and returns a score from 0 to 100, a status and its
 * reasons in plain words. The combined score and the gate are in
 * evaluate.ts; the lists and limits are data in data.ts.
 */
import type { Platform } from "@/lib/agents/catalog";
import { PLATFORMS } from "@/lib/agents/catalog";
import type { AgentBody } from "@/lib/agents/spec";
import type { BrandBrain } from "@/lib/runs/brand-brain";
import { LOW_SIMILARITY, brandFit, describeFlag, voiceSimilarity } from "@/lib/runs/brand-fit";
import { PHRASE_LISTS, findPhrases } from "@/lib/runs/guardrails";
import type { RunInputs } from "@/lib/runs/inputs";
import { outputTexts, type RunOutput } from "@/lib/runs/output";
import { CHECKS, FILLER_WORDS, GENERIC_PHRASES, PENALTIES, PLATFORM_RULES, THREAD_PART_CHARS, VAGUE_WORDS, WEAK_BELOW, type Language } from "./data";
import type { QualityCheckId, QualityCheckResult, QualityStatus } from "./types";

/** What the checks compare a draft with, besides the inputs and the Brand Brain: the agent's golden and bad samples. */
export type QualityReferences = { gold: string[]; bad: string[] };

export const NO_REFERENCES: QualityReferences = { gold: [], bad: [] };

export type QualityInput = {
  /** The checks read the first four; the judge's rubric also reads the job, the instructions' QUALITY RULES and the Brand Brain parts. */
  spec: Pick<AgentBody, "inputs" | "output" | "platforms" | "category"> & Partial<Pick<AgentBody, "name" | "job" | "instructions" | "brandBrain">>;
  /** The person's inputs, without any rewrite note. */
  inputs: RunInputs;
  output: RunOutput;
  brain: BrandBrain | null;
  references: QualityReferences;
  language?: Language;
  /** What the agent's tools found (Trend Scout's web lookup), as the agent saw it. Only the judge reads it. */
  toolFindings?: string;
};

type Outcome = { status: QualityStatus; score: number | null; reasons: string[] };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ");
const quote = (s: string, max = 70) => `"${s.length > max ? `${s.slice(0, max - 3).trimEnd()}...` : s}"`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The units a draft is read in: list items (fields joined), script beats,
 * caption variants, posts. A plain text is one unit.
 */
export function draftUnits(output: RunOutput): string[] {
  switch (output.kind) {
    case "text":
      return [output.text];
    case "list":
      return output.items.map((it) => (typeof it === "string" ? it : Object.values(it).join(" | ")));
    case "script":
      return output.sections.map((s) => `${s.spoken} ${s.on_screen}`);
    case "caption_set":
      return output.captions.flatMap((c) => c.variants);
    case "post_set":
      return output.posts.map((p) => p.parts.join("\n"));
  }
}

/** A word's simple stem, so "plumber" and "plumbers" or "bake" and "baking" meet. */
function stem(w: string): string {
  return w.replace(/'s$/, "").replace(/(ing|ers|er|es|ed|s)$/, "").slice(0, 7);
}

const words = (text: string) => norm(text).match(/[\p{L}][\p{L}'-]{2,}/gu) ?? [];

/** The concrete details a draft can name: content words, numbers and names from the inputs and the Brand Brain. */
export function anchorsOf(input: Pick<QualityInput, "spec" | "inputs" | "brain">, only: "all" | "inputs" = "all"): { stems: Set<string>; numbers: Set<string> } {
  const texts: string[] = [];
  for (const def of input.spec.inputs) {
    const v = input.inputs[def.key];
    if ((def.type === "text" || def.type === "long_text") && typeof v === "string") texts.push(v);
  }
  const b = only === "all" ? input.brain : null;
  if (b && b.id !== "run_idea") texts.push(b.name, b.niche ?? "", ...(b.voiceDetail?.topics ?? []));
  if (b?.idea) texts.push(b.idea);
  const stems = new Set(words(texts.join(" ")).filter((w) => w.length >= 4 && !VAGUE_WORDS.has(w)).map(stem));
  const numbers = new Set(texts.join(" ").match(/\d[\d.,:]*/g)?.map((n) => n.replace(/[.,:]+$/, "")) ?? []);
  return { stems, numbers };
}

/** Whether a unit names something concrete: a detail from the input or Brand Brain, any number, or a name. */
function concreteDetails(unit: string, anchors: { stems: Set<string>; numbers: Set<string> }): string[] {
  const found: string[] = [];
  for (const w of words(unit)) if (w.length >= 4 && !VAGUE_WORDS.has(w) && anchors.stems.has(stem(w))) found.push(w);
  for (const n of unit.match(/\d[\d.,:]*/g) ?? []) found.push(n.replace(/[.,:]+$/, ""));
  // Names: a capitalised word that does not start a sentence.
  for (const m of unit.matchAll(/(?<=[\p{Ll},;] )\p{Lu}[\p{Ll}]{2,}/gu)) found.push(m[0]);
  return found;
}

/* ---------- The checks ---------- */

/** Specific to you: each unit names a real detail; filler words and repeats cost points. */
export function specificityCheck(input: QualityInput): Outcome {
  const lang = input.language ?? "en";
  const units = draftUnits(input.output).filter((u) => u.trim());
  if (!units.length) return { status: "fail", score: 0, reasons: ["The draft is empty."] };
  const anchors = anchorsOf(input);
  const reasons: string[] = [];

  const vague = units.filter((u) => concreteDetails(u, anchors).length === 0);
  const coverage = (units.length - vague.length) / units.length;
  // The person's own words: at least one unit has to name something from them.
  const own = anchorsOf(input, "inputs");
  const fromInput = units.some((u) => words(u).some((w) => w.length >= 4 && own.stems.has(stem(w))) || (u.match(/\d[\d.,:]*/g) ?? []).some((n) => own.numbers.has(n.replace(/[.,:]+$/, ""))));

  const filler = findPhrases(units, { phrases: FILLER_WORDS[lang] });
  const seen = new Map<string, string>();
  const repeats: string[] = [];
  for (const u of units) {
    const k = norm(u).replace(/[^\p{L}\d ]+/gu, "").trim();
    if (seen.has(k)) repeats.push(u);
    seen.set(k, u);
  }

  let score = 100 * coverage;
  score -= Math.min(PENALTIES.fillerMax, PENALTIES.fillerWord * filler.length);
  score -= PENALTIES.repeat * repeats.length;

  const one = units.length === 1;
  reasons.push(
    one
      ? vague.length
        ? "It names nothing concrete from your input: no name, number or real detail."
        : "It names real details from your input."
      : `${units.length - vague.length} of ${units.length} ${input.output.kind === "script" ? "beats" : "lines"} name a real detail from your input or Brand Brain.`,
  );
  if (!one && vague.length) reasons.push(`Could be about anyone: ${vague.slice(0, 3).map((v) => quote(v)).join(", ")}.`);
  if (filler.length) reasons.push(`Filler words: ${filler.join(", ")}.`);
  if (repeats.length) reasons.push(`Repeats itself: ${repeats.slice(0, 2).map((r) => quote(r)).join(", ")}.`);

  const hasAnchors = own.stems.size > 0 || own.numbers.size > 0;
  if (hasAnchors && !fromInput) {
    reasons.unshift("Nothing in it names anything from your input.");
    return { status: "fail", score: clamp(Math.min(score, 30)), reasons };
  }
  if (repeats.length) return { status: "fail", score: clamp(score), reasons };
  return { status: score < WEAK_BELOW ? "weak" : "pass", score: clamp(score), reasons };
}

/** No generic phrases: the banned list, one hit fails. */
export function genericPhrasesCheck(input: QualityInput): Outcome {
  const found = findPhrases(outputTexts(input.output), { phrases: GENERIC_PHRASES[input.language ?? "en"] });
  if (!found.length) return { status: "pass", score: 100, reasons: ["None of the stock lines that could come from any brand."] };
  return {
    status: "fail",
    score: clamp(100 - PENALTIES.genericPhrase * found.length),
    reasons: [`Uses ${plural(found.length, "generic phrase")}: ${found.map((f) => quote(f)).join(", ")}.`, "Swap each one for something only this brand would say."],
  };
}

/** Like your best posts: style and wording against the brand's posts that worked and the agent's golden samples, and away from its bad ones. */
export function referenceAnchoringCheck(input: QualityInput): Outcome {
  const brandRefs = input.brain?.references ?? [];
  const gold = [...brandRefs, ...input.references.gold].map((s) => s.trim()).filter(Boolean);
  const bad = input.references.bad.map((s) => s.trim()).filter(Boolean);
  if (!gold.length) return { status: "skipped", score: null, reasons: ["No posts that worked and no golden samples to compare with yet."] };
  const texts = draftUnits(input.output);
  const good = voiceSimilarity(texts, gold);
  if (!good) return { status: "skipped", score: null, reasons: ["Nothing to compare."] };
  let score = 100 * (0.35 + 0.65 * good.similarity);
  const reasons = [`${Math.round(good.similarity * 100)}% like ${brandRefs.length ? "your posts that worked" : "the agent's best examples"}.`];
  const worse = bad.length ? voiceSimilarity(texts, bad) : null;
  if (worse && worse.similarity > good.similarity + 0.05) {
    score -= PENALTIES.badReference;
    reasons.push(`Reads closer to a known bad example (${quote(worse.closest, 50)}) than to the good ones.`);
  }
  reasons.push(`Closest: ${quote(good.closest, 80)}`);
  return { status: score < WEAK_BELOW ? "weak" : "pass", score: clamp(score), reasons };
}

/** Brand fit, the phase 7 reading: words to avoid, don'ts, closeness to the sample lines. */
export function brandFitCheck(input: QualityInput): Outcome {
  const b = input.brain;
  if (!b || (b.id === "run_idea" && !b.dos_donts.donts.length && !b.dos_donts.bannedWords.length)) {
    return { status: "skipped", score: null, reasons: ["No Brand Brain, so brand fit was not read."] };
  }
  const fit = brandFit(outputTexts(input.output), b);
  if (fit.flags.length) {
    return { status: "fail", score: fit.score, reasons: [`Breaks ${plural(fit.flags.length, "brand rule")}.`, ...fit.flags.slice(0, 4).map(describeFlag)] };
  }
  if (fit.similarity === null) return { status: "pass", score: fit.score, reasons: ["Keeps every brand rule. No sample lines to compare the voice with yet."] };
  if (fit.similarity < LOW_SIMILARITY) return { status: "weak", score: fit.score, reasons: ["Keeps the rules, but reads unlike your voice's sample lines.", `Closest sample line: ${quote(fit.closest ?? "", 80)}`] };
  return { status: "pass", score: fit.score, reasons: ["Keeps every brand rule and sounds like your sample lines."] };
}

/** No misleading claims: results, money and health promises, invented reviews, impersonation, unsafe advice. */
export function claimsCheck(input: QualityInput): Outcome {
  const texts = outputTexts(input.output);
  const lists = [
    ["misleading_claims", "A claim it cannot back up"],
    ["fake_testimonials", "Reads like an invented review"],
    ["impersonation", "Speaks as someone else"],
    ["unsafe_content", "Unsafe advice"],
  ] as const;
  const reasons: string[] = [];
  for (const [list, words] of lists) {
    const found = findPhrases(texts, PHRASE_LISTS[list]);
    if (found.length) reasons.push(`${words}: ${found.map((f) => quote(f)).join(", ")}.`);
  }
  if (!reasons.length) return { status: "pass", score: 100, reasons: ["No promises about results, money or health, and no invented reviews."] };
  return { status: "fail", score: 0, reasons: [...reasons, "These always go to a person before anything is used."] };
}

/** The platform a list of tags is for: the run's own platform input, else the agent's only platform. */
function platformOf(input: QualityInput): Platform | null {
  for (const def of input.spec.inputs) {
    const v = input.inputs[def.key];
    if (def.type === "choice" && !def.multiple && typeof v === "string" && (PLATFORMS as readonly string[]).includes(v)) return v as Platform;
  }
  return input.spec.platforms.length === 1 ? input.spec.platforms[0] : null;
}

const HASHTAG = /#[\p{L}\d_]+/gu;

/** Fits the platform: lengths, titles, hashtag counts, as data per platform. */
export function platformRulesCheck(input: QualityInput): Outcome {
  const out = input.output;
  const hard: string[] = [];
  const soft: string[] = [];
  if (out.kind === "caption_set") {
    for (const c of out.captions) {
      const rule = PLATFORM_RULES[c.platform];
      if (!rule) continue;
      c.variants.forEach((v, i) => {
        const which = c.variants.length > 1 ? `${rule.name} version ${i + 1}` : rule.name;
        // A layout with labelled lines carries its caption under "Caption:"; the title is that caption's first line.
        const caption = /^Caption:\s*([^]*)$/im.exec(v)?.[1] ?? v;
        if (caption.length > rule.captionChars) hard.push(`${which} is ${caption.length} characters; ${rule.name} allows ${rule.captionChars}.`);
        const tags = caption.match(HASHTAG)?.length ?? 0;
        if (tags > rule.hashtagsMax) hard.push(`${which} has ${tags} hashtags; keep it to ${rule.hashtagsMax} on ${rule.name}.`);
        const title = (/^Title:\s*(.*)$/im.exec(v)?.[1] ?? caption.split("\n")[0]).trim();
        if (rule.titleChars && title.length > rule.titleChars) hard.push(`${which}: the title is ${title.length} characters; ${rule.name} shows ${rule.titleChars}.`);
        if (rule.firstLineChars && caption.split("\n")[0].length > rule.firstLineChars) soft.push(`${which}: the first line runs past ${rule.firstLineChars} characters, so the point may hide behind "more".`);
      });
    }
  }
  if (out.kind === "post_set") {
    for (const p of out.posts.filter((p) => p.format === "thread")) {
      p.parts.forEach((t, i) => {
        if (t.length > THREAD_PART_CHARS) hard.push(`Thread post ${i + 1} is ${t.length} characters; X allows ${THREAD_PART_CHARS}.`);
      });
    }
  }
  if (out.kind === "list" && out.items.some((it) => typeof it !== "string")) {
    const platform = platformOf(input);
    const rule = platform ? PLATFORM_RULES[platform] : null;
    const tags = (out.items as Record<string, string>[]).filter((it) => it.type === "hashtag" || /^#/.test(it.term ?? "")).length;
    if (rule && tags > rule.hashtagsMax) hard.push(`${tags} hashtags; keep it to ${rule.hashtagsMax} on ${rule.name}.`);
  }
  const score = clamp(100 - PENALTIES.platformHard * hard.length - PENALTIES.platformSoft * soft.length);
  if (hard.length) return { status: "fail", score, reasons: [...hard, ...soft] };
  if (soft.length) return { status: "weak", score, reasons: soft };
  const relevant = out.kind === "caption_set" || out.kind === "post_set" || out.kind === "list";
  return { status: "pass", score: 100, reasons: [relevant ? "Inside every platform limit." : "Nothing platform-bound to check."] };
}

/** The deterministic checks, in the order screens show them. */
export const DETERMINISTIC_CHECKS: { id: Exclude<QualityCheckId, "judge">; run: (input: QualityInput) => Outcome }[] = [
  { id: "specificity", run: specificityCheck },
  { id: "generic_phrases", run: genericPhrasesCheck },
  { id: "brand_fit", run: brandFitCheck },
  { id: "reference_anchoring", run: referenceAnchoringCheck },
  { id: "claims", run: claimsCheck },
  { id: "platform_rules", run: platformRulesCheck },
];

export function runDeterministicChecks(input: QualityInput): QualityCheckResult[] {
  return DETERMINISTIC_CHECKS.map((c) => ({ id: c.id, label: CHECKS[c.id].label, weight: CHECKS[c.id].weight, ...c.run(input) }));
}
