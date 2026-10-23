/**
 * The REST API, MCP and webhooks for tests: the app on the fake provider with
 * credits on (testApp), the example Brand Brains in the team, webhooks on a
 * memory sender that never touches the network, and a way to call the API
 * like an HTTP client would.
 */
import { as, testApp } from "@/lib/app/test-helpers";
import { QualityService } from "@/lib/quality/service";
import type { FakeOptions } from "@/lib/runs/providers/fake";
import { memoryWebhookSender, type WebhookRequest } from "@/lib/webhooks/sender";
import { memoryWebhookStore } from "@/lib/webhooks/store";
import { Webhooks } from "@/lib/webhooks/webhooks";
import { wireWebhookEvents } from "./events";
import { DEFAULT_API_LIMITS, type ApiLimits } from "./limits";
import { RestApi } from "./rest";
import { PublicApi } from "./service";
import type { StatsStore } from "@/lib/stats/store";

export const SERVER_SECRET = "test-server-secret-that-is-long-enough-0123456789";

export async function testApi(opts: { limits?: Partial<ApiLimits>; respond?: (req: WebhookRequest, n: number) => number | null | Error; credits?: boolean; fake?: FakeOptions; stats?: StatsStore } = {}) {
  const t = await testApp({ credits: opts.credits ?? true, ...(opts.fake ? { fake: opts.fake } : {}), ...(opts.stats ? { stats: opts.stats } : {}) });
  await t.seedTeamBrains();
  const ws = t.team.id;
  const ada = as(t.ada.id);
  const sender = memoryWebhookSender(opts.respond);
  // Retries never fire on their own in tests: the test moves the clock and calls runDue().
  const webhooks = new Webhooks({ accounts: t.accounts, store: memoryWebhookStore(), sender, secret: SERVER_SECRET, local: true, now: () => new Date(t.clock.t), schedule: () => undefined, log: () => undefined });
  const off = wireWebhookEvents({ webhooks, engine: t.engine, pipelines: t.pipelineEngine, registry: t.registry, log: () => undefined });
  const quality = new QualityService({ runs: t.engine, reviews: t.store.reviews, items: t.teamStore.items, activity: t.teamStore.activity, ratings: { find: async () => [] }, requireBuilder: async () => undefined });
  const limits = { ...DEFAULT_API_LIMITS, ...opts.limits };
  const api = new PublicApi({ accounts: t.accounts, app: t.api, pipelines: t.pipelines, ...(t.guardedCredits ? { credits: t.guardedCredits } : {}), quality, webhooks, limits });
  const rest = new RestApi({ api, accounts: t.accounts, appUrl: "http://localhost:3900", now: () => t.clock.t, log: () => undefined });

  /** A key in the team workspace, made by ada (the owner) unless someone else is named. */
  const key = async (role: "admin" | "editor" | "viewer" = "editor", by = t.ada.id, workspaceId = ws) => (await t.accounts.apiKeys.create(as(by), workspaceId, { name: `${role} key`, role })).key;
  const topUp = (n = 1000) => t.guardedCredits!.topUp(ada, ws, n);

  /** Calls the API like an HTTP client: method, path under /api/v1, the key, a body. */
  const call = async (method: string, path: string, o: { key?: string | null; body?: unknown; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { ...(o.key ? { authorization: `Bearer ${o.key}` } : {}), ...o.headers };
    let body: string | undefined;
    if (o.body !== undefined) {
      body = typeof o.body === "string" ? o.body : JSON.stringify(o.body);
      headers["content-type"] ??= "application/json";
    }
    const res = await rest.handle(new Request(`http://localhost:3900/api/v1${path}`, { method, headers, body }));
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  };

  return { ...t, app: t.api, ws, ada, sender, webhooks, off, quality, limits, api, rest, key, topUp, call };
}
