/**
 * The credit records and what screens see of them. Types and small pure
 * helpers only, so client code can import it.
 *
 * The ledger is append-only. A workspace's balance is the sum of its entries:
 *
 *   top_up      + credits bought (a payment provider said paid, an x402 payment, $WOVI sent to the burn pot)
 *   grant       + credits given: support, or a $WOVI holder's monthly credits (phase 17)
 *   hold        - the estimate, reserved when a run or pipeline starts
 *   release     + what a hold gives back: all of it when the run ends (paired
 *                 with the charge), or a part of a pipeline's hold per step
 *   charge      - what a finished run really costs, never more than it held
 *   refund      + a charge given back afterwards (support, by a script)
 *   adjustment  +/- a correction (support, by a script)
 *   expire      - holder credits left at the end of their month (phase 17)
 *
 * Two pools, never mixed (phase 17): paid credits, and holder credits. Every
 * entry says how much of its amount is holder credits (`holder`) and for
 * which month (`period`); the rest is paid. Holder credits are spendable on
 * runs only, never moved, swapped or paid out, and expire at the end of their
 * month (UTC). A hold takes from the two pools in the configured order and
 * gives back to the pool it took from.
 *
 * So a run that held 4 and cost 1 writes hold -4, then release +4 and
 * charge -1 together: 1 spent, 3 back. A run that failed writes release +4
 * and nothing else. The balance never goes below zero.
 */

