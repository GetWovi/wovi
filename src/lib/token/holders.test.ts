/**
 * $WOVI holders and paying with $WOVI (phase 17): wallets linked by
 * signature, holder status from exact balances, the monthly snapshot at one
 * block and its grants, expiry, and every check on a $WOVI payment for
 * credits. On a pretend chain and memory stores; nothing calls a network.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { testAccounts } from "@/lib/accounts/test-helpers";
import { Credits } from "@/lib/credits/credits";
import { memoryCreditStore } from "@/lib/credits/store";
import { ZERO, type PaidTx } from "./chain";
import { WEI } from "./config";
import { Holders } from "./holders";
import { WoviPay, creditsAtQuote, tokensForCredits } from "./pay";
import { memoryTokenStore } from "./store";
import { FakeChain, POT, TOKEN, testConfig, tokens } from "./test-helpers";

const wallet = () => privateKeyToAccount(generatePrivateKey());

async function world(env: Record<string, string> = {}) {
  const t = testAccounts();
  const chain = new FakeChain();
  chain.launch();
  const store = memoryTokenStore();
  const credits = new Credits({ store: memoryCreditStore(), now: () => new Date(t.clock.t) });
  const config = testConfig({ WOVI_HOLDER_MIN: "1000000", ...env });
  const tokenAddress = async () => (chain.pots.token ? TOKEN : null);
  const holders = new Holders({ config, reader: chain, store, accounts: t.accounts, credits, tokenAddress, now: () => new Date(t.clock.t) });
  const pay = new WoviPay({ config, reader: chain, store, accounts: t.accounts.store, credits, tokenAddress, now: () => new Date(t.clock.t) });
  /** Links a fresh throwaway wallet to a user by signing the server's message. */
  const link = async (userId: string, w = wallet(), asTyped?: string) => {
    const { challengeId, message } = await t.accounts.wallets.linkMessage(userId, asTyped ?? w.address, 4663);
    await t.accounts.wallets.verifyLink(userId, challengeId, await w.signMessage({ message }));
    return w;
  };
  return { ...t, chain, store, credits, config, holders, pay, link };
}

describe("holder status", () => {
  it("is a holder from the threshold up across all linked wallets, exact in wei, read when a wallet is linked", async () => {
    const w = await world();
    const ada = (await w.signUp("ada@example.com")).user;
    const one = await w.link(ada.id);
    w.chain.bal.set(one.address.toLowerCase(), tokens(600_000));
    expect(await w.holders.refreshUser(ada.id)).toBe(true);
    expect(await w.holders.isHolder(ada.id)).toBe(false);
    // A second wallet: together exactly one wei short, then exactly the threshold.
    const two = await w.link(ada.id);
    w.chain.bal.set(two.address.toLowerCase(), tokens(400_000) - BigInt(1));
    await w.holders.refreshUser(ada.id);
    expect(await w.holders.isHolder(ada.id)).toBe(false);
    w.chain.bal.set(two.address.toLowerCase(), tokens(400_000));
    await w.holders.refreshUser(ada.id);
    expect(await w.holders.isHolder(ada.id)).toBe(true);
    const view = await w.holders.view(ada.id);
    expect(view).toMatchObject({ on: true, holder: true, totalWei: tokens(1_000_000).toString(), minWhole: "1000000", creditsOn: false, monthlyCredits: 0 });
    // Addresses are kept and compared in lower case.
    expect((await w.store.holders.get(ada.id))!.wallets.every((x) => x.address === x.address.toLowerCase())).toBe(true);
  });

  it("drops the badge when the last wallet is unlinked, and on the next check for everyone", async () => {
    const w = await world();
    const ada = (await w.signUp("ada@example.com")).user;
    const bo = (await w.signUp("bo@example.com")).user;
    const a = await w.link(ada.id);
    const b = await w.link(bo.id);
    w.chain.bal.set(a.address.toLowerCase(), tokens(2_000_000));
    w.chain.bal.set(b.address.toLowerCase(), tokens(5_000_000));
    expect(await w.holders.refreshAll()).toEqual({ people: 2, holders: 2 });
    // Bo sells; Ada unlinks, typing her address in upper case.
    w.chain.bal.set(b.address.toLowerCase(), ZERO);
    await w.accounts.wallets.unlink(ada.id, a.address.toUpperCase().replace("0X", "0x"));
    await w.holders.refreshUser(ada.id);
    expect(await w.holders.isHolder(ada.id)).toBe(false);
    expect(await w.holders.refreshAll()).toEqual({ people: 1, holders: 0 });
    expect(await w.holders.isHolder(bo.id)).toBe(false);
  });

  it("never makes anyone a holder before the launch or while the chain is silent", async () => {
    const w = await world();
    const ada = (await w.signUp("ada@example.com")).user;
    const a = await w.link(ada.id);
    w.chain.bal.set(a.address.toLowerCase(), tokens(9_000_000));
    w.chain.pots = { ...w.chain.pots, token: null };
    await w.holders.refreshUser(ada.id);
    expect(await w.holders.isHolder(ada.id)).toBe(false);
    w.chain.launch();
    w.chain.down = true;
    expect(await w.holders.refreshUser(ada.id)).toBe(false);
    expect(await w.holders.isHolder(ada.id)).toBe(false);
  });

  it("is off with no burn pot set", async () => {
    const t = testAccounts();
    const holders = new Holders({ config: testConfig({ WOVI_BURN_POT_ADDRESS: "" }), reader: new FakeChain(), store: memoryTokenStore(), accounts: t.accounts, credits: null, tokenAddress: async () => null });
    const ada = (await t.signUp("ada@example.com")).user;
    expect(await holders.refreshUser(ada.id)).toBe(false);
    expect((await holders.view(ada.id)).on).toBe(false);
    expect(await holders.allocate()).toMatchObject({ done: "off" });
  });
});

