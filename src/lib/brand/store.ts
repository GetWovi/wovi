/**
 * The Brand Brain tables, on the same Collection interface as accounts and
 * the builder: memory for tests, one JSON file in .data/ for local work, and
 * a Postgres store later behind the same three tables. Every row carries its
 * workspace id.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { Brain, BrainVersion, Proposal } from "./types";

export type BrandStore = {
  brains: Collection<Brain>;
  brainVersions: Collection<BrainVersion>;
  proposals: Collection<Proposal>;
};

const TABLES = ["brains", "brainVersions", "proposals"] as const satisfies readonly (keyof BrandStore)[];

export function memoryBrandStore(): BrandStore {
  return memoryTables<BrandStore>(TABLES);
}

export function jsonFileBrandStore(file: string): BrandStore {
  return jsonFileTables<BrandStore>(file, TABLES);
}
