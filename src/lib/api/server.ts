/**
 * The Next.js side of the REST API, MCP and webhooks (phase 14): one of each
 * per server process, on the same AppApi, engine, pipelines, credits and
 * quality service as the app's screens. Webhooks start listening to the
 * engines on first use, and pending deliveries from a previous process are
 * tried again.
 */
import { join } from "node:path";
import { accounts, appEngine } from "@/lib/accounts/server";
import { dataDirFromEnv, isLocalApp } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { appApi } from "@/lib/app/server";
import { appCredits } from "@/lib/credits/server";
import { appPipelines } from "@/lib/pipelines/server";
import { appQuality } from "@/lib/quality/server";
import { webhookSenderFromEnv } from "@/lib/webhooks/sender";
import { jsonFileWebhookStore } from "@/lib/webhooks/store";
import { Webhooks } from "@/lib/webhooks/webhooks";
import { wireWebhookEvents } from "./events";
import { RestApi } from "./rest";
import { PublicApi } from "./service";

const g = globalThis as { __woviApi?: { webhooks?: Webhooks; api?: PublicApi; rest?: RestApi } };
const cache = (g.__woviApi ??= {});

export function appUrl(): string {
  return (process.env.WOVI_APP_URL ?? "http://localhost:3900").replace(/\/$/, "");
}

export function appWebhooks(): Webhooks {
  if (!cache.webhooks) {
    const dir = dataDirFromEnv();
    const local = isLocalApp();
    const webhooks = new Webhooks({ accounts: accounts(), store: jsonFileWebhookStore(join(dir, "webhooks.json")), sender: webhookSenderFromEnv(dir, local), secret: accounts().secret, local });
    cache.webhooks = webhooks;
    wireWebhookEvents({ webhooks, engine: appEngine(), pipelines: appPipelines().engine, registry: localRegistry() });
    void webhooks.runDue().catch((err) => console.error("Could not retry webhook deliveries:", err));
  }
  return cache.webhooks;
}

export function appPublicApi(): PublicApi {
  return (cache.api ??= new PublicApi({
    accounts: accounts(),
    app: appApi(),
    pipelines: appPipelines(),
    credits: appCredits(),
    quality: appQuality(),
    webhooks: appWebhooks(),
  }));
}

export function appRest(): RestApi {
  return (cache.rest ??= new RestApi({ api: appPublicApi(), accounts: accounts(), appUrl: appUrl() }));
}
