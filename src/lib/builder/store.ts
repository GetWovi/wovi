/**
 * The builder's own tables, on the same Collection interface as accounts.
 * Samples and board items each carry a workspace id and an agent id. The
 * bench tables (benches, ratings, batches) arrived in phase 6; a file written
 * before them reads back with those tables empty.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { Batch, Bench, BoardItem, Rating, Sample } from "./types";

export type BuilderStore = {
  samples: Collection<Sample>;
  boardItems: Collection<BoardItem>;
  benches: Collection<Bench>;
  ratings: Collection<Rating>;
  batches: Collection<Batch>;
};

const TABLES = ["samples", "boardItems", "benches", "ratings", "batches"] as const satisfies readonly (keyof BuilderStore)[];

export function memoryBuilderStore(): BuilderStore {
  return memoryTables<BuilderStore>(TABLES);
}

export function jsonFileBuilderStore(file: string): BuilderStore {
  return jsonFileTables<BuilderStore>(file, TABLES);
}
