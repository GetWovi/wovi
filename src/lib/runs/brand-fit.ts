/**
 * Brand fit, first version: cheap and deterministic, like the other
 * guardrails. It reads a draft against the Brand Brain and answers three
 * things:
 *
 * - flags: words the brand avoids, and lines that break its don't list;
 * - similarity: how close the draft's style and wording sit to the voice's
 *   sample lines (0 to 1), and which sample line it is closest to;
 * - score: one number from 0 to 100 for screens and quality gates.
 *
 * The don't rules are data (DONT_RULES), so phase 12 adds rules, an LLM
 * judge or embeddings beside them without touching the engine.
 */
import type { BrandBrain } from "./brand-brain";

export type FitFlag = {
  kind: "avoid_word" | "dont";
  /** The word to avoid, or the don't as the brand wrote it. */
  rule: string;
  /** What was found in the draft. */
  found: string;
};

export type BrandFit = {
  score: number;
  flags: FitFlag[];
  /** 0 to 1, or null when the voice has no sample lines to compare with. */
  similarity: number | null;
  /** The sample line the draft is closest to. */
  closest: string | null;
};

/** A style rule a don't can name: "No hashtags", "Never use emoji", "Avoid exclamation marks". */
export type DontRule = {
  id: string;
  /** Matches the don't's own text. */
  names: RegExp;
  /** What breaks it in a draft. */
  find: (text: string) => string[];
};

const EMOJI = /\p{Extended_Pictographic}/gu;
const all = (re: RegExp) => (text: string) => [...text.matchAll(re)].map((m) => m[0]);

