/**
 * SERVER ONLY. Topping up credits with USDC or ETH on Robinhood Chain, from
 * the product doc's "$WOVI or stablecoin (including x402) for crypto users".
 * The same shape as paying with $WOVI (token/pay.ts) and x402: no custody,
 * no key, every check read only.
 *
 *   1. quote: an owner or admin ticks the purchase consent (phase 18) and
 *      picks a pack and USDC or ETH. USDC is one to one with the dollar (six
 *      decimals: 500 credits are 5,000,000 units); ETH is priced from
 *      Chainlink's ETH/USD feed on Robinhood Chain and rounded up to a whole gwei.
 *      One credit is always one cent. The price is single use, lasts ten
 *      minutes, and keeps the consent word for word.
 *   2. pay: a wallet linked to the account sends the amount to WOVI's
 *      receiving address: a plain USDC transfer, or plain ETH.
 *   3. claim: the transaction is read on chain: Robinhood Chain, succeeded,
 *      enough confirmations, from a linked wallet to the receiving address,
 *      in the price's asset, mined inside the price's window. Each
 *      transaction counts once, ever, here and for x402 alike, and each
 *      price once.
 *
 * What it becomes:
 *   - in time, at least one credit's worth: a paid top-up with the consent
 *     stored, for the credits at the price's own rate, rounded down (less
 *     than the price gives fewer credits, more gives more, like $WOVI);
 *   - too late, or less than one credit: nothing is credited and the whole
 *     amount is written down as owed back to the wallet it came from, for the
 *     owner to send (Reports and refunds).
 */
import { randomBytes } from "node:crypto";
import type { AccountStore, Collection } from "@/lib/accounts/store";
import type { Credits } from "@/lib/credits/credits";
import { creditWords } from "@/lib/credits/config";
import type { OwedRow } from "@/lib/safety/store";
import { atomicForUsd, unitsWords, usdMicroForCredits } from "@/lib/x402/money";
import type { ChainPayReader } from "./chain";
import { chainPayStatus, sameAddress, type ChainPayConfig, type PayAsset } from "./config";
import type { ChainPaymentRow, ChainPayStore, ChainQuoteRow } from "./store";

export type ChainQuote = { id: string; credits: number; asset: PayAsset; symbol: string; token: string; decimals: number; amount: string; payTo: string; expiresAt: string };

export type ChainPayCode =
  | "off"
  | "invalid_request"
  | "unavailable"
  | "no_consent"
  | "no_price"
  | "no_wallet"
  | "unknown_quote"
  | "quote_used"
  | "quote_expired"
  | "tx_used"
  | "not_found"
  | "not_confirmed"
  | "wrong_chain"
  | "failed"
  | "too_early"
  | "too_late"
  | "no_transfer"
  | "too_little"
  | "chain_down";

export type ChainClaimResult =
  | { ok: true; credits: number; amount: string; symbol: string; topUpId: string; paymentId: string }
  | { ok: false; code: ChainPayCode; message: string; pending?: boolean; owed?: { amount: string; symbol: string; to: string } };

export class ChainPayError extends Error {
  constructor(
    readonly code: ChainPayCode,
    message: string,
  ) {
    super(message);
    this.name = "ChainPayError";
  }
}

export type ChainPayDeps = {
  config: ChainPayConfig;
  reader: ChainPayReader;
  store: ChainPayStore;
  accounts: AccountStore;
  credits: Credits;
  /** Money owed back (safety.json): late and too-small payments land here. */
  owed: Collection<OwedRow>;
  /** Whether a transaction already paid for something else (an x402 call to the same address). */
  usedElsewhere?: (paymentId: string) => Promise<boolean>;
  now?: () => Date;
};

const ZERO = BigInt(0);
const HASH = /^0x[0-9a-fA-F]{64}$/;

/** The credits an amount buys at a quote's own rate, rounded down. */
export function creditsAtQuote(paid: bigint, quote: Pick<ChainQuoteRow, "credits" | "amount">): number {
  const q = BigInt(quote.amount);
  if (q <= ZERO || paid <= ZERO) return 0;
  return Number((paid * BigInt(quote.credits)) / q);
}

