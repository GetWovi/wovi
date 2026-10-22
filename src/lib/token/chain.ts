/**
 * SERVER ONLY. Reading $WOVI's two contracts and the token on Robinhood Chain
 * (phase 17), through the configured RPC with viem. Read only: nothing here
 * signs or sends. The keeper's sending side is keeper-chain.ts.
 *
 * Within the node's limits (docs/token.md): logs in spans of 100,000 blocks,
 * halved when the node refuses a span as too big; balances many at a time
 * through Multicall3, pinned to one block so a snapshot counts every token
 * once; no read of an old block's state, which the node prunes.
 *
 * Tests hand in their own TokenReader; no test calls a chain.
 */
import { createPublicClient, encodeAbiParameters, encodePacked, http, keccak256, parseAbiItem, type Address, type Hex } from "viem";
import { readFeed, type ChainReader } from "@/lib/x402/onchain";
import { PONS_FACTORY, ROBINHOOD_CHAIN_ID, WEI, sameAddress } from "./config";

export const ZERO = BigInt(0);
const ZERO_ADDRESS = /^0x0{40}$/i;

export const POT_ABI = [
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "splitter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "burnCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalTokensBurned", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalEthBurned", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lastBurnAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "startedAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "openingBuyTokens", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "preview", stateMutability: "view", inputs: [], outputs: [{ name: "amount", type: "uint256" }, { name: "nextAt", type: "uint256" }, { name: "ready", type: "bool" }, { name: "tokens", type: "uint256" }] },
  { type: "function", name: "market", stateMutability: "view", inputs: [], outputs: [{ name: "open", type: "bool" }, { name: "viaCurve", type: "bool" }, { name: "depthCap", type: "uint256" }] },
  { type: "function", name: "burn", stateMutability: "nonpayable", inputs: [{ name: "minTokensOut", type: "uint256" }], outputs: [{ name: "ethIn", type: "uint256" }, { name: "tokensBurned", type: "uint256" }] },
] as const;

