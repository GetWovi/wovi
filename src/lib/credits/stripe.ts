/**
 * SERVER ONLY. Card top-ups through Stripe Checkout, Stripe's own hosted
 * page, so no card number ever reaches WOVI. Off until STRIPE_SECRET_KEY and
 * STRIPE_WEBHOOK_SECRET are both set; then it is the payment provider for
 * top-ups and the test provider is gone.
 *
 *   1. checkout: the buyer ticks the purchase consent (phase 18) and picks a
 *      pack; a pending top-up row stores the consent, then a Checkout Session
 *      is made for that pack's price in USD and the buyer is sent to it.
 *   2. webhook: Stripe calls /api/stripe/webhook. The signature is checked
 *      with the webhook secret, every event is handled once (its id), and
 *      `checkout.session.completed` with `payment_status: paid` lands the
 *      credits, once per top-up, after checking the session, the amount, the
 *      currency and the pack against the row. Coming back from Stripe's page
 *      grants nothing: credits only ever come from a verified webhook.
 *   3. refunds: the owner refunds a withdrawal (14 days, phase 18) through
 *      Stripe's refund API from the owner's page, and `charge.refunded`
 *      takes the refunded part's credits off the balance (never twice: a
 *      withdrawal already took them).
 *
 * WOVI's pages, receipts and the product name on Stripe's page say "WOVI"
 * only (STRIPE_BUSINESS_NAME). The card statement reads the account's
 * shortened descriptor and STRIPE_STATEMENT_DESCRIPTOR (default "WOVI").
 * Tests hand in a stub client; no test calls Stripe.
 */
import Stripe from "stripe";
import type { Collection } from "@/lib/accounts/store";
import { jsonFileTables, memoryTables } from "@/lib/accounts/store";
import type { SafetyStore } from "@/lib/safety/store";
import { CREDITS, creditWords } from "./config";
import type { Credits } from "./credits";
import type { CheckoutRequest, CheckoutResult, PaymentProvider } from "./payments";
import type { TopUp } from "./types";

/* ---------- Settings ---------- */

export type StripeSettings = {
  secretKey: string | null;
  webhookSecret: string | null;
  /** True with a test-mode key (sk_test_ or rk_test_): no real money, every screen says so. */
  test: boolean;
  /** The card statement's suffix after the account's shortened descriptor. */
  descriptor: string;
  /** The name on the product line of Stripe's page and on WOVI's receipts. */
  businessName: string;
  /** Optional Stripe Price ids per pack (STRIPE_PRICE_500 ...). A pack without one is priced inline. */
  prices: Record<number, string>;
  on: boolean;
  missing: string[];
};

const KEY = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/;
const WHSEC = /^whsec_[A-Za-z0-9+/=]{10,}$/;

