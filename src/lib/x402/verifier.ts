/**
 * Checking x402 payments (phase 15), behind one interface:
 *
 *   verify  reads the transfer a payment names and checks it against its
 *           quote: chain, success, payer, recipient, asset, amount,
 *           confirmations and freshness. Read only.
 *   refund  records a refund the owner owes. Never sends anything: WOVI
 *           holds no keys, so the owner pays it from their own wallet.
 *
 * Two verifiers share the same checks (checkTransfer): the fake one reads a
 * pretend chain in memory, for tests and local demos, and the on-chain one
 * (onchain.ts) reads Robinhood Chain through an RPC URL.
 */
import type { Collection } from "@/lib/accounts/store";
import { sameAddress } from "./config";
import type { FakeTransfer, OwedRefund, Payment, RefundReason, X402ErrorCode } from "./types";

/** A transfer as the chain shows it. */
export type ObservedTransfer = {
  chainId: number;
  txHash: string;
  /** The wallet that sent the transaction. */
  from: string;
  /** Who received the asset: the transaction's target for ETH, the Transfer log's for a token. */
  to: string;
  asset: string;
  /** Atomic units that reached `to` from `from`. */
  amount: bigint;
  blockNumber: bigint;
  /** Unix seconds of the block. */
  blockTime: number;
  confirmations: number;
  success: boolean;
};

export type LookupResult = { ok: true; transfer: ObservedTransfer } | { ok: false; code: "payment_not_found" | "payment_not_confirmed" | "payment_wrong_chain" | "payment_check_failed"; message: string; retry?: boolean };

export type VerifyRequest = {
  txHash: string;
  payer: string;
  asset: string;
  payTo: string;
  chainId: number;
  /** What the quote asked for, atomic. */
  required: bigint;
  issuedAt: Date;
  expiresAt: Date;
  minConfirmations: number;
  skewSeconds: number;
};

export type VerifyResult =
  | { ok: true; transfer: ObservedTransfer }
  | {
      ok: false;
      code: X402ErrorCode;
      message: string;
      /** Try the same payment again later (not enough confirmations yet). */
      retry?: boolean;
      /** A transfer that reached us but does not meet its quote: it is owed back. */
      owed?: { reason: Extract<RefundReason, "too_late" | "too_little">; transfer: ObservedTransfer };
    };

export type RefundRequest = { id: string; payment: Payment; amount: bigint; reason: RefundReason; note: string; now: Date };

export interface PaymentVerifier {
  readonly name: "fake" | "onchain";
  /** True when no money moves (the fake verifier). */
  readonly test: boolean;
  verify(req: VerifyRequest): Promise<VerifyResult>;
  /** Records a refund the owner owes. Nothing is sent. */
  refund(req: RefundRequest): Promise<OwedRefund>;
}

/**
 * The rules every payment meets, in the order a payer would want to hear
 * them. Pure, so both verifiers and the tests share one copy.
 */
export function checkTransfer(t: ObservedTransfer, req: VerifyRequest): VerifyResult {
  if (t.chainId !== req.chainId) return { ok: false, code: "payment_wrong_chain", message: `The transfer is on chain ${t.chainId}. Pay on chain ${req.chainId}.` };
  if (!t.success) return { ok: false, code: "payment_failed", message: "The transaction failed on chain." };
  if (!sameAddress(t.from, req.payer)) return { ok: false, code: "payment_wrong_payer", message: "The transaction was sent by another wallet than payload.payer." };
  if (!sameAddress(t.to, req.payTo)) return { ok: false, code: "payment_wrong_recipient", message: "The transfer did not go to the payTo address." };
  if (!sameAddress(t.asset, req.asset)) return { ok: false, code: "payment_wrong_asset", message: "The transfer is in another asset than the one named." };
  if (t.confirmations < req.minConfirmations) {
    return { ok: false, code: "payment_not_confirmed", message: `The transfer has ${t.confirmations} of ${req.minConfirmations} confirmations. Send the same X-PAYMENT again in a few seconds.`, retry: true };
  }
  const minedMs = t.blockTime * 1000;
  if (minedMs < req.issuedAt.getTime() - req.skewSeconds * 1000) return { ok: false, code: "payment_too_old", message: "The transfer was made before this quote. Pay the quote it names." };
  if (minedMs > req.expiresAt.getTime()) return { ok: false, code: "payment_too_late", message: "The transfer landed after the quote ended. It is recorded as owed back to you.", owed: { reason: "too_late", transfer: t } };
  if (t.amount < req.required) return { ok: false, code: "payment_amount_too_low", message: `The transfer is ${t.amount} and the quote is ${req.required} (atomic units). It is recorded as owed back to you.`, owed: { reason: "too_little", transfer: t } };
  return { ok: true, transfer: t };
}

/** The owed refund record both verifiers make. */
export function owedRefund(req: RefundRequest): OwedRefund {
  const p = req.payment;
  return {
    id: req.id,
    paymentId: p.id,
    to: p.payer,
    asset: p.asset,
    symbol: p.symbol,
    decimals: p.decimals,
    amount: req.amount.toString(),
    chainId: p.chainId,
    network: p.network,
    reason: req.reason,
    status: "owed",
    test: p.test,
    note: req.note,
    createdAt: req.now.toISOString(),
    paidAt: null,
    paidTx: null,
    paidBy: null,
  };
}

/** A verifier from a way to look a transaction up. */
export function lookupVerifier(name: "fake" | "onchain", test: boolean, lookup: (req: VerifyRequest) => Promise<LookupResult>): PaymentVerifier {
  return {
    name,
    test,
    async verify(req) {
      const found = await lookup(req);
      if (!found.ok) return { ok: false, code: found.code, message: found.message, ...(found.retry ? { retry: true } : {}) };
      return checkTransfer(found.transfer, req);
    },
    async refund(req) {
      return owedRefund(req);
    },
  };
}

/** A pretend chain for the fake verifier: transfers recorded by tests or the local demo, in a table of the x402 store. */
export type FakeChain = Collection<FakeTransfer>;

export const fakeTxId = (chainId: number, txHash: string) => `${chainId}:${txHash.toLowerCase()}`;

/** The fake verifier: reads the pretend chain. No network, no money. */
export function fakeVerifier(chain: FakeChain): PaymentVerifier {
  return lookupVerifier("fake", true, async (req) => {
    // The pretend chain keeps every chain's transfers, so a transfer on another chain is seen as one.
    const t = (await chain.get(fakeTxId(req.chainId, req.txHash))) ?? (await chain.find({ txHash: req.txHash.toLowerCase() }))[0] ?? null;
    if (!t) return { ok: false, code: "payment_not_found", message: "No such transaction on the chain yet. Send the same X-PAYMENT again once it is mined.", retry: true };
    return {
      ok: true,
      transfer: { chainId: t.chainId, txHash: t.txHash, from: t.from, to: t.to, asset: t.asset, amount: BigInt(t.amount), blockNumber: BigInt(t.blockNumber), blockTime: Math.floor(Date.parse(t.blockTime) / 1000), confirmations: t.confirmations, success: t.success },
    };
  });
}