describe("holder credits each month", () => {
  const TIERS = { WOVI_HOLDER_CREDITS: "1000000:100,10000000:400" };

  it("grants each person their tier once a month into their personal workspace, from one snapshot at one block", async () => {
    const w = await world(TIERS);
    const ada = (await w.signUp("ada@example.com")).user;
    const bo = (await w.signUp("bo@example.com")).user;
    const cy = (await w.signUp("cy@example.com")).user;
    const a1 = await w.link(ada.id);
    const a2 = await w.link(ada.id);
    const b = await w.link(bo.id);
    const c = await w.link(cy.id);
    w.chain.block = 3_000_000;
    // At the snapshot block: Ada 6M + 5M across two wallets, Bo exactly 1M, Cy one wei short.
    w.chain.atBlock.set(3_000_000, new Map([
      [a1.address.toLowerCase(), tokens(6_000_000)],
      [a2.address.toLowerCase(), tokens(5_000_000)],
      [b.address.toLowerCase(), tokens(1_000_000)],
      [c.address.toLowerCase(), tokens(1_000_000) - BigInt(1)],
    ]));
    const r = await w.holders.allocate();
    expect(r).toEqual({ done: "granted", period: "2026-10", people: 2, credits: 500 });
    expect(await w.credits.balance(ada.personalWorkspaceId)).toMatchObject({ available: 400, paid: 0, holder: { available: 400, period: "2026-10" } });
    expect(await w.credits.balance(bo.personalWorkspaceId)).toMatchObject({ holder: { available: 100 } });
    expect(await w.credits.balance(cy.personalWorkspaceId)).toMatchObject({ available: 0 });
    const snap = (await w.store.snapshots.get("2026-10"))!;
    expect(snap.block).toBe(3_000_000);
    expect(snap.granted.sort()).toEqual([ada.id, bo.id].sort());
    // Run again in the same month: the same snapshot, no second read, no second grant.
    w.chain.block = 3_100_000;
    const reads = w.chain.calls.balances;
    expect(await w.holders.allocate()).toEqual(r);
    expect(w.chain.calls.balances).toBe(reads);
    expect((await w.credits.balance(ada.personalWorkspaceId)).available).toBe(400);
    expect((await w.holders.view(ada.id)).thisMonth).toMatchObject({ block: 3_000_000, credits: 400 });
  });

  it("counts a token once however it moves: everyone is read at the same block", async () => {
    const w = await world(TIERS);
    const ada = (await w.signUp("ada@example.com")).user;
    const bo = (await w.signUp("bo@example.com")).user;
    const a = await w.link(ada.id);
    const b = await w.link(bo.id);
    // 1M $WOVI sits in Ada's wallet at the snapshot block and in Bo's a block later.
    w.chain.block = 500;
    w.chain.atBlock.set(500, new Map([[a.address.toLowerCase(), tokens(1_000_000)]]));
    w.chain.atBlock.set(501, new Map([[b.address.toLowerCase(), tokens(1_000_000)]]));
    expect(await w.holders.allocate()).toMatchObject({ people: 1, credits: 100 });
    // Bo links after the month's snapshot and moves nothing into a second grant this month.
    w.chain.block = 501;
    expect(await w.holders.allocate()).toMatchObject({ people: 1, credits: 100 });
    expect((await w.credits.balance(bo.personalWorkspaceId)).available).toBe(0);
  });

  it("finishes a snapshot left halfway from its own numbers, never a second read", async () => {
    const w = await world(TIERS);
    const ada = (await w.signUp("ada@example.com")).user;
    const bo = (await w.signUp("bo@example.com")).user;
    const a = await w.link(ada.id);
    const b = await w.link(bo.id);
    w.chain.bal.set(a.address.toLowerCase(), tokens(20_000_000));
    w.chain.bal.set(b.address.toLowerCase(), tokens(2_000_000));
    // A crash after the snapshot was written and one grant made.
    const real = w.credits.grantHolder.bind(w.credits);
    let n = 0;
    w.credits.grantHolder = async (ws, input) => {
      if (++n === 2) throw new Error("crash");
      return real(ws, input);
    };
    await expect(w.holders.allocate()).rejects.toThrow("crash");
    w.credits.grantHolder = real;
    w.chain.bal.set(a.address.toLowerCase(), ZERO);
    w.chain.bal.set(b.address.toLowerCase(), ZERO);
    await w.holders.allocate();
    expect((await w.credits.balance(ada.personalWorkspaceId)).available).toBe(400);
    expect((await w.credits.balance(bo.personalWorkspaceId)).available).toBe(100);
  });

  it("writes off last month's holder credits and grants the new month's from a new snapshot", async () => {
    const w = await world(TIERS);
    const ada = (await w.signUp("ada@example.com")).user;
    const a = await w.link(ada.id);
    w.chain.bal.set(a.address.toLowerCase(), tokens(1_500_000));
    await w.holders.allocate();
    expect((await w.credits.balance(ada.personalWorkspaceId)).holder.available).toBe(100);
    w.clock.t = Date.UTC(2026, 10, 1, 0, 30);
    expect(await w.holders.expire()).toBe(100);
    expect((await w.credits.balance(ada.personalWorkspaceId)).available).toBe(0);
    w.chain.bal.set(a.address.toLowerCase(), tokens(12_000_000));
    expect(await w.holders.allocate()).toMatchObject({ period: "2026-11", credits: 400 });
    expect(await w.credits.balance(ada.personalWorkspaceId)).toMatchObject({ available: 400, holder: { period: "2026-11", expiresAt: "2026-12-01T00:00:00.000Z" } });
  });

  it("keeps no snapshot while nobody reaches a tier, so people who link later in the month are counted", async () => {
    const w = await world(TIERS);
    const ada = (await w.signUp("ada@example.com")).user;
    const a = await w.link(ada.id);
    w.chain.bal.set(a.address.toLowerCase(), tokens(999_999));
    expect(await w.holders.allocate()).toEqual({ done: "granted", period: "2026-10", people: 0, credits: 0 });
    expect(await w.store.snapshots.find()).toEqual([]);
    w.chain.bal.set(a.address.toLowerCase(), tokens(1_000_000));
    expect(await w.holders.allocate()).toMatchObject({ people: 1, credits: 100 });
    expect((await w.credits.balance(ada.personalWorkspaceId)).holder.available).toBe(100);
  });

  it("grants nothing while the tiers are unset or before the launch", async () => {
    const off = await world();
    expect(await off.holders.allocate()).toMatchObject({ done: "off" });
    const early = await world(TIERS);
    early.chain.pots = { ...early.chain.pots, token: null };
    expect(await early.holders.allocate()).toMatchObject({ done: "no_token" });
    expect(await early.store.snapshots.find()).toEqual([]);
  });
});