/** Stripe's rules for a descriptor: 2 to 22 characters, a letter at least, none of < > \ ' " *. */
export function cleanDescriptor(v: string | undefined, fallback = "WOVI"): string {
  const s = (v ?? "").trim().replace(/\s+/g, " ");
  return s.length >= 2 && s.length <= 22 && /[A-Za-z]/.test(s) && !/[<>\\'"*]/.test(s) && /^[\x20-\x7E]+$/.test(s) ? s : fallback;
}

export function stripeSettingsFromEnv(env: Record<string, string | undefined> = process.env): StripeSettings {
  const secretKey = env.STRIPE_SECRET_KEY?.trim() || null;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  const missing: string[] = [];
  if (!secretKey) missing.push("A secret key (STRIPE_SECRET_KEY).");
  else if (!KEY.test(secretKey)) missing.push("STRIPE_SECRET_KEY does not look like a Stripe secret key (sk_live_, sk_test_, rk_live_ or rk_test_).");
  if (!webhookSecret) missing.push("The webhook's signing secret (STRIPE_WEBHOOK_SECRET).");
  else if (!WHSEC.test(webhookSecret)) missing.push("STRIPE_WEBHOOK_SECRET does not look like a signing secret (whsec_).");
  const prices: Record<number, string> = {};
  for (const pack of CREDITS.packs) {
    const id = env[`STRIPE_PRICE_${pack}`]?.trim();
    if (id && /^price_[A-Za-z0-9]{6,}$/.test(id)) prices[pack] = id;
  }
  const name = (env.STRIPE_BUSINESS_NAME ?? "").trim();
  return {
    secretKey,
    webhookSecret,
    test: /^(sk|rk)_test_/.test(secretKey ?? ""),
    descriptor: cleanDescriptor(env.STRIPE_STATEMENT_DESCRIPTOR),
    businessName: name && name.length <= 40 && /^[\x20-\x7E]+$/.test(name) ? name : "WOVI",
    prices,
    on: missing.length === 0,
    missing,
  };
}

/* ---------- The client: the few calls WOVI makes ---------- */

export type CheckoutSessionLike = {
  id: string;
  url?: string | null;
  mode?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  payment_status?: string | null;
  status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  currency_conversion?: { amount_total: number; source_currency: string } | null;
  payment_intent?: string | { id: string } | null;
  livemode?: boolean;
};

export type ChargeLike = { id: string; amount: number; amount_refunded: number; currency: string; refunded?: boolean; payment_intent?: string | { id: string } | null };

export type StripeEventLike = { id: string; type: string; livemode: boolean; created?: number; data: { object: unknown } };

export type StripeClient = {
  checkout: { sessions: { create(params: Stripe.Checkout.SessionCreateParams, options?: { idempotencyKey?: string }): Promise<{ id: string; url: string | null }> } };
  refunds: { create(params: Stripe.RefundCreateParams, options?: { idempotencyKey?: string }): Promise<{ id: string; status: string | null; amount: number }> };
  webhooks: { constructEvent(payload: string, header: string, secret: string): StripeEventLike };
};

/**
 * The real client. No call is made until a checkout or a refund. `apiBase`
 * points it at a local stand-in for Stripe's API (stripe-mock, or the
 * screenshot script's), and is only ever passed for a local app.
 */
export function stripeClient(secretKey: string, apiBase?: string | null): StripeClient {
  const local = apiBase ? new URL(apiBase) : null;
  return new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "WOVI" },
    ...(local ? { host: local.hostname, port: Number(local.port || (local.protocol === "https:" ? 443 : 80)), protocol: local.protocol === "https:" ? "https" : "http" } : {}),
  }) as unknown as StripeClient;
}

/** STRIPE_API_BASE, for a local app only: a stand-in for Stripe's API on this machine. Null anywhere else. */
export function localStripeApiBase(env: Record<string, string | undefined>): string | null {
  const base = env.STRIPE_API_BASE?.trim();
  if (!base) return null;
  try {
    const app = new URL(env.WOVI_APP_URL ?? "http://localhost:3900").hostname;
    const api = new URL(base).hostname;
    const here = (h: string) => h === "localhost" || h === "127.0.0.1";
    return here(app) && here(api) ? base : null;
  } catch {
    return null;
  }
}

