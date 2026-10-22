/**
 * $WOVI on the site (phase 17): the settings and their exact math, the /token
 * panel in its three states with its cache and the burn log reader, and every
 * keeper decision. All on a pretend chain; nothing calls a network.
 */
import { describe, expect, it } from "vitest";
import { ZERO, scanBurns, scrub, paidTo, type PotState } from "./chain";
import { WEI, isHolder, keeperStatus, parseTiers, payStatus, tierFor, toWei, tokenConfigFromEnv } from "./config";
import { LOST_AFTER_MS, NotSent, runKeeper, type KeeperChain, type KeeperOptions } from "./keeper";
import { TokenPanels } from "./panel";
import { memoryTokenStore } from "./store";
import { FakeChain, POT, SPLITTER, TOKEN, testConfig, tokens } from "./test-helpers";

describe("$WOVI settings", () => {
  it("is all off with nothing set: no page, no keeper, no holders, no credits, no paying", () => {
    const c = tokenConfigFromEnv({});
    expect(c.pageOn).toBe(false);
    expect(c.pot).toBeNull();
    expect(c.holder.on).toBe(false);
    expect(c.holder.tiers).toEqual([]);
    expect(keeperStatus(c).on).toBe(false);
    expect(payStatus(c).on).toBe(false);
    expect(c.publicRpc).toBe(true);
  });

  it("turns the page on with the burn pot, or on its own, and keeps it off when told", () => {
    expect(tokenConfigFromEnv({ WOVI_TOKEN_PAGE: "on" }).pageOn).toBe(true);
    expect(testConfig().pageOn).toBe(true);
    expect(testConfig({ WOVI_TOKEN_PAGE: "off" }).pageOn).toBe(false);
    // A malformed address is no address.
    expect(tokenConfigFromEnv({ WOVI_BURN_POT_ADDRESS: "0x123" }).pot).toBeNull();
    expect(tokenConfigFromEnv({ WOVI_BUY_URL: "http://not-https.example" }).buyUrl).toBeNull();
    expect(testConfig({ WOVI_BUY_URL: "https://wovi.example/buy" }).buyUrl).toBe("https://wovi.example/buy");
  });

  it("reads amounts on the digits, never through a float", () => {
    expect(toWei("0.0005")).toBe(BigInt("500000000000000"));
    expect(toWei("0.1")).toBe(BigInt("100000000000000000"));
    expect(toWei("1,000,000")).toBe(BigInt("1000000") * WEI);
    expect(toWei("0.000000000000000001")).toBe(BigInt(1));
    expect(toWei("0.0000000000000000001")).toBeNull();
    expect(toWei("-1")).toBeNull();
    expect(toWei("1e18")).toBeNull();
    expect(testConfig({ WOVI_KEEPER_MIN_GAS_ETH: "0.003" }).keeper.minGasWei).toBe(BigInt("3000000000000000"));
  });

  it("parses holder tiers lowest first, and drops the whole list on any bad pair so a typo never grants", () => {
    const tiers = parseTiers("10,000,000:400 , 1000000:100");
    expect(tiers.map((t) => [t.minWhole, t.credits])).toEqual([]);
    const ok = parseTiers("10000000:400,1000000:100");
    expect(ok.map((t) => [t.minWhole, t.credits])).toEqual([
      ["1000000", 100],
      ["10000000", 400],
    ]);
    expect(parseTiers("1000000:100,abc:5")).toEqual([]);
    expect(parseTiers("1000000:100,1000000:200")).toEqual([]);
    expect(parseTiers("1000000:-1")).toEqual([]);
    expect(parseTiers("")).toEqual([]);
    // Zero credits is a valid tier that grants nothing.
    expect(parseTiers("1000:0,5000:10").map((t) => t.minWhole)).toEqual(["5000"]);
  });

  it("decides holder status and tiers exactly in wei: one wei under is not enough", () => {
    const c = testConfig({ WOVI_HOLDER_MIN: "1000000", WOVI_HOLDER_CREDITS: "1000000:100,10000000:400" });
    const min = tokens(1_000_000);
    expect(isHolder(c, min)).toBe(true);
    expect(isHolder(c, min - BigInt(1))).toBe(false);
    expect(isHolder(c, null)).toBe(false);
    expect(tierFor(c.holder.tiers, min - BigInt(1))).toBeNull();
    expect(tierFor(c.holder.tiers, min)?.credits).toBe(100);
    expect(tierFor(c.holder.tiers, tokens(10_000_000) - BigInt(1))?.credits).toBe(100);
    expect(tierFor(c.holder.tiers, tokens(10_000_000))?.credits).toBe(400);
    // The top tier is the cap.
    expect(tierFor(c.holder.tiers, tokens(900_000_000))?.credits).toBe(400);
  });

  it("switches the keeper on only with its key and both contracts, and off with WOVI_KEEPER=off whatever else is set", () => {
    const key = `0x${"1".repeat(64)}`;
    expect(keeperStatus(testConfig({ WOVI_KEEPER_KEY: key })).on).toBe(true);
    expect(keeperStatus(testConfig({ WOVI_KEEPER_KEY: key, WOVI_KEEPER: "off" })).on).toBe(false);
    expect(keeperStatus(testConfig({ WOVI_KEEPER_KEY: "0x1234" })).on).toBe(false);
    expect(keeperStatus(tokenConfigFromEnv({ WOVI_KEEPER_KEY: key, WOVI_BURN_POT_ADDRESS: POT })).missing).toEqual(["The fee address (WOVI_SPLITTER_ADDRESS)."]);
  });

  it("scrubs node addresses and anything key-like out of messages", () => {
    const msg = scrub(`failed at https://rpc.example/v2/abcdef with 0x${"ab".repeat(32)}`);
    expect(msg).not.toContain("rpc.example");
    expect(msg).not.toContain("ab".repeat(32));
  });

  it("adds up transfers of one token between two addresses whatever their case", () => {
    const tx = { ok: true, chainId: 4663, block: 1, at: 0, confirmations: 5, from: "0xaa", transfers: [
      { token: TOKEN.toLowerCase(), from: "0x00000000000000000000000000000000000000aa", to: POT.toLowerCase(), value: BigInt(5) },
      { token: TOKEN.toLowerCase(), from: "0x00000000000000000000000000000000000000aa", to: POT.toLowerCase(), value: BigInt(7) },
      { token: "0x00000000000000000000000000000000000000ff", from: "0x00000000000000000000000000000000000000aa", to: POT.toLowerCase(), value: BigInt(100) },
      { token: TOKEN.toLowerCase(), from: "0x00000000000000000000000000000000000000bb", to: POT.toLowerCase(), value: BigInt(100) },
    ] };
    expect(paidTo(tx, TOKEN, "0x00000000000000000000000000000000000000AA", POT.toUpperCase().replace("0X", "0x"))).toBe(BigInt(12));
  });
});