/** What an amount is worth in US cents at the quote's rate, rounded down: USDC one to one, ETH at the quote's feed price. */
export function centsAtQuote(amount: bigint, quote: Pick<ChainQuoteRow, "asset" | "ethUsd" | "decimals">): number {
  if (quote.asset === "usdc") return Number(amount / BigInt(10) ** BigInt(quote.decimals - 2));
  if (!quote.ethUsd) return 0;
  // wei x (USD with 8 decimals) / 1e18 / 1e8 x 100 cents
  return Number((amount * BigInt(quote.ethUsd)) / BigInt(10) ** BigInt(24));
}

export class ChainPay {
  constructor(private readonly d: ChainPayDeps) {}

  private now() {
    return this.d.now?.() ?? new Date();
  }

  status() {
    return { ...chainPayStatus(this.d.config), payTo: this.d.config.payTo, packs: this.d.config.packs };
  }

  /** A price for a pack in USDC or ETH, for one person and workspace. Throws ChainPayError. */
  async quote(userId: string, workspaceId: string, input: { credits: number; asset: unknown; consent: { at: string; wording: string } | null }): Promise<ChainQuote> {
    const c = this.d.config;
    if (!chainPayStatus(c).on) throw new ChainPayError("off", "Paying with USDC or ETH is not open.");
    if (!input.consent?.wording) throw new ChainPayError("no_consent", "Tick the box about starting your credits now first.");
    if (!c.packs.includes(input.credits)) throw new ChainPayError("invalid_request", `Pick one of the packs: ${c.packs.join(", ")} credits.`);
    if (input.asset !== "usdc" && input.asset !== "eth") throw new ChainPayError("invalid_request", "Pick USDC or ETH.");
    const info = input.asset === "usdc" ? c.usdc : c.eth;
    if (!info.available || !info.token) throw new ChainPayError("unavailable", `${info.symbol} is not available yet.`);
    if (!(await this.d.accounts.wallets.find({ userId })).length) throw new ChainPayError("no_wallet", `Link a wallet first: the ${info.symbol} has to come from a wallet linked to your account.`);
    const usdMicro = usdMicroForCredits(input.credits);
    let amount: bigint;
    let ethUsd: bigint | null = null;
    if (input.asset === "usdc") {
      // Six decimals: one unit is one micro-dollar.
      amount = (usdMicro * BigInt(10) ** BigInt(info.decimals)) / BigInt(1_000_000);
    } else {
      try {
        ethUsd = await this.d.reader.ethUsd(c.ethUsdFeed, c.feedMaxAgeSec);
      } catch {
        throw new ChainPayError("chain_down", "Robinhood Chain did not answer. Try again in a moment.");
      }
      if (!ethUsd) throw new ChainPayError("no_price", "There is no fresh ETH price right now. Try again later, or pay with USDC.");
      // Rounded up to a whole gwei, so the amount is short enough to read and type (at most a gwei, a tiny fraction of a cent, over).
      const GWEI = BigInt(1_000_000_000);
      amount = ((atomicForUsd(usdMicro, ethUsd, info.decimals) + GWEI - BigInt(1)) / GWEI) * GWEI;
    }
    const now = this.now();
    const row: ChainQuoteRow = {
      id: `cq_${randomBytes(12).toString("hex")}`,
      userId,
      workspaceId,
      credits: input.credits,
      asset: info.asset,
      symbol: info.symbol,
      token: info.token.toLowerCase(),
      decimals: info.decimals,
      amount: amount.toString(),
      payTo: c.payTo!.toLowerCase(),
      ethUsd: ethUsd?.toString() ?? null,
      consent: { at: input.consent.at, wording: input.consent.wording },
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + c.quoteSeconds * 1000).toISOString(),
      usedAt: null,
      txHash: null,
    };
    await this.d.store.quotes.insert(row);
    return { id: row.id, credits: row.credits, asset: row.asset, symbol: row.symbol, token: info.token, decimals: row.decimals, amount: row.amount, payTo: c.payTo!, expiresAt: row.expiresAt };
  }

  /**
   * Counts one payment for a price by its transaction hash, after reading it
   * on chain. Never throws for anything the payer did; `pending` means "ask
   * again in a few seconds".
   */
  async claim(userId: string, quoteId: unknown, txInput: unknown): Promise<ChainClaimResult> {
    const c = this.d.config;
    const no = (code: ChainPayCode, message: string, pending = false): ChainClaimResult => ({ ok: false, code, message, ...(pending ? { pending } : {}) });
    if (!chainPayStatus(c).on) return no("off", "Paying with USDC or ETH is not open.");
    if (typeof txInput !== "string" || !HASH.test(txInput.trim())) return no("invalid_request", "That is not a transaction hash.");
    const tx = txInput.trim().toLowerCase();
    const paymentId = `${c.chainId}:${tx}`;
    const quote = typeof quoteId === "string" ? await this.d.store.quotes.get(quoteId) : null;
    if (!quote || quote.userId !== userId) return no("unknown_quote", "That price is not one this server gave you. Start again.");

    const done = await this.d.store.payments.get(paymentId);
    if (done) {
      if (done.quoteId !== quote.id || done.userId !== userId) return no("tx_used", "This transaction has already been counted.");
      // The same claim again (a lost answer, or a crash halfway): finished the same way, written once.
      return this.finish(done, quote);
    }
    if (quote.usedAt) return no("quote_used", "This price was already used for another payment. Start again.");
    const now = this.now().getTime();
    if (now > Date.parse(quote.expiresAt) + c.claimDays * 86_400_000) return no("quote_expired", `This price is more than ${c.claimDays} days old. If you sent ${quote.symbol} for it, write to us with the transaction.`);
    if (await this.d.usedElsewhere?.(paymentId)) return no("tx_used", "This transaction already paid for something else.");

    let paid;
    try {
      paid = await this.d.reader.tx(tx);
    } catch {
      return no("chain_down", "Robinhood Chain did not answer. Your payment is safe; this checks again in a moment.", true);
    }
    if (!paid) return no("not_found", "Waiting for Robinhood Chain to include it.", true);
    if (paid.chainId !== c.chainId) return no("wrong_chain", "That transaction is not on Robinhood Chain.");
    if (!paid.ok) return no("failed", "That transaction failed on Robinhood Chain, so nothing was paid.");
    if (paid.confirmations < c.minConfirmations) return no("not_confirmed", "Waiting for a few more blocks.", true);
    if (paid.at < Date.parse(quote.createdAt) - c.skewSeconds * 1000) return no("too_early", "That transaction is older than this price. Each payment needs its own price.");

    const wallets = (await this.d.accounts.wallets.find({ userId })).map((w) => w.address.toLowerCase());
    let amount = ZERO;
    let payer = "";
    if (quote.asset === "eth") {
      if (wallets.includes(paid.from) && sameAddress(paid.to, quote.payTo) && paid.value > ZERO) {
        amount = paid.value;
        payer = paid.from;
      }
    } else {
      for (const w of wallets) {
        const v = paid.transfers.filter((t) => sameAddress(t.token, quote.token) && sameAddress(t.from, w) && sameAddress(t.to, quote.payTo)).reduce((s, t) => s + t.value, ZERO);
        if (v > ZERO && !payer) payer = w;
        amount += v;
      }
    }
    if (amount === ZERO) return no("no_transfer", `That transaction did not send ${quote.symbol} from a wallet linked to your account to WOVI's address.`);

    const late = paid.at > Date.parse(quote.expiresAt);
    const credits = late ? 0 : creditsAtQuote(amount, quote);
    const outcome: ChainPaymentRow["outcome"] = credits >= 1 ? "credited" : "owed";
    const hashPart = tx.slice(2);
    const row: ChainPaymentRow = {
      id: paymentId,
      tx,
      userId,
      workspaceId: quote.workspaceId,
      quoteId: quote.id,
      asset: quote.asset,
      payer,
      amount: amount.toString(),
      credits: outcome === "credited" ? credits : 0,
      outcome,
      reason: outcome === "owed" ? (late ? "late" : "too_little") : null,
      topUpId: outcome === "credited" ? `top_chain_${hashPart}` : null,
      owedId: outcome === "owed" ? `owed_chain_${hashPart}` : null,
      block: paid.block,
      at: paid.at,
      createdAt: this.now().toISOString(),
    };
    // Single use: the payment row first (its id is the chain and the hash), then the price, then the ledger or the owed row.
    try {
      await this.d.store.payments.insert(row);
    } catch {
      return no("tx_used", "This transaction has already been counted.");
    }
    const claimed = await this.d.store.quotes.updateIf(quote.id, { usedAt: null }, { usedAt: this.now().toISOString(), txHash: tx });
    if (!claimed) {
      await this.d.store.payments.delete(paymentId);
      return no("quote_used", "This price was already used for another payment. Start again.");
    }
    return this.finish(row, quote);
  }

  /** Writes what a counted payment becomes: the top-up, or the owed row. Idempotent, so a replay finishes a crash. */
  private async finish(p: ChainPaymentRow, quote: ChainQuoteRow): Promise<ChainClaimResult> {
    const chain = { asset: quote.asset, symbol: quote.symbol, token: quote.token, decimals: quote.decimals, amount: p.amount, payer: p.payer, tx: p.tx, chainId: this.d.config.chainId };
    const words = `${unitsWords(p.amount, quote.decimals)} ${quote.symbol}`;
    if (p.outcome === "credited" && p.topUpId) {
      await this.d.credits.recordPaidTopUp(p.workspaceId, {
        id: p.topUpId,
        provider: quote.asset,
        providerRef: p.id,
        credits: p.credits,
        amountCents: centsAtQuote(BigInt(p.amount), quote),
        by: p.userId,
        label: `Paid with ${quote.symbol}, ${creditWords(p.credits)}`,
        ledgerKey: `chain:${p.id}`,
        consent: quote.consent,
        chain,
      });
      return { ok: true, credits: p.credits, amount: p.amount, symbol: quote.symbol, topUpId: p.topUpId, paymentId: p.id };
    }
    const owedId = p.owedId!;
    if (!(await this.d.owed.get(owedId))) {
      const user = await this.d.accounts.users.get(p.userId);
      await this.d.owed
        .insert({
          id: owedId,
          kind: "chain_payment",
          workspaceId: p.workspaceId,
          topUpId: null,
          credits: 0,
          amountCents: centsAtQuote(BigInt(p.amount), quote),
          currency: "usd",
          test: false,
          contact: user?.email ?? null,
          status: "owed",
          createdAt: this.now().toISOString(),
          paidAt: null,
          paidBy: null,
          chain: { symbol: quote.symbol, token: quote.token, decimals: quote.decimals, amount: p.amount, to: p.payer, tx: p.tx, chainId: this.d.config.chainId },
          reason: p.reason,
        })
        .catch(() => undefined);
    }
    const owed = { amount: p.amount, symbol: quote.symbol, to: p.payer };
    return p.reason === "late"
      ? { ok: false, code: "too_late", message: `That payment landed after this price ran out, so no credits were added. The ${words} is written down to send back to the wallet it came from.`, owed }
      : { ok: false, code: "too_little", message: `That payment is less than one credit at this price, so no credits were added. The ${words} is written down to send back to the wallet it came from.`, owed };
  }

  /** For the owner's page: payments counted, credits from them, and what is owed back. */
  async summary(): Promise<{ payments: number; credits: number; owed: number; byAsset: Record<PayAsset, string> }> {
    const rows = await this.d.store.payments.find();
    const byAsset: Record<PayAsset, string> = { usdc: "0", eth: "0" };
    for (const r of rows) if (r.outcome === "credited") byAsset[r.asset] = (BigInt(byAsset[r.asset]) + BigInt(r.amount)).toString();
    return { payments: rows.filter((r) => r.outcome === "credited").length, credits: rows.reduce((s, r) => s + r.credits, 0), owed: rows.filter((r) => r.outcome === "owed").length, byAsset };
  }

  /** Whether a transaction was counted here: x402 asks before it takes one. */
  async used(paymentId: string): Promise<boolean> {
    return Boolean(await this.d.store.payments.get(paymentId.toLowerCase()));
  }
}
