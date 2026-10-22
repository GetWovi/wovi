/**
 * Every credit decision in one place, so each one is a one-line change.
 * Client-safe: no storage, no Node imports.
 *
 * Decided for now (docs/credits.md has the why):
 * - One credit is worth a fixed $0.01. There is no floating price.
 * - Credits are only for running agents. They are never swapped for anything
 *   and never paid out. That waits for a legal check.
 * - Nobody gets free credits. Grants exist as a ledger type for later
 *   (holder credits are phase 17), but nothing gives one yet.
 * - A run costs its real cost times the margin, rounded up to whole credits,
 *   at least one credit. The estimate shown before a run is the most it can
 *   be charged.
 */

export type CreditsConfig = {
  enabled: boolean;
  microUsdPerCredit: number;
  marginMultiplier: number;
  minCreditsPerRun: number;
  estimateHeadroom: number;
  typicalCost: { minRuns: number; lastRuns: number };
  chargeFailedRuns: boolean;
  packs: readonly number[];
  minTopUpCredits: number;
  maxMonthlyLimit: number;
  swappable: false;
  starterCredits: number;
};

export const CREDITS: CreditsConfig = {
  /** Off turns billing off for the local app (WOVI_CREDITS=off does the same). Runs then cost nothing. */
  enabled: true,
  /** The fixed value of one credit, in micro-dollars: 10,000 is $0.01. */
  microUsdPerCredit: 10_000,
  /** What a run costs in credits: its real model cost times this, rounded up. */
  marginMultiplier: 2.5,
  /** Every run that finishes costs at least this much. */
  minCreditsPerRun: 1,
  /** The estimate is the typical cost times this, never above the run's spend cap. */
  estimateHeadroom: 1.5,
  /** The typical cost is the middle cost of the agent's last finished runs, once there are enough of them. */
  typicalCost: { minRuns: 5, lastRuns: 50 },
  /** Failed and cancelled runs give back everything they held. */
  chargeFailedRuns: false,
  /** Top-up packs, in credits. The price is credits times the credit's value. */
  packs: [500, 1000, 2500, 5000],
  /** The smallest top-up, in credits: 500 is $5. A pack below it is refused. */
  minTopUpCredits: 500,
  /** The highest monthly limit an owner can set, in credits. */
  maxMonthlyLimit: 10_000_000,
  /** Credits never turn into tokens or money, in either direction. */
  swappable: false,
  /** Non-holders: no free credits (the product doc, decided for now). */
  starterCredits: 0,
};

/** A credit amount in plain words: "1 credit", "1,250 credits". */
export function creditWords(n: number): string {
  return `${n.toLocaleString("en-US")} credit${n === 1 ? "" : "s"}`;
}

/** The price of some credits in US cents, at the fixed value. */
export function centsFor(credits: number): number {
  return Math.round((credits * CREDITS.microUsdPerCredit) / 10_000);
}

/** "$5.00" for 500 credits. */
export function priceWords(credits: number): string {
  return `$${(centsFor(credits) / 100).toFixed(2)}`;
}
