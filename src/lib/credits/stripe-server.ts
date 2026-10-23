/**
 * SERVER ONLY. Stripe for this process: the settings, the client and the
 * webhook handler, sharing the app's credits. Null while card payments are
 * off (STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not set).
 */
import { join } from "node:path";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { creditsEnabled, processCredits } from "./local";
import { jsonFileStripeStore, localStripeApiBase, StripeEvents, stripeClient, stripeSettingsFromEnv, type StripeClient, type StripeSettings, type StripeStore } from "./stripe";

export type StripeServices = { settings: StripeSettings; client: StripeClient; store: StripeStore; events: StripeEvents };

const g = globalThis as { __woviStripe?: StripeServices | null };

export function appStripe(): StripeServices | null {
  if (g.__woviStripe === undefined) {
    const settings = stripeSettingsFromEnv();
    if (!settings.on || !creditsEnabled()) {
      g.__woviStripe = null;
    } else {
      const client = stripeClient(settings.secretKey!, localStripeApiBase(process.env));
      const store = jsonFileStripeStore(join(dataDirFromEnv(), "stripe.json"));
      g.__woviStripe = { settings, client, store, events: new StripeEvents({ settings, client, credits: processCredits(), store }) };
    }
  }
  return g.__woviStripe;
}
