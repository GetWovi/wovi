/**
 * Webhook storage on the shared Collection interface: memory for tests, one
 * JSON file in .data/ for local work. Every row carries its workspace id.
 * In Postgres the delivery id is the primary key, so one event lands once
 * per endpoint even when two servers see it.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { WebhookDelivery, WebhookEndpoint } from "./types";

export type WebhookStore = {
  endpoints: Collection<WebhookEndpoint>;
  deliveries: Collection<WebhookDelivery>;
};

const TABLES = ["endpoints", "deliveries"] as const satisfies readonly (keyof WebhookStore)[];

export function memoryWebhookStore(): WebhookStore {
  return memoryTables<WebhookStore>(TABLES);
}

export function jsonFileWebhookStore(file: string): WebhookStore {
  return jsonFileTables<WebhookStore>(file, TABLES);
}
