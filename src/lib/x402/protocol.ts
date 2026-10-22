/**
 * The x402 wire format (phase 15): reading X-PAYMENT, writing
 * X-PAYMENT-RESPONSE, the message a payer signs, and hashing a request body
 * so a quote pays for exactly one request. Pure functions.
 */
import { createHash } from "node:crypto";
import { X402_SCHEME, X402_VERSION, isAddress } from "./config";
import type { PaymentPayload, SettleResponse } from "./types";

export const PAYMENT_HEADER = "x-payment";
export const PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";
export const RECEIPT_HEADER = "X-Receipt-Token";

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130,}$/;
const NONCE = /^x402q_[A-Za-z0-9_-]{16,64}$/;

export const isTxHash = (v: unknown): v is string => typeof v === "string" && TX_HASH.test(v);
export const isNonce = (v: unknown): v is string => typeof v === "string" && NONCE.test(v);

/**
 * The exact text the paying wallet signs (EIP-191 personal_sign). It ties
 * the transfer to one quote: a transaction hash seen on chain is useless to
 * anyone but the wallet that sent it.
 */
export function signMessage(nonce: string, txHash: string, chainId: number): string {
  return ["WOVI x402 payment", `Nonce: ${nonce}`, `Transaction: ${txHash.toLowerCase()}`, `Chain: ${chainId}`].join("\n");
}

/** The message template a 402 shows, with {txHash} to fill in. */
export function signTemplate(nonce: string, chainId: number): string {
  return ["WOVI x402 payment", `Nonce: ${nonce}`, "Transaction: {txHash}", `Chain: ${chainId}`].join("\n");
}

export const b64json = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8").toString("base64");

export class PaymentHeaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentHeaderError";
  }
}

/** Reads X-PAYMENT: base64 JSON in the x402 v1 shape with our scheme. Throws PaymentHeaderError with a plain reason. */
export function decodePaymentHeader(value: string, maxBytes: number): PaymentPayload {
  if (value.length > maxBytes) throw new PaymentHeaderError(`X-PAYMENT is longer than ${maxBytes} bytes.`);
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(value.trim(), "base64").toString("utf8"));
  } catch {
    throw new PaymentHeaderError("X-PAYMENT is not base64 JSON.");
  }
  const p = raw as Partial<PaymentPayload> | null;
  if (!p || typeof p !== "object") throw new PaymentHeaderError("X-PAYMENT is not a payment payload.");
  if (p.x402Version !== X402_VERSION) throw new PaymentHeaderError(`x402Version must be ${X402_VERSION}.`);
  if (p.scheme !== X402_SCHEME) throw new PaymentHeaderError(`The scheme must be "${X402_SCHEME}".`);
  if (typeof p.network !== "string") throw new PaymentHeaderError("The network is missing.");
  const pl = (p.payload ?? {}) as Partial<PaymentPayload["payload"]>;
  if (!isNonce(pl.nonce)) throw new PaymentHeaderError("payload.nonce is not a quote nonce from a 402.");
  if (!isTxHash(pl.txHash)) throw new PaymentHeaderError("payload.txHash must be a 0x transaction hash with 64 hex characters.");
  if (!isAddress(pl.payer)) throw new PaymentHeaderError("payload.payer must be the 0x address that sent the transfer.");
  if (!isAddress(pl.asset)) throw new PaymentHeaderError("payload.asset must be one of the assets the 402 offered.");
  if (typeof pl.signature !== "string" || !SIGNATURE.test(pl.signature)) throw new PaymentHeaderError("payload.signature must be the payer's 0x signature of the quote message.");
  return { x402Version: 1, scheme: p.scheme, network: p.network, payload: { nonce: pl.nonce, txHash: pl.txHash, payer: pl.payer, asset: pl.asset, signature: pl.signature } };
}

export function encodePaymentHeader(p: PaymentPayload): string {
  return b64json(p);
}

export function encodeSettleResponse(r: SettleResponse): string {
  return b64json(r);
}

export function decodeSettleResponse(value: string): SettleResponse {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as SettleResponse;
}

/** JSON with keys sorted at every level, so the same body always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function bodyHash(body: unknown): string {
  return sha256(canonicalJson(body ?? {}));
}
