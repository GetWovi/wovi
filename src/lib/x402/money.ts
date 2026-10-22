/**
 * Exact money math for x402 (phase 15). Amounts on chain are whole atomic
 * units (wei for ETH) as bigint, never floats. USD is in micro-dollars, and
 * prices per whole unit are kept with 8 decimals (like Chainlink feeds).
 */
import { CREDITS } from "@/lib/credits/config";

/** 1e8: the scale of a USD price per whole unit. */
export const PRICE_SCALE = BigInt(100000000);

export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= BigInt(0)) throw new Error("Divide by a positive number.");
  if (a <= BigInt(0)) return BigInt(0);
  return (a + b - BigInt(1)) / b;
}

/** "2500.5" to 250,050,000,000 (USD with 8 decimals). Throws on anything else. */
export function usdToScaled(usd: string): bigint {
  const m = /^(\d{1,12})(?:\.(\d{1,8}))?$/.exec(usd.trim());
  if (!m) throw new Error(`Not a USD amount: ${usd}`);
  return BigInt(m[1]) * PRICE_SCALE + BigInt((m[2] ?? "").padEnd(8, "0"));
}

/** What some credits cost, in micro-dollars, at the fixed credit value. */
export function usdMicroForCredits(credits: number): bigint {
  if (!Number.isInteger(credits) || credits < 0) throw new Error("Credits are whole numbers.");
  return BigInt(credits) * BigInt(CREDITS.microUsdPerCredit);
}

/**
 * The atomic amount that pays `usdMicro` at `priceScaled` USD per whole
 * unit, rounded up so the owner is never paid less than the quote:
 *
 *   units  = usd / price = (usdMicro / 1e6) / (priceScaled / 1e8)
 *   atomic = ceil(units x 10^decimals) = ceil(usdMicro x 100 x 10^decimals / priceScaled)
 */
export function atomicForUsd(usdMicro: bigint, priceScaled: bigint, decimals: number): bigint {
  if (priceScaled <= BigInt(0)) throw new Error("A price must be above zero.");
  return ceilDiv(usdMicro * BigInt(100) * BigInt(10) ** BigInt(decimals), priceScaled);
}

/** "0.04" for 40,000 micro-dollars; always two decimals at least, more when needed. */
export function usdWords(usdMicro: bigint | string): string {
  const v = BigInt(usdMicro);
  const whole = v / BigInt(1000000);
  let frac = (v % BigInt(1000000)).toString().padStart(6, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${whole}.${frac}`;
}

/** An atomic amount in whole units, exact: 16,000,000,000,000 wei with 18 decimals is "0.000016". */
export function unitsWords(atomic: bigint | string, decimals: number): string {
  const v = BigInt(atomic);
  const neg = v < BigInt(0);
  const abs = neg ? -v : v;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = abs / base;
  const frac = decimals ? (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/**
 * The part of a payment a charge used, at the quote's own rate, rounded down
 * so the payer is never charged more than the credits used:
 *
 *   used = floor(required x charged / quoted), never above what was paid
 */
export function usedAmount(required: bigint, paid: bigint, chargedCredits: number, quotedCredits: number): bigint {
  if (quotedCredits <= 0) return BigInt(0);
  const c = BigInt(Math.max(0, Math.min(chargedCredits, quotedCredits)));
  const used = (required * c) / BigInt(quotedCredits);
  return used > paid ? paid : used;
}

/** An atomic amount back in credits at the quote's rate, rounded down. */
export function creditsForAmount(amount: bigint, required: bigint, quotedCredits: number): number {
  if (required <= BigInt(0)) return 0;
  return Number((amount * BigInt(quotedCredits)) / required);
}
