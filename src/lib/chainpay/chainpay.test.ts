/**
 * Topping up with a stablecoin (USDG by default) and ETH on Robinhood Chain:
 * the stablecoin read and checked on chain at start, quotes, every on-chain
 * check, each transaction once (here and against x402), under, over and late
 * payments, the consent stored, withdrawal of such a top-up, and the settings.
 * On a pretend chain and memory stores; nothing calls a network.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { testAccounts } from "@/lib/accounts/test-helpers";
import { Credits } from "@/lib/credits/credits";
import { memoryCreditStore } from "@/lib/credits/store";
import { PURCHASE_CONSENT } from "@/lib/legal/operator";
import { Withdrawals } from "@/lib/legal/withdrawals";
import { memorySafetyStore } from "@/lib/safety/store";
import type { ChainPayReader, ChainPayTx } from "./chain";
import { CHAIN_ID, chainPayConfigFromEnv, chainPayStatus, ETH_USD_FEED, NATIVE_ETH, USDG } from "./config";
import { centsAtQuote, ChainPay, creditsAtQuote } from "./pay";
import { memoryChainPayStore } from "./store";

const PAY_TO = "0x00000000000000000000000000000000000Fee01";
const OTHER_TOKEN = "0x0000000000000000000000000000000000000Bad";
const wallet = () => privateKeyToAccount(generatePrivateKey());
const consent = () => ({ at: new Date().toISOString(), wording: PURCHASE_CONSENT });
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

class FakeChain implements ChainPayReader {
  txs = new Map<string, ChainPayTx>();
  usd: bigint | null = BigInt(2400) * BigInt(100_000_000);
  down = false;
  feeds: string[] = [];
  async tx(h: string) {
    if (this.down) throw new Error("fetch failed at https://rpc.example/secret");
    return this.txs.get(h.toLowerCase()) ?? null;
  }
  async ethUsd(feed: string) {
    this.feeds.push(feed);
    if (this.down) throw new Error("down");
    return this.usd;
  }
  /** What tokens report about themselves: USDG as read on Robinhood Chain. */
  meta = new Map<string, { symbol: unknown; decimals: unknown }>([[USDG.toLowerCase(), { symbol: "USDG", decimals: 6 }]]);
  rpcChain = CHAIN_ID;
  infoReads = 0;
  async tokenInfo(token: string) {
    this.infoReads++;
    if (this.down) throw new Error("fetch failed at https://rpc.example/secret");
    const m = this.meta.get(token.toLowerCase());
    if (!m) throw new Error("execution reverted");
    return { chainId: this.rpcChain, ...m };
  }
}

async function world(env: Record<string, string> = {}) {
  const t = testAccounts();
  const chain = new FakeChain();
  const store = memoryChainPayStore();
  const safety = memorySafetyStore();
  const credits = new Credits({ store: memoryCreditStore(), now: () => new Date(t.clock.t) });
  const config = chainPayConfigFromEnv({ WOVI_PAY_TO: PAY_TO, ...env });
  const x402Used = new Set<string>();
  const logs: string[] = [];
  const pay = new ChainPay({ config, reader: chain, store, accounts: t.accounts.store, credits, owed: safety.owed, usedElsewhere: async (id) => x402Used.has(id), now: () => new Date(t.clock.t), log: (l) => logs.push(l) });
  const link = async (userId: string, w = wallet()) => {
    const { challengeId, message } = await t.accounts.wallets.linkMessage(userId, w.address, CHAIN_ID);
    await t.accounts.wallets.verifyLink(userId, challengeId, await w.signMessage({ message }));
    return w;
  };
  const person = async (email = "ada@example.com") => {
    const user = (await t.signUp(email)).user;
    return { user, ws: user.personalWorkspaceId, w: await link(user.id) };
  };
  /** A mined transaction: a stablecoin transfer or plain ETH, from `from`, at the clock's time unless said. */
  let n = 1;
  const mine = (o: { from: string; stable?: bigint; eth?: bigint; to?: string; token?: string; at?: number; confirmations?: number; ok?: boolean; chainId?: number; logFrom?: string }) => {
    const h = hash(n++);
    const from = o.from.toLowerCase();
    chain.txs.set(h, {
      ok: o.ok ?? true,
      chainId: o.chainId ?? CHAIN_ID,
      block: 1000 + n,
      at: o.at ?? t.clock.t,
      confirmations: o.confirmations ?? 5,
      from,
      to: o.eth !== undefined ? (o.to ?? PAY_TO).toLowerCase() : (o.token ?? USDG).toLowerCase(),
      value: o.eth ?? BigInt(0),
      transfers: o.stable !== undefined ? [{ token: (o.token ?? USDG).toLowerCase(), from: (o.logFrom ?? from).toLowerCase(), to: (o.to ?? PAY_TO).toLowerCase(), value: o.stable }] : [],
    });
    return h;
  };
  return { ...t, chain, store, safety, credits, config, pay, link, person, mine, x402Used, logs };
}