describe("the /token panel", () => {
  const panels = (chain: FakeChain, env: Record<string, string> = {}, now = () => Date.UTC(2026, 9, 22)) => {
    const store = memoryTokenStore();
    return { store, p: new TokenPanels({ config: testConfig(env), reader: chain, store, now }) };
  };

  it("before the contracts exist: the page says soon and reads nothing", async () => {
    const chain = new FakeChain();
    const p = new TokenPanels({ config: tokenConfigFromEnv({ WOVI_TOKEN_PAGE: "on" }), reader: chain, store: memoryTokenStore() });
    const panel = await p.panel();
    expect(panel).toMatchObject({ stage: "soon", pot: null, token: null, supply: null, burned: null, count: 0, problem: null });
    expect(chain.calls).toEqual({});
  });

  it("deployed but not launched: the addresses and no numbers, never zeros", async () => {
    const chain = new FakeChain();
    const { p } = panels(chain);
    const panel = await p.panel();
    expect(panel).toMatchObject({ stage: "deployed", pot: POT, splitter: SPLITTER, token: null, supply: null, burned: null, ethSpent: null, next: null });
  });

  it("live: supply now and at launch, the totals, the latest burns from the logs, and the next burn from preview()", async () => {
    const chain = new FakeChain();
    chain.launch();
    chain.addBurn(1, 1500, tokens(2_000_000), BigInt("10000000000000000"));
    chain.addBurn(2, 250_000, tokens(1_500_000), BigInt("8000000000000000"));
    chain.pots = { ...chain.pots, waitingEth: BigInt("3000000000000000"), waitingTokens: tokens(10), nextAt: Date.UTC(2026, 9, 22, 0, 30), ready: false };
    const { p, store } = panels(chain);
    const panel = await p.panel();
    expect(panel.stage).toBe("live");
    expect(panel.token).toBe(TOKEN);
    expect(panel.count).toBe(2);
    expect(panel.burned).toBe(tokens(3_500_000).toString());
    expect(panel.ethSpent).toBe("18000000000000000");
    expect(panel.supply).toBe((tokens(1_000_000_000) - tokens(3_500_000)).toString());
    expect(panel.launchSupply).toBe(tokens(1_000_000_000).toString());
    expect(panel.latest.map((b) => b.n)).toEqual([2, 1]);
    expect(panel.latest[0]).toMatchObject({ block: 250_000, tokens: tokens(1_500_000).toString() });
    expect(panel.next).toEqual({ eth: "3000000000000000", tokens: tokens(10).toString(), at: Date.UTC(2026, 9, 22, 0, 30), ready: false });
    // Read from the deploy block, and remembered: the next read starts where this one stopped.
    expect((await store.scan.get("burns"))?.scannedTo).toBe(chain.block);
  });

  it("reads the chain at most once a minute for every visitor, and only reads logs when a burn is new", async () => {
    const chain = new FakeChain();
    chain.launch();
    chain.addBurn(1, 1500, tokens(1), BigInt(1));
    let t = Date.UTC(2026, 9, 22);
    const { p } = panels(chain, {}, () => t);
    await Promise.all([p.panel(), p.panel(), p.panel()]);
    expect(chain.calls.pot).toBe(1);
    await p.panel();
    expect(chain.calls.pot).toBe(1);
    const logReads = chain.calls.burnLogs;
    t += 61_000;
    await p.panel();
    expect(chain.calls.pot).toBe(2);
    // No new burn: the logs are not read again.
    expect(chain.calls.burnLogs).toBe(logReads);
    chain.block = 2_100_000;
    chain.addBurn(2, 2_050_000, tokens(1), BigInt(1));
    t += 61_000;
    expect((await p.panel()).latest.map((b) => b.n)).toEqual([2, 1]);
  });

  it("shows the last good reading marked stale when the chain stops answering, and says so with none", async () => {
    const chain = new FakeChain();
    chain.launch();
    let t = Date.UTC(2026, 9, 22);
    const { p } = panels(chain, {}, () => t);
    const good = await p.panel();
    chain.down = true;
    t += 120_000;
    const stale = await p.panel();
    expect(stale).toMatchObject({ stage: "live", supply: good.supply, stale: true });
    const fresh = new TokenPanels({ config: testConfig(), reader: chain, store: memoryTokenStore() });
    const none = await fresh.panel();
    expect(none).toMatchObject({ stage: "deployed", supply: null, stale: true });
    expect(none.problem).toContain("did not answer");
    expect(JSON.stringify(none)).not.toContain("rpc.example");
  });

  it("halves a span the node refuses as too big, and keeps spans at 100,000 blocks", async () => {
    const chain = new FakeChain();
    chain.maxSpan = 30_000;
    chain.addBurn(1, 1_050, tokens(1), BigInt(1));
    chain.addBurn(2, 160_000, tokens(1), BigInt(1));
    const r = await scanBurns(chain, POT, 1_000, 200_000);
    expect(r.logs.map((l) => l.n)).toEqual([1, 2]);
    expect(r.scannedTo).toBe(200_000);
    const wide = new FakeChain();
    const spans: number[] = [];
    wide.burnLogs = async (_p, from, to) => {
      spans.push(to - from + 1);
      return [];
    };
    await scanBurns(wide, POT, 1, 250_000);
    expect(spans).toEqual([100_000, 100_000, 50_000]);
  });
});

