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
import { appUrlFromEnv } from "@/lib/runtime";
import { localRegistry } from "@/lib/agents/registry";
import { appApi } from "@/lib/app/server";
import { appCredits } from "@/lib/credits/server";
import { creditsEnabled } from "@/lib/credits/local";
import { appPipelines } from "@/lib/pipelines/server";
import { appQuality } from "@/lib/quality/server";
import { processCredits } from "@/lib/credits/local";
import { usedForTopUp } from "@/lib/chainpay/local";
import { x402ConfigFromEnv } from "@/lib/x402/config";
import { X402Http } from "@/lib/x402/http";
import { onchainVerifier, readFeed, rpcReader } from "@/lib/x402/onchain";
import { X402 } from "@/lib/x402/service";
import { jsonFileX402Store } from "@/lib/x402/store";
import { fakeVerifier } from "@/lib/x402/verifier";
import { webhookSenderFromEnv } from "@/lib/webhooks/sender";
import { jsonFileWebhookStore } from "@/lib/webhooks/store";
import { Webhooks } from "@/lib/webhooks/webhooks";
import { wireWebhookEvents } from "./events";
import { RestApi } from "./rest";
import { PublicApi } from "./service";

const g = globalThis as { __woviApi?: { webhooks?: Webhooks; api?: PublicApi; rest?: RestApi; x402?: X402; x402Http?: X402Http } };
const cache = (g.__woviApi ??= {});

export function appUrl(): string {
  return appUrlFromEnv();
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
    credits: creditsEnabled() ? appCredits() : undefined,
    quality: appQuality(),
    webhooks: appWebhooks(),
  }));
}

/**
 * x402 (phase 15) for this process. Off unless WOVI_X402_PAY_TO and a way to
 * check payments are set (docs/x402.md). The fake verifier only runs on a
 * local app; anywhere else it is refused and x402 stays off.
 */
export function appX402(): X402 {
  if (!cache.x402) {
    const cfg = x402ConfigFromEnv();
    const local = isLocalApp();
    const store = jsonFileX402Store(join(dataDirFromEnv(), "x402.json"));
    const verifier = cfg.verifier === "fake" ? (local ? fakeVerifier(store.fakeTransfers) : null) : onchainVerifier(cfg);
    const reader = cfg.rpcUrl ? rpcReader(cfg.rpcUrl) : null;
    const x402 = new X402({
      cfg,
      local,
      verifier,
      store,
      accounts: accounts(),
      api: appPublicApi(),
      credits: processCredits(),
      engine: appEngine(),
      pipelines: appPipelines().engine,
      appUrl: appUrl(),
      usedElsewhere: usedForTopUp,
      ...(reader ? { readFeed: (feed: string, maxAgeSec: number) => readFeed(reader, feed, maxAgeSec, Math.floor(Date.now() / 1000)) } : {}),
    });
    cache.x402 = x402;
    x402.wire();
    void x402.settleOpen().catch((err) => console.error("Could not settle x402 payments:", err));
  }
  return cache.x402;
}

export function appX402Http(): X402Http {
  return (cache.x402Http ??= new X402Http(appX402(), { appUrl: appUrl(), maxBodyBytes: appPublicApi().limits.maxBodyBytes }));
}

export function appRest(): RestApi {
  return (cache.rest ??= new RestApi({ api: appPublicApi(), accounts: accounts(), appUrl: appUrl(), x402: appX402Http() }));
}