/* ---------- Paying with $WOVI ---------- */

const PAY = { WOVI_PAY_WITH_WOVI: "on" };

function transferTx(o: { from: string; to?: string; value: bigint; token?: string; at: number; ok?: boolean; confirmations?: number; chainId?: number }): PaidTx {
  return {
    ok: o.ok ?? true,
    chainId: o.chainId ?? 4663,
    block: 9_000,
    at: o.at,
    confirmations: o.confirmations ?? 5,
    from: o.from.toLowerCase(),
    transfers: [{ token: (o.token ?? TOKEN).toLowerCase(), from: o.from.toLowerCase(), to: (o.to ?? POT).toLowerCase(), value: o.value }],
  };
}
const hash = (n: number) => `0x${n.toString(16).padStart(64, "c")}`;

describe("paying for credits with $WOVI", () => {
  it("prices a pack exactly: at the fixed rate, or from the market rounded up to the wei", () => {
    // $WOVI at 1e-9 ETH and ETH at $2,500: one $WOVI is $0.0000025, so one credit ($0.01) is 4,000 $WOVI.
    expect(tokensForCredits(1, BigInt(1_000_000_000), BigInt(2500) * BigInt(100000000))).toBe(tokens(4_000));
    expect(tokensForCredits(500, BigInt(1_000_000_000), BigInt(2500) * BigInt(100000000))).toBe(tokens(2_000_000));
    // A price that does not divide evenly rounds up by one wei, never down.
    const odd = tokensForCredits(1, BigInt(3), BigInt(7));
    expect(odd * BigInt(3) * BigInt(7)).toBeGreaterThanOrEqual(BigInt(10_000) * BigInt(10) ** BigInt(38));
    expect((odd - BigInt(1)) * BigInt(3) * BigInt(7)).toBeLessThan(BigInt(10_000) * BigInt(10) ** BigInt(38));
    expect(creditsAtQuote(tokens(1_000_000), { credits: 500, tokensWei: tokens(2_000_000).toString() })).toBe(250);
    expect(creditsAtQuote(tokens(2_000_000) - BigInt(1), { credits: 500, tokensWei: tokens(2_000_000).toString() })).toBe(499);
  });

  it("is off unless switched on, and needs a linked wallet and a launched token", async () => {
    const off = await world();
    const ada = (await off.signUp("ada@example.com")).user;
    await expect(off.pay.quote(ada.id, ada.personalWorkspaceId, 500)).rejects.toMatchObject({ code: "off" });
    expect(await off.pay.claim(ada.id, "wq_x", hash(1))).toMatchObject({ ok: false, code: "off" });
    const on = await world(PAY);
    const bo = (await on.signUp("bo@example.com")).user;
    await expect(on.pay.quote(bo.id, bo.personalWorkspaceId, 500)).rejects.toMatchObject({ code: "no_wallet" });
    await on.link(bo.id);
    await expect(on.pay.quote(bo.id, bo.personalWorkspaceId, 499)).rejects.toMatchObject({ code: "invalid_request" });
    on.chain.price = null;
    await expect(on.pay.quote(bo.id, bo.personalWorkspaceId, 500)).rejects.toMatchObject({ code: "no_price" });
  });

  it("counts a transfer from a linked wallet to the burn pot once, as paid credits, at the quote's price", async () => {
    const w = await world(PAY);
    const ada = (await w.signUp("ada@example.com")).user;
    const a = await w.link(ada.id);
    const q = await w.pay.quote(ada.id, ada.personalWorkspaceId, 500);
    expect(q).toMatchObject({ credits: 500, tokensWei: tokens(2_000_000).toString(), token: TOKEN, pot: POT, source: "market" });
    // The wallet reports a checksummed address; the log has it in lower case.
    w.chain.txs.set(hash(1), transferTx({ from: a.address, value: tokens(2_000_000), at: w.clock.t + 30_000 }));
    const r = await w.pay.claim(ada.id, q.id, hash(1).toUpperCase().replace("0X", "0x"));
    expect(r).toEqual({ ok: true, credits: 500, tokensWei: tokens(2_000_000).toString(), paymentId: `4663:${hash(1)}` });
    expect(await w.credits.balance(ada.personalWorkspaceId)).toMatchObject({ available: 500, paid: 500, holder: { available: 0 } });
    // The same claim again (a lost answer): the same answer, no second credit.
    expect(await w.pay.claim(ada.id, q.id, hash(1))).toEqual(r);
    expect((await w.credits.balance(ada.personalWorkspaceId)).available).toBe(500);
    // The same transaction for another price, or the used price for another transaction: refused.
    const q2 = await w.pay.quote(ada.id, ada.personalWorkspaceId, 500);
    expect(await w.pay.claim(ada.id, q2.id, hash(1))).toMatchObject({ ok: false, code: "tx_used" });
    w.chain.txs.set(hash(2), transferTx({ from: a.address, value: tokens(2_000_000), at: w.clock.t + 30_000 }));
    expect(await w.pay.claim(ada.id, q.id, hash(2))).toMatchObject({ ok: false, code: "quote_used" });
    expect((await w.credits.balance(ada.personalWorkspaceId)).available).toBe(500);
    // The ledger has one top-up for it, keyed by the transaction.
    const ups = (await w.credits.entries(ada.personalWorkspaceId)).filter((e) => e.kind === "top_up");
    expect(ups.map((e) => [e.key, e.amount, e.label])).toEqual([[`wovi:4663:${hash(1)}`, 500, "Paid with $WOVI, 500 credits"]]);
  });

  it("uses the fixed rate when one is set", async () => {
    const w = await world({ ...PAY, WOVI_PAY_TOKENS_PER_CREDIT: "2,500" });
    const ada = (await w.signUp("ada@example.com")).user;
    await w.link(ada.id);
    const q = await w.pay.quote(ada.id, ada.personalWorkspaceId, 1000);
    expect(q).toMatchObject({ tokensWei: (BigInt(2_500_000) * WEI).toString(), source: "fixed" });
    expect(w.chain.calls.marketPrice).toBeUndefined();
  });

  it("refuses what is not a payment from you to the burn pot, in $WOVI, on Robinhood Chain, inside the price's window", async () => {
    const w = await world(PAY);
    const ada = (await w.signUp("ada@example.com")).user;
    const bo = (await w.signUp("bo@example.com")).user;
    const a = await w.link(ada.id);
    const b = await w.link(bo.id);
    const q = await w.pay.quote(ada.id, ada.personalWorkspaceId, 500);
    const at = w.clock.t + 10_000;
    const cases: [PaidTx | null, string, boolean?][] = [
      [null, "not_found", true],
      [transferTx({ from: a.address, value: tokens(2_000_000), at, confirmations: 1 }), "not_confirmed", true],
      [transferTx({ from: a.address, value: tokens(2_000_000), at, chainId: 1 }), "wrong_chain"],
      [transferTx({ from: a.address, value: tokens(2_000_000), at, ok: false }), "failed"],
      [transferTx({ from: b.address, value: tokens(2_000_000), at }), "no_transfer"],
      [transferTx({ from: a.address, to: "0x000000000000000000000000000000000000dEaD", value: tokens(2_000_000), at }), "no_transfer"],
      [transferTx({ from: a.address, token: "0x00000000000000000000000000000000000000ff", value: tokens(2_000_000), at }), "no_transfer"],
      [transferTx({ from: a.address, value: tokens(2_000_000), at: w.clock.t - 3 * 60_000 }), "too_early"],
      [transferTx({ from: a.address, value: tokens(2_000_000), at: w.clock.t + 11 * 60_000 }), "too_late"],
      [transferTx({ from: a.address, value: tokens(3_000), at }), "too_little"],
    ];
    let n = 100;
    for (const [tx, code, pending] of cases) {
      const h = hash(++n);
      if (tx) w.chain.txs.set(h, tx);
      const r = await w.pay.claim(ada.id, q.id, h);
      expect(r).toMatchObject({ ok: false, code });
      expect("pending" in r && r.pending).toBe(pending ?? false);
    }
    // Someone else's price, an unknown one, and junk.
    expect(await w.pay.claim(bo.id, q.id, hash(1))).toMatchObject({ ok: false, code: "unknown_quote" });
    expect(await w.pay.claim(ada.id, "wq_nope", hash(1))).toMatchObject({ ok: false, code: "unknown_quote" });
    expect(await w.pay.claim(ada.id, q.id, "0x1234")).toMatchObject({ ok: false, code: "invalid_request" });
    // A silent chain: try again later, nothing used up.
    w.chain.down = true;
    expect(await w.pay.claim(ada.id, q.id, hash(999))).toMatchObject({ ok: false, code: "chain_down", pending: true });
    w.chain.down = false;
    // After all that, the price still works for a real payment.
    w.chain.txs.set(hash(500), transferTx({ from: a.address, value: tokens(2_000_000), at }));
    expect(await w.pay.claim(ada.id, q.id, hash(500))).toMatchObject({ ok: true, credits: 500 });
    expect((await w.credits.balance(ada.personalWorkspaceId)).available).toBe(500);
  });

  it("credits a part payment at the quote's rate, rounded down, and refuses a price that ran out long ago", async () => {
    const w = await world(PAY);
    const ada = (await w.signUp("ada@example.com")).user;
    const a = await w.link(ada.id);
    const q = await w.pay.quote(ada.id, ada.personalWorkspaceId, 500);
    w.chain.txs.set(hash(7), transferTx({ from: a.address, value: tokens(1_000_000) + BigInt(3_999), at: w.clock.t + 5_000 }));
    expect(await w.pay.claim(ada.id, q.id, hash(7))).toMatchObject({ ok: true, credits: 250 });
    const old = await w.pay.quote(ada.id, ada.personalWorkspaceId, 500);
    w.clock.t += 26 * 60_000;
    expect(await w.pay.claim(ada.id, old.id, hash(8))).toMatchObject({ ok: false, code: "quote_expired" });
  });
});
