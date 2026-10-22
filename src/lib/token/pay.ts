/**
 * SERVER ONLY. Paying for credits with $WOVI (phase 17), from the product
 * doc's "$WOVI or stablecoin for crypto users". Off unless
 * WOVI_PAY_WITH_WOVI=on and the burn pot is set.
 *
 * No custody, like x402: WOVI never holds the tokens and holds no key here.
 *
 *   1. quote: an owner or admin picks a pack; WOVI prices it in $WOVI, either
 *      at the fixed rate (WOVI_PAY_TOKENS_PER_CREDIT) or from the market (the
 *      Pons curve's reserves, or the pool's price after graduation, times
 *      Chainlink's ETH/USD), rounded up to the wei. One credit is always one
 *      cent, so the price of a run never moves with $WOVI. The quote is single
 *      use and lasts ten minutes.
 *   2. pay: their own wallet sends a plain $WOVI transfer to the burn pot,
 *      which burns every $WOVI it holds with its next burn.
 *   3. claim: the transaction hash comes back here and is read on chain, read
 *      only: Robinhood Chain, succeeded, enough confirmations, mined inside the
 *      quote's window, and a $WOVI Transfer from one of the person's linked
 *      wallets to the burn pot. The credits are the quote's credits for the
 *      amount sent, at the quote's own rate, rounded down. Each transaction
 *      counts once, ever, and each quote once.
 */
import type { Credits } from "@/lib/credits/credits";
import { creditWords } from "@/lib/credits/config";
import type { AccountStore } from "@/lib/accounts/store";
import { randomBytes } from "node:crypto";
import { payStatus, type TokenConfig } from "./config";
import { paidTo, scrub, ZERO, type TokenReader } from "./chain";
import type { QuoteRow, TokenStore, WoviPaymentRow } from "./store";

export type PayQuote = {
  id: string;
  credits: number;
  tokensWei: string;
  token: string;
  pot: string;
  source: "fixed" | "market";
  expiresAt: string;
};

export type PayCode =
  | "off"
  | "invalid_request"
  | "no_token"
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

export type ClaimResult = { ok: true; credits: number; tokensWei: string; paymentId: string } | { ok: false; code: PayCode; message: string; pending?: boolean };

export class PayError extends Error {
  constructor(
    readonly code: PayCode,
    message: string,
  ) {
    super(message);
    this.name = "PayError";
  }
}

export type PayDeps = {
  config: TokenConfig;
  reader: TokenReader;
  store: TokenStore;
  accounts: AccountStore;
  credits: Credits;
  tokenAddress: () => Promise<string | null>;
  now?: () => Date;
};

/** 1e38: credits' micro-dollars over (wei per token x USD per ETH with 8 decimals) to $WOVI wei. See tokensForCredits. */
const SCALE_38 = BigInt(10) ** BigInt(38);
const SKEW_MS = 120_000;
const GRACE_MS = 15 * 60_000;

const ceilDiv = (a: bigint, b: bigint) => (a + b - BigInt(1)) / b;

/**
 * $WOVI wei for some credits at the market price, rounded up:
 *   usd per token  = (weiPerToken / 1e18) x (ethUsd / 1e8)
 *   tokens         = (credits x $0.01) / usd per token
 *   wei            = ceil(credits x 10,000 micro-dollars x 1e38 / (weiPerToken x ethUsd))
 */
export function tokensForCredits(credits: number, weiPerToken: bigint, ethUsd8: bigint, microUsdPerCredit = 10_000): bigint {
  if (!Number.isInteger(credits) || credits <= 0) throw new Error("Credits are whole numbers above zero.");
  if (weiPerToken <= ZERO || ethUsd8 <= ZERO) throw new Error("A price must be above zero.");
  return ceilDiv(BigInt(credits) * BigInt(microUsdPerCredit) * SCALE_38, weiPerToken * ethUsd8);
}

/** The credits an amount buys at a quote's own rate, rounded down. */
export function creditsAtQuote(paidWei: bigint, quote: Pick<QuoteRow, "credits" | "tokensWei">): number {
  const q = BigInt(quote.tokensWei);
  if (q <= ZERO || paidWei <= ZERO) return 0;
  return Number((paidWei * BigInt(quote.credits)) / q);
}

export class WoviPay {
  constructor(private readonly d: PayDeps) {}

  private now() {
    return this.d.now?.() ?? new Date();
  }

  status() {
    const s = payStatus(this.d.config);
    return { ...s, source: this.d.config.pay.tokensPerCreditWei !== null ? ("fixed" as const) : ("market" as const), packs: this.d.config.pay.packs };
  }

