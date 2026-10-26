import type { Platform } from "@/lib/agents/catalog";

/** Plain module, so server pages can read it (a constant from a client module arrives there as a reference, not the object). */
export const PLATFORM_LABELS: Record<Platform, string> = { x: "X", tiktok: "TikTok", shorts: "YouTube Shorts", reels: "Instagram Reels" };

/** Cream or night text, whichever reads on a colour. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#0B1230" : "#FFF4DC";
}
