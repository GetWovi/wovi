/**
 * Card top-ups through Stripe: the settings, the Checkout Session WOVI asks
 * for, the webhook (signatures, each event once, each top-up once, amount,
 * currency and pack checked), expired checkouts, refunds from the owner's page
 * and from Stripe's dashboard, and the test provider never in production.
 * Stripe's own signature code runs for real; every API call is a stub, so no
 * test reaches the network.
 */
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { testAccounts } from "@/lib/accounts/test-helpers";
import { PURCHASE_CONSENT } from "@/lib/legal/operator";
import { Withdrawals } from "@/lib/legal/withdrawals";
import { memorySafetyStore } from "@/lib/safety/store";
import { Credits } from "./credits";
import { providerFromEnv } from "./local";
import { paymentProviderFromEnv } from "./payments";
import { memoryCreditStore } from "./store";
import { cleanDescriptor, memoryStripeStore, refundOwedByStripe, StripeEvents, stripePaymentProvider, stripeSettingsFromEnv, type StripeClient } from "./stripe";

const KEY = "sk_test_" + "a".repeat(24);
const LIVE = "sk_live_" + "b".repeat(24);
const WHSEC = "whsec_" + "c".repeat(32);
const real = new Stripe(KEY);

type Params = { line_items: { price?: string; quantity?: number; price_data?: Record<string, unknown> }[]; expires_at: number } & Record<string, unknown>;

function world(env: Record<string, string> = {}) {
  const t = testAccounts();
  const settings = stripeSettingsFromEnv({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC, ...env });
  let n = 0;
  const create = vi.fn(async (params: Record<string, unknown>) => ({ id: `cs_test_${++n}${"x".repeat(10)}`, url: `https://checkout.stripe.com/c/pay/cs_test_${n}`, params }));
  const refund = vi.fn(async (params: { amount?: number }) => ({ id: `re_${n}`, status: "succeeded", amount: params.amount ?? 0 }));
  const client = { checkout: { sessions: { create } }, refunds: { create: refund }, webhooks: real.webhooks } as unknown as StripeClient;
  const provider = stripePaymentProvider(settings, client, "https://wovi.fun/", () => t.clock.t);
  const credits = new Credits({ store: memoryCreditStore(), payments: provider, now: () => new Date(t.clock.t) });
  const store = memoryStripeStore();
  const logs: string[] = [];
  const events = new StripeEvents({ settings, client, credits, store, log: (l) => logs.push(l), now: () => new Date(t.clock.t) });
  const safety = memorySafetyStore();
  let e = 0;
  /** A webhook call signed with the endpoint's secret, as Stripe sends it. */
  const deliver = (type: string, object: unknown, o: { id?: string; livemode?: boolean; secret?: string } = {}) => {
    const payload = JSON.stringify({ id: o.id ?? `evt_${++e}`, object: "event", type, livemode: o.livemode ?? false, created: Math.floor(t.clock.t / 1000), data: { object } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: o.secret ?? WHSEC });
    return events.handle(payload, header);
  };
  /** The session Stripe sends back once a top-up's checkout is paid. */
  const session = (top: { id: string; providerRef: string | null; credits: number; workspaceId: string }, patch: Record<string, unknown> = {}) => ({
    id: top.providerRef,
    object: "checkout.session",
    mode: "payment",
    client_reference_id: top.id,
    metadata: { topUpId: top.id, workspaceId: top.workspaceId, credits: String(top.credits) },
    payment_status: "paid",
    status: "complete",
    amount_total: top.credits,
    currency: "usd",
    currency_conversion: null,
    payment_intent: `pi_${top.id}`,
    livemode: false,
    ...patch,
  });
  const consent = { at: new Date(t.clock.t).toISOString(), wording: PURCHASE_CONSENT };
  return { ...t, settings, client, create, refund, provider, credits, store, events, deliver, session, safety, logs, consent };
}

