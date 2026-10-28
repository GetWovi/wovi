/**
 * Captions for Make a video: the spoken words on screen, timed to the voice.
 * There is no word timing from the voice model, so each word gets a share of
 * the clip's measured speech time by its length, with a small pause after a
 * comma or a full stop. The same cues drive the burned-in captions (an
 * overlay track rendered by captions-render.ts) and the free preview in the
 * browser, so both show the same words at the same moments.
 *
 * Three looks: Clean (a few words, white with an outline), Bold (big words,
 * the one being said lights up in the highlight colour) and Minimal (small,
 * quiet words). Two positions: bottom and middle.
 */
import { escapeXml } from "./motion";
import type { CaptionLook, CaptionPosition } from "./styles";

export type WordTime = { word: string; start: number; end: number };
/** One caption on screen: a few words from `start` to `end`, with the word being said (`active`) highlighted, or -1 for none. */
export type CaptionCue = { start: number; end: number; words: string[]; active: number };

const letters = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length;

/**
 * The words of one clip spread over `duration` seconds from `start`: a word
 * takes time by its length (plus a little for every word), and a comma or a
 * full stop adds a short pause after it.
 */
export function wordTimings(text: string, start: number, duration: number): WordTime[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || duration <= 0) return [];
  const length = words.map((w) => letters(w) + 1.5);
  const pause = words.map((w, i): number => (i === words.length - 1 ? 0 : /[.!?]["')\]]?$/.test(w) ? 3 : /[,;:]$/.test(w) ? 1.5 : 0));
  const total = length.reduce((a, b) => a + b, 0) + pause.reduce((a, b) => a + b, 0);
  const scale = duration / total;
  let t = start;
  return words.map((word, i) => {
    const w = { word, start: round(t), end: round(t + length[i] * scale) };
    t += (length[i] + pause[i]) * scale;
    return w;
  });
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** How each look sits on a frame of this size: font size, line length, where the words stand, and their case. */
export function captionLayout(look: CaptionLook, position: CaptionPosition, width: number, height: number) {
  const s = Math.min(width, height);
  const size = Math.round(s * (look === "bold" ? 0.078 : look === "minimal" ? 0.05 : 0.062));
  // Outfit is about 0.58 of its size wide a letter in bold, a little less in regular.
  const perChar = look === "minimal" ? 0.5 : look === "bold" ? 0.64 : 0.58;
  const maxChars = Math.max(8, Math.floor((width * 0.86) / (size * perChar)));
  const words = look === "bold" ? 3 : look === "minimal" ? 6 : 4;
  const tall = height > width;
  const y = position === "middle" ? height * 0.55 : height * (tall ? 0.78 : look === "minimal" ? 0.9 : 0.86);
  return { size, maxChars, words, y: Math.round(y), upper: look === "bold", weight: look === "minimal" ? 400 : 800 };
}

/** Words grouped into the short lines a look shows at once: at most so many words, never wider than the frame. */
export function captionLines(words: WordTime[], maxWords: number, maxChars: number): WordTime[][] {
  const out: WordTime[][] = [];
  let cur: WordTime[] = [];
  for (const w of words) {
    const next = [...cur, w].map((x) => x.word).join(" ");
    if (cur.length && (cur.length >= maxWords || next.length > maxChars)) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * The cues for one clip's words, never past `until` (the end of the scene).
 * Clean and Minimal show a line until the next one starts; Bold shows the
 * same line once per word, with that word lit.
 */
export function captionCues(words: WordTime[], look: CaptionLook, layout: { words: number; maxChars: number }, until: number): CaptionCue[] {
  const lines = captionLines(words, layout.words, layout.maxChars);
  const cues: CaptionCue[] = [];
  lines.forEach((line, i) => {
    const next = lines[i + 1]?.[0]?.start;
    const end = Math.min(until, next ?? line[line.length - 1].end + 0.35);
    const text = line.map((w) => w.word);
    if (look !== "bold") {
      cues.push({ start: line[0].start, end, words: text, active: -1 });
      return;
    }
    line.forEach((w, j) => cues.push({ start: w.start, end: Math.min(until, line[j + 1]?.start ?? end), words: text, active: j }));
  });
  return cues.filter((c) => c.end > c.start);
}

/** Every cue of a video: each scene's words over its own speech time, shifted to where the scene starts. */
export function videoCues(
  scenes: { words: string; start: number; seconds: number; speechStart: number; speechSeconds: number }[],
  look: CaptionLook,
  position: CaptionPosition,
  width: number,
  height: number,
): CaptionCue[] {
  const layout = captionLayout(look, position, width, height);
  return scenes.flatMap((s) => captionCues(wordTimings(s.words, s.start + s.speechStart, Math.min(s.speechSeconds, s.seconds - s.speechStart)), look, layout, s.start + s.seconds));
}

/** How long the words take to read when there is no voice: about 2.6 words a second, inside the scene. */
export function readingSeconds(words: string, seconds: number): number {
  const n = words.split(/\s+/).filter(Boolean).length;
  return Math.max(0.5, Math.min(seconds - 0.2, n / 2.6 + 0.3));
}

/** One cue as a transparent full-frame SVG: an outline pass under the words, the lit word in the highlight colour. */
export function captionSvg(cue: CaptionCue, look: CaptionLook, position: CaptionPosition, width: number, height: number, highlight: string): string {
  const L = captionLayout(look, position, width, height);
  const words = cue.words.map((w) => (L.upper ? w.toUpperCase() : w));
  // A line longer than the frame (one very long word) is drawn smaller.
  const chars = words.join(" ").length;
  const size = chars > L.maxChars ? Math.max(12, Math.floor((L.size * L.maxChars) / chars)) : L.size;
  // Two spaces between words under the thick outline, so it never closes the gap; one under Minimal's thin one.
  const spans = (fill: (i: number) => string) => words.map((w, i) => `<tspan fill="${fill(i)}">${escapeXml(w)}</tspan>`).join(look === "minimal" ? " " : "  ");
  const base = "#FFFFFF";
  const stroke = look === "minimal" ? Math.max(2, size * 0.14) : Math.max(3, size * 0.18);
  const strokeColour = look === "minimal" ? "rgba(0,0,0,0.72)" : "#000000";
  const attrs = `x="${width / 2}" y="${L.y}" text-anchor="middle" font-family="Outfit" font-weight="${L.weight}" font-size="${size}" xml:space="preserve"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<text ${attrs} stroke="${strokeColour}" stroke-width="${stroke.toFixed(1)}" stroke-linejoin="round">${spans(() => strokeColour)}</text>
<text ${attrs}>${spans((i) => (i === cue.active ? highlight : base))}</text>
</svg>`;
}