/** A Stripe error in safe words: its type and code, never the key or anything the card holder typed. */
export function stripeErrorWords(err: unknown): string {
  const e = (err ?? {}) as { type?: unknown; code?: unknown; statusCode?: unknown };
  const parts = [typeof e.type === "string" ? e.type : null, typeof e.code === "string" ? e.code : null, typeof e.statusCode === "number" ? `HTTP ${e.statusCode}` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : "no answer";
}

/* ---------- The payment provider ---------- */

/**
 * Card top-ups on Stripe's hosted page. `confirm` never says paid: credits
 * land only from the verified webhook (StripeEvents), never from a redirect
 * or a poll.
 */
export function stripePaymentProvider(s: StripeSettings, client: StripeClient, appUrl: string, now: () => number = Date.now): PaymentProvider {
  const base = appUrl.replace(/\/+$/, "");
  return {
    id: "stripe",
    label: s.test ? "Card, Stripe test mode" : "Card",
    test: s.test,
    async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
      const price = s.prices[req.credits];
      const meta = { topUpId: req.topUpId, workspaceId: req.workspaceId, credits: String(req.credits) };
      try {
        const session = await client.checkout.sessions.create(
          {
            mode: "payment",
            client_reference_id: req.topUpId,
            metadata: meta,
            line_items: [
              price
                ? { price, quantity: 1 }
                : {
                    quantity: 1,
                    price_data: {
                      currency: req.currency,
                      unit_amount: req.amountCents,
                      product_data: { name: `${s.businessName} credits: ${req.credits.toLocaleString("en-US")}`, description: `${creditWords(req.credits)} for running agents on ${s.businessName}. One credit is one cent.` },
                    },
                  },
            ],
            payment_intent_data: { statement_descriptor_suffix: s.descriptor, description: `${s.businessName} credits: ${creditWords(req.credits)}`, metadata: meta },
            submit_type: "pay",
            success_url: `${base}/app/credits?paid={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/app/credits?cancelled=1`,
            // Stripe's shortest: half an hour. An expired session fails the top-up (checkout.session.expired).
            expires_at: Math.floor(now() / 1000) + 31 * 60,
          },
          { idempotencyKey: `wovi-checkout-${req.topUpId}` },
        );
        if (!session.url) return { status: "failed", error: "Stripe did not give a page to pay on." };
        return { status: "pending", providerRef: session.id, redirectUrl: session.url };
      } catch (err) {
        return { status: "failed", error: `Stripe refused the checkout (${stripeErrorWords(err)}).` };
      }
    },
    async confirm() {
      return "pending";
    },
  };
}

/* ---------- Events, once each ---------- */

export type StripeEventRow = { id: string; type: string; livemode: boolean; result: string; at: string };
export type StripeStore = { events: Collection<StripeEventRow> };

export const memoryStripeStore = (): StripeStore => memoryTables<StripeStore>(["events"]);
export const jsonFileStripeStore = (file: string): StripeStore => jsonFileTables<StripeStore>(file, ["events"]);

export type WebhookAnswer = { status: number; body: { received: boolean; result?: string; error?: string } };

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

export class StripeEvents {
  constructor(
    private readonly o: {
      settings: StripeSettings;
      client: StripeClient;
      credits: Credits;
      store: StripeStore;
      log?: (line: string) => void;
      now?: () => Date;
    },
  ) {}

  private log(line: string) {
    (this.o.log ?? ((l: string) => console.error(l)))(line);
  }

  private iso() {
    return (this.o.now?.() ?? new Date()).toISOString();
  }

  /**
   * One webhook call: the raw body and the Stripe-Signature header. 400 for
   * a bad signature, 500 for a failure Stripe should send again, else 200.
   */
  async handle(raw: string, signature: string | null): Promise<WebhookAnswer> {
    const s = this.o.settings;
    if (!s.on || !s.webhookSecret) return { status: 404, body: { received: false, error: "Card payments are not set up." } };
    if (!signature) return { status: 400, body: { received: false, error: "No Stripe-Signature header." } };
    let event: StripeEventLike;
    try {
      event = this.o.client.webhooks.constructEvent(raw, signature, s.webhookSecret);
    } catch {
      return { status: 400, body: { received: false, error: "The signature does not match." } };
    }
    if (event.livemode === s.test) {
      // A live event at a test key, or the other way round: never counted.
      return { status: 400, body: { received: false, error: "This event is from the other Stripe mode." } };
    }
    const seen = await this.o.store.events.get(event.id);
    if (seen) return { status: 200, body: { received: true, result: `already handled: ${seen.result}` } };
    let result: string;
    try {
      result = await this.dispatch(event);
    } catch (err) {
      this.log(`Stripe event ${event.id} (${event.type}) failed; Stripe sends it again: ${(err as Error)?.name ?? "error"}`);
      return { status: 500, body: { received: false, error: "Could not handle it now." } };
    }
    await this.o.store.events.insert({ id: event.id, type: event.type, livemode: event.livemode, result, at: this.iso() }).catch(() => undefined);
    return { status: 200, body: { received: true, result } };
  }

