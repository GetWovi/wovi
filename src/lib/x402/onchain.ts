/**
 * The on-chain verifier and price feed (phase 15): reads Robinhood Chain
 * through the RPC URL in config, with viem. Read only: it never signs or
 * sends anything, and there is no key anywhere in it.
 *
 * For a payment it reads the transaction, its receipt, its block and the
 * chain head, and hands the transfer to the shared checks (checkTransfer):
 * the chain id from the RPC itself, success, the sender, the recipient, the
 * asset, the amount, confirmations and the block time against the quote.
 *
 * - ETH: a plain transfer, the transaction's `to` and `value`. ETH sent from
 *   inside a contract (some smart wallets) has no trace here and is not seen.
 * - A token: the asset's Transfer logs in the receipt from the payer to payTo.
 *
 * Tests hand in a stub reader; no test calls a real chain.
 */
import { createPublicClient, http } from "viem";
import { NATIVE_ASSET, sameAddress, type X402Config } from "./config";
import { lookupVerifier, type LookupResult, type PaymentVerifier, type VerifyRequest } from "./verifier";

/** The few RPC reads the verifier makes. viem's public client has them all. */
export type ChainReader = {
  getChainId(): Promise<number>;
  getTransaction(a: { hash: `0x${string}` }): Promise<{ from: string; to: string | null; value: bigint; blockNumber: bigint | null }>;
  getTransactionReceipt(a: { hash: `0x${string}` }): Promise<{ status: "success" | "reverted"; blockNumber: bigint; logs: readonly { address: string; topics: readonly string[]; data: string }[] }>;
  getBlock(a: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  getBlockNumber(): Promise<bigint>;
  readContract(a: { address: `0x${string}`; abi: readonly unknown[]; functionName: string }): Promise<unknown>;
};

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const topicAddress = (topic: string | undefined) => (topic && topic.length === 66 ? `0x${topic.slice(26)}` : "");

/** A reader on an RPC URL: 10 seconds a call, one retry. */
export function rpcReader(rpcUrl: string): ChainReader {
  return createPublicClient({ transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }) }) as unknown as ChainReader;
}

const notFound = (err: unknown) => /NotFound|could not be found/i.test(err instanceof Error ? `${err.name} ${err.message}` : String(err));

export async function lookupOnChain(reader: ChainReader, req: VerifyRequest): Promise<LookupResult> {
  const hash = req.txHash as `0x${string}`;
  try {
    const chainId = await reader.getChainId();
    if (chainId !== req.chainId) return { ok: false, code: "payment_wrong_chain", message: `The RPC is for chain ${chainId}, not ${req.chainId}. The owner must fix WOVI_X402_RPC_URL.` };
    let tx: Awaited<ReturnType<ChainReader["getTransaction"]>>;
    try {
      tx = await reader.getTransaction({ hash });
    } catch (err) {
      if (notFound(err)) return { ok: false, code: "payment_not_found", message: `No transaction ${req.txHash} on chain ${req.chainId} yet. Send the same X-PAYMENT again once it is mined.`, retry: true };
      throw err;
    }
    if (tx.blockNumber === null) return { ok: false, code: "payment_not_confirmed", message: "The transaction is not mined yet. Send the same X-PAYMENT again in a few seconds.", retry: true };
    const receipt = await reader.getTransactionReceipt({ hash });
    const [block, head] = await Promise.all([reader.getBlock({ blockNumber: receipt.blockNumber }), reader.getBlockNumber()]);
    const confirmations = Number(head >= receipt.blockNumber ? head - receipt.blockNumber + BigInt(1) : BigInt(0));
    const base = { chainId, txHash: req.txHash, from: tx.from, blockNumber: receipt.blockNumber, blockTime: Number(block.timestamp), confirmations, success: receipt.status === "success" };
    if (sameAddress(req.asset, NATIVE_ASSET)) {
      return { ok: true, transfer: { ...base, to: tx.to ?? "", asset: NATIVE_ASSET, amount: tx.value } };
    }
    // A token: add up its Transfer logs from the payer to payTo.
    let amount = BigInt(0);
    for (const log of receipt.logs) {
      if (!sameAddress(log.address, req.asset) || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || log.topics.length < 3) continue;
      if (!sameAddress(topicAddress(log.topics[1]), tx.from) || !sameAddress(topicAddress(log.topics[2]), req.payTo)) continue;
      amount += BigInt(log.data === "0x" ? 0 : log.data);
    }
    // No matching log: the asset never reached payTo, which the checks report as the wrong recipient.
    return { ok: true, transfer: { ...base, to: amount > BigInt(0) ? req.payTo : tx.to ?? "", asset: amount > BigInt(0) ? req.asset : (tx.to ?? ""), amount } };
  } catch (err) {
    return { ok: false, code: "payment_check_failed", message: `The payment could not be checked on chain right now (${err instanceof Error ? err.name : "error"}). Send the same X-PAYMENT again in a little while.`, retry: true };
  }
}

/** The on-chain verifier for this config. Null when no RPC URL is set. */
export function onchainVerifier(cfg: Pick<X402Config, "rpcUrl">, reader?: ChainReader): PaymentVerifier | null {
  const r = reader ?? (cfg.rpcUrl ? rpcReader(cfg.rpcUrl) : null);
  if (!r) return null;
  return lookupVerifier("onchain", false, (req) => lookupOnChain(r, req));
}

const FEED_ABI = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/**
 * A Chainlink USD feed's price, scaled to 8 decimals. Null when the feed is
 * older than `maxAgeSec` or not positive, so a stale price never quotes.
 */
export async function readFeed(reader: ChainReader, feed: string, maxAgeSec: number, nowSec: number): Promise<bigint | null> {
  const [round, decimals] = await Promise.all([
    reader.readContract({ address: feed as `0x${string}`, abi: FEED_ABI, functionName: "latestRoundData" }) as Promise<readonly [bigint, bigint, bigint, bigint, bigint]>,
    reader.readContract({ address: feed as `0x${string}`, abi: FEED_ABI, functionName: "decimals" }) as Promise<number>,
  ]);
  const answer = round[1];
  const updatedAt = Number(round[3]);
  if (answer <= BigInt(0) || nowSec - updatedAt > maxAgeSec) return null;
  const d = Number(decimals);
  return d === 8 ? answer : d > 8 ? answer / BigInt(10) ** BigInt(d - 8) : answer * BigInt(10) ** BigInt(8 - d);
}
