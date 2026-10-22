/**
 * Storage for x402 (phase 15) on the shared Collection interface: memory for
 * tests, one JSON file in .data/ for local work, Postgres later.
 *
 *   quotes          every 402's quote, single use (usedAt)
 *   payments        one row per transaction, ever: the payer, the amount, the transfer
 *   refunds         refunds the owner owes, until they mark them paid
 *   receipts        hashes of receipt tokens, each reading one run
 *   fakeTransfers   the fake verifier's pretend chain (local demos and tests only)
 *
 * In Postgres: the payment id (chain and transaction hash) is the primary
 * key, so a transaction can never pay twice, and quotes are claimed with
 * UPDATE ... WHERE used_at IS NULL.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { FakeTransfer, OwedRefund, Payment, Quote, Receipt } from "./types";

export type X402Store = {
  quotes: Collection<Quote>;
  payments: Collection<Payment>;
  refunds: Collection<OwedRefund>;
  receipts: Collection<Receipt>;
  fakeTransfers: Collection<FakeTransfer>;
};

const TABLES = ["quotes", "payments", "refunds", "receipts", "fakeTransfers"] as const satisfies readonly (keyof X402Store)[];

export function memoryX402Store(): X402Store {
  return memoryTables<X402Store>(TABLES);
}

export function jsonFileX402Store(file: string): X402Store {
  return jsonFileTables<X402Store>(file, TABLES);
}