export const LEDGER_KINDS = ["top_up", "grant", "hold", "release", "charge", "refund", "adjustment", "expire"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** Where a grant comes from: holder credits (phase 17, through grantHolder only) or support. */
export const GRANT_SOURCES = ["holder", "support"] as const;
export type GrantSource = (typeof GRANT_SOURCES)[number];

/** Why a hold gave credits back. */
export type ReleaseReason = "settled" | "failed" | "cancelled" | "step" | "ended";

export type LedgerRef = { type: "run" | "pipeline_run" | "top_up" | "grant" | "manual"; id: string };

export type LedgerEntry = {
  id: string;
  workspaceId: string;
  /** Unique per workspace. Writing the same key twice returns the first entry. */
  key: string;
  kind: LedgerKind;
  /** Whole credits, signed: plus adds to the balance, minus takes from it. */
  amount: number;
  /** The balance right after this entry. */
  balanceAfter: number;
  /** The hold this entry opens, gives back from, or is charged against. */
  holdId: string | null;
  ref: LedgerRef | null;
  /** Whose spend it counts toward, for monthly limits: the person who started the run. */
  userId: string | null;
  /** Who wrote it, for top-ups, grants and support entries. */
  by: string | null;
  /** A short label for history: the agent or pipeline name, the pack. */
  label: string;
  note: string | null;
  reason: ReleaseReason | null;
  grantSource: GrantSource | null;
  /** True for top-ups through the test provider: no real money moved. */
  test: boolean;
  /** For charges: the real model cost behind it, in micro-dollars. Builders and support only. */
  costMicroUsd: number | null;
  /**
   * The part of `amount` that is holder credits, with the same sign (phase 17).
   * Zero or missing: all of it is paid credits. Older rows have none.
   */
  holder?: number;
  /** The month ("2026-10", UTC) the holder part belongs to. Null when there is none. */
  period?: string | null;
  /** On a holder grant: when what is left of it expires. */
  expiresAt?: string | null;
  createdAt: string;
};

/** The holder part of an entry: zero for paid-only entries and rows from before phase 17. */
export const holderPart = (e: Pick<LedgerEntry, "holder">): number => e.holder ?? 0;

/** Which pool a hold takes from first. */
export type HolderSpendOrder = "after_paid" | "before_paid";

export type TopUpStatus = "pending" | "paid" | "failed";

export type TopUp = {
  id: string;
  workspaceId: string;
  credits: number;
  amountCents: number;
  currency: "usd";
  provider: string;
  providerRef: string | null;
  /** True when the provider is the test provider. */
  test: boolean;
  status: TopUpStatus;
  idempotencyKey: string | null;
  by: string;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  /**
   * Phase 18: the buyer asked for the credits to start at once and accepted
   * the withdrawal terms (Consumer Rights Directive Art. 8(8) and 16), with
   * the exact words they ticked. Missing on top-ups from before phase 18.
   */
  consent?: { at: string; wording: string } | null;
  /** Card top-ups: Stripe's hosted page to pay on, while the top-up is pending. Missing on older rows. */
  checkoutUrl?: string | null;
  /**
   * What the provider says was paid, once it is paid: Stripe's payment intent,
   * the amount in the smallest unit and the currency it was charged in (with
   * Stripe's local currencies it can differ from `currency`). Missing on older rows.
   */
  payment?: { ref: string; amount: number; currency: string } | null;
  /**
   * USDC or ETH sent on Robinhood Chain (chainpay): the asset, the exact amount
   * in its smallest unit, the linked wallet it came from and the transaction.
   * Missing on every other top-up.
   */
  chain?: TopUpChain | null;
};

export type TopUpChain = { asset: "usdc" | "eth"; symbol: string; token: string; decimals: number; amount: string; payer: string; tx: string; chainId: number };

/** Monthly limits in credits. Null means no limit. */
export type CreditLimits = {
  /** The workspace id. */
  id: string;
  workspaceId: string;
  monthly: number | null;
  /** Per member, by user id. */
  members: Record<string, number>;
  updatedBy: string | null;
  updatedAt: string;
};

/** How a run is billed, as the run keeps it. */
export type RunCredits = {
  /** own: the run held its own estimate. pipeline: it ran inside a pipeline's hold. free: a builder's bench run. */
  mode: "own" | "pipeline" | "free";
  /** The estimate shown and held: the most it can be charged. For a pipeline step, its part of the pipeline's hold. */
  estimate: number;
  /** The hold it was charged against. */
  holdId: string | null;
  state: "held" | "charged" | "refunded" | "free";
  /** What it cost in the end. Null while it runs. */
  charged: number | null;
  /** What came back to the balance from its own hold. */
  back: number | null;
  userId: string | null;
};

/** How a pipeline run is billed. */
export type PipelineCredits = {
  /** The hold for this try of the pipeline. A retry holds again. */
  holdId: string;
  /** Every hold this pipeline run made, oldest first. */
  holdIds: string[];
  estimate: number;
  state: "held" | "settled";
  /** Charged so far, over every step run and try. */
  charged: number;
  back: number;
  userId: string | null;
};

/** One hold as it stands now, worked out from the ledger. */
export type HoldState = {
  holdId: string;
  workspaceId: string;
  amount: number;
  released: number;
  charged: number;
  open: number;
  closed: boolean;
  userId: string | null;
  label: string;
  ref: LedgerRef | null;
  createdAt: string;
  /** The holder credits in `amount` (phase 17), the part of them not yet given back or charged, and their month. */
  holder: number;
  holderOpen: number;
  period: string | null;
};

export type Balance = {
  workspaceId: string;
  /** What can be spent now: paid credits plus this month's holder credits. */
  available: number;
  /** Paid credits that can be spent now. */
  paid: number;
  /**
   * Holder credits (phase 17): spendable on runs only, never moved or paid
   * out, gone at the end of their month. `available` is this month's.
   */
  holder: { available: number; period: string; expiresAt: string };
  /** Held for runs and pipelines in progress. */
  held: number;
  /** Spent this calendar month (charges minus refunds), plus what is held now. */
  usedThisMonth: number;
};

/** A run's charge as screens show it. */
export type ChargeView = { estimate: number; charged: number | null; back: number | null; state: RunCredits["state"] };

export function chargeView(c: RunCredits | PipelineCredits | null | undefined): ChargeView | null {
  if (!c) return null;
  if ("mode" in c) return { estimate: c.estimate, charged: c.charged, back: c.back, state: c.state };
  return { estimate: c.estimate, charged: c.state === "settled" ? c.charged : null, back: c.state === "settled" ? c.back : null, state: c.state === "settled" ? (c.charged > 0 ? "charged" : "refunded") : "held" };
}

/** A charge in plain words: "Charged 1 credit. 3 held back went back." */
export function chargeWords(c: ChargeView): string {
  const n = (x: number) => `${x.toLocaleString("en-US")} credit${x === 1 ? "" : "s"}`;
  if (c.state === "free") return "Free: a builder's bench run";
  if (c.state === "held") return `${n(c.estimate)} held while it runs`;
  if (c.state === "refunded") return `Nothing charged. The ${n(c.estimate)} held came back`;
  const back = c.back ?? 0;
  return back > 0 ? `Charged ${n(c.charged ?? 0)} of the ${c.estimate} held, ${back} back` : `Charged ${n(c.charged ?? 0)}`;
}

/** Ledger kinds in words, for history. */
export const KIND_LABELS: Record<LedgerKind, string> = {
  top_up: "Top-up",
  grant: "Grant",
  hold: "Held",
  release: "Back",
  charge: "Charged",
  refund: "Refund",
  adjustment: "Adjustment",
  expire: "Expired",
};
