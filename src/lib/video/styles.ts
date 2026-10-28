/**
 * Make a video, version 2: what a video is for (the type) and how it looks
 * (the style) are two separate choices. Each style carries its own picture
 * rules and its own motion; Motion graphics draws no pictures at all and uses
 * the minimal motion engine (motion.ts). Plain data, shared by the screens and
 * the server.
 */

export const TYPES = [
  { value: "explainer", label: "Explainer", hint: "Makes one thing clear, step by step.", words: "an explainer video: it makes one thing clear, with a fact, a step or a number in every scene" },
  { value: "product", label: "Product feature", hint: "One product or service up close, and why it is good.", words: "a product feature video: it shows the real thing up close and the one reason it is good" },
  { value: "teaser", label: "Teaser", hint: "Builds curiosity and ends on one reveal.", words: "a teaser video: short, mysterious lines that build curiosity and end on one clear reveal" },
  { value: "story", label: "Story", hint: "A small story with a start, a turn and an end.", words: "a story video: a small, true to life story with a start, a turn and an end" },
  { value: "ad", label: "Ad", hint: "One offer, one reason, one next step.", words: "a short ad: one offer, the one reason to want it, and one clear next step at the end" },
  { value: "tutorial", label: "Tutorial", hint: "How to do one thing, in clear steps.", words: "a tutorial: how to do one thing, one clear step per scene" },
  { value: "announcement", label: "Announcement", hint: "News: what, when and where.", words: "an announcement: what is new, when and where, said plainly" },
] as const;

/** How the pictures move in the cut: slow drifts, livelier moves, a push-in on every scene, or a still hold with hard cuts. */
export type Motion = "slow" | "lively" | "punchy" | "still";

export const STYLES = [
  {
    value: "3d",
    label: "3D",
    hint: "A clean 3D animated look, soft light, rounded shapes.",
    motion: "lively",
    picture: "A clean 3D animated render, like a still from a modern animated film: soft global light, rounded friendly shapes, smooth matte materials, gentle shadows, a simple uncluttered set.",
  },
  {
    value: "2d",
    label: "2D",
    hint: "Flat illustration, clear shapes, bold colours.",
    motion: "lively",
    picture: "A flat 2D vector illustration: clear simple shapes, bold solid colours, clean outlines, plenty of open space, no photo texture.",
  },
  {
    value: "realistic",
    label: "Realistic",
    hint: "Natural photos, like shot on a good phone.",
    motion: "slow",
    picture: "A natural, realistic photo, like shot on a good phone: natural light, true colours, a real everyday setting, nothing staged or glossy.",
  },
  {
    value: "hyperrealistic",
    label: "Hyperrealistic",
    hint: "Cinematic, high detail, dramatic light, shallow depth of field.",
    motion: "slow",
    picture: "A hyperrealistic cinematic shot: very high detail, dramatic directional light, rich contrast, shallow depth of field with a softly blurred background, like a still from a film.",
  },
  {
    value: "comic",
    label: "Comic",
    hint: "Comic book panels, ink lines, halftone dots.",
    motion: "punchy",
    picture: "One comic book panel: bold black ink lines, flat bright colours, halftone dot shading, a dynamic angle and a thick panel border. Original characters only. No speech bubbles, no captions and no sound effect words.",
  },
  {
    value: "motion",
    label: "Motion graphics",
    hint: "Line and shape animation, no pictures.",
    motion: "slow",
    picture: "",
  },
  {
    value: "pixel",
    label: "Pixel",
    hint: "Retro pixel art, limited palette.",
    motion: "still",
    picture: "Retro pixel art, like a 16-bit game: a visible pixel grid, a limited palette of about 16 colours, crisp hard edges, no blur and no smooth gradients.",
  },
] as const satisfies readonly { value: string; label: string; hint: string; motion: Motion; picture: string }[];

export type VideoType = (typeof TYPES)[number]["value"];
export type VideoStyle = (typeof STYLES)[number]["value"];
/** The styles that draw pictures, the ones a restyle can switch between. */
export const PICTURE_STYLES = STYLES.filter((s) => s.value !== "motion").map((s) => s.value) as Exclude<VideoStyle, "motion">[];

/** Every picture keeps these, whatever the style. */
export const PICTURE_RULES =
  "No text, letters, numbers, captions, signs with writing, logos or watermarks anywhere in the picture. No real or famous person and no face that looks like one. No trademarks, brand names, or known characters from films, games, comics or cartoons.";

export const styleOf = (value: string | undefined) => STYLES.find((s) => s.value === value) ?? STYLES[1];
export const typeOf = (value: string | undefined) => TYPES.find((t) => t.value === value) ?? TYPES[0];
/** The example picture each style card shows, made once (scripts/video-samples.ts). */
export const styleExample = (style: VideoStyle) => `/video-styles/${style}.jpg`;

/** The voices a voiceover can have; "none" means no voiceover. */
export const SPOKEN_VOICES = [
  { value: "warm", label: "Warm", hint: "Friendly and close." },
  { value: "calm", label: "Calm", hint: "Slow and steady." },
  { value: "bright", label: "Bright", hint: "Upbeat and quick." },
] as const;
export type SpokenVoice = (typeof SPOKEN_VOICES)[number]["value"];
/** A two second sample of each voice, made once (scripts/video-samples.ts). */
export const voiceSample = (voice: SpokenVoice) => `/video-voices/${voice}.mp3`;

export const CAPTION_LOOKS = [
  { value: "clean", label: "Clean", hint: "White words with a soft outline, a few at a time." },
  { value: "bold", label: "Bold", hint: "Big words, each one lights up as it is said." },
  { value: "minimal", label: "Minimal", hint: "Small, quiet words." },
] as const;
export const CAPTION_POSITIONS = [
  { value: "bottom", label: "Bottom" },
  { value: "middle", label: "Middle" },
] as const;
export type CaptionLook = (typeof CAPTION_LOOKS)[number]["value"];
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number]["value"];
export type Captions = { on: boolean; look: CaptionLook; position: CaptionPosition };

/** The brand's look for a video: its name, its colours and its logo, from the default Brand Brain. */
export type BrandLook = { name: string; colors: string[]; logo: { bytes: Uint8Array; mimeType: string } | null };

const hex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
function luminance(c: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function saturation(c: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * The brand's colours as roles: an accent bright enough to read on a picture
 * (for the words on screen and the motion shapes), a coloured one for the
 * caption word being said (null when the brand has no real colour), a
 * dark one for the end card's background and a light one for its words.
 */
export function brandPalette(colors: readonly string[]): { accent: string | null; highlight: string | null; dark: string; light: string } {
  const ok = colors.filter(hex);
  const readable = ok.filter((c) => luminance(c) > 0.12).sort((a, b) => saturation(b) - saturation(a));
  const dark = [...ok].sort((a, b) => luminance(a) - luminance(b))[0];
  const light = [...ok].sort((a, b) => luminance(b) - luminance(a))[0];
  return {
    accent: readable[0] ?? null,
    // The lit caption word must stand out from the white ones: only a real colour, never a cream or a grey.
    highlight: readable.find((c) => saturation(c) >= 0.3) ?? null,
    dark: dark && luminance(dark) < 0.2 ? dark : "#0B0B10",
    light: light && luminance(light) > 0.6 ? light : "#FFFFFF",
  };
}
