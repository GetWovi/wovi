/**
 * SERVER ONLY. The keeper (phase 17): a small hot wallet that calls $WOVI's
 * two contracts on a schedule, so fees move and burns happen without anyone
 * watching. Both calls are open to anyone on the chain; the keeper only makes
 * sure they happen. It sends exactly two kinds of transaction, splitter.sweep()
 * and burnPot.burn(0), with no value: it never holds or moves funds, it only
 * pays their gas.
 *
 * One run (runKeeper), one at a time per process:
 *   1. a transaction sent before and not seen mined is looked up first; after
 *      half an hour without a receipt it is written off as lost. While one is
 *      out, nothing new is sent.
 *   2. the node must be Robinhood Chain, the gas price under the cap, and the
 *      keeper wallet must hold at least the gas floor (WOVI_KEEPER_MIN_GAS_ETH);
 *      under it nothing is sent and the owner's card says so.
 *   3. sweep: what sweep() would split now is asked with a call (nothing
 *      sent); from WOVI_KEEPER_MIN_SWEEP_ETH up it is sent, so fees on the
 *      curve and in Pons' escrow reach the burn pot.
 *   4. burn: when the pot's preview() says a burn would go through now,
 *      burn(0) is sent. The pot caps each burn at 1% of the market's depth
 *      and keeps its own 30 minutes between burns.
 * Each transaction's gas is the node's estimate plus a quarter, refused when
 * it would take the UTC day past WOVI_KEEPER_DAILY_GAS or cost more than the
 * wallet holds; the fee is the block's base fee, at most twice it, no tip.
 * Every transaction is signed and written down with its hash before it is
 * broadcast, so a crash at any point never sends twice.
 *
 * Off unless WOVI_KEEPER_KEY, the burn pot and the fee address are all set,
 * and always off with WOVI_KEEPER=off.
 */
import { ROBINHOOD_CHAIN_ID } from "./config";
import { scrub, ZERO, type PotState } from "./chain";
import { emptyKeeper, put, type KeeperRow, type TokenStore } from "./store";
import { utcWords } from "./words";

export type Sent = { ok: boolean; gas: number; block: number };

/** A send the node refused outright: it was not broadcast, so nothing is out. */
export class NotSent extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotSent";
  }
}

/** What the keeper needs from the chain. keeper-chain.ts has the viem one; the tests give their own. */
export interface KeeperChain {
  /** The keeper wallet's address (public). */
  readonly account: string;
  chainId(): Promise<number>;
  /** What one unit of gas costs now (the block's base fee), in wei. */
  gasPrice(): Promise<bigint>;
  balance(): Promise<bigint>;
  /** What sweep() would split right now (a call, nothing sent). */
  sweepWouldSplit(): Promise<bigint>;
  estimateSweep(): Promise<bigint>;
  pot(): Promise<PotState>;
  estimateBurn(): Promise<bigint>;
  /**
   * Signs and sends sweep() or burn(0), with no value. `before` gets the hash
   * once it is signed and before it is broadcast, so it is written down first.
   */
  send(kind: "sweep" | "burn", gas: bigint, maxFeePerGas: bigint, before: (tx: string) => Promise<void>): Promise<string>;
  /** The receipt, or null while it is not mined. */
  receipt(tx: string): Promise<Sent | null>;
}

export type KeeperOptions = {
  chain: KeeperChain;
  store: TokenStore;
  now?: () => number;
  dailyGas: number;
  maxGwei: number;
  minGasWei: bigint;
  minSweepWei: bigint;
  /** How long to wait for each receipt (ms). */
  waitMs?: number;
  /** True while the server is stopping: nothing new is sent. */
  stopping?: () => boolean;
};

export type KeeperResult =
  | { done: "ran"; sweep: { tx: string; split: string } | null; burn: { tx: string } | null; notes: string[] }
  | { done: "waiting"; tx: string }
  | { done: "refused"; reason: string }
  | { done: "busy" };

export const LOST_AFTER_MS = 30 * 60_000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gweiWei = (gwei: number) => BigInt(Math.round(gwei * 1e9));

/** A sent transaction's receipt into the numbers; true once it is settled one way or the other. */
async function settle(k: KeeperRow, chain: KeeperChain, now: number): Promise<boolean> {
  const p = k.pending;
  if (!p) return true;
  const r = await chain.receipt(p.tx);
  if (r) {
    k.gasByDay[day(now)] = (k.gasByDay[day(now)] ?? 0) + r.gas;
    if (r.ok) {
      if (p.kind === "burn") {
        k.burns++;
        k.lastBurn = { tx: p.tx, at: now };
      } else {
        k.sweeps++;
        k.lastSweep = { tx: p.tx, at: now };
      }
    } else {
      k.failures++;
      k.lastError = `The ${p.kind} transaction failed on chain.`;
    }
    k.pending = null;
    return true;
  }
  if (now - p.sentAt < LOST_AFTER_MS) return false;
  k.failures++;
  k.lastError = `The ${p.kind} transaction never arrived.`;
  k.pending = null;
  return true;
}

let running = false;

