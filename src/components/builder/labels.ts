/** Words for the catalog values, for the builder's screens. Data only. */
import type { Category, Platform } from "@/lib/agents/catalog";

export const PLATFORM_LABELS: Record<Platform, string> = { x: "X", tiktok: "TikTok", shorts: "Shorts", reels: "Reels" };

export const CATEGORY_LABELS: Record<Category, string> = {
  research: "Research",
  ideation: "Ideation",
  writing: "Writing",
  production: "Production",
  optimization: "Optimization",
  publish: "Publish",
};

export const BRAND_PART_LABELS: Record<string, { label: string; description: string }> = {
  voice: { label: "Voice", description: "How the brand sounds, in a few sentences." },
  mood_board: { label: "Mood board", description: "The look: colours, light, pace, framing. The agent's own board is added here." },
  references: { label: "References", description: "Past posts that worked. The agent's board links are added here." },
  dos_donts: { label: "Dos and don'ts", description: "The rules and the banned words." },
  idea: { label: "The idea", description: "The bigger idea behind the brand." },
};

export const INPUT_TYPE_LABELS: Record<string, string> = {
  text: "Short text",
  long_text: "Long text",
  url: "Link",
  file: "File",
  image: "Image",
  video: "Video",
  choice: "Choice",
  number: "Number",
  profile: "Brand Brain",
};

export const OUTPUT_KIND_LABELS: Record<string, string> = {
  text: "Text",
  list: "List",
  script: "Script",
  caption_set: "Caption set",
  post_set: "Post set",
  image: "Images",
  storyboard: "Storyboard",
  video: "Video",
};

export const ROUTE_LABELS: Record<string, string> = {
  "text-fast": "Text, fast",
  "text-standard": "Text, standard",
  "text-strong": "Text, strong",
  "image-standard": "Image",
  "video-standard": "Video",
  "audio-standard": "Audio",
};

export const RATING_LABELS: Record<string, string> = { good: "Good", ok: "Ok", bad: "Bad" };

/** Micro-dollars as money: cents from a dollar up, four decimals under it, so a column lines up. */
export function money(micro: number): string {
  const usd = micro / 1_000_000;
  if (usd === 0) return "$0";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd < 0.0001) return "under $0.0001";
  return `$${usd.toFixed(4)}`;
}

/** Milliseconds as a short time: "840 ms", "2.3 s", "1 min 5 s". */
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${Math.round((ms - m * 60_000) / 1000)} s`;
}

/** 0 to 1 as "75%". */
export function percent(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? "" : `${Math.round(rate * 100)}%`;
}

/** The time a server page renders at, read once per request for the "ago" labels. */
export function currentTime(): number {
  return Date.now();
}

/** "2 days ago", "just now". */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return iso.slice(0, 10);
}
