/**
 * Storage for credits on the shared Collection interface: memory for tests,
 * one JSON file in .data/ for local work, Postgres later. Every row carries
 * its workspace id.
 *
 * In Postgres the ledger gets a unique index on (workspace_id, key), so a
 * replayed write cannot land twice, and every write takes a lock on the
 * workspace's row (SELECT ... FOR UPDATE), so the balance check and the
 * insert happen as one. Locally one process serializes writes per workspace.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { CreditLimits, LedgerEntry, TopUp } from "./types";

export type CreditStore = {
  ledger: Collection<LedgerEntry>;
  topUps: Collection<TopUp>;
  limits: Collection<CreditLimits>;
};

const TABLES = ["ledger", "topUps", "limits"] as const satisfies readonly (keyof CreditStore)[];

export function memoryCreditStore(): CreditStore {
  return memoryTables<CreditStore>(TABLES);
}

export function jsonFileCreditStore(file: string): CreditStore {
  return jsonFileTables<CreditStore>(file, TABLES);
}
