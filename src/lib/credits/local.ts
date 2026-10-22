/**
 * Credits on the local JSON store in .data/credits.json (or WOVI_DATA_DIR),
 * one per process, shared by the app's run engine and its pipelines. No
 * Next.js imports, so the engine wiring can use it.
 */
import { join } from "node:path";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { CREDITS } from "./config";
import { Credits } from "./credits";
import { paymentProviderFromEnv } from "./payments";
import { jsonFileCreditStore } from "./store";

/** Whether this process bills runs: on unless the config or WOVI_CREDITS=off turns it off. */
export function creditsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return CREDITS.enabled && env.WOVI_CREDITS !== "off";
}

export function localCredits(dataDir = dataDirFromEnv()): Credits {
  return new Credits({ store: jsonFileCreditStore(join(dataDir, "credits.json")), payments: paymentProviderFromEnv(), registry: localRegistry(dataDir) });
}

const g = globalThis as { __woviCredits?: Credits };

/** The one credits service of this process. */
export function processCredits(): Credits {
  return (g.__woviCredits ??= localCredits());
}
