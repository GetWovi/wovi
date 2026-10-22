/** x402 in plain words for screens (phase 15). Client-safe. */
import { unitsWords } from "./money";
import type { PaymentStatus, RefundReason } from "./types";

export const REFUND_WORDS: Record<RefundReason, string> = {
  failed: "The run failed",
  cancelled: "The run was stopped",
  unused: "Not used by the run",
  not_started: "The run did not start",
  too_late: "Paid after the quote ended",
  too_little: "Paid less than the quote",
};

export const PAYMENT_WORDS: Record<PaymentStatus, string> = {
  running: "Running",
  settled: "Settled",
  not_started: "Not started",
  rejected: "Refused",
};

/** 0x4020...0402 */
export function shortHex(v: string, head = 6, tail = 4): string {
  return v.length > head + tail + 3 ? `${v.slice(0, head)}...${v.slice(-tail)}` : v;
}

/** An amount for a table: exact up to 9 decimals, "about" past that. */
export function amountWords(atomic: string | bigint, decimals: number, symbol: string): string {
  const exact = unitsWords(atomic, decimals);
  const [whole, frac = ""] = exact.split(".");
  if (frac.length <= 9) return `${exact} ${symbol}`;
  return `about ${whole}.${frac.slice(0, 9)} ${symbol}`;
}
