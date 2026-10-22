/**
 * A pretend Robinhood Chain for the $WOVI tests (phase 17): the pot's
 * numbers, burn logs, balances per block, transactions and prices, all set by
 * the test. Nothing here talks to a network.
 */
import { WEI, tokenConfigFromEnv, type TokenConfig } from "./config";
import { ZERO, type BurnLog, type MarketPrice, type PaidTx, type PotState, type TokenReader } from "./chain";

export const POT = "0x6717d4AB10466e3b303753679a7174f03CF5dFdc";
export const SPLITTER = "0x6Ad0485926D5a828056b8Fa6B7EEa7978D6325b2";
export const TOKEN = "0xD920D04989Ef89D0B21284E1d718236419A92E33";

export const tokens = (whole: number | string) => BigInt(whole) * WEI;

export function testConfig(env: Record<string, string> = {}): TokenConfig {
  return tokenConfigFromEnv({ WOVI_BURN_POT_ADDRESS: POT, WOVI_SPLITTER_ADDRESS: SPLITTER, WOVI_BURN_POT_BLOCK: "1000", ...env });
}

export class FakeChain implements TokenReader {
  calls: Record<string, number> = {};
  chain = 4663;
  block = 2_000_000;
  pots: PotState = { token: null, burnCount: 0, totalTokens: ZERO, totalEth: ZERO, lastBurnAt: 0, startedAt: 0, waitingEth: ZERO, waitingTokens: ZERO, nextAt: 0, ready: false };
  totalSupply = tokens(1_000_000_000);
  logs: BurnLog[] = [];
  /** A span wider than this is refused the way the node refuses it. */
  maxSpan = Infinity;
  /** Balances by lower-case wallet; `atBlock` overrides for a given block. */
  bal = new Map<string, bigint>();
  atBlock = new Map<number, Map<string, bigint>>();
  txs = new Map<string, PaidTx>();
  price: MarketPrice | null = { weiPerToken: BigInt(1_000_000_000), venue: "curve" };
  usd: bigint | null = BigInt(2500) * BigInt(100000000);
  down = false;

  private hit(name: string) {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
    if (this.down) throw new Error("fetch failed at https://rpc.example/secret-key-path");
  }

  launch(at = Date.UTC(2026, 9, 1)) {
    this.pots = { ...this.pots, token: TOKEN, startedAt: at };
  }

  addBurn(n: number, block: number, tokensBurned: bigint, eth: bigint) {
    this.logs.push({ n, tx: `0x${n.toString(16).padStart(64, "a")}`, block, tokens: tokensBurned, eth });
    this.pots = { ...this.pots, burnCount: n, totalTokens: this.pots.totalTokens + tokensBurned, totalEth: this.pots.totalEth + eth };
    this.totalSupply -= tokensBurned;
  }

  async chainId() {
    this.hit("chainId");
    return this.chain;
  }
  async head() {
    this.hit("head");
    return this.block;
  }
  async blockTime(n: number) {
    this.hit("blockTime");
    return Date.UTC(2026, 9, 1) + n * 100;
  }
  async pot() {
    this.hit("pot");
    return this.pots;
  }
  async supply() {
    this.hit("supply");
    return this.totalSupply;
  }
  async burnLogs(_pot: string, from: number, to: number) {
    this.hit("burnLogs");
    if (to - from + 1 > this.maxSpan) throw new Error("logs matched by query exceeds limit of 10000");
    return this.logs.filter((l) => l.block >= from && l.block <= to);
  }
  async balances(_token: string, wallets: string[], block?: number) {
    this.hit("balances");
    const map = block !== undefined && this.atBlock.has(block) ? this.atBlock.get(block)! : this.bal;
    return wallets.map((w) => map.get(w.toLowerCase()) ?? ZERO);
  }
  async paidTx(tx: string) {
    this.hit("paidTx");
    return this.txs.get(tx.toLowerCase()) ?? null;
  }
  async marketPrice() {
    this.hit("marketPrice");
    return this.price;
  }
  async ethUsd() {
    this.hit("ethUsd");
    return this.usd;
  }
}
