/**
 * Checks and cleans a Brand Brain body before it is saved: trims text, drops
 * empty list entries and duplicates, holds every limit, and gives new
 * references and mood items an id. Every problem is listed at once, in plain
 * words, with the field it belongs to.
 */
import { newId } from "@/lib/accounts/crypto";
import { PLATFORMS, type Platform } from "@/lib/agents/catalog";
import { BRAND_LIMITS as L, MOOD_KINDS, type BrainBody, type MoodItem, type Reference, type Voice } from "./types";

export type BodyCheck = { ok: true; value: BrainBody } | { ok: false; errors: string[] };

const HEX = /^#[0-9a-f]{6}$/i;
const ITEM_ID = /^[a-z]{3,4}_[a-f0-9]{20}$/;

export function cleanText(v: unknown): string {
  return (typeof v === "string" ? v : "").replace(/\r\n/g, "\n").trim();
}

export function cleanLink(v: unknown): string | null {
  const s = cleanText(v);
  if (!s || s.length > 2048) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function text(errors: string[], field: string, v: unknown, max: number, required = false): string {
  const s = cleanText(v);
  if (required && !s) errors.push(`${field}: Add this first.`);
  if (s.length > max) errors.push(`${field}: At most ${max} characters (now ${s.length}).`);
  return s;
}

/** A list of short strings: trimmed, empties and duplicates dropped (case-insensitive). */
function words(errors: string[], field: string, v: unknown, maxItems: number, maxEach: number): string[] {
  const list = Array.isArray(v) ? v : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const s = cleanText(item).replace(/\s+/g, " ");
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    if (s.length > maxEach) errors.push(`${field}: "${s.slice(0, 30)}..." is longer than ${maxEach} characters.`);
    out.push(s);
  }
  if (out.length > maxItems) errors.push(`${field}: At most ${maxItems} entries (now ${out.length}).`);
  return out;
}

function itemId(v: unknown, prefix: string): string {
  return typeof v === "string" && ITEM_ID.test(v) ? v : newId(prefix);
}

function voice(errors: string[], v: unknown): Voice {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    description: text(errors, "voice.description", o.description, L.voiceDescription),
    tone: words(errors, "voice.tone", o.tone, L.tags, L.tag),
    use: words(errors, "voice.use", o.use, L.words, L.word),
    avoid: words(errors, "voice.avoid", o.avoid, L.words, L.word),
    samples: words(errors, "voice.samples", o.samples, L.sampleLines, L.sampleLine),
  };
}

function references(errors: string[], v: unknown): Reference[] {
  const list = Array.isArray(v) ? v : [];
  if (list.length > L.references) errors.push(`references: At most ${L.references} references (now ${list.length}).`);
  return list.map((r, i) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const at = `references[${i}]`;
    const t = text(errors, `${at}.text`, o.text, L.referenceText);
    const rawUrl = cleanText(o.url);
    const url = rawUrl ? cleanLink(rawUrl) : null;
    if (rawUrl && !url) errors.push(`${at}.url: Use a full http or https link.`);
    if (!t && !url) errors.push(`${at}: Paste the post or add its link.`);
    return { id: itemId(o.id, "ref"), text: t, url, note: text(errors, `${at}.note`, o.note, L.referenceNote) };
  });
}

/** Mood items as sent. Image files are resolved by the caller, which knows the workspace's storage. */
function moodBoard(errors: string[], v: unknown): MoodItem[] {
  const list = Array.isArray(v) ? v : [];
  if (list.length > L.moodItems) errors.push(`moodBoard: At most ${L.moodItems} items (now ${list.length}).`);
  return list.map((m, i) => {
    const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    const at = `moodBoard[${i}]`;
    const kind = MOOD_KINDS.includes(o.kind as never) ? (o.kind as MoodItem["kind"]) : null;
    if (!kind) errors.push(`${at}.kind: An item is an image, a link, a text snippet or a colour swatch.`);
    const item: MoodItem = { id: itemId(o.id, "mood"), kind: kind ?? "text", note: text(errors, `${at}.note`, o.note, L.moodNote), url: null, text: null, color: null, file: null };
    if (kind === "link") {
      item.url = cleanLink(o.url);
      if (!item.url) errors.push(`${at}.url: Use a full http or https link.`);
    } else if (kind === "text") {
      item.text = text(errors, `${at}.text`, o.text, L.moodText, true);
    } else if (kind === "swatch") {
      const c = cleanText(o.color);
      if (!HEX.test(c)) errors.push(`${at}.color: A swatch is a colour like #FF5A1F.`);
      item.color = c.toUpperCase();
    } else if (kind === "image") {
      const f = o.file as MoodItem["file"];
      if (!f || typeof f !== "object" || typeof f.id !== "string") errors.push(`${at}.file: Upload the image first.`);
      else item.file = f;
    }
    return item;
  });
}

export function checkBody(input: unknown): BodyCheck {
  const errors: string[] = [];
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const platforms = Array.isArray(o.platforms) ? o.platforms : [];
  const bad = platforms.filter((p) => !PLATFORMS.includes(p as Platform));
  if (bad.length) errors.push(`platforms: Unknown platform ${bad.map((p) => JSON.stringify(p)).join(", ")}. Pick from ${PLATFORMS.join(", ")}.`);
  const value: BrainBody = {
    name: text(errors, "name", o.name, L.name, true),
    niche: text(errors, "niche", o.niche, L.niche),
    platforms: PLATFORMS.filter((p) => platforms.includes(p)),
    voice: voice(errors, o.voice),
    topics: words(errors, "topics", o.topics, L.topics, L.topic),
    references: references(errors, o.references),
    moodBoard: moodBoard(errors, o.moodBoard),
    dos: words(errors, "dos", o.dos, L.rules, L.rule),
    donts: words(errors, "donts", o.donts, L.rules, L.rule),
    idea: text(errors, "idea", o.idea, L.idea),
  };
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
