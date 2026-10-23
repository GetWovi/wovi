/**
 * Live stats in plain words, for the screens. Client-safe. A number that has
 * too few runs behind it reads "New", never a figure.
 */
import type { Mean, PublicStats, Rate } from "./types";

export const NEW = "New";

export function pctOf(r: Pick<Rate, "value">): string {
  return r.value === null ? NEW : `${Math.round(r.value * 100)}%`;
}

export function meanOf(m: Pick<Mean, "value">, unit = ""): string {
  return m.value === null ? NEW : `${m.value}${unit}`;
}

/** An edit size (0 to 1) as the share of the text changed. */
export function changeOf(m: Pick<Mean, "value">): string {
  return m.value === null ? NEW : `${Math.round(m.value * 100)}%`;
}

export function secondsOf(ms: number | null): string {
  if (ms === null) return NEW;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

/** "14 of 20 results", or what is still needed. */
export function countOf(r: Pick<Rate, "count" | "n" | "enough">, noun: string, min: number): string {
  if (!r.n) return `No ${noun} yet`;
  if (!r.enough) return `${r.n} of the ${min} it needs`;
  return `${r.count} of ${r.n} ${noun}`;
}

/** The one line an agent's numbers lead with. */
export function statsHeadline(s: PublicStats): string {
  if (s.isNew) return s.runs ? `New: ${s.runs} real ${s.runs === 1 ? "run" : "runs"} so far, numbers from ${s.min}` : `New: numbers show after ${s.min} real runs`;
  if (s.acceptance.value !== null) return `${pctOf(s.acceptance)} of results used without another try`;
  return `${s.runs} real runs so far`;
}

export function usd(micro: number | null): string {
  if (micro === null) return "·";
  const v = micro / 1_000_000;
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`;
}
