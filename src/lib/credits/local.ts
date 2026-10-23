/**
 * Credits on the local JSON store in .data/credits.json (or WOVI_DATA_DIR),
 * one per process, shared by the app's run engine and its pipelines. No
 * Next.js imports, so the engine wiring can use it.
 */
import { join } from "node:path";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { CREDITS, holderSpendOrderFromEnv } from "./config";
import { Credits } from "./credits";
import { paymentProviderFromEnv, type PaymentProvider } from "./payments";
import { localStripeApiBase, stripeClient, stripePaymentProvider, stripeSettingsFromEnv } from "./stripe";
import { jsonFileCreditStore } from "./store";
import { appUrlFromEnv } from "@/lib/runtime";

/** Whether this process bills runs: on unless the config or WOVI_CREDITS=off turns it off. */
export function creditsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return CREDITS.enabled && env.WOVI_CREDITS !== "off";
}

/**
 * Stripe when STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set (card
 * top-ups), else the test provider on a local app, else none: top-ups closed.
 */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): PaymentProvider | null {
  const s = stripeSettingsFromEnv(env);
  if (s.on) return stripePaymentProvider(s, stripeClient(s.secretKey!, localStripeApiBase(env)), appUrlFromEnv(env));
  return paymentProviderFromEnv(env);
}

export function localCredits(dataDir = dataDirFromEnv()): Credits {
  return new Credits({ store: jsonFileCreditStore(join(dataDir, "credits.json")), payments: providerFromEnv(), registry: localRegistry(dataDir), config: { holderSpendOrder: holderSpendOrderFromEnv() } });
}

const g = globalThis as { __woviCredits?: Credits };

/** The one credits service of this process. */
export function processCredits(): Credits {
  return (g.__woviCredits ??= localCredits());
}