  private async dispatch(event: StripeEventLike): Promise<string> {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return this.paid(event.data.object as CheckoutSessionLike);
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        return this.notPaid(event.data.object as CheckoutSessionLike, event.type === "checkout.session.expired" ? "The checkout expired before it was paid." : "The payment did not go through.");
      case "charge.refunded":
        return this.refunded(event.data.object as ChargeLike);
      default:
        return "ignored";
    }
  }

  /** The top-up a session is for, after checking that it really is. */
  private async topUpFor(session: CheckoutSessionLike): Promise<{ row: TopUp } | { problem: string }> {
    const id = session.client_reference_id ?? session.metadata?.topUpId ?? null;
    if (!id) return { problem: "no top-up id on the session" };
    const row = await this.o.credits.topUpById(id);
    if (!row) return { problem: `no top-up ${id}` };
    if (row.provider !== "stripe" || row.providerRef !== session.id) return { problem: `top-up ${id} is not this session` };
    return { row };
  }

  private async paid(session: CheckoutSessionLike): Promise<string> {
    if (session.payment_status !== "paid") return "not paid yet";
    const found = await this.topUpFor(session);
    if ("problem" in found) {
      this.log(`Stripe session not counted: ${found.problem}.`);
      return `refused: ${found.problem}`;
    }
    const row = found.row;
    // The amount and currency the pack was priced in. With Stripe's local currencies the buyer may pay in another,
    // and the session then keeps the original in currency_conversion.
    const cc = session.currency_conversion ?? null;
    const amount = cc ? cc.amount_total : session.amount_total;
    const currency = (cc ? cc.source_currency : session.currency)?.toLowerCase();
    const problems: string[] = [];
    if (session.mode && session.mode !== "payment") problems.push("not a payment");
    if (currency !== row.currency) problems.push(`currency ${currency ?? "none"}, not ${row.currency}`);
    if (amount !== row.amountCents) problems.push(`amount ${amount ?? "none"}, not ${row.amountCents}`);
    if (session.metadata?.credits !== undefined && session.metadata.credits !== String(row.credits)) problems.push("another pack");
    if (row.workspaceId !== (session.metadata?.workspaceId ?? row.workspaceId)) problems.push("another workspace");
    if (problems.length) {
      this.log(`Stripe session for ${row.id} not counted: ${problems.join(", ")}.`);
      return `refused: ${problems.join(", ")}`;
    }
    const pi = idOf(session.payment_intent);
    const done = await this.o.credits.markTopUpPaid(row.id, { ref: pi ?? session.id, amount: session.amount_total ?? row.amountCents, currency: (session.currency ?? row.currency).toLowerCase() });
    return `paid ${done.id}`;
  }

  private async notPaid(session: CheckoutSessionLike, why: string): Promise<string> {
    const found = await this.topUpFor(session);
    if ("problem" in found) return `ignored: ${found.problem}`;
    const row = await this.o.credits.failTopUp(found.row.id, why);
    return row?.status === "failed" ? `failed ${found.row.id}` : `left ${found.row.id} ${found.row.status}`;
  }

  /**
   * A refund (from the owner's page or Stripe's dashboard): the refunded
   * share of the top-up's credits leaves the balance, minus what a
   * withdrawal or an earlier refund already took. Credits already spent stay
   * spent; the note says how many could not be taken.
   */
  private async refunded(charge: ChargeLike): Promise<string> {
    const pi = idOf(charge.payment_intent);
    if (!pi) return "ignored: no payment intent";
    const row = (await this.o.credits.findTopUps({ provider: "stripe", status: "paid" })).find((t) => t.payment?.ref === pi);
    if (!row) return "ignored: not a WOVI top-up";
    const target = charge.amount_refunded >= charge.amount ? row.credits : Math.floor((row.credits * charge.amount_refunded) / charge.amount);
    // This refunded share was handled before (another event for the same refund).
    if (await this.o.credits.hasKey(row.workspaceId, `adjust:refund:${row.id}:${target}`)) return `nothing to take: the refund of ${target} was handled`;
    const already = await this.o.credits.removedFromTopUp(row.workspaceId, row.id);
    const due = target - already;
    if (due <= 0) return `nothing to take: ${already} of ${row.credits} already gone`;
    const paid = (await this.o.credits.balance(row.workspaceId)).paid;
    const take = Math.min(due, paid);
    const short = due - take;
    const note = `Refunded by card: ${creditWords(due)} of the purchase of ${creditWords(row.credits)}${short > 0 ? `; ${creditWords(short)} of it were already spent` : ""}`;
    if (take > 0) await this.o.credits.adjust(row.workspaceId, { amount: -take, key: `refund:${row.id}:${target}`, by: "stripe", note });
    else this.log(`A refund of top-up ${row.id}: ${creditWords(due)} were already spent.`);
    return `took ${take} of ${due}`;
  }
}

