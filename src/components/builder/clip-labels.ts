/** Words and numbers for clip screens. Client-safe. */
import type { Clip, ClipPlatform, ClipStatus } from "@/lib/clips/types";

export const CLIP_STATUS_WORDS: Record<ClipStatus, string> = {
  uploaded: "In line",
  reading: "Reading",
  waiting: "Waiting",
  ready: "Ready",
  failed: "Failed",
};

export const CLIP_PLATFORM_WORDS: Record<ClipPlatform, string> = { tiktok: "TikTok", reels: "Instagram Reels", shorts: "YouTube Shorts", x: "X" };

/** 0:07, 2:59 */
export function clipDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "";
  // Whole seconds shown, as a player shows them.
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function megabytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Dollars from micro-dollars, with the digits a fraction of a cent needs. */
export function money(micro: number): string {
  const usd = micro / 1e6;
  if (usd === 0) return "$0.00";
  // Whole cents read as cents ($0.10); a clip's fractions of a cent keep their digits ($0.000139).
  if (Number.isInteger(micro / 10_000)) return `$${usd.toFixed(2)}`;
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** Rows for a textarea that fits its text, between 3 and 10. */
export function rowsFor(text: string, perLine = 70): number {
  const lines = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return Math.min(10, Math.max(3, lines + 1));
}

/** Final states need no polling. */
export function clipSettled(c: Pick<Clip, "status">): boolean {
  return c.status === "ready" || c.status === "failed";
}
