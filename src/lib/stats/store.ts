/**
 * The stats tables on the shared Collection interface: feedback events,
 * releases and the audit log. Memory for tests, `stats.json` in the data dir
 * for local work. The file is only written on the first event, so a data dir
 * from before reads unchanged.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { AuditRow, FeedbackRow, ReleaseRow } from "./types";

export type StatsStore = {
  feedback: Collection<FeedbackRow>;
  releases: Collection<ReleaseRow>;
  audit: Collection<AuditRow>;
};

const TABLES = ["feedback", "releases", "audit"] as const satisfies readonly (keyof StatsStore)[];

export function memoryStatsStore(): StatsStore {
  return memoryTables<StatsStore>(TABLES);
}

export function jsonFileStatsStore(file: string): StatsStore {
  return jsonFileTables<StatsStore>(file, TABLES);
}
