/**
 * Where the site's own $WOVI records live (phase 17), on the shared
 * Collection interface: memory for tests, .data/token.json for local work,
 * Postgres later. Addresses are kept in lower case, the one form they are
 * compared in. No key, no email.
 *
 *   burns      the pot's Burned events as read from its logs, newest kept
 *   scan       how far the logs were read, and $WOVI's supply when first seen at launch
 *   keeper     the keeper's numbers: runs, sweeps, burns, gas by day, the last error, a transaction still out
 *   holders    each person's holder status: their linked wallets' $WOVI at the last read
 *   snapshots  one per month: every linked wallet's $WOVI at one block, and the holder credits granted from it
 *   quotes     a price for some credits in $WOVI, single use, short-lived
 *   payments   every $WOVI transaction counted for credits, once each (the id is the chain and the hash)
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";

export type BurnRow = { id: string; n: number; tx: string; block: number; at: number; tokens: string; eth: string };
export type ScanRow = { id: "burns"; scannedTo: number; launchSupply: string | null };

export type KeeperRow = {
  id: "keeper";
  runs: number;
  lastRunAt: number | null;
  lastResult: string | null;
  sweeps: number;
  sweptWei: string;
  burns: number;
  failures: number;
  lastError: string | null;
  lastSweep: { tx: string; at: number } | null;
  lastBurn: { tx: string; at: number } | null;
  /** The keeper wallet and what it held at the last look (wei), for the owner's card. */
  account: string | null;
  gasBalanceWei: string | null;
  gasByDay: Record<string, number>;
  /** A transaction sent and not yet seen mined. While one is out nothing new is sent. */
  pending: { kind: "sweep" | "burn"; tx: string; sentAt: number } | null;
};

export type HolderRow = {
  /** The person's user id. */
  id: string;
  userId: string;
  wallets: { address: string; wei: string | null }[];
  totalWei: string;
  holder: boolean;
  checkedAt: string;
};

export type SnapshotUser = { userId: string; workspaceId: string; wallets: string[]; totalWei: string; credits: number };
export type SnapshotRow = {
  /** The month, "2026-10". */
  id: string;
  period: string;
  block: number;
  at: string;
  users: SnapshotUser[];
  /** Users whose grant has been written. Grants are idempotent; this only says how far it got. */
  granted: string[];
  credits: number;
};

export type QuoteRow = {
  id: string;
  userId: string;
  workspaceId: string;
  credits: number;
  /** $WOVI wei to send, exact. */
  tokensWei: string;
  source: "fixed" | "market";
  /** The price the quote used, for the record: wei of ETH per $WOVI and USD per ETH (8 decimals), or the fixed rate. */
  price: { weiPerToken: string | null; ethUsd: string | null; tokensPerCreditWei: string | null };
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  txHash: string | null;
};

export type WoviPaymentRow = {
  /** `<chain>:<hash>`: a transaction counts once, ever. */
  id: string;
  tx: string;
  userId: string;
  workspaceId: string;
  payer: string;
  tokensWei: string;
  credits: number;
  quoteId: string;
  block: number;
  at: number;
  createdAt: string;
};

export type TokenStore = {
  burns: Collection<BurnRow>;
  scan: Collection<ScanRow>;
  keeper: Collection<KeeperRow>;
  holders: Collection<HolderRow>;
  snapshots: Collection<SnapshotRow>;
  quotes: Collection<QuoteRow>;
  payments: Collection<WoviPaymentRow>;
};

const TABLES = ["burns", "scan", "keeper", "holders", "snapshots", "quotes", "payments"] as const satisfies readonly (keyof TokenStore)[];

export function memoryTokenStore(): TokenStore {
  return memoryTables<TokenStore>(TABLES);
}

export function jsonFileTokenStore(file: string): TokenStore {
  return jsonFileTables<TokenStore>(file, TABLES);
}

export const emptyKeeper = (): KeeperRow => ({
  id: "keeper",
  runs: 0,
  lastRunAt: null,
  lastResult: null,
  sweeps: 0,
  sweptWei: "0",
  burns: 0,
  failures: 0,
  lastError: null,
  lastSweep: null,
  lastBurn: null,
  account: null,
  gasBalanceWei: null,
  gasByDay: {},
  pending: null,
});

/** Inserts or replaces a row. */
export async function put<T extends { id: string }>(c: Collection<T>, row: T): Promise<void> {
  if (await c.get(row.id)) await c.update(row);
  else await c.insert(row);
}