describe("settings", () => {
  it("is off with nothing set, takes x402's address, and defaults the stablecoin to USDG on Robinhood Chain", () => {
    expect(chainPayStatus(chainPayConfigFromEnv({})).on).toBe(false);
    const viaX402 = chainPayConfigFromEnv({ WOVI_X402_PAY_TO: PAY_TO });
    expect(viaX402).toMatchObject({ payTo: PAY_TO, payToFrom: "WOVI_X402_PAY_TO", publicRpc: true, ethUsdFeed: ETH_USD_FEED, minConfirmations: 3 });
    expect(viaX402.stable).toEqual({ token: USDG, from: "default", expectSymbol: null, expectDecimals: null, badSetting: null });
    expect(USDG).toBe("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
    expect(viaX402.eth).toMatchObject({ available: true, token: NATIVE_ETH });
    expect(chainPayStatus(viaX402).on).toBe(true);
    const own = chainPayConfigFromEnv({ WOVI_PAY_TO: PAY_TO, WOVI_X402_PAY_TO: OTHER_TOKEN, WOVI_PAY_ETH: "off", WOVI_STABLECOIN_ADDRESS: "off", WOVI_PAY_RPC_URL: "https://rpc.example", WOVI_PAY_MIN_CONFIRMATIONS: "7" });
    expect(own).toMatchObject({ payTo: PAY_TO, payToFrom: "WOVI_PAY_TO", rpcUrl: "https://rpc.example", publicRpc: false, minConfirmations: 7, stable: { token: null, from: "off" } });
    // ETH off and the stablecoin off: nothing to pay with, so off.
    expect(chainPayStatus(own)).toMatchObject({ on: false });
    expect(chainPayConfigFromEnv({ WOVI_PAY_TO: "not an address" }).payTo).toBeNull();
  });

  it("takes another stablecoin by WOVI_STABLECOIN_ADDRESS, still reads WOVI_USDC_ADDRESS as its older name, and refuses a bad address", () => {
    expect(chainPayConfigFromEnv({ WOVI_STABLECOIN_ADDRESS: OTHER_TOKEN, WOVI_STABLECOIN_SYMBOL: "USDC", WOVI_STABLECOIN_DECIMALS: "6" }).stable).toEqual({ token: OTHER_TOKEN, from: "WOVI_STABLECOIN_ADDRESS", expectSymbol: "USDC", expectDecimals: 6, badSetting: null });
    expect(chainPayConfigFromEnv({ WOVI_USDC_ADDRESS: OTHER_TOKEN }).stable).toMatchObject({ token: OTHER_TOKEN, from: "WOVI_USDC_ADDRESS" });
    expect(chainPayConfigFromEnv({ WOVI_USDC_ADDRESS: OTHER_TOKEN, WOVI_STABLECOIN_ADDRESS: USDG }).stable).toMatchObject({ token: USDG, from: "WOVI_STABLECOIN_ADDRESS" });
    expect(chainPayConfigFromEnv({ WOVI_STABLECOIN_ADDRESS: "0x123" }).stable).toMatchObject({ token: null, badSetting: expect.stringContaining("WOVI_STABLECOIN_ADDRESS") });
  });

  it("keeps money math exact: the stablecoin one to one, ETH rounded up, credits rounded down", () => {
    expect(creditsAtQuote(BigInt(4_990_000), { credits: 500, amount: "5000000" })).toBe(499);
    expect(creditsAtQuote(BigInt(9_999), { credits: 500, amount: "5000000" })).toBe(0);
    expect(centsAtQuote(BigInt(5_000_000), { asset: "stable", decimals: 6, ethUsd: null })).toBe(500);
    expect(centsAtQuote(BigInt(5) * BigInt(10) ** BigInt(18), { asset: "stable", decimals: 18, ethUsd: null })).toBe(500);
    // A row written before the rename ("usdc") is still the stablecoin.
    expect(centsAtQuote(BigInt(5_000_000), { asset: "usdc" as never, decimals: 6, ethUsd: null })).toBe(500);
    expect(centsAtQuote(BigInt("2083333333333334"), { asset: "eth", decimals: 18, ethUsd: (BigInt(2400) * BigInt(1e8)).toString() })).toBe(500);
  });
});

describe("the stablecoin, read and checked on chain", () => {
  it("uses USDG's real symbol and decimals from the chain, read once and kept", async () => {
    const w = await world();
    const v = await w.pay.view();
    expect(v.assets[0]).toEqual({ asset: "stable", symbol: "USDG", token: USDG, decimals: 6, available: true, note: null });
    expect(v.stable).toEqual({ ok: true, token: USDG, symbol: "USDG", decimals: 6 });
    await w.pay.view();
    expect(w.chain.infoReads).toBe(1);
  });

  it("is not offered when the RPC is another chain, the token gives a strange symbol or decimals, or it does not match the settings; ETH still works", async () => {
    const cases: [Record<string, string>, (c: FakeChain) => void, RegExp][] = [
      [{}, (c) => (c.rpcChain = 1), /chain 1, not Robinhood Chain/],
      [{}, (c) => c.meta.set(USDG.toLowerCase(), { symbol: "<script>", decimals: 6 }), /symbol/],
      [{}, (c) => c.meta.set(USDG.toLowerCase(), { symbol: "USDG", decimals: 0 }), /0 decimals/],
      [{}, (c) => c.meta.set(USDG.toLowerCase(), { symbol: "USDG", decimals: 30 }), /30 decimals/],
      [{ WOVI_STABLECOIN_SYMBOL: "USDC" }, () => undefined, /reports USDG, not USDC/],
      [{ WOVI_STABLECOIN_DECIMALS: "18" }, () => undefined, /6 decimals, not 18/],
      [{ WOVI_STABLECOIN_ADDRESS: OTHER_TOKEN }, () => undefined, /did not answer symbol\(\) and decimals\(\)/],
    ];
    for (const [env, bend, why] of cases) {
      const w = await world(env);
      bend(w.chain);
      const { user, ws } = await w.person();
      const v = await w.pay.view();
      expect(v.assets[0]).toMatchObject({ available: false, note: "Not available right now" });
      expect(v.stable && !v.stable.ok && v.stable.reason).toMatch(why);
      expect(w.logs.join(" ")).toMatch(why);
      await expect(w.pay.quote(user.id, ws, { credits: 500, asset: "stable", consent: consent() })).rejects.toMatchObject({ code: "unavailable" });
      expect((await w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: consent() })).asset).toBe("eth");
    }
  });

  it("tries again after a minute when the chain did not answer, and never shows the node's address", async () => {
    const w = await world();
    w.chain.down = true;
    const first = await w.pay.stablecoin();
    expect(first).toMatchObject({ ok: false });
    expect(JSON.stringify(first) + w.logs.join(" ")).not.toContain("rpc.example");
    w.chain.down = false;
    expect(await w.pay.stablecoin()).toMatchObject({ ok: false }); // inside the minute: the same answer
    vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ["Date"] });
    try {
      expect(await w.pay.stablecoin()).toMatchObject({ ok: true, symbol: "USDG" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("never holds a page for a slow node: the stablecoin shows as being checked until it answers", async () => {
    const w = await world();
    let answer!: () => void;
    const real = w.chain.tokenInfo.bind(w.chain);
    w.chain.tokenInfo = (t: string) => new Promise((r) => (answer = () => r(real(t))));
    const v = await w.pay.view(20);
    expect(v.assets[0]).toMatchObject({ asset: "stable", available: false, note: "Being checked" });
    expect(v.assets[1]).toMatchObject({ asset: "eth", available: true });
    answer();
    expect((await w.pay.view()).assets[0]).toMatchObject({ symbol: "USDG", available: true });
  });

  it("prices any decimals one to one: an 18-decimal stablecoin set by WOVI_USDC_ADDRESS", async () => {
    const w = await world({ WOVI_USDC_ADDRESS: OTHER_TOKEN });
    w.chain.meta.set(OTHER_TOKEN.toLowerCase(), { symbol: "USDX", decimals: 18 });
    const { user, ws, w: wal } = await w.person();
    const q = await w.pay.quote(user.id, ws, { credits: 500, asset: "stable", consent: consent() });
    expect(q).toMatchObject({ symbol: "USDX", decimals: 18, amount: "5000000000000000000", token: OTHER_TOKEN });
    expect(await w.pay.claim(user.id, q.id, w.mine({ from: wal.address, stable: BigInt(q.amount), token: OTHER_TOKEN }))).toMatchObject({ ok: true, credits: 500, symbol: "USDX" });
    expect((await w.credits.ledger(ws))[0].label).toBe("Paid with USDX, 500 credits");
  });

  it("is switched off by WOVI_STABLECOIN_ADDRESS=off, with nothing read", async () => {
    const w = await world({ WOVI_STABLECOIN_ADDRESS: "off" });
    const v = await w.pay.view();
    expect(v.assets[0]).toMatchObject({ available: false, note: "Switched off" });
    expect(w.chain.infoReads).toBe(0);
  });
});

describe("a price", () => {
  it("is USDG one to one in the six decimals it reports, single use and ten minutes long, with the consent kept word for word", async () => {
    const w = await world();
    const { user, ws } = await w.person();
    const q = await w.pay.quote(user.id, ws, { credits: 500, asset: "stable", consent: consent() });
    expect(q).toMatchObject({ credits: 500, asset: "stable", symbol: "USDG", amount: "5000000", decimals: 6, payTo: PAY_TO });
    expect(Date.parse(q.expiresAt) - w.clock.t).toBe(600_000);
    expect((await w.store.quotes.get(q.id))!.consent.wording).toBe(PURCHASE_CONSENT);
    expect((await w.pay.quote(user.id, ws, { credits: 5000, asset: "stable", consent: consent() })).amount).toBe("50000000");
  });

  it("is ETH from Chainlink's ETH/USD, rounded up to a whole gwei so WOVI is never paid less", async () => {
    const w = await world();
    const { user, ws } = await w.person();
    const q = await w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: consent() });
    // $5 at $2,400: 0.0020833... ETH, rounded up to the gwei.
    expect(q.amount).toBe("2083334000000000");
    expect(w.chain.feeds).toEqual([ETH_USD_FEED]);
    expect((await w.store.quotes.get(q.id))!.ethUsd).toBe("240000000000");
  });

  it("is refused while off, without the consent, for a pack that is not one, with the stablecoin switched off, with no linked wallet, and with no fresh ETH price", async () => {
    const off = await world({ WOVI_PAY_TO: "" });
    const a = await off.person();
    await expect(off.pay.quote(a.user.id, a.ws, { credits: 500, asset: "eth", consent: consent() })).rejects.toMatchObject({ code: "off" });

    const w = await world();
    const { user, ws } = await w.person();
    await expect(w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: null })).rejects.toMatchObject({ code: "no_consent" });
    await expect(w.pay.quote(user.id, ws, { credits: 499, asset: "eth", consent: consent() })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(w.pay.quote(user.id, ws, { credits: 500, asset: "btc", consent: consent() })).rejects.toMatchObject({ code: "invalid_request" });
    const bo = (await w.signUp("bo@example.com")).user;
    await expect(w.pay.quote(bo.id, bo.personalWorkspaceId, { credits: 500, asset: "eth", consent: consent() })).rejects.toMatchObject({ code: "no_wallet" });
    w.chain.usd = null;
    await expect(w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: consent() })).rejects.toMatchObject({ code: "no_price" });
    w.chain.down = true;
    await expect(w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: consent() })).rejects.toMatchObject({ code: "chain_down" });

    const noUsdc = await world({ WOVI_STABLECOIN_ADDRESS: "off" });
    const c = await noUsdc.person();
    await expect(noUsdc.pay.quote(c.user.id, c.ws, { credits: 500, asset: "stable", consent: consent() })).rejects.toMatchObject({ code: "unavailable" });
    expect((await noUsdc.pay.quote(c.user.id, c.ws, { credits: 500, asset: "eth", consent: consent() })).asset).toBe("eth");
  });
});

