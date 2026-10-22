/**
 * The team tables (phase 11) on the shared Collection interface: memory for
 * tests, one JSON file in .data/ for local work, a Postgres store later.
 * Every row carries its workspace id.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { ActivityRow, ClientRow, CommentRow, ItemRow, NotificationRow, ReviewSettings, ShareLinkRow } from "./types";

export type TeamStore = {
  items: Collection<ItemRow>;
  comments: Collection<CommentRow>;
  activity: Collection<ActivityRow>;
  notifications: Collection<NotificationRow>;
  clients: Collection<ClientRow>;
  shareLinks: Collection<ShareLinkRow>;
  settings: Collection<ReviewSettings>;
};

const TABLES = ["items", "comments", "activity", "notifications", "clients", "shareLinks", "settings"] as const satisfies readonly (keyof TeamStore)[];

export function memoryTeamStore(): TeamStore {
  return memoryTables<TeamStore>(TABLES);
}

export function jsonFileTeamStore(file: string): TeamStore {
  return jsonFileTables<TeamStore>(file, TABLES);
}