export const SPLITTER_ABI = [
  { type: "function", name: "sweep", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "amount", type: "uint256" }] },
  { type: "function", name: "unsplit", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "who", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const FACTORY_ABI = [
  {
    type: "function",
    name: "getLaunchedToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "curve", type: "address" },
          { name: "deployer", type: "address" },
          { name: "creatorFeeRecipient", type: "address" },
          { name: "pairToken", type: "address" },
          { name: "graduationThreshold", type: "uint256" },
          { name: "poolFee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "creatorTaxBps", type: "uint16" },
          { name: "buybackEnabled", type: "bool" },
          { name: "phase", type: "uint8" },
          { name: "sweptQuote", type: "uint256" },
          { name: "sweptTokens", type: "uint256" },
          { name: "sweptAt", type: "uint256" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
  { type: "function", name: "poolManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "memeHook", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const CURVE_ABI = [{ type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ name: "quoteReserve", type: "uint256" }, { name: "tokenReserve", type: "uint256" }] }] as const;
const EXTSLOAD_ABI = [{ type: "function", name: "extsload", stateMutability: "view", inputs: [{ name: "slot", type: "bytes32" }], outputs: [{ type: "bytes32" }] }] as const;

export const BURNED_EVENT = parseAbiItem("event Burned(uint256 indexed n, address indexed caller, uint256 ethIn, uint256 tokensBurned, bool viaCurve)");
/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const ROBINHOOD_CHAIN = {
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  contracts: { multicall3: { address: MULTICALL3 as Address } },
} as const;

/** Node addresses, keys and anything that looks like one, out of a message before it is logged or shown. */
export function scrub(msg: string): string {
  return msg
    .replace(/https?:\/\/\S+/g, "[node]")
    .replace(/0x[0-9a-fA-F]{64}/g, (m) => `${m.slice(0, 10)}...`)
    .slice(0, 300);
}

export type PotState = {
  /** Null before the launch. */
  token: string | null;
  burnCount: number;
  totalTokens: bigint;
  totalEth: bigint;
  /** Milliseconds; 0 when it has not happened. */
  lastBurnAt: number;
  startedAt: number;
  /** From preview(): the ETH the next burn would spend, the $WOVI held for it, when, and whether burn() goes through now. */
  waitingEth: bigint;
  waitingTokens: bigint;
  nextAt: number;
  ready: boolean;
};

export type BurnLog = { n: number; tx: string; block: number; tokens: bigint; eth: bigint };

export type TokenTransfer = { token: string; from: string; to: string; value: bigint };
export type PaidTx = { ok: boolean; chainId: number; block: number; at: number; confirmations: number; from: string; transfers: TokenTransfer[] };

/** $WOVI's price on the market right now: wei of ETH per whole $WOVI (18 decimals), from the curve or the pool. */
export type MarketPrice = { weiPerToken: bigint; venue: "curve" | "pool" };

/** Everything the site reads from the chain. The viem one below; tests give their own. */
export interface TokenReader {
  chainId(): Promise<number>;
  head(): Promise<number>;
  blockTime(block: number): Promise<number>;
  pot(pot: string): Promise<PotState>;
  supply(token: string): Promise<bigint>;
  /** Burned events in [from, to]. Throws the node's own error when the span holds too many. */
  burnLogs(pot: string, from: number, to: number): Promise<BurnLog[]>;
  /** Balances at one block (the head when left out); null for a wallet the node did not answer for. */
  balances(token: string, wallets: string[], block?: number): Promise<(bigint | null)[]>;
  /** A transaction's success, sender, block and the token transfers in it. Null while it is not mined or unknown. */
  paidTx(tx: string): Promise<PaidTx | null>;
  /** Null when there is nowhere to price it (before the pool exists, after a rescue). */
  marketPrice(token: string): Promise<MarketPrice | null>;
  /** ETH / USD with 8 decimals, or null when the feed is stale. */
  ethUsd(feed: string): Promise<bigint | null>;
}

const SPAN = 100_000;

/** A reader on one RPC URL: 10 seconds a call, one retry. */
export function viemReader(rpcUrl: string): TokenReader {
  const c = createPublicClient({ chain: ROBINHOOD_CHAIN, transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }) });
  const read = <T>(address: string, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) =>
    c.readContract({ address: address as Address, abi: abi as never, functionName: functionName as never, args: args as never }) as Promise<T>;
  return {
    chainId: () => c.getChainId(),
    head: async () => Number(await c.getBlockNumber()),
    blockTime: async (n) => Number((await c.getBlock({ blockNumber: BigInt(n) })).timestamp) * 1000,
    async pot(pot) {
      const [token, n, tokens, eth, last, started, preview] = await Promise.all([
        read<string>(pot, POT_ABI, "token"),
        read<bigint>(pot, POT_ABI, "burnCount"),
        read<bigint>(pot, POT_ABI, "totalTokensBurned"),
        read<bigint>(pot, POT_ABI, "totalEthBurned"),
        read<bigint>(pot, POT_ABI, "lastBurnAt"),
        read<bigint>(pot, POT_ABI, "startedAt"),
        read<readonly [bigint, bigint, boolean, bigint]>(pot, POT_ABI, "preview"),
      ]);
      return {
        token: ZERO_ADDRESS.test(token) ? null : token,
        burnCount: Number(n),
        totalTokens: tokens,
        totalEth: eth,
        lastBurnAt: Number(last) * 1000,
        startedAt: Number(started) * 1000,
        waitingEth: preview[0],
        nextAt: Number(preview[1]) * 1000,
        ready: preview[2],
        waitingTokens: preview[3],
      };
    },
    supply: (token) => read<bigint>(token, ERC20_ABI, "totalSupply"),
    async burnLogs(pot, from, to) {
      const logs = await c.getLogs({ address: pot as Address, event: BURNED_EVENT, fromBlock: BigInt(from), toBlock: BigInt(to) });
      return logs.map((l) => ({ n: Number(l.args.n), tx: l.transactionHash as string, block: Number(l.blockNumber), tokens: l.args.tokensBurned!, eth: l.args.ethIn! }));
    },
    async balances(token, wallets, block) {
      const out: (bigint | null)[] = [];
      const at = block === undefined ? undefined : BigInt(block);
      for (let i = 0; i < wallets.length; i += 100) {
        const part = wallets.slice(i, i + 100);
        const res = await c.multicall({
          contracts: part.map((w) => ({ address: token as Address, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [w as Address] as const })),
          allowFailure: true,
          ...(at === undefined ? {} : { blockNumber: at }),
        });
        for (const r of res) out.push(r.status === "success" ? (r.result as bigint) : null);
      }
      return out;
    },
    async paidTx(tx) {
      const hash = tx as Hex;
      const rec = await c.getTransactionReceipt({ hash }).catch(() => null);
      if (!rec) return null;
      const [chainId, block, head] = await Promise.all([c.getChainId(), c.getBlock({ blockNumber: rec.blockNumber }), c.getBlockNumber()]);
      const transfers = rec.logs
        .filter((l) => l.topics[0]?.toLowerCase() === TRANSFER_TOPIC && l.topics.length === 3 && l.data.length === 66)
        .map((l) => ({ token: l.address.toLowerCase(), from: `0x${l.topics[1]!.slice(26)}`.toLowerCase(), to: `0x${l.topics[2]!.slice(26)}`.toLowerCase(), value: BigInt(l.data) }));
      return {
        ok: rec.status === "success",
        chainId,
        block: Number(rec.blockNumber),
        at: Number(block.timestamp) * 1000,
        confirmations: Number(head - rec.blockNumber) + 1,
        from: rec.from.toLowerCase(),
        transfers,
      };
    },
    async marketPrice(token) {
      const info = await read<{ curve: string; phase: number; poolFee: number; tickSpacing: number; exists: boolean; pairToken: string }>(PONS_FACTORY, FACTORY_ABI, "getLaunchedToken", [token]);
      if (!info.exists || !ZERO_ADDRESS.test(info.pairToken)) return null;
      if (info.phase === 0) {
        // The curve: constant product over its reserves, the quote side with its virtual part.
        const [quote, tokens] = await read<readonly [bigint, bigint]>(info.curve, CURVE_ABI, "getReserves");
        return tokens > ZERO ? { weiPerToken: (quote * WEI) / tokens, venue: "curve" } : null;
      }
      if (info.phase !== 2) return null;
      // The Uniswap v4 pool: ETH is currency0, $WOVI currency1; the price from slot0's sqrtPriceX96.
      const [manager, hook] = await Promise.all([read<string>(PONS_FACTORY, FACTORY_ABI, "poolManager"), read<string>(PONS_FACTORY, FACTORY_ABI, "memeHook")]);
      const poolId = keccak256(
        encodeAbiParameters(
          [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
          ["0x0000000000000000000000000000000000000000", token as Address, info.poolFee, info.tickSpacing, hook as Address],
        ),
      );
      const slot = keccak256(encodePacked(["bytes32", "uint256"], [poolId, BigInt(6)]));
      const word = await read<Hex>(manager, EXTSLOAD_ABI, "extsload", [slot]);
      const sqrtP = BigInt(word) & ((BigInt(1) << BigInt(160)) - BigInt(1));
      if (sqrtP === ZERO) return null;
      // tokens per ETH = (sqrtP / 2^96)^2, so wei per whole token = 2^192 x 1e18 / sqrtP^2.
      return { weiPerToken: ((BigInt(1) << BigInt(192)) * WEI) / (sqrtP * sqrtP), venue: "pool" };
    },
    ethUsd: (feed) => readFeed(c as unknown as ChainReader, feed, 26 * 3600, Math.floor(Date.now() / 1000)),
  };
}

/** Whether a node's refusal means "too many logs in that span": then the span is halved. */
export const tooManyLogs = (err: unknown) => /exceeds limit|too many|query returned more than|log query timed out|block range/i.test(err instanceof Error ? err.message : String(err));

/**
 * Burned events from `from` up to `to`, in spans of at most 100,000 blocks,
 * each halved when the node refuses it as too big. Calls `progress` after
 * each finished span so a caller can save how far it got.
 */
export async function scanBurns(reader: TokenReader, pot: string, from: number, to: number, opts: { maxSpans?: number; progress?: (scannedTo: number, found: BurnLog[]) => void } = {}): Promise<{ scannedTo: number; logs: BurnLog[] }> {
  const logs: BurnLog[] = [];
  let at = from;
  let spans = 0;
  let span = SPAN;
  let scannedTo = from - 1;
  while (at <= to && spans < (opts.maxSpans ?? 20)) {
    const end = Math.min(to, at + span - 1);
    let part: BurnLog[];
    try {
      part = await reader.burnLogs(pot, at, end);
    } catch (err) {
      if (tooManyLogs(err) && span > 1) {
        span = Math.max(1, Math.floor(span / 2));
        continue;
      }
      throw err;
    }
    logs.push(...part);
    scannedTo = end;
    opts.progress?.(scannedTo, part);
    at = end + 1;
    spans++;
    span = SPAN;
  }
  return { scannedTo, logs };
}

/** Sums the transfers of one token from one wallet to one address in a transaction: exact, addresses in any case. */
export function paidTo(tx: PaidTx, token: string, from: string, to: string): bigint {
  return tx.transfers.filter((t) => sameAddress(t.token, token) && sameAddress(t.from, from) && sameAddress(t.to, to)).reduce((s, t) => s + t.value, ZERO);
}