describe("settings", () => {
  it("is off without both secrets, knows test from live, and keeps descriptors to Stripe's rules with WOVI by default", () => {
    expect(stripeSettingsFromEnv({}).on).toBe(false);
    expect(stripeSettingsFromEnv({ STRIPE_SECRET_KEY: KEY }).missing).toEqual(["The webhook's signing secret (STRIPE_WEBHOOK_SECRET)."]);
    expect(stripeSettingsFromEnv({ STRIPE_SECRET_KEY: "pk_test_nope", STRIPE_WEBHOOK_SECRET: WHSEC }).on).toBe(false);
    const s = stripeSettingsFromEnv({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_PRICE_500: "price_abc123def", STRIPE_PRICE_999: "price_x" });
    expect(s).toMatchObject({ on: true, test: true, descriptor: "WOVI", businessName: "WOVI", prices: { 500: "price_abc123def" } });
    expect(stripeSettingsFromEnv({ STRIPE_SECRET_KEY: LIVE, STRIPE_WEBHOOK_SECRET: WHSEC }).test).toBe(false);
    expect(cleanDescriptor("CREDITS")).toBe("CREDITS");
    expect(cleanDescriptor("bad*one")).toBe("WOVI");
    expect(cleanDescriptor("12345")).toBe("WOVI");
    expect(cleanDescriptor("x".repeat(23))).toBe("WOVI");
  });

  it("uses Stripe when it is set up, the test provider only on a local app or off production, and never on a production server", () => {
    expect(providerFromEnv({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: WHSEC, WOVI_APP_URL: "https://wovi.fun" })).toMatchObject({ id: "stripe", test: true, label: "Card, Stripe test mode" });
    expect(providerFromEnv({ WOVI_APP_URL: "http://localhost:3900" })).toMatchObject({ id: "test" });
    expect(providerFromEnv({ STRIPE_SECRET_KEY: KEY, WOVI_APP_URL: "https://wovi.fun", NODE_ENV: "production" })).toBeNull();
    expect(paymentProviderFromEnv({ WOVI_APP_URL: "https://wovi.fun", WOVI_TEST_PAYMENTS: "on", NODE_ENV: "production" })).toBeNull();
    expect(paymentProviderFromEnv({ WOVI_APP_URL: "https://wovi.fun", WOVI_TEST_PAYMENTS: "on", NODE_ENV: "development" })?.test).toBe(true);
  });
});

describe("checkout", () => {
  it("makes one Checkout Session per top-up in USD with the pack's price, WOVI's name and descriptor, and stores the consent first", async () => {
    const w = world();
    const ada = (await w.signUp("ada@example.com")).user;
    const top = await w.credits.topUp(ada.personalWorkspaceId, { credits: 1000, by: ada.id, idempotencyKey: "press-1", consent: w.consent });
    expect(top).toMatchObject({ status: "pending", provider: "stripe", test: true, amountCents: 1000, consent: { wording: PURCHASE_CONSENT } });
    expect(top.providerRef).toMatch(/^cs_test_/);
    expect(top.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const [params, opts] = w.create.mock.calls[0] as unknown as [Params, { idempotencyKey: string }];
    expect(opts.idempotencyKey).toBe(`wovi-checkout-${top.id}`);
    expect(params).toMatchObject({
      mode: "payment",
      client_reference_id: top.id,
      metadata: { topUpId: top.id, workspaceId: ada.personalWorkspaceId, credits: "1000" },
      payment_intent_data: { statement_descriptor_suffix: "WOVI" },
      success_url: "https://wovi.fun/app/credits?paid={CHECKOUT_SESSION_ID}",
      cancel_url: "https://wovi.fun/app/credits?cancelled=1",
    });
    expect(params.line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 1000, product_data: { name: "WOVI credits: 1,000" } });
    expect(params.expires_at - Math.floor(w.clock.t / 1000)).toBeGreaterThanOrEqual(30 * 60);
    // Nothing lands until the webhook, and the same press returns the same top-up.
    expect((await w.credits.balance(ada.personalWorkspaceId)).available).toBe(0);
    expect((await w.credits.topUp(ada.personalWorkspaceId, { credits: 1000, by: ada.id, idempotencyKey: "press-1" })).id).toBe(top.id);
    expect(w.create).toHaveBeenCalledTimes(1);
    // A provider confirm never says paid: only the webhook does.
    expect(await w.provider.confirm(top.providerRef!)).toBe("pending");
    expect((await w.credits.confirmTopUp(ada.personalWorkspaceId, top.id)).status).toBe("pending");
  });

  it("uses a Stripe Price when one is set for the pack, and fails cleanly when Stripe refuses", async () => {
    const w = world({ STRIPE_PRICE_500: "price_fivehundred" });
    const ada = (await w.signUp("ada@example.com")).user;
    await w.credits.topUp(ada.personalWorkspaceId, { credits: 500, by: ada.id });
    expect((w.create.mock.calls[0] as unknown as [Params])[0].line_items).toEqual([{ price: "price_fivehundred", quantity: 1 }]);
    w.create.mockRejectedValueOnce(Object.assign(new Error(`Invalid API Key provided: ${KEY}`), { type: "StripeAuthenticationError", statusCode: 401 }));
    const err = await w.credits.topUp(ada.personalWorkspaceId, { credits: 500, by: ada.id }).catch((e: Error) => e);
    expect(err).toMatchObject({ code: "payment_failed" });
    expect(String((err as Error).message)).toContain("StripeAuthenticationError, HTTP 401");
    expect(String((err as Error).message)).not.toContain(KEY);
  });
});