export const DONT_RULES: DontRule[] = [
  { id: "hashtags", names: /\bhash ?tags?\b/i, find: all(/#[\p{L}\d_]+/gu) },
  { id: "emoji", names: /\bemoji/i, find: all(EMOJI) },
  { id: "exclamation", names: /\bexclamation/i, find: all(/!+/g) },
  { id: "all_caps", names: /\ball[- ]caps\b|\bcapital letters\b/i, find: all(/\b[A-Z]{4,}\b/g) },
  { id: "links", names: /\blinks?\b|\burls?\b/i, find: all(/https?:\/\/\S+/g) },
  { id: "mentions", names: /\b(@|at-)?mentions?\b|\btagging\b/i, find: all(/(^|\s)@[\w.]{2,}/g) },
];

/** A don't that forbids something starts with one of these. */
const NEGATION = /^\s*(no|never|don'?t|do not|avoid|without|stop)\b[\s,:]*/i;
/** Verbs after the negation that are not the thing itself: "never call anything X", "don't use X". */
const LEAD = /^(use|using|say|saying|write|writing|call|calling|mention|mentioning|put|start with|open with|post|posting|sound like|anything|it|the word|the words|words like|phrases like|like)\b\s*/i;

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function hasPhrase(hay: string, phrase: string): boolean {
  const p = norm(phrase).trim();
  if (!p) return false;
  return new RegExp(`(^|[^\\p{L}\\d])${escapeRe(p)}($|[^\\p{L}\\d])`, "iu").test(hay);
}

/** The phrases a don't forbids: quoted ones, or the short thing after the negation. */
export function dontPhrases(dont: string): string[] {
  const quoted = [...dont.matchAll(/["“'‘]([^"”'’]{2,40})["”'’]/g)].map((m) => m[1].trim());
  if (quoted.length) return quoted;
  if (!NEGATION.test(dont)) return [];
  let rest = dont.replace(NEGATION, "").replace(/[.!]+$/, "").trim();
  for (let i = 0; i < 3; i++) rest = rest.replace(LEAD, "");
  const words = rest.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 3 ? [rest] : [];
}

/** Every way a draft breaks the brand's avoid words and don'ts. */
export function fitFlags(texts: string[], brain: Pick<BrandBrain, "dos_donts" | "voiceDetail">): FitFlag[] {
  const joined = texts.join("\n");
  const hay = norm(joined);
  const flags: FitFlag[] = [];
  const avoid = new Set([...(brain.voiceDetail?.avoid ?? []), ...brain.dos_donts.bannedWords].map((w) => w.trim()).filter(Boolean));
  for (const word of avoid) if (hasPhrase(hay, word)) flags.push({ kind: "avoid_word", rule: word, found: word });
  for (const dont of brain.dos_donts.donts) {
    if (!NEGATION.test(dont) && !/["“]/.test(dont)) continue;
    const rule = DONT_RULES.find((r) => r.names.test(dont));
    if (rule) {
      const found = [...new Set(rule.find(joined).map((f) => f.trim()))];
      if (found.length) flags.push({ kind: "dont", rule: dont, found: found.slice(0, 3).join(" ") });
      continue;
    }
    const hit = dontPhrases(dont).find((p) => hasPhrase(hay, p) && !avoid.has(p));
    if (hit) flags.push({ kind: "dont", rule: dont, found: hit });
  }
  return flags;
}

/* ---------- Similarity ---------- */

type Style = { wordsPerSentence: number; emoji: number; hashtags: number; exclaim: number; lowerStart: number; question: number };

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\d]/u.test(s));
}

/** The style of a set of lines, averaged per line. */
export function styleOf(lines: string[]): Style {
  const n = Math.max(1, lines.length);
  // Hashtags and list items ("1. Rain") are not sentences.
  const prose = (l: string) =>
    l
      .replace(/#[\p{L}\d_]+/gu, " ")
      .split("\n")
      .filter((x) => !/^\s*(\d+[.)]|[-•*–])\s+/.test(x))
      .join("\n");
  const sents = lines.flatMap((l) => sentences(prose(l)));
  const words = sents.reduce((sum, s) => sum + s.split(/\s+/).filter(Boolean).length, 0);
  const startsLower = sents.filter((s) => /^[^\p{L}]*\p{Ll}/u.test(s)).length;
  return {
    wordsPerSentence: sents.length ? words / sents.length : 0,
    emoji: lines.reduce((s, l) => s + (l.match(EMOJI)?.length ?? 0), 0) / n,
    hashtags: lines.reduce((s, l) => s + (l.match(/#[\p{L}\d_]+/gu)?.length ?? 0), 0) / n,
    exclaim: lines.filter((l) => l.includes("!")).length / n,
    lowerStart: sents.length ? startsLower / sents.length : 0,
    question: lines.filter((l) => l.includes("?")).length / n,
  };
}

const closeness = (a: number, b: number, scale: number) => 1 - Math.min(1, Math.abs(a - b) / scale);

function styleSimilarity(a: Style, b: Style): number {
  const parts = [
    1 - Math.min(1, Math.abs(a.wordsPerSentence - b.wordsPerSentence) / Math.max(a.wordsPerSentence, b.wordsPerSentence, 1)),
    closeness(a.emoji, b.emoji, 2),
    closeness(a.hashtags, b.hashtags, 3),
    closeness(a.exclaim, b.exclaim, 1),
    closeness(a.lowerStart, b.lowerStart, 1),
    closeness(a.question, b.question, 1),
  ];
  return parts.reduce((s, x) => s + x, 0) / parts.length;
}

function trigrams(text: string): Map<string, number> {
  const t = ` ${norm(text).replace(/[^\p{L}\d ]+/gu, " ").replace(/\s+/g, " ").trim()} `;
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 2; i++) {
    const g = t.slice(i, i + 3);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    dot += v * (b.get(k) ?? 0);
  }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** How close the draft sits to the sample lines: style (70%) and wording (30%). Null without sample lines. */
export function voiceSimilarity(texts: string[], samples: string[]): { similarity: number; closest: string } | null {
  const lines = samples.map((s) => s.trim()).filter(Boolean);
  const drafts = texts.map((t) => t.trim()).filter(Boolean);
  if (!lines.length || !drafts.length) return null;
  const style = styleSimilarity(styleOf(drafts), styleOf(lines));
  const draftGrams = trigrams(drafts.join(" "));
  let best = { line: lines[0], score: -1 };
  for (const line of lines) {
    const score = 0.5 * styleSimilarity(styleOf(drafts), styleOf([line])) + 0.5 * cosine(draftGrams, trigrams(line));
    if (score > best.score) best = { line, score };
  }
  const wording = Math.max(...lines.map((l) => cosine(draftGrams, trigrams(l))));
  const similarity = Math.round((0.7 * style + 0.3 * wording) * 100) / 100;
  return { similarity, closest: best.line };
}

/** Points off the score per flag. */
export const FLAG_PENALTY = 15;
/** Below this similarity a draft reads unlike the voice. */
export const LOW_SIMILARITY = 0.45;

/** The full brand-fit reading of a draft. */
export function brandFit(texts: string[], brain: Pick<BrandBrain, "dos_donts" | "voiceDetail">): BrandFit {
  const flags = fitFlags(texts, brain);
  const sim = voiceSimilarity(texts, brain.voiceDetail?.samples ?? []);
  const base = sim ? 100 * (0.4 + 0.6 * sim.similarity) : 100;
  const score = Math.max(0, Math.min(100, Math.round(base - FLAG_PENALTY * flags.length)));
  return { score, flags, similarity: sim?.similarity ?? null, closest: sim?.closest ?? null };
}

/** One flag as a line for a check's findings. */
export function describeFlag(f: FitFlag): string {
  return f.kind === "avoid_word" ? `Uses "${f.found}", a word the brand avoids.` : `${f.rule.replace(/[.!]+$/, "")}: found ${f.found}`;
}