/** One look at the chain, and at most one sweep and one burn. */
export async function runKeeper(o: KeeperOptions): Promise<KeeperResult> {
  if (running) return { done: "busy" };
  running = true;
  try {
    return await run(o);
  } finally {
    running = false;
  }
}

async function run(o: KeeperOptions): Promise<KeeperResult> {
  const clock = o.now ?? (() => Date.now());
  const now = clock();
  const k: KeeperRow = { ...emptyKeeper(), ...(await o.store.keeper.get("keeper")) };
  k.runs++;
  k.lastRunAt = now;
  k.account = o.chain.account;
  const saveRow = () => put(o.store.keeper, k);
  const save = async (result: string) => {
    k.lastResult = result;
    for (const d of Object.keys(k.gasByDay).sort().slice(0, -7)) delete k.gasByDay[d];
    await saveRow();
  };
  const maxWei = gweiWei(o.maxGwei);

  // 1. a transaction still out
  if (!(await settle(k, o.chain, now))) {
    await save("Waiting for the last transaction.");
    return { done: "waiting", tx: k.pending!.tx };
  }

  // 2. the chain, the price and the gas floor
  if ((await o.chain.chainId()) !== ROBINHOOD_CHAIN_ID) {
    await save("Refused: the node is not Robinhood Chain.");
    return { done: "refused", reason: "The node is not Robinhood Chain." };
  }
  const balance = await o.chain.balance();
  k.gasBalanceWei = balance.toString();
  if (balance < o.minGasWei) {
    await save("Refused: the keeper wallet is under its gas floor.");
    return { done: "refused", reason: "The keeper wallet holds less ETH than its gas floor. Send it a little ETH for gas." };
  }
  const price = await o.chain.gasPrice();
  if (price > maxWei) {
    await save("Refused: gas price over the cap.");
    return { done: "refused", reason: `The gas price is ${Number(price) / 1e9} gwei, over the cap of ${o.maxGwei} gwei.` };
  }
  const maxFee = price * BigInt(2) > maxWei ? maxWei : price * BigInt(2);

  const notes: string[] = [];
  const send = async (kind: "sweep" | "burn", estimate: bigint): Promise<string | null> => {
    const gas = (estimate * BigInt(125)) / BigInt(100);
    const used = k.gasByDay[day(now)] ?? 0;
    if (used + Number(gas) > o.dailyGas) {
      notes.push(`The ${kind} waits: today's gas cap (${o.dailyGas.toLocaleString("en-US")}) would be passed.`);
      return null;
    }
    const have = await o.chain.balance();
    k.gasBalanceWei = have.toString();
    if (have < gas * maxFee || have < o.minGasWei) {
      notes.push(`The ${kind} waits: the keeper wallet does not hold enough ETH for its gas.`);
      return null;
    }
    if (o.stopping?.()) {
      notes.push(`The ${kind} waits: the server is stopping.`);
      return null;
    }
    let tx: string;
    try {
      tx = await o.chain.send(kind, gas, maxFee, async (h) => {
        k.pending = { kind, tx: h, sentAt: now };
        await saveRow();
      });
    } catch (err) {
      if (!(err instanceof NotSent)) throw err;
      k.pending = null;
      k.failures++;
      k.lastError = `The node refused the ${kind}: ${scrub(err.message)}`;
      await saveRow();
      notes.push(`The node refused the ${kind}.`);
      return null;
    }
    if (!k.pending) k.pending = { kind, tx, sentAt: now };
    await saveRow();
    const until = Date.now() + (o.waitMs ?? 30_000);
    while (k.pending && Date.now() < until && !o.stopping?.()) {
      if (await settle(k, o.chain, clock())) break;
      await sleep(400);
    }
    return tx;
  };

  // 3. the sweep
  let sweep: { tx: string; split: string } | null = null;
  const would = await o.chain.sweepWouldSplit().catch(() => ZERO);
  if (would >= o.minSweepWei && would > ZERO) {
    const tx = await send("sweep", await o.chain.estimateSweep());
    if (tx) {
      sweep = { tx, split: would.toString() };
      k.sweptWei = (BigInt(k.sweptWei) + would).toString();
    }
  } else if (would > ZERO) notes.push("Fees waiting are under the sweep minimum.");
  if (k.pending) {
    await save("Waiting for the sweep.");
    return { done: "ran", sweep, burn: null, notes };
  }

  // 4. the burn
  let burn: { tx: string } | null = null;
  const pot = await o.chain.pot();
  if (!pot.token) notes.push("$WOVI is not launched yet.");
  else if (pot.ready) {
    const tx = await send("burn", await o.chain.estimateBurn());
    if (tx) burn = { tx };
  } else if (pot.waitingEth > ZERO || pot.waitingTokens > ZERO) notes.push(`A burn is due ${pot.nextAt ? utcWords(pot.nextAt) : "later"}.`);
  await save(sweep || burn ? `Sent ${[sweep && "a sweep", burn && "a burn"].filter(Boolean).join(" and ")}.` : notes[0] ?? "Nothing to send.");
  return { done: "ran", sweep, burn, notes };
}

/** The keeper's numbers for the owner's card. */
export async function keeperRecord(store: TokenStore): Promise<KeeperRow> {
  return { ...emptyKeeper(), ...(await store.keeper.get("keeper")) };
}