describe("the webhook", () => {
  it("lands the credits once from a signed checkout.session.completed, however often Stripe sends it", async () => {
    const w = world();
    const ada = (await w.signUp("ada@example.com")).user;
    const ws = ada.personalWorkspaceId;
    const top = await w.credits.topUp(ws, { credits: 2500, by: ada.id, consent: w.consent });
    const r = await w.deliver("checkout.session.completed", w.session(top), { id: "evt_paid" });
    expect(r).toMatchObject({ status: 200, body: { received: true, result: `paid ${top.id}` } });
    expect((await w.credits.balance(ws)).paid).toBe(2500);
    const paid = (await w.credits.topUps(ws))[0];
    expect(paid).toMatchObject({ status: "paid", payment: { ref: `pi_${top.id}`, amount: 2500, currency: "usd" }, checkoutUrl: null, consent: { wording: PURCHASE_CONSENT } });
    // The same event again, and the same session in another event: nothing more.
    expect((await w.deliver("checkout.session.completed", w.session(top), { id: "evt_paid" })).body.result).toMatch(/^already handled/);
    expect((await w.deliver("checkout.session.async_payment_succeeded", w.session(top))).status).toBe(200);
    expect((await w.credits.balance(ws)).paid).toBe(2500);
    expect((await w.credits.ledger(ws)).filter((e) => e.kind === "top_up")).toHaveLength(1);
    expect((await w.credits.ledger(ws))[0].label).toBe("Paid by card in Stripe test mode, 2,500 credits");
  });

  it("refuses a bad signature, another secret, no signature, an event from the other mode, and stays shut when Stripe is off", async () => {
    const w = world();
    const ada = (await w.signUp("ada@example.com")).user;
    const top = await w.credits.topUp(ada.personalWorkspaceId, { credits: 500, by: ada.id });
    const payload = JSON.stringify({ id: "evt_x", type: "checkout.session.completed", livemode: false, data: { object: w.session(top) } });
    expect((await w.events.handle(payload, "t=1,v1=deadbeef")).status).toBe(400);
    expect((await w.events.handle(payload, null)).status).toBe(400);
    expect((await w.deliver("checkout.session.completed", w.session(top), { secret: "whsec_" + "d".repeat(32) })).status).toBe(400);
    // A body changed after signing.
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
    expect((await w.events.handle(payload.replace('"credits":"500"', '"credits":"5000"'), header)).status).toBe(400);
    expect((await w.deliver("checkout.session.completed", w.session(top), { livemode: true })).status).toBe(400);
    expect((await w.credits.balance(ada.personalWorkspaceId)).paid).toBe(0);
    const off = new StripeEvents({ settings: stripeSettingsFromEnv({}), client: w.client, credits: w.credits, store: w.store });
    expect((await off.handle(payload, header)).status).toBe(404);
  });

  it("does not count a session whose amount, currency, pack or top-up does not match, nor an unpaid one", async () => {
    const w = world();
    const ada = (await w.signUp("ada@example.com")).user;
    const ws = ada.personalWorkspaceId;
    const top = await w.credits.topUp(ws, { credits: 1000, by: ada.id });
    for (const patch of [{ amount_total: 999 }, { currency: "eur" }, { metadata: { topUpId: top.id, workspaceId: ws, credits: "5000" } }, { id: "cs_test_someone_else" }, { client_reference_id: "top_nope", metadata: {} }, { mode: "subscription" }]) {
      const r = await w.deliver("checkout.session.completed", w.session(top, patch));
      expect(r.status).toBe(200);
      expect(r.body.result).toMatch(/^refused/);
    }
    expect((await w.deliver("checkout.session.completed", w.session(top, { payment_status: "unpaid" }))).body.result).toBe("not paid yet");
    expect((await w.credits.balance(ws)).paid).toBe(0);
    expect(w.logs.join("\n")).not.toContain(KEY);
    // Stripe's local currencies: the buyer paid in euros, the session keeps the USD original. That counts.
    expect((await w.deliver("checkout.session.completed", w.session(top, { currency: "eur", amount_total: 921, currency_conversion: { amount_total: 1000, source_currency: "usd" } }))).body.result).toBe(`paid ${top.id}`);
    expect((await w.credits.topUps(ws))[0].payment).toEqual({ ref: `pi_${top.id}`, amount: 921, currency: "eur" });
  });

  it("fails a top-up whose checkout expired, and never un-pays a paid one", async () => {
    const w = world();
    const ada = (await w.signUp("ada@example.com")).user;
    const ws = ada.personalWorkspaceId;
    const a = await w.credits.topUp(ws, { credits: 500, by: ada.id });
    expect((await w.deliver("checkout.session.expired", w.session(a, { payment_status: "unpaid", status: "expired" }))).body.result).toBe(`failed ${a.id}`);
    expect((await w.credits.topUpById(a.id))!.status).toBe("failed");
    const b = await w.credits.topUp(ws, { credits: 500, by: ada.id });
    await w.deliver("checkout.session.completed", w.session(b));
    expect((await w.deliver("checkout.session.expired", w.session(b))).body.result).toBe(`left ${b.id} paid`);
    expect((await w.credits.balance(ws)).paid).toBe(500);
    expect((await w.deliver("customer.created", { id: "cus_1" })).body.result).toBe("ignored");
  });

  it("answers 500 when it cannot handle an event now, so Stripe sends it again, and counts it then", async () => {
    const w = world();
    const ada = (await w.signUp("ada@example.com")).user;
    const top = await w.credits.topUp(ada.personalWorkspaceId, { credits: 500, by: ada.id });
    const spy = vi.spyOn(w.credits, "markTopUpPaid").mockRejectedValueOnce(new Error("disk full"));
    expect((await w.deliver("checkout.session.completed", w.session(top), { id: "evt_retry" })).status).toBe(500);
    spy.mockRestore();
    expect((await w.deliver("checkout.session.completed", w.session(top), { id: "evt_retry" })).status).toBe(200);
    expect((await w.credits.balance(ada.personalWorkspaceId)).paid).toBe(500);
  });
});

