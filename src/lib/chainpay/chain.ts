/**
 * SERVER ONLY. Reading a USDC or ETH payment on Robinhood Chain, read only:
 * nothing here signs or sends, and there is no key anywhere in it. Tests hand
 * in their own ChainPayReader; no test calls a chain.
 */
import { createPublicClient, http, type Hex } from "viem";
import { ROBINHOOD_CHAIN, TRANSFER_TOPIC, type TokenTransfer } from "@/lib/token/chain";
import { readFeed, type ChainReader } from "@/lib/x402/onchain";

/** A transaction as a payment check needs it. */
export type ChainPayTx = {
  ok: boolean;
  chainId: number;
  block: number;
  /** Milliseconds: the block's time. */
  at: number;
  confirmations: number;
  /** The sender, lower case. */
  from: string;
  /** The target, lower case (null for a contract creation). */
  to: string | null;
  /** ETH sent with it, in wei. ETH sent from inside a contract (some smart wallets) is not seen. */
  value: bigint;
  /** Every ERC-20 Transfer in its receipt, addresses lower case. */
  transfers: TokenTransfer[];
};

export interface ChainPayReader {
  /** Null while the transaction is not mined or not known. */
  tx(hash: string): Promise<ChainPayTx | null>;
  /** ETH / USD with 8 decimals, or null when the feed is older than `maxAgeSec`. */
  ethUsd(feed: string, maxAgeSec: number): Promise<bigint | null>;
}

const notFound = (err: unknown) => /NotFound|could not be found/i.test(err instanceof Error ? `${err.name} ${err.message}` : String(err));

/** A reader on one RPC URL: 10 seconds a call, one retry. */
export function viemChainPayReader(rpcUrl: string): ChainPayReader {
  const c = createPublicClient({ chain: ROBINHOOD_CHAIN, transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }) });
  return {
    async tx(hash) {
      const h = hash as Hex;
      let rec;
      try {
        rec = await c.getTransactionReceipt({ hash: h });
      } catch (err) {
        if (notFound(err)) return null;
        throw err;
      }
      const [tx, chainId, block, head] = await Promise.all([c.getTransaction({ hash: h }), c.getChainId(), c.getBlock({ blockNumber: rec.blockNumber }), c.getBlockNumber()]);
      const transfers = rec.logs
        .filter((l) => l.topics[0]?.toLowerCase() === TRANSFER_TOPIC && l.topics.length === 3 && l.data.length === 66)
        .map((l) => ({ token: l.address.toLowerCase(), from: `0x${l.topics[1]!.slice(26)}`.toLowerCase(), to: `0x${l.topics[2]!.slice(26)}`.toLowerCase(), value: BigInt(l.data) }));
      return {
        ok: rec.status === "success",
        chainId,
        block: Number(rec.blockNumber),
        at: Number(block.timestamp) * 1000,
        confirmations: Number(head >= rec.blockNumber ? head - rec.blockNumber + BigInt(1) : BigInt(0)),
        from: rec.from.toLowerCase(),
        to: tx.to ? tx.to.toLowerCase() : null,
        value: tx.value,
        transfers,
      };
    },
    ethUsd: (feed, maxAgeSec) => readFeed(c as unknown as ChainReader, feed, maxAgeSec, Math.floor(Date.now() / 1000)),
  };
}