describe("a payment", () => {
  it("in USDG lands once as a paid top-up with the consent, and the same claim again changes nothing", async () => {
    const w = await world();
    const { user, ws, w: wal } = await w.person();
    const q = await w.pay.quote(user.id, ws, { credits: 1000, asset: "stable", consent: consent() });
    const tx = w.mine({ from: wal.address, stable: BigInt(10_000_000) });
    const r = await w.pay.claim(user.id, q.id, tx);
    expect(r).toMatchObject({ ok: true, credits: 1000, symbol: "USDG", amount: "10000000" });
    expect((await w.credits.balance(ws)).paid).toBe(1000);
    const [top] = await w.credits.topUps(ws);
    expect(top).toMatchObject({ provider: "stable", status: "paid", credits: 1000, amountCents: 1000, test: false, consent: { wording: PURCHASE_CONSENT } });
    expect(top.chain).toMatchObject({ asset: "stable", amount: "10000000", payer: wal.address.toLowerCase(), tx });
    // The same claim again (a lost answer): the same, nothing new.
    expect(await w.pay.claim(user.id, q.id, tx.toUpperCase().replace("0X", "0x"))).toMatchObject({ ok: true, credits: 1000 });
    expect((await w.credits.balance(ws)).paid).toBe(1000);
    expect(await w.credits.topUps(ws)).toHaveLength(1);
    expect((await w.credits.ledger(ws)).filter((e) => e.kind === "top_up")).toHaveLength(1);
    // The owner's totals, with a row written before the rename ("usdc") counted as the stablecoin.
    const old = (await w.store.payments.find())[0];
    await w.store.payments.insert({ ...old, id: "4663:0xold", tx: "0xold", asset: "usdc" as never, amount: "5000000", credits: 500 });
    expect(await w.pay.summary()).toEqual({ payments: 2, credits: 1500, owed: 0, byAsset: { stable: "15000000", eth: "0" } });
  });

  it("in ETH lands at the price's own rate, and the price never moves after it was given", async () => {
    const w = await world();
    const { user, ws, w: wal } = await w.person();
    const q = await w.pay.quote(user.id, ws, { credits: 2500, asset: "eth", consent: consent() });
    w.chain.usd = BigInt(1200) * BigInt(1e8); // ETH halves after the price: the price still holds.
    const tx = w.mine({ from: wal.address, eth: BigInt(q.amount) });
    expect(await w.pay.claim(user.id, q.id, tx)).toMatchObject({ ok: true, credits: 2500 });
    const [top] = await w.credits.topUps(ws);
    expect(top).toMatchObject({ provider: "eth", credits: 2500, amountCents: 2500 });
  });

  it("counts each transaction once: not for a second price, not for another person, not when x402 took it", async () => {
    const w = await world();
    const { user, ws, w: wal } = await w.person();
    const q1 = await w.pay.quote(user.id, ws, { credits: 500, asset: "stable", consent: consent() });
    const q2 = await w.pay.quote(user.id, ws, { credits: 500, asset: "stable", consent: consent() });
    const tx = w.mine({ from: wal.address, stable: BigInt(5_000_000) });
    expect((await w.pay.claim(user.id, q1.id, tx)).ok).toBe(true);
    expect(await w.pay.claim(user.id, q2.id, tx)).toMatchObject({ ok: false, code: "tx_used" });
    // A second transaction for the used price is refused, and the second price still works.
    const tx2 = w.mine({ from: wal.address, stable: BigInt(5_000_000) });
    expect(await w.pay.claim(user.id, q1.id, tx2)).toMatchObject({ ok: false, code: "quote_used" });
    expect(await w.pay.claim(user.id, q2.id, tx2)).toMatchObject({ ok: true, credits: 500 });
    // Someone else's price is not one this server gave them.
    const bo = await w.person("bo@example.com");
    expect(await w.pay.claim(bo.user.id, q1.id, tx)).toMatchObject({ ok: false, code: "unknown_quote" });
    // A transaction x402 already counted (the same receiving address) never tops up.
    const q3 = await w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: consent() });
    const tx3 = w.mine({ from: wal.address, eth: BigInt(q3.amount) });
    w.x402Used.add(`${CHAIN_ID}:${tx3}`);
    expect(await w.pay.claim(user.id, q3.id, tx3)).toMatchObject({ ok: false, code: "tx_used" });
    expect(await w.pay.used(`${CHAIN_ID}:${tx}`)).toBe(true);
    expect((await w.credits.balance(ws)).paid).toBe(1000);
  });

  it("under the price adds the credits it pays for; over it adds more at the same rate; less than one credit is owed back", async () => {
    const w = await world();
    const { user, ws, w: wal } = await w.person();
    const q = await w.pay.quote(user.id, ws, { credits: 500, asset: "stable", consent: consent() });
    expect(await w.pay.claim(user.id, q.id, w.mine({ from: wal.address, stable: BigInt(4_995_000) }))).toMatchObject({ ok: true, credits: 499 });
    const q2 = await w.pay.quote(user.id, ws, { credits: 500, asset: "stable", consent: consent() });
    expect(await w.pay.claim(user.id, q2.id, w.mine({ from: wal.address, stable: BigInt(6_000_000) }))).toMatchObject({ ok: true, credits: 600 });
    expect((await w.credits.balance(ws)).paid).toBe(1099);
    const q3 = await w.pay.quote(user.id, ws, { credits: 500, asset: "stable", consent: consent() });
    const tiny = w.mine({ from: wal.address, stable: BigInt(9_000) });
    const r = await w.pay.claim(user.id, q3.id, tiny);
    expect(r).toMatchObject({ ok: false, code: "too_little", owed: { amount: "9000", symbol: "USDG", to: wal.address.toLowerCase() } });
    expect((await w.credits.balance(ws)).paid).toBe(1099);
    const [owed] = await w.safety.owed.find({ kind: "chain_payment" });
    expect(owed).toMatchObject({ status: "owed", reason: "too_little", credits: 0, amountCents: 0, contact: "ada@example.com", chain: { symbol: "USDG", amount: "9000", to: wal.address.toLowerCase(), tx: tiny } });
    // The same claim again: the same answer, one owed row.
    expect(await w.pay.claim(user.id, q3.id, tiny)).toMatchObject({ ok: false, code: "too_little" });
    expect(await w.safety.owed.find()).toHaveLength(1);
  });

  it("after the price ran out adds nothing and is owed back in full, even when checked days later", async () => {
    const w = await world();
    const { user, ws, w: wal } = await w.person();
    const q = await w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: consent() });
    const late = w.mine({ from: wal.address, eth: BigInt(q.amount), at: Date.parse(q.expiresAt) + 1000 });
    w.advance(3 * 86_400_000);
    const r = await w.pay.claim(user.id, q.id, late);
    expect(r).toMatchObject({ ok: false, code: "too_late", owed: { amount: q.amount, symbol: "ETH" } });
    expect((await w.credits.balance(ws)).paid).toBe(0);
    expect(await w.safety.owed.find({ reason: "late" })).toHaveLength(1);
    // Paid in time but checked late (a closed tab): still counted.
    const q2 = await w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: consent() });
    const inTime = w.mine({ from: wal.address, eth: BigInt(q2.amount) });
    w.advance(2 * 86_400_000);
    expect(await w.pay.claim(user.id, q2.id, inTime)).toMatchObject({ ok: true, credits: 500 });
    // A price more than a week old is not checked at all.
    const q3 = await w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: consent() });
    const old = w.mine({ from: wal.address, eth: BigInt(q3.amount) });
    w.advance(8 * 86_400_000);
    expect(await w.pay.claim(user.id, q3.id, old)).toMatchObject({ ok: false, code: "quote_expired" });
  });

  it("refuses everything else, and the price stays usable after each refusal", async () => {
    const w = await world();
    const { user, ws, w: wal } = await w.person();
    const q = await w.pay.quote(user.id, ws, { credits: 500, asset: "stable", consent: consent() });
    const no = async (tx: unknown, code: string, pending = false) => expect(await w.pay.claim(user.id, q.id, tx)).toMatchObject({ ok: false, code, ...(pending ? { pending: true } : {}) });
    await no("0x1234", "invalid_request");
    await no(hash(999), "not_found", true);
    await no(w.mine({ from: wal.address, stable: BigInt(5_000_000), confirmations: 2 }), "not_confirmed", true);
    await no(w.mine({ from: wal.address, stable: BigInt(5_000_000), chainId: 1 }), "wrong_chain");
    await no(w.mine({ from: wal.address, stable: BigInt(5_000_000), ok: false }), "failed");
    await no(w.mine({ from: wal.address, stable: BigInt(5_000_000), at: w.clock.t - 5 * 60_000 }), "too_early");
    await no(w.mine({ from: wallet().address, stable: BigInt(5_000_000) }), "no_transfer"); // not a linked wallet
    await no(w.mine({ from: wal.address, stable: BigInt(5_000_000), to: OTHER_TOKEN }), "no_transfer"); // not WOVI's address
    await no(w.mine({ from: wal.address, stable: BigInt(5_000_000), token: OTHER_TOKEN }), "no_transfer"); // not the stablecoin
    await no(w.mine({ from: wal.address, eth: BigInt(10) ** BigInt(18) }), "no_transfer"); // ETH for a stablecoin price
    await no(w.mine({ from: wal.address, stable: BigInt(5_000_000), logFrom: wallet().address }), "no_transfer"); // someone else's stablecoin
    w.chain.down = true;
    const r = await w.pay.claim(user.id, q.id, hash(998));
    expect(r).toMatchObject({ ok: false, code: "chain_down", pending: true });
    expect(JSON.stringify(r)).not.toContain("rpc.example");
    w.chain.down = false;
    expect(await w.pay.claim(user.id, q.id, w.mine({ from: wal.address, stable: BigInt(5_000_000) }))).toMatchObject({ ok: true, credits: 500 });
    // ETH must come straight from the linked wallet to WOVI's address.
    const qe = await w.pay.quote(user.id, ws, { credits: 500, asset: "eth", consent: consent() });
    expect(await w.pay.claim(user.id, qe.id, w.mine({ from: wal.address, eth: BigInt(qe.amount), to: OTHER_TOKEN }))).toMatchObject({ ok: false, code: "no_transfer" });
    expect(await w.pay.claim(user.id, qe.id, w.mine({ from: wallet().address, eth: BigInt(qe.amount) }))).toMatchObject({ ok: false, code: "no_transfer" });
  });

  it("can be withdrawn from within 14 days: the credits leave and the same asset is owed back to the wallet", async () => {
    const w = await world();
    const { user, ws, w: wal } = await w.person();
    const q = await w.pay.quote(user.id, ws, { credits: 1000, asset: "stable", consent: consent() });
    await w.pay.claim(user.id, q.id, w.mine({ from: wal.address, stable: BigInt(10_000_000) }));
    await w.credits.adjust(ws, { amount: -400, key: "spent", by: "test", note: "Runs" });
    const wd = new Withdrawals({ credits: w.credits, accounts: w.accounts, safety: w.safety, email: w.email, now: () => new Date(w.clock.t) });
    const [top] = await w.credits.topUps(ws);
    const row = await wd.withdraw({ kind: "user", userId: user.id }, ws, top.id);
    expect(row).toMatchObject({ kind: "withdrawal", credits: 600, amountCents: 600, chain: { symbol: "USDG", amount: "6000000", to: wal.address.toLowerCase() } });
    expect((await w.credits.balance(ws)).paid).toBe(0);
    expect(w.email.sent.at(-1)!.text).toContain(`6 USDG back to the wallet it came from, ${wal.address.toLowerCase()}`);
  });
});