/* ---------- The keeper ---------- */

const KEEPER = "0x00000000000000000000000000000000000000Ce";
const GWEI = BigInt(1_000_000_000);

class FakeKeeper implements KeeperChain {
  readonly account = KEEPER;
  chain = 4663;
  price = GWEI / BigInt(50); // 0.02 gwei
  wallet = BigInt("5000000000000000"); // 0.005 ETH
  wouldSplit = BigInt("1000000000000000");
  potState: PotState = { token: TOKEN, burnCount: 0, totalTokens: ZERO, totalEth: ZERO, lastBurnAt: 0, startedAt: 1, waitingEth: BigInt("2000000000000000"), waitingTokens: ZERO, nextAt: 1, ready: true };
  sent: { kind: "sweep" | "burn"; gas: bigint; maxFee: bigint; pendingSaved: boolean }[] = [];
  receipts = new Map<string, { ok: boolean; gas: number; block: number } | null>();
  refuse: "sweep" | "burn" | null = null;
  mined = true;
  store = memoryTokenStore();
  async chainId() {
    return this.chain;
  }
  async gasPrice() {
    return this.price;
  }
  async balance() {
    return this.wallet;
  }
  async sweepWouldSplit() {
    return this.wouldSplit;
  }
  async estimateSweep() {
    return BigInt(200_000);
  }
  async pot() {
    return this.potState;
  }
  async estimateBurn() {
    return BigInt(400_000);
  }
  async send(kind: "sweep" | "burn", gas: bigint, maxFee: bigint, before: (tx: string) => Promise<void>) {
    const tx = `0x${String(this.sent.length + 1).padStart(64, kind === "sweep" ? "5" : "b")}`;
    await before(tx);
    const pendingSaved = (await this.store.keeper.get("keeper"))?.pending?.tx === tx;
    if (this.refuse === kind) throw new NotSent("insufficient funds at https://rpc.example/key");
    this.sent.push({ kind, gas, maxFee, pendingSaved });
    this.receipts.set(tx, this.mined ? { ok: true, gas: Number(gas) - 10_000, block: 100 } : null);
    return tx;
  }
  async receipt(tx: string) {
    return this.receipts.get(tx) ?? null;
  }
}

