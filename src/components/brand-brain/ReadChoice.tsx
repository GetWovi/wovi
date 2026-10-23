"use client";

import Link from "next/link";
import styles from "@/components/app/App.module.css";
import type { ReadQuote } from "@/lib/brand/brains";

/** Whether the AI may read the posts by default: only when the read is charged and the balance covers it. */
export function defaultUseModel(quote: ReadQuote): boolean {
  return quote.mode === "credits" && quote.available >= quote.credits;
}

/**
 * The choice before "Read my posts" where reads are charged: the AI reads
 * them for up to N credits, shown first, or plain counts read them for free.
 * Nothing shows where reads are free (a local app) or off.
 */
export function ReadChoice({ quote, value, onChange }: { quote: ReadQuote; value: boolean; onChange: (v: boolean) => void }) {
  if (quote.mode !== "credits") return null;
  const n = (x: number) => `${x.toLocaleString("en-US")} credit${x === 1 ? "" : "s"}`;
  const short = quote.available < quote.credits;
  return (
    <label className={styles.confirm}>
      <input type="checkbox" checked={value && !short} disabled={short} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Have the AI read them, for up to {n(quote.credits)}. You are charged what the read really costs.{" "}
        {short ? (
          <>
            You have {n(quote.available)}: <Link href="/app/credits">top up</Link> to use it. Without it, plain counts read your posts for free.
          </>
        ) : (
          <>Untick it to read them with plain counts instead, for free.</>
        )}
      </span>
    </label>
  );
}