/* ---------- The owner's refund of a withdrawal ---------- */

export class StripeRefundError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_request" | "provider",
    message: string,
  ) {
    super(message);
    this.name = "StripeRefundError";
  }
}

/**
 * Pays back a withdrawal (phase 18) through Stripe: the share of what the
 * buyer paid for the credits they gave back, refunded to their card, and the
 * owed row marked paid with Stripe's refund id. The same row again is
 * refused; Stripe's idempotency key makes a retried call one refund.
 */
export async function refundOwedByStripe(o: { client: StripeClient; credits: Credits; safety: SafetyStore; owedId: string; by: string; now?: () => Date }): Promise<{ refundId: string; amount: number; currency: string }> {
  const owed = await o.safety.owed.get(o.owedId);
  if (!owed) throw new StripeRefundError("not_found", "No such row.");
  if (owed.status !== "owed") throw new StripeRefundError("invalid_request", "This is already paid back.");
  if (owed.kind !== "withdrawal" || !owed.topUpId) throw new StripeRefundError("invalid_request", "Only a withdrawal from one card purchase can be refunded through Stripe.");
  const topUp = await o.credits.topUpById(owed.topUpId);
  if (!topUp || topUp.provider !== "stripe" || topUp.status !== "paid" || !topUp.payment?.ref) throw new StripeRefundError("invalid_request", "That purchase was not paid by card through Stripe.");
  const pay = topUp.payment;
  const amount = owed.credits >= topUp.credits ? pay.amount : Math.floor((pay.amount * owed.credits) / topUp.credits);
  if (amount <= 0) throw new StripeRefundError("invalid_request", "Nothing to refund.");
  let refund;
  try {
    refund = await o.client.refunds.create(
      { payment_intent: pay.ref, amount, reason: "requested_by_customer", metadata: { owedId: owed.id, topUpId: topUp.id, credits: String(owed.credits) } },
      { idempotencyKey: `wovi-refund-${owed.id}` },
    );
  } catch (err) {
    throw new StripeRefundError("provider", `Stripe did not refund it (${stripeErrorWords(err)}). Nothing changed here.`);
  }
  const at = (o.now?.() ?? new Date()).toISOString();
  await o.safety.owed.update({ ...owed, status: "paid", paidAt: at, paidBy: o.by, contact: null, refund: { provider: "stripe", ref: refund.id } });
  return { refundId: refund.id, amount, currency: pay.currency };
}

/** "$5.00" for a USD amount in cents, else the amount and the currency code. */
export function moneyWords(amount: number, currency: string): string {
  return currency.toLowerCase() === "usd" ? `$${(amount / 100).toFixed(2)}` : `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
}
