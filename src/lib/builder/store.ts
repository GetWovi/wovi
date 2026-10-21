/**
 * The builder's own tables, on the same Collection interface as accounts.
 * Samples and board items each carry a workspace id and an agent id.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { BoardItem, Sample } from "./types";

export type BuilderStore = {
  samples: Collection<Sample>;
  boardItems: Collection<BoardItem>;
};

const TABLES = ["samples", "boardItems"] as const satisfies readonly (keyof BuilderStore)[];

export function memoryBuilderStore(): BuilderStore {
  return memoryTables<BuilderStore>(TABLES);
}

export function jsonFileBuilderStore(file: string): BuilderStore {
  return jsonFileTables<BuilderStore>(file, TABLES);
}
