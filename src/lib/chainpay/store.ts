/**
 * Where USDC and ETH top-ups are kept, on the shared Collection interface:
 * memory for tests, .data/chainpay.json for local work (made on the first
 * price), Postgres later. Addresses and hashes in lower case.
 *
 *   quotes    a price for a pack in USDC or ETH, single use, ten minutes
 *   payments  every transaction counted, once ever (the id is the chain and the hash)
 *
 * In Postgres the payment id is the primary key, so a transaction can never
 * count twice, and a quote is claimed with UPDATE ... WHERE used_at IS NULL.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { PayAsset } from "./config";

export type ChainQuoteRow = {
  id: string;
  userId: string;
  workspaceId: string;
  credits: number;
  asset: PayAsset;
  symbol: string;
  /** The token, or the ETH placeholder address. */
  token: string;
  decimals: number;
  /** What to send, in the asset's smallest unit, exact. */
  amount: string;
  payTo: string;
  /** For ETH: the USD price per ETH (8 decimals) the quote used. Null for USDC (one to one). */
  ethUsd: string | null;
  /** The purchase consent (phase 18), ticked before the price, word for word. */
  consent: { at: string; wording: string };
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  txHash: string | null;
};

export type ChainPaymentRow = {
  /** `<chain>:<hash>`: a transaction counts once, ever. */
  id: string;
  tx: string;
  userId: string;
  workspaceId: string;
  quoteId: string;
  asset: PayAsset;
  /** The linked wallet it came from. */
  payer: string;
  amount: string;
  /** Credits given for it: zero when it is owed back instead. */
  credits: number;
  /** credited: a top-up. owed: too late or less than a credit, written down to send back. */
  outcome: "credited" | "owed";
  reason: "late" | "too_little" | null;
  /** The top-up it became, or the owed row. */
  topUpId: string | null;
  owedId: string | null;
  block: number;
  at: number;
  createdAt: string;
};

export type ChainPayStore = { quotes: Collection<ChainQuoteRow>; payments: Collection<ChainPaymentRow> };

const TABLES = ["quotes", "payments"] as const satisfies readonly (keyof ChainPayStore)[];

export const memoryChainPayStore = (): ChainPayStore => memoryTables<ChainPayStore>(TABLES);
export const jsonFileChainPayStore = (file: string): ChainPayStore => jsonFileTables<ChainPayStore>(file, TABLES);
