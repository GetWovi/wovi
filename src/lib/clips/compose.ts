/**
 * Turns what the models read into the text sample a clip becomes, and that
 * text into a sample for one agent: inputs that fit the agent's form and the
 * ideal output in the same readable shape the launch samples use. Pure.
 */
import type { AgentInput, AgentSpec } from "@/lib/agents/spec";
import { injectionSignals } from "@/lib/safety/injection";
import { screen } from "@/lib/safety/screen";
import type { SampleInput } from "@/lib/builder/builder";
import { CLIP_TEXT_LIMITS, type Clip, type ClipPlatform, type ClipProbe, type ClipText, type FrameReading, type Transcript } from "./types";

export const PLATFORM_NAMES: Record<ClipPlatform, string> = { tiktok: "TikTok", reels: "Instagram Reels", shorts: "YouTube Shorts", x: "X" };

/** 0:07 */
export function stamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** The first sentence, at most `max` words. */
export function firstSentence(text: string, max = 20): string {
  const t = text.trim();
  if (!t) return "";
  const m = /^([\s\S]+?[.!?])(\s|$)/.exec(t);
  const sentence = (m ? m[1] : t).replace(/\s+/g, " ").trim();
  const w = words(sentence);
  return w.length > max ? `${w.slice(0, max).join(" ")}...` : sentence;
}

/** The transcript as text: one line per segment with its [m:ss] stamp, or the plain text when there are no timestamps. */
export function transcriptText(t: Transcript): string {
  if (t.segments.length) return t.segments.map((s) => `[${stamp(s.start)}] ${s.text}`).join("\n");
  return t.text;
}

/** A platform from the frames, else from the shape and length. */
export function guessPlatform(probe: ClipProbe, frames: FrameReading | null): { platform: ClipPlatform | null; why: string } {
  if (frames?.platformHint) return { platform: frames.platformHint, why: `The frames show ${PLATFORM_NAMES[frames.platformHint]}.` };
  const { width, height, durationSec } = probe;
  if (width && height && height > width * 1.3) {
    return durationSec <= 60 ? { platform: null, why: "Vertical and under a minute: TikTok, Reels or Shorts." } : { platform: "tiktok", why: "Vertical and over a minute: longer than Shorts takes." };
  }
  if (width && height && width > height * 1.3) return { platform: "x", why: "Landscape: reads as a post for X." };
  return { platform: null, why: "Square or unknown shape." };
}

export function composeClipText(probe: ClipProbe, transcript: Transcript | null, frames: FrameReading | null): ClipText {
  const spoken = transcript?.text.trim() ?? "";
  const onScreen = frames?.onScreenText ?? [];
  const firstSpoken = transcript?.segments.length ? transcript.segments[0].text : spoken;
  const hook = firstSentence(firstSpoken) || firstSentence(spoken) || onScreen[0] || "";
  const g = guessPlatform(probe, frames);
  return {
    hook: hook.slice(0, CLIP_TEXT_LIMITS.hook),
    transcript: (transcript ? transcriptText(transcript) : "").slice(0, CLIP_TEXT_LIMITS.transcript),
    onScreenText: onScreen.join("\n").slice(0, CLIP_TEXT_LIMITS.onScreenText),
    description: (frames?.description ?? "").slice(0, CLIP_TEXT_LIMITS.description),
    durationSec: probe.durationSec,
    platform: g.platform,
    platformWhy: g.why.slice(0, CLIP_TEXT_LIMITS.platformWhy),
  };
}

/**
 * The content rules (phase 18) and prompt injection signals in the clip's
 * text. Flags only: a clip is stored and shown whatever they find, with the
 * finding beside it, and a bench run with flagged inputs is refused by the
 * engine as any request would be.
 */