  /** A price for a pack, in $WOVI, for one person and workspace. Throws PayError. */
  async quote(userId: string, workspaceId: string, credits: number): Promise<PayQuote> {
    const c = this.d.config;
    if (!payStatus(c).on) throw new PayError("off", "Paying with $WOVI is not open.");
    if (!c.pay.packs.includes(credits)) throw new PayError("invalid_request", `Pick one of the packs: ${c.pay.packs.join(", ")} credits.`);
    if (!(await this.d.accounts.wallets.find({ userId })).length) throw new PayError("no_wallet", "Link a wallet first: the $WOVI has to come from a wallet linked to your account.");
    const token = await this.d.tokenAddress();
    if (!token) throw new PayError("no_token", "$WOVI is not launched yet.");
    let tokensWei: bigint;
    let price: QuoteRow["price"];
    if (c.pay.tokensPerCreditWei !== null) {
      tokensWei = BigInt(credits) * c.pay.tokensPerCreditWei;
      price = { weiPerToken: null, ethUsd: null, tokensPerCreditWei: c.pay.tokensPerCreditWei.toString() };
    } else {
      let market;
      let ethUsd;
      try {
        [market, ethUsd] = await Promise.all([this.d.reader.marketPrice(token), this.d.reader.ethUsd(c.pay.ethUsdFeed)]);
      } catch (err) {
        throw new PayError("chain_down", `Robinhood Chain did not answer (${scrub(String((err as Error)?.message ?? err))}). Try again in a moment.`);
      }
      if (!market || !ethUsd) throw new PayError("no_price", "There is no market price for $WOVI right now. Try again later.");
      tokensWei = tokensForCredits(credits, market.weiPerToken, ethUsd);
      price = { weiPerToken: market.weiPerToken.toString(), ethUsd: ethUsd.toString(), tokensPerCreditWei: null };
    }
    const now = this.now();
    const row: QuoteRow = {
      id: `wq_${randomBytes(12).toString("hex")}`,
      userId,
      workspaceId,
      credits,
      tokensWei: tokensWei.toString(),
      source: price.tokensPerCreditWei ? "fixed" : "market",
      price,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + c.pay.quoteSeconds * 1000).toISOString(),
      usedAt: null,
      txHash: null,
    };
    await this.d.store.quotes.insert(row);
    return { id: row.id, credits, tokensWei: row.tokensWei, token, pot: c.pot!, source: row.source, expiresAt: row.expiresAt };
  }

  /**
   * Counts one payment for a quote, by its transaction hash, after reading it
   * on chain. Never throws for anything the payer did; `pending` means "ask
   * again in a few seconds".
   */
  async claim(userId: string, quoteId: string, txInput: unknown): Promise<ClaimResult> {
    const c = this.d.config;
    const no = (code: PayCode, message: string, pending = false): ClaimResult => ({ ok: false, code, message, ...(pending ? { pending } : {}) });
    if (!payStatus(c).on) return no("off", "Paying with $WOVI is not open.");
    if (typeof txInput !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txInput)) return no("invalid_request", "That is not a transaction hash.");
    const tx = txInput.toLowerCase();
    const paymentId = `${c.chainId}:${tx}`;
    const quote = typeof quoteId === "string" ? await this.d.store.quotes.get(quoteId) : null;
    if (!quote || quote.userId !== userId) return no("unknown_quote", "That price is not one this server gave you. Start again.");
    const done = await this.d.store.payments.get(paymentId);
    if (done) {
      if (done.quoteId !== quote.id || done.userId !== userId) return no("tx_used", "This transaction has already been counted.");
      // The same claim again (a lost answer, or a crash before the ledger): the same credits, written once.
      await this.d.credits.payWithToken(done.workspaceId, { paymentId, credits: done.credits, by: userId, label: `Paid with $WOVI, ${creditWords(done.credits)}` });
      return { ok: true, credits: done.credits, tokensWei: done.tokensWei, paymentId };
    }
    if (quote.usedAt) return no("quote_used", "This price was already used for another payment. Start again.");
    const now = this.now().getTime();
    if (now > Date.parse(quote.expiresAt) + GRACE_MS) return no("quote_expired", "This price ran out before the payment was checked. Start again; if you already sent $WOVI, contact support with the transaction.");
    const token = await this.d.tokenAddress();
    if (!token) return no("no_token", "$WOVI is not launched yet.");

    let paid;
    try {
      paid = await this.d.reader.paidTx(tx);
    } catch {
      return no("chain_down", "Robinhood Chain did not answer. Your payment is safe; this checks again in a moment.", true);
    }
    if (!paid) return no("not_found", "Waiting for Robinhood Chain to include it.", true);
    if (paid.chainId !== c.chainId) return no("wrong_chain", "That transaction is not on Robinhood Chain.");
    if (!paid.ok) return no("failed", "That transaction failed on Robinhood Chain, so nothing was paid.");
    if (paid.confirmations < c.pay.minConfirmations) return no("not_confirmed", "Waiting for a few more blocks.", true);
    if (paid.at < Date.parse(quote.createdAt) - SKEW_MS) return no("too_early", "That transaction is older than this price. Each payment needs its own price.");
    if (paid.at > Date.parse(quote.expiresAt)) return no("too_late", "That transaction landed after this price ran out. Contact support with the transaction.");

    const wallets = (await this.d.accounts.wallets.find({ userId })).map((w) => w.address.toLowerCase());
    let amount = ZERO;
    let payer = "";
    for (const w of wallets) {
      const v = paidTo(paid, token, w, c.pot!);
      if (v > ZERO && !payer) payer = w;
      amount += v;
    }
    if (amount === ZERO) return no("no_transfer", "That transaction did not send $WOVI from a wallet linked to your account to the burn pot.");
    const credits = creditsAtQuote(amount, quote);
    if (credits < 1) return no("too_little", "That payment is less than one credit at this price.");

    // Single use: the payment row first (its id is the chain and the hash), then the quote, then the ledger.
    const row: WoviPaymentRow = { id: paymentId, tx, userId, workspaceId: quote.workspaceId, payer, tokensWei: amount.toString(), credits, quoteId: quote.id, block: paid.block, at: paid.at, createdAt: this.now().toISOString() };
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
    await this.d.credits.payWithToken(quote.workspaceId, { paymentId, credits, by: userId, label: `Paid with $WOVI, ${creditWords(credits)}` });
    return { ok: true, credits, tokensWei: row.tokensWei, paymentId };
  }

  /** For the owner's card: how many payments and how much $WOVI went to the burn pot this way. */
  async summary(): Promise<{ payments: number; credits: number; tokensWei: string }> {
    const rows = await this.d.store.payments.find();
    return { payments: rows.length, credits: rows.reduce((s, r) => s + r.credits, 0), tokensWei: rows.reduce((s, r) => s + BigInt(r.tokensWei), ZERO).toString() };
  }
}