describe("refunds", () => {
  async function paidTopUp(w: ReturnType<typeof world>, credits = 1000) {
    const ada = (await w.signUp("ada@example.com")).user;
    const ws = ada.personalWorkspaceId;
    const top = await w.credits.topUp(ws, { credits, by: ada.id, consent: w.consent });
    await w.deliver("checkout.session.completed", w.session(top));
    return { ada, ws, top: (await w.credits.topUpById(top.id))! };
  }

  it("refunds a withdrawal to the card for the unused part, once, and Stripe's charge.refunded then takes nothing more", async () => {
    const w = world();
    const { ada, ws, top } = await paidTopUp(w);
    await w.credits.adjust(ws, { amount: -300, key: "spent", by: "test", note: "Runs" });
    const wd = new Withdrawals({ credits: w.credits, accounts: w.accounts, safety: w.safety, email: w.email, now: () => new Date(w.clock.t) });
    const owed = await wd.withdraw({ kind: "user", userId: ada.id }, ws, top.id);
    expect(owed).toMatchObject({ credits: 700, amountCents: 700 });
    expect((await w.credits.balance(ws)).paid).toBe(0);

    const r = await refundOwedByStripe({ client: w.client, credits: w.credits, safety: w.safety, owedId: owed.id, by: "usr_owner" });
    expect(r).toMatchObject({ amount: 700, currency: "usd" });
    expect(w.refund).toHaveBeenCalledWith({ payment_intent: `pi_${top.id}`, amount: 700, reason: "requested_by_customer", metadata: { owedId: owed.id, topUpId: top.id, credits: "700" } }, { idempotencyKey: `wovi-refund-${owed.id}` });
    expect(await w.safety.owed.get(owed.id)).toMatchObject({ status: "paid", paidBy: "usr_owner", contact: null, refund: { provider: "stripe" } });
    await expect(refundOwedByStripe({ client: w.client, credits: w.credits, safety: w.safety, owedId: owed.id, by: "usr_owner" })).rejects.toMatchObject({ code: "invalid_request" });
    expect(w.refund).toHaveBeenCalledTimes(1);

    // Stripe's webhook for that refund: the withdrawal already took those credits.
    const res = await w.deliver("charge.refunded", { id: "ch_1", amount: 1000, amount_refunded: 700, currency: "usd", refunded: false, payment_intent: `pi_${top.id}` });
    expect(res.body.result).toMatch(/^nothing to take/);
    expect((await w.credits.ledger(ws)).filter((e) => e.kind === "adjustment")).toHaveLength(2);
  });

  it("takes the refunded share off when a refund is made in Stripe's dashboard, once, never below zero, and a later withdrawal counts it", async () => {
    const w = world();
    const { ada, ws, top } = await paidTopUp(w);
    const charge = { id: "ch_1", amount: 1000, amount_refunded: 400, currency: "usd", payment_intent: `pi_${top.id}` };
    expect((await w.deliver("charge.refunded", charge, { id: "evt_r1" })).body.result).toBe("took 400 of 400");
    expect((await w.credits.balance(ws)).paid).toBe(600);
    expect((await w.deliver("charge.refunded", charge, { id: "evt_r1" })).body.result).toMatch(/^already handled/);
    expect((await w.deliver("charge.refunded", charge, { id: "evt_r1b" })).body.result).toMatch(/^nothing to take/);
    expect((await w.credits.balance(ws)).paid).toBe(600);

    // A withdrawal afterwards gives back only what the refund did not.
    const wd = new Withdrawals({ credits: w.credits, accounts: w.accounts, safety: w.safety, email: w.email, now: () => new Date(w.clock.t) });
    expect((await wd.withdraw({ kind: "user", userId: ada.id }, ws, top.id)).credits).toBe(600);

    // The rest refunded in full, with credits already gone: nothing below zero.
    const full = await w.deliver("charge.refunded", { ...charge, amount_refunded: 1000, refunded: true }, { id: "evt_r2" });
    expect(full.body.result).toMatch(/^nothing to take/);
    expect((await w.credits.balance(ws)).paid).toBe(0);
  });

  it("takes only what is left when the refunded credits were already spent, and ignores charges that are not WOVI top-ups", async () => {
    const w = world();
    const { ws, top } = await paidTopUp(w);
    await w.credits.adjust(ws, { amount: -900, key: "spent", by: "test", note: "Runs" });
    expect((await w.deliver("charge.refunded", { id: "ch_1", amount: 1000, amount_refunded: 1000, currency: "usd", payment_intent: `pi_${top.id}` })).body.result).toBe("took 100 of 1000");
    expect((await w.credits.balance(ws)).paid).toBe(0);
    expect((await w.credits.ledger(ws)).find((e) => e.key === `adjust:refund:${top.id}:1000`)!.note).toContain("900 credits of it were already spent");
    expect((await w.deliver("charge.refunded", { id: "ch_2", amount: 500, amount_refunded: 500, currency: "usd", payment_intent: "pi_other" })).body.result).toBe("ignored: not a WOVI top-up");
  });

  it("refuses to refund through Stripe what was not paid by card through Stripe", async () => {
    const t = testAccounts();
    const credits = new Credits({ store: memoryCreditStore(), payments: paymentProviderFromEnv({}), now: () => new Date(t.clock.t) });
    const safety = memorySafetyStore();
    const ada = (await t.signUp("ada@example.com")).user;
    const top = await credits.topUp(ada.personalWorkspaceId, { credits: 500, by: ada.id });
    const wd = new Withdrawals({ credits, accounts: t.accounts, safety });
    const owed = await wd.withdraw({ kind: "user", userId: ada.id }, ada.personalWorkspaceId, top.id);
    const client = { refunds: { create: vi.fn() } } as unknown as StripeClient;
    await expect(refundOwedByStripe({ client, credits, safety, owedId: owed.id, by: "x" })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(refundOwedByStripe({ client, credits, safety, owedId: "owed_nope", by: "x" })).rejects.toMatchObject({ code: "not_found" });
  });
});
