/**
 * The normalized edit distance between a draft and what the person kept:
 * the Levenshtein distance on characters (after folding runs of whitespace,
 * so a changed line break is not an edit) divided by the longer text's
 * length. 0 means unchanged, 1 means nothing of the draft is left.
 *
 * Long texts are compared on their first MAX_CHARS characters each, with the
 * difference in length beyond that counted as edits, so a huge paste never
 * costs more than a few milliseconds.
 */
export const MAX_CHARS = 4000;

export function normalizeText(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** Levenshtein distance with two rows. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Uint32Array(b.length + 1);
  let cur = new Uint32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      cur[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 0 to 1, rounded to three decimals. */
export function editDistance(draft: string, kept: string): number {
  const a = normalizeText(draft);
  const b = normalizeText(kept);
  if (a === b) return 0;
  const longest = Math.max(a.length, b.length);
  if (!longest) return 0;
  const ha = a.slice(0, MAX_CHARS);
  const hb = b.slice(0, MAX_CHARS);
  const beyond = Math.abs(Math.max(a.length - MAX_CHARS, 0) - Math.max(b.length - MAX_CHARS, 0));
  const d = Math.min(longest, levenshtein(ha, hb) + beyond);
  return Math.round((d / longest) * 1000) / 1000;
}