export function flagClipText(text: ClipText): Clip["flags"] {
  const texts = { hook: text.hook, transcript: text.transcript, on_screen_text: text.onScreenText, description: text.description };
  // Read both ways: the text becomes a sample's inputs (a request) and its ideal output.
  const seen = new Set<string>();
  const safety = [...screen(texts, { where: "request" }).findings, ...screen(texts, { where: "output" }).findings].filter((f) => {
    const k = `${f.rule}:${f.field}:${f.match}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  return { safety, injection: injectionSignals(texts) };
}

/* ---------- One clip as a sample for one agent ---------- */

/** The spoken words without stamps. */
function plainSpoken(text: ClipText): string {
  return text.transcript.replace(/^\[\d+:\d{2}\]\s*/gm, "").replace(/\s*\n\s*/g, " ").trim();
}

/** What the clip is, in a few lines, as a person would describe their post. */
function whatItShows(text: ClipText): string {
  const parts = [text.description, text.hook && `It opens with: "${text.hook}"`].filter(Boolean);
  return parts.join(" ");
}

function fit(s: string, input: AgentInput): string {
  const max = "limits" in input && input.limits && "maxLength" in input.limits && typeof input.limits.maxLength === "number" ? input.limits.maxLength : 2_000;
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 3);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40))}...`;
}

const PLATFORM_KEYS = new Set(["platform", "platforms", "posted_on"]);

/** A choice value for a platform input, from the clip's platform (TikTok when unknown and the input needs one). */
function platformValue(input: Extract<AgentInput, { type: "choice" }>, platform: ClipPlatform | null): string | string[] | undefined {
  const values = input.options.map((o) => o.value);
  const pick = platform && values.includes(platform) ? platform : values.includes("tiktok") ? "tiktok" : values[0];
  if (!pick) return undefined;
  return input.multiple ? [pick] : pick;
}

/** Which clip text a free-text input of a launch agent gets. */
const TEXT_FOR: Record<string, (t: ClipText) => string> = {
  niche: (t) => t.description,
  topic: (t) => whatItShows(t),
  idea: (t) => whatItShows(t),
  post: (t) => [whatItShows(t), plainSpoken(t) && `What is said: ${plainSpoken(t)}`, t.onScreenText && `On screen: ${t.onScreenText.replace(/\n/g, " / ")}`].filter(Boolean).join("\n"),
  caption: (t) => [t.hook, t.onScreenText.replace(/\n/g, " "), t.description].filter(Boolean).join(" "),
  source: (t) => plainSpoken(t) || whatItShows(t),
};

/** The ideal output for an agent, in the same shape the launch samples use. */
function idealFor(spec: AgentSpec, t: ClipText): string {
  const spoken = plainSpoken(t);
  const screenLines = t.onScreenText.split("\n").filter(Boolean);
  const name = t.platform ? PLATFORM_NAMES[t.platform] : "TikTok";
  switch (spec.id) {
    case "hook-writer":
      return [t.hook, ...screenLines.slice(0, 2)].filter((v, i, a) => v && a.indexOf(v) === i).join("\n");
    case "script-writer":
      return [`Clip (${Math.round(t.durationSec)} s)`, `Say: ${t.transcript || "(no speech)"}`, `On screen: ${screenLines.join(" / ") || t.description}`].join("\n");
    case "caption-writer":
      return `${name}\n${screenLines.join(" ") || t.hook}`;
    case "repurposer":
      return [name, `Hook: ${t.hook}`, `Script: ${spoken}`, `On screen: ${screenLines.join(" / ")}`, `Caption: ${t.description}`].join("\n");
    case "hashtag-picker": {
      const tags = `${t.onScreenText} ${spoken}`.match(/#[\p{L}\p{N}_]+/gu) ?? [];
      return tags.length ? [...new Set(tags)].join("\n") : `Term: ${t.hook}\nWhere: first line of the caption`;
    }
    case "idea-generator":
      return [`Idea: ${t.hook || t.description}`, `Format: ${t.description}`, `Why it fits: ${t.platformWhy}`].join("\n");
    case "trend-scout":
      return [`Trend: ${t.description}`, `What it looks like: ${t.hook}${screenLines.length ? ` / ${screenLines[0]}` : ""}`, `Evidence: this clip (${Math.round(t.durationSec)} s)`].join("\n");
    default: {
      const kind = spec.output.kind;
      if (kind === "script") return [`Say: ${t.transcript}`, `On screen: ${screenLines.join(" / ")}`].join("\n");
      if (kind === "caption_set") return `${name}\n${screenLines.join(" ") || t.hook}`;
      return [t.hook, spoken, t.onScreenText].filter(Boolean).join("\n\n");
    }
  }
}

/**
 * The sample for one agent: every required input filled from the clip (free
 * text from the clip's words, a platform from its guess, other choices at
 * their default), the ideal output from the clip, the clip's label, title and
 * note. The builder checks it against the form when it is saved.
 */
export function clipSampleFor(spec: AgentSpec, clip: Pick<Clip, "id" | "file" | "poster" | "label" | "title" | "note" | "text">): SampleInput {
  const t = clip.text;
  if (!t) throw new Error("The clip has no text yet.");
  const inputs: Record<string, unknown> = {};
  for (const input of spec.inputs) {
    if (input.type === "choice") {
      if (PLATFORM_KEYS.has(input.key)) {
        const v = platformValue(input, t.platform);
        if (v !== undefined) inputs[input.key] = v;
      } else if (input.key === "length" && input.options.some((o) => o.value === "s15")) {
        inputs[input.key] = t.durationSec <= 20 ? "s15" : t.durationSec <= 40 ? "s30" : "s60";
      } else if (input.required) {
        inputs[input.key] = input.default ?? (input.multiple ? [input.options[0].value] : input.options[0].value);
      }
    } else if (input.type === "text" || input.type === "long_text") {
      const from = TEXT_FOR[input.key];
      if (from || input.required) {
        const v = fit((from ?? ((x: ClipText) => whatItShows(x)))(t), input);
        const min = input.limits && "minLength" in input.limits && typeof input.limits.minLength === "number" ? input.limits.minLength : 0;
        if (v && v.length >= min) inputs[input.key] = v;
        else if (input.required) inputs[input.key] = fit([whatItShows(t), plainSpoken(t), t.onScreenText.replace(/\n/g, " / ")].filter(Boolean).join(" "), input);
      }
    } else if (input.type === "number" && input.required) {
      inputs[input.key] = input.default ?? input.limits.min;
    }
  }
  const note = [clip.note, `From the clip "${clip.file.name}".`].filter(Boolean).join(" ");
  return {
    label: clip.label,
    title: clip.title || clip.file.name.replace(/\.[^.]+$/, ""),
    inputs,
    idealOutput: idealFor(spec, t).slice(0, 20_000),
    note: note.slice(0, 500),
    links: [],
    fileIds: [],
    clip: { id: clip.id, name: clip.file.name, posterId: clip.poster?.id ?? null },
  };
}
