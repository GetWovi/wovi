/**
 * x402's shapes as zod schemas (phase 15), for the OpenAPI document and the
 * tests, which parse real answers with them.
 */
import { z } from "zod";
import { PipelineRunSchema, RunSchema } from "@/lib/api/schemas";
import { X402_ERROR_CODES } from "./types";

export const PaymentRequirementsSchema = z
  .object({
    scheme: z.literal("tx-hash").describe('WOVI\'s scheme: pay on chain yourself, then send the transaction hash, signed. Not "exact": that needs a facilitator and a token with signed transfers.'),
    network: z.string().describe("CAIP-2, eip155:4663 for Robinhood Chain."),
    maxAmountRequired: z.string().describe("Atomic units of the asset (wei for ETH), as a decimal string."),
    resource: z.string().describe("The URL this pays for."),
    description: z.string(),
    mimeType: z.string(),
    payTo: z.string().describe("Where to send the transfer."),
    maxTimeoutSeconds: z.number().int().describe("How long the quote stays open."),
    asset: z.string().describe("The token contract, or 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE for ETH (EIP-7528)."),
    outputSchema: z.null(),
    extra: z.object({
      nonce: z.string().describe("Single use. Goes into X-PAYMENT and into the signed message."),
      expiresAt: z.string().describe("The transfer must be mined before this."),
      chainId: z.number().int(),
      symbol: z.string(),
      decimals: z.number().int(),
      credits: z.number().int().describe("The estimate in credits: the most the run can be charged."),
      priceUsd: z.string().describe("The same in USD, one credit is $0.01."),
      sign: z.string().describe("The message the paying wallet signs (EIP-191), with {txHash} filled in."),
    }),
  })
  .describe("One way to pay for this call.");

export const PaymentRequiredSchema = z
  .object({
    x402Version: z.literal(1),
    error: z.string().describe("Why payment is needed, or what was wrong with the payment sent."),
    code: z.enum(X402_ERROR_CODES),
    accepts: z.array(PaymentRequirementsSchema).describe("Quotes to pay, one per asset. Empty when nothing can be quoted right now."),
  })
  .describe("The body of a 402 from x402 (version 1).");

export const PaymentPayloadSchema = z
  .object({
    x402Version: z.literal(1),
    scheme: z.literal("tx-hash"),
    network: z.string(),
    payload: z.object({
      nonce: z.string(),
      txHash: z.string().describe("The transfer you sent to payTo."),
      payer: z.string().describe("The wallet that sent it."),
      asset: z.string(),
      signature: z.string().describe("The payer's EIP-191 signature of extra.sign with {txHash} filled in."),
    }),
  })
  .describe("What goes into the X-PAYMENT header, as base64 of this JSON.");

export const SettleResponseSchema = z
  .object({ success: z.boolean(), transaction: z.string(), network: z.string(), payer: z.string(), errorReason: z.string().optional() })
  .describe("What the X-PAYMENT-RESPONSE header holds, as base64 of this JSON.");

export const X402PaymentSchema = z
  .object({
    id: z.string(),
    status: z.enum(["running", "settled", "not_started", "rejected"]),
    payer: z.string(),
    network: z.string(),
    transaction: z.string(),
    asset: z.string(),
    symbol: z.string(),
    paid: z.string().describe("Atomic units."),
    required: z.string(),
    credits: z.number().int().describe("Quoted."),
    charged: z.number().int().nullable().describe("Charged once the run ended. Never more than quoted."),
    refund: z.object({ amount: z.string(), status: z.enum(["owed", "paid"]), reason: z.string() }).nullable().describe("What the owner owes back, if anything. Sent by the owner, not automatically."),
    test: z.boolean().describe("True on a test server with the fake verifier: no money moved."),
  })
  .describe("A payment, as its payer sees it.");

export const X402RunResultSchema = z.object({ run: RunSchema, payment: X402PaymentSchema }).describe("A paid run and its payment.");
export const X402PipelineRunResultSchema = z.object({ pipelineRun: PipelineRunSchema, payment: X402PaymentSchema }).describe("A paid pipeline run and its payment.");

const Price = z.object({ id: z.string(), name: z.string(), credits: z.number().int(), usd: z.string() });

export const X402DiscoverySchema = z
  .object({
    x402Version: z.literal(1),
    enabled: z.boolean(),
    off: z.string().optional(),
    test: z.boolean(),
    scheme: z.literal("tx-hash"),
    network: z.string(),
    chainId: z.number().int(),
    payTo: z.string().nullable(),
    assets: z.array(z.object({ symbol: z.string(), asset: z.string(), decimals: z.number().int() })),
    creditUsd: z.string(),
    quoteSeconds: z.number().int(),
    confirmations: z.number().int(),
    pricing: z.string(),
    endpoints: z.array(z.object({ method: z.string(), path: z.string(), description: z.string(), prices: z.array(Price) })),
    receipts: z.object({ header: z.string(), endpoints: z.array(z.string()) }),
    payment: z.object({ header: z.string(), sign: z.string(), refunds: z.string() }),
    mcp: z.string(),
    openapi: z.string(),
    docs: z.string(),
  })
  .describe("Which endpoints take x402, and the prices.");
