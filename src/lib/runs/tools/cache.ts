/**
 * A short-lived cache for tool answers, so the same niche on the same
 * platform within a few hours reuses one search instead of paying again.
 * In memory for tests; one JSON file (tool-cache.json, made on its first
 * write) for the app. Expired rows are dropped on every write.
 */
import { createHash } from "node:crypto";
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { ToolAnswer } from "./types";

export type CachedAnswer = Omit<ToolAnswer, "costMicroUsd" | "tokensIn" | "tokensOut">;

export interface ToolCache {
  get(key: string): Promise<CachedAnswer | null>;
  set(key: string, value: CachedAnswer, ttlMs: number): Promise<void>;
}

type Row = { id: string; value: CachedAnswer; expiresAt: string };
type Tables = { answers: Collection<Row> };

/** The cache key: the tool and its arguments, lower-cased and trimmed, hashed. */
export function toolCacheKey(tool: string, args: Record<string, string>): string {
  const norm = Object.keys(args)
    .sort()
    .map((k) => `${k}=${String(args[k]).toLowerCase().replace(/\s+/g, " ").trim()}`)
    .join("&");
  return `${tool}:${createHash("sha256").update(norm).digest("hex").slice(0, 32)}`;
}

function tableCache(t: Tables, now: () => Date): ToolCache {
  return {
    async get(key) {
      const row = await t.answers.get(key);
      if (!row || Date.parse(row.expiresAt) <= now().getTime()) return null;
      return structuredClone(row.value);
    },
    async set(key, value, ttlMs) {
      if (!(ttlMs > 0)) return;
      const at = now().getTime();
      for (const old of await t.answers.find()) if (Date.parse(old.expiresAt) <= at) await t.answers.delete(old.id);
      const row: Row = { id: key, value: structuredClone(value), expiresAt: new Date(at + ttlMs).toISOString() };
      if (await t.answers.get(key)) await t.answers.update(row);
      else await t.answers.insert(row);
    },
  };
}

export function memoryToolCache(now: () => Date = () => new Date()): ToolCache {
  return tableCache(memoryTables<Tables>(["answers"]), now);
}

export function jsonFileToolCache(file: string, now: () => Date = () => new Date()): ToolCache {
  return tableCache(jsonFileTables<Tables>(file, ["answers"]), now);
}
