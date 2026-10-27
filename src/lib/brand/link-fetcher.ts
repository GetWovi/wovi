/**
 * Reads the text of a public X post from its link, through X's own embed
 * lookup (publish.twitter.com/oembed): no key, no scraping, nothing paid. Any
 * other link returns null, so it stays a reference. TikTok's lookup no longer
 * carries the caption and Instagram's needs an app key, so neither is read.
 */
import type { LinkFetcher } from "./profile";

const X_POST = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status(?:es)?\/\d{1,25}(?:[/?#]|$)/i;

/** True for a link to one post on X (or twitter.com). */
export function isXPost(url: string): boolean {
  return X_POST.test(url.trim());
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** The post's own words from the embed's html: the first paragraph, line breaks kept, tags and attached media links dropped. */
export function embedText(html: string): string | null {
  const p = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (!p) return null;
  const text = decode(p[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/\bpic\.(?:twitter|x)\.com\/\S+/gi, "")
    .replace(/https?:\/\/t\.co\/\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return text || null;
}

/** The fetcher for Brand Brains: X posts are read, everything else is left as a reference. */
export function xPostFetcher(fetchImpl: typeof fetch = fetch): LinkFetcher {
  return {
    async fetchText(url, signal) {
      if (!isXPost(url)) return null;
      const res = await fetchImpl(`https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(url)}`, { signal, headers: { accept: "application/json" } });
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as { html?: unknown } | null;
      return typeof body?.html === "string" ? embedText(body.html) : null;
    },
  };
}
