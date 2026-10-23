/**
 * Clip samples live in their own file, clips.json, created on the first
 * upload, so a data dir from before clips reads and works exactly as it did.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { Clip, ClipCall } from "./types";

export type ClipStore = {
  clips: Collection<Clip>;
  calls: Collection<ClipCall>;
};

const TABLES = ["clips", "calls"] as const satisfies readonly (keyof ClipStore)[];

export function memoryClipStore(): ClipStore {
  return memoryTables<ClipStore>(TABLES);
}

export function jsonFileClipStore(file: string): ClipStore {
  return jsonFileTables<ClipStore>(file, TABLES);
}
