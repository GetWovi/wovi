/**
 * x402 records and wire shapes (phase 15). Client-safe: types only.
 *
 * The wire shapes follow x402 version 1 (HTTP 402 with a PaymentRequirements
 * list, the X-PAYMENT request header and the X-PAYMENT-RESPONSE answer
 * header, both base64 JSON), with WOVI's own "tx-hash" scheme.
 */

/** One way to pay, in a 402 answer's `accepts`. */
export type PaymentRequirements = {
  scheme: string;
  network: string;
  /** Atomic units (wei for ETH), as a decimal string. */
  maxAmountRequired: string;
  /** The full URL of the call this pays for. */
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  /** The token contract, or 0xEeee...EEeE for ETH. */
  asset: string;
  outputSchema: null;
  extra: {
    /** Single use. Sign it with the transaction hash (see `sign`). */
    nonce: string;
    /** The transfer must be mined before this. */
    expiresAt: string;
    chainId: number;
    symbol: string;
    decimals: number;
    /** The estimate in credits: the most the run can be charged. */
    credits: number;
    /** The same in USD, at one credit = $0.01. */
    priceUsd: string;
    /** The message to sign with the paying wallet (EIP-191), with {txHash} filled in. */
    sign: string;
  };
};

/** The body of every 402. */
export type PaymentRequiredBody = {
  x402Version: 1;
  /** What went wrong, in words. */
  error: string;
  /** A short code for software: payment_required, payment_invalid, payment_expired, payment_used, ... */
  code: X402ErrorCode;
  accepts: PaymentRequirements[];
};

export const X402_ERROR_CODES = [
  "payment_required",
  "payment_invalid",
  "payment_unknown_quote",
  "payment_expired",
  "payment_used",
  "payment_wrong_resource",
  "payment_bad_signature",
  "payment_not_found",
  "payment_not_confirmed",
  "payment_wrong_chain",
  "payment_wrong_recipient",
  "payment_wrong_asset",
  "payment_wrong_payer",
  "payment_amount_too_low",
  "payment_too_old",
  "payment_too_late",
  "payment_failed",
  "payment_check_failed",
] as const;
export type X402ErrorCode = (typeof X402_ERROR_CODES)[number];

/** What the X-PAYMENT header holds, before base64. */
export type PaymentPayload = {
  x402Version: 1;
  scheme: string;
  network: string;
  payload: {
    nonce: string;
    txHash: string;
    /** The wallet that sent the transfer and signed. */
    payer: string;
    asset: string;
    /** EIP-191 signature of the quote's message by the payer. */
    signature: string;
  };
};

/** What the X-PAYMENT-RESPONSE header holds, before base64. */
export type SettleResponse = {
  success: boolean;
  transaction: string;
  network: string;
  payer: string;
  errorReason?: string;
};

/** A price quote: what a 402 asked for. Single use. */
export type Quote = {
  /** The nonce. */
  id: string;
  kind: "run" | "pipeline";
  /** The agent or pipeline id. */
  target: string;
  targetName: string;
  /** METHOD /api/v1/... */
  resource: string;
  /** sha256 of the body in canonical JSON, so a quote pays for exactly one request. */
  bodyHash: string;
  credits: number;
  usdMicro: string;
  payTo: string;
  chainId: number;
  network: string;
  accepts: { asset: string; symbol: string; decimals: number; amount: string }[];
  ip: string;
  issuedAt: string;
  expiresAt: string;
  usedAt: string | null;
  paymentId: string | null;
};

export type PaymentStatus =
  /** Paid and checked; the run is going. */
  | "running"
  /** The run ended and its charge is settled. */
  | "settled"
  /** Paid, but the run could not start. Everything is owed back. */
  | "not_started"
  /** A transfer to us that does not meet its quote (too late or too little). Owed back. */
  | "rejected";

/** One x402 payment: the payer, the amount and the transaction. */
export type Payment = {
  /** `${chainId}:${txHash}`: one payment per transaction, ever. */
  id: string;
  quoteId: string;
  kind: "run" | "pipeline";
  target: string;
  targetName: string;
  runId: string | null;
  pipelineRunId: string | null;
  payer: string;
  asset: string;
  symbol: string;
  decimals: number;
  /** What the quote asked for, atomic. */
  required: string;
  /** What the transfer sent, atomic. */
  paid: string;
  txHash: string;
  chainId: number;
  network: string;
  blockNumber: string;
  blockTime: string;
  verifier: string;
  /** True with the fake verifier: no money moved. */
  test: boolean;
  /** The credits quoted: the most the run can be charged. */
  credits: number;
  usdMicro: string;
  /** sha256 of the X-PAYMENT header, so the same header again returns the same run. */
  headerHash: string;
  status: PaymentStatus;
  /** Credits charged, once settled. */
  charged: number | null;
  /** The part of `paid` the charge used, atomic. */
  used: string | null;
  /** The rest, atomic: owed back, or kept under the refund minimum. */
  unused: string | null;
  refundId: string | null;
  /** The run's end: succeeded, failed, cancelled, ready, ... */
  outcome: string | null;
  note: string | null;
  ip: string;
  createdAt: string;
  settledAt: string | null;
};

export type RefundReason = "failed" | "cancelled" | "unused" | "not_started" | "too_late" | "too_little";

/** A refund the owner owes. WOVI holds no keys: nothing is ever sent from here. */
export type OwedRefund = {
  id: string;
  paymentId: string;
  /** The payer. */
  to: string;
  asset: string;
  symbol: string;
  decimals: number;
  amount: string;
  chainId: number;
  network: string;
  reason: RefundReason;
  status: "owed" | "paid";
  test: boolean;
  note: string;
  createdAt: string;
  /** Set by the owner after paying it from their own wallet. */
  paidAt: string | null;
  paidTx: string | null;
  paidBy: string | null;
};

/** A receipt token's row: only its hash is kept. Reads one run or pipeline run. */
export type Receipt = {
  /** sha256 of the token. */
  id: string;
  paymentId: string;
  kind: "run" | "pipeline";
  targetId: string;
  createdAt: string;
  expiresAt: string;
};

/** A fake transfer (fake verifier only): what a pretend chain saw. */
export type FakeTransfer = {
  id: string;
  chainId: number;
  txHash: string;
  from: string;
  to: string;
  asset: string;
  amount: string;
  blockNumber: string;
  blockTime: string;
  confirmations: number;
  success: boolean;
};