function keeperRun(k: FakeKeeper, extra: Partial<KeeperOptions> = {}) {
  return runKeeper({ chain: k, store: k.store, dailyGas: 8_000_000, maxGwei: 0.5, minGasWei: BigInt("500000000000000"), minSweepWei: BigInt("200000000000000"), waitMs: 50, now: () => Date.UTC(2026, 9, 22, 12), ...extra });
}

describe("the keeper", () => {
  it("sweeps when the fees are worth it and burns when preview() says ready, writing each transaction down before it is sent", async () => {
    const k = new FakeKeeper();
    const r = await keeperRun(k);
    expect(r).toMatchObject({ done: "ran", sweep: { split: "1000000000000000" }, burn: { tx: expect.any(String) } });
    expect(k.sent.map((s) => s.kind)).toEqual(["sweep", "burn"]);
    expect(k.sent.every((s) => s.pendingSaved)).toBe(true);
    // Gas is the estimate plus a quarter; the fee at most twice the base fee and never over the cap.
    expect(k.sent[0].gas).toBe(BigInt(250_000));
    expect(k.sent[1].gas).toBe(BigInt(500_000));
    expect(k.sent[0].maxFee).toBe(k.price * BigInt(2));
    const rec = (await k.store.keeper.get("keeper"))!;
    expect(rec).toMatchObject({ runs: 1, sweeps: 1, burns: 1, failures: 0, pending: null, account: KEEPER, gasBalanceWei: k.wallet.toString(), sweptWei: "1000000000000000" });
    expect(rec.lastSweep?.tx).toBe((r as { sweep: { tx: string } }).sweep.tx);
    expect(rec.gasByDay["2026-10-22"]).toBe(250_000 - 10_000 + 500_000 - 10_000);
  });

  it("sends nothing it does not need: fees under the minimum wait, and no burn before preview() says ready", async () => {
    const k = new FakeKeeper();
    k.wouldSplit = BigInt("100000000000000");
    k.potState = { ...k.potState, ready: false, nextAt: Date.UTC(2026, 9, 22, 12, 20) };
    const r = await keeperRun(k);
    expect(k.sent).toEqual([]);
    expect(r).toMatchObject({ done: "ran", sweep: null, burn: null });
    expect((r as { notes: string[] }).notes).toEqual(["Fees waiting are under the sweep minimum.", "A burn is due 22 Oct, 12:20 UTC."]);
  });

  it("does nothing before the launch", async () => {
    const k = new FakeKeeper();
    k.wouldSplit = ZERO;
    k.potState = { ...k.potState, token: null, ready: false };
    const r = await keeperRun(k);
    expect(k.sent).toEqual([]);
    expect((r as { notes: string[] }).notes).toEqual(["$WOVI is not launched yet."]);
  });

  it("refuses another chain, a gas price over the cap, and a wallet under its gas floor", async () => {
    const wrong = new FakeKeeper();
    wrong.chain = 1;
    expect(await keeperRun(wrong)).toEqual({ done: "refused", reason: "The node is not Robinhood Chain." });
    const pricey = new FakeKeeper();
    pricey.price = GWEI;
    expect(await keeperRun(pricey)).toMatchObject({ done: "refused", reason: expect.stringContaining("over the cap") });
    const poor = new FakeKeeper();
    poor.wallet = BigInt("499999999999999");
    expect(await keeperRun(poor)).toMatchObject({ done: "refused", reason: expect.stringContaining("gas floor") });
    expect((await poor.store.keeper.get("keeper"))).toMatchObject({ lastResult: "Refused: the keeper wallet is under its gas floor.", gasBalanceWei: "499999999999999" });
    for (const k of [wrong, pricey, poor]) expect(k.sent).toEqual([]);
  });

  it("keeps the day's gas under its cap", async () => {
    const k = new FakeKeeper();
    const r = await keeperRun(k, { dailyGas: 300_000 });
    expect(k.sent.map((s) => s.kind)).toEqual(["sweep"]);
    expect((r as { notes: string[] }).notes[0]).toContain("today's gas cap");
  });

  it("never sends while a transaction is out, writes it off as lost after half an hour, and never sends twice", async () => {
    const k = new FakeKeeper();
    k.mined = false;
    const first = await keeperRun(k);
    expect(first).toMatchObject({ done: "ran", sweep: { tx: expect.any(String) }, burn: null });
    expect(k.sent).toHaveLength(1);
    // The next run finds it still out and sends nothing.
    expect(await keeperRun(k, { now: () => Date.UTC(2026, 9, 22, 12, 15) })).toMatchObject({ done: "waiting" });
    expect(k.sent).toHaveLength(1);
    // After half an hour with no receipt it is written off, and the keeper goes on.
    k.mined = true;
    const later = await keeperRun(k, { now: () => Date.UTC(2026, 9, 22, 12) + LOST_AFTER_MS + 1 });
    expect(later).toMatchObject({ done: "ran" });
    const rec = (await k.store.keeper.get("keeper"))!;
    expect(rec.failures).toBe(1);
    expect(rec.lastError).toBe("The sweep transaction never arrived.");
  });

  it("forgets a send the node refused outright, scrubbed, and goes on to the burn", async () => {
    const k = new FakeKeeper();
    k.refuse = "sweep";
    const r = await keeperRun(k);
    expect(k.sent.map((s) => s.kind)).toEqual(["burn"]);
    expect(r).toMatchObject({ done: "ran", sweep: null, burn: { tx: expect.any(String) } });
    const rec = (await k.store.keeper.get("keeper"))!;
    expect(rec.pending).toBeNull();
    expect(rec.lastError).toContain("The node refused the sweep");
    expect(rec.lastError).not.toContain("rpc.example");
  });

  it("runs one at a time", async () => {
    const k = new FakeKeeper();
    const [a, b] = await Promise.all([keeperRun(k), keeperRun(k)]);
    expect([a.done, b.done].sort()).toEqual(["busy", "ran"]);
  });
});
