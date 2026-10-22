/**
 * Every REST route of /api/v1 (phase 14) in one table: method, path, what it
 * takes and returns, and the call it makes. The router (rest.ts) serves this
 * table and the OpenAPI document (openapi.ts) is generated from it, so the
 * two never drift apart.
 */
import type { KeyCaller, PublicApi } from "./service";
import {
  AgentSchema,
  BrandBrainSchema,
  CreateWebhookBody,
  CreditsSchema,
  DeliverySchema,
  MeSchema,
  PickBody,
  PipelineRunSchema,
  PipelineSchema,
  RunSchema,
  StartPipelineBody,
  StartRunBody,
  WebhookCreatedSchema,
  WebhookSchema,
  listOf,
} from "./schemas";
import { z } from "zod";

export type RouteContext = {
  api: PublicApi;
  caller: KeyCaller;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  idempotencyKey: string | null;
};

export type Route = {
  method: "GET" | "POST" | "DELETE" | "PUT";
  /** OpenAPI style: /agents/{id}. */
  path: string;
  operationId: string;
  tag: "Agents" | "Runs" | "Pipelines" | "Brand Brains" | "Credits" | "Webhooks" | "Key";
  summary: string;
  description?: string;
  query?: { name: string; description: string; schema: Record<string, unknown> }[];
  body?: z.ZodType;
  /** Takes the Idempotency-Key header. */
  idempotent?: boolean;
  /** Counts against the starts-per-key limit. */
  starts?: boolean;
  status: number;
  response: z.ZodType;
  /** Left out of the OpenAPI document: routes that exist only to answer forbidden. */
  hidden?: boolean;
  handle: (ctx: RouteContext) => Promise<unknown>;
};

const data = <T>(items: T[]) => ({ data: items });
const Deleted = z.object({ deleted: z.literal(true), id: z.string() });
const limitQuery = { name: "limit", description: "How many, 1 to 100. Default 20.", schema: { type: "integer", minimum: 1, maximum: 100 } };

export const ROUTES: Route[] = [
  {
    method: "GET",
    path: "/me",
    operationId: "getMe",
    tag: "Key",
    summary: "The key's workspace, role and limits",
    status: 200,
    response: MeSchema,
    handle: ({ api, caller }) => api.me(caller),
  },

  /* Agents */
  {
    method: "GET",
    path: "/agents",
    operationId: "listAgents",
    tag: "Agents",
    summary: "List the agents you can run",
    description: "Each agent's name, job, form (with JSON Schema), output shape, quality scorecard and about what one run costs. Never its instructions or models.",
    status: 200,
    response: listOf(AgentSchema),
    handle: async ({ api, caller }) => data(await api.listAgents(caller)),
  },
  {
    method: "GET",
    path: "/agents/{id}",
    operationId: "getAgent",
    tag: "Agents",
    summary: "One agent",
    status: 200,
    response: AgentSchema,
    handle: ({ api, caller, params }) => api.getAgent(caller, params.id),
  },
  {
    method: "POST",
    path: "/agents/{id}/runs",
    operationId: "startRun",
    tag: "Runs",
    summary: "Start a run",
    description:
      "Checks the inputs against the agent's form, picks the Brand Brain (the one named, else the workspace default), holds the estimate in credits and queues the run. Answers at once with the run; poll GET /runs/{id} or listen for run.finished. Send an Idempotency-Key so a retried request never starts a second run.",
    body: StartRunBody,
    idempotent: true,
    starts: true,
    status: 202,
    response: RunSchema,
    handle: ({ api, caller, params, body, idempotencyKey }) => api.startRun(caller, params.id, body, idempotencyKey),
  },

  /* Runs */
  {
    method: "GET",
    path: "/runs",
    operationId: "listRuns",
    tag: "Runs",
    summary: "List runs, newest first",
    description: "Runs started in this workspace, from the app or the API. Runs a pipeline made are inside their pipeline run.",
    query: [limitQuery, { name: "status", description: "queued, running, succeeded, failed or cancelled.", schema: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] } }, { name: "agent", description: "Only this agent's runs.", schema: { type: "string" } }],
    status: 200,
    response: listOf(RunSchema),
    handle: async ({ api, caller, query }) => data(await api.listRuns(caller, { limit: query.get("limit"), status: query.get("status"), agent: query.get("agent") })),
  },
  {
    method: "GET",
    path: "/runs/{id}",
    operationId: "getRun",
    tag: "Runs",
    summary: "One run: status, output, quality and charge",
    status: 200,
    response: RunSchema,
    handle: ({ api, caller, params }) => api.getRun(caller, params.id),
  },
  {
    method: "POST",
    path: "/runs/{id}/cancel",
    operationId: "cancelRun",
    tag: "Runs",
    summary: "Stop a run",
    description: "Stops a queued or running run and gives its credits back. A finished run is returned as it is.",
    status: 200,
    response: RunSchema,
    handle: ({ api, caller, params }) => api.cancelRun(caller, params.id),
  },
  { method: "POST", path: "/runs/{id}/approve", operationId: "approveRun", tag: "Runs", summary: "Not for keys", status: 403, response: RunSchema, hidden: true, handle: ({ api, caller, params }) => api.decideRun(caller, params.id, "approved") },
  { method: "POST", path: "/runs/{id}/reject", operationId: "rejectRun", tag: "Runs", summary: "Not for keys", status: 403, response: RunSchema, hidden: true, handle: ({ api, caller, params }) => api.decideRun(caller, params.id, "rejected") },

  /* Pipelines */
  {
    method: "GET",
    path: "/pipelines",
    operationId: "listPipelines",
    tag: "Pipelines",
    summary: "List the pipelines you can start",
    status: 200,
    response: listOf(PipelineSchema),
    handle: async ({ api, caller }) => data(await api.listPipelines(caller)),
  },
  {
    method: "POST",
    path: "/pipelines/{id}/runs",
    operationId: "startPipeline",
    tag: "Pipelines",
    summary: "Start a pipeline run",
    description: "Holds one estimate for the whole chain and starts the first step. When a step asks a person to pick, the run waits with status waiting; answer with POST /pipeline-runs/{id}/pick.",
    body: StartPipelineBody,
    idempotent: true,
    starts: true,
    status: 202,
    response: PipelineRunSchema,
    handle: ({ api, caller, params, body, idempotencyKey }) => api.startPipeline(caller, params.id, body, idempotencyKey),
  },
  {
    method: "GET",
    path: "/pipeline-runs",
    operationId: "listPipelineRuns",
    tag: "Pipelines",
    summary: "List pipeline runs, newest first",
    query: [limitQuery, { name: "pipeline", description: "Only this pipeline's runs.", schema: { type: "string" } }],
    status: 200,
    response: listOf(PipelineRunSchema),
    handle: async ({ api, caller, query }) => data(await api.listPipelineRuns(caller, { limit: query.get("limit"), pipeline: query.get("pipeline") })),
  },
  {
    method: "GET",
    path: "/pipeline-runs/{id}",
    operationId: "getPipelineRun",
    tag: "Pipelines",
    summary: "One pipeline run: every step, what waits, the package",
    status: 200,
    response: PipelineRunSchema,
    handle: ({ api, caller, params }) => api.getPipelineRun(caller, params.id),
  },
  {
    method: "POST",
    path: "/pipeline-runs/{id}/pick",
    operationId: "pickOption",
    tag: "Pipelines",
    summary: "Pick an option where a step waits",
    body: PickBody,
    status: 200,
    response: PipelineRunSchema,
    handle: ({ api, caller, params, body }) => api.pick(caller, params.id, body),
  },
  {
    method: "POST",
    path: "/pipeline-runs/{id}/cancel",
    operationId: "cancelPipelineRun",
    tag: "Pipelines",
    summary: "Stop a pipeline run",
    description: "Stops a running or waiting pipeline run. What the finished steps did not use comes back.",
    status: 200,
    response: PipelineRunSchema,
    handle: ({ api, caller, params }) => api.cancelPipelineRun(caller, params.id),
  },
  { method: "POST", path: "/pipeline-runs/{id}/approve", operationId: "approvePipelineRun", tag: "Pipelines", summary: "Not for keys", status: 403, response: PipelineRunSchema, hidden: true, handle: ({ api, caller, params }) => api.decidePipeline(caller, params.id, "approved") },
  { method: "POST", path: "/pipeline-runs/{id}/reject", operationId: "rejectPipelineRun", tag: "Pipelines", summary: "Not for keys", status: 403, response: PipelineRunSchema, hidden: true, handle: ({ api, caller, params }) => api.decidePipeline(caller, params.id, "rejected") },

  /* Brand Brains and credits */
  {
    method: "GET",
    path: "/brand-brains",
    operationId: "listBrandBrains",
    tag: "Brand Brains",
    summary: "List the workspace's Brand Brains",
    description: "Read only. Pass an id as brandBrainId when you start a run.",
    status: 200,
    response: listOf(BrandBrainSchema),
    handle: async ({ api, caller }) => data(await api.listBrandBrains(caller)),
  },
  {
    method: "GET",
    path: "/credits",
    operationId: "getCredits",
    tag: "Credits",
    summary: "The credit balance",
    description: "Read only. Keys never top up or change limits.",
    status: 200,
    response: CreditsSchema,
    handle: ({ api, caller }) => api.credits(caller),
  },
  { method: "POST", path: "/credits/top-up", operationId: "topUp", tag: "Credits", summary: "Not for keys", status: 403, response: CreditsSchema, hidden: true, handle: ({ api, caller, body }) => api.topUp(caller, (body as { credits?: unknown } | null)?.credits) },
  { method: "PUT", path: "/credits/limits", operationId: "setLimits", tag: "Credits", summary: "Not for keys", status: 403, response: CreditsSchema, hidden: true, handle: ({ api, caller, body }) => api.setLimits(caller, (body as { monthly?: unknown } | null)?.monthly) },

  /* Webhooks */
  {
    method: "GET",
    path: "/webhooks",
    operationId: "listWebhooks",
    tag: "Webhooks",
    summary: "List webhooks",
    description: "Admin keys only.",
    status: 200,
    response: listOf(WebhookSchema),
    handle: async ({ api, caller }) => data(await api.listWebhooks(caller)),
  },
  {
    method: "POST",
    path: "/webhooks",
    operationId: "createWebhook",
    tag: "Webhooks",
    summary: "Register a webhook",
    description: "Admin keys only. The answer carries the signing secret once. Deliveries are signed in Wovi-Signature (t=<seconds>,v1=<HMAC-SHA256 of t.body>) and tried again with backoff: after 10 s, 1 min, 5 min, 30 min and 2 h.",
    body: CreateWebhookBody,
    status: 201,
    response: WebhookCreatedSchema,
    handle: ({ api, caller, body }) => api.createWebhook(caller, body),
  },
  {
    method: "GET",
    path: "/webhooks/{id}",
    operationId: "getWebhook",
    tag: "Webhooks",
    summary: "One webhook",
    status: 200,
    response: WebhookSchema,
    handle: ({ api, caller, params }) => api.getWebhook(caller, params.id),
  },
  {
    method: "DELETE",
    path: "/webhooks/{id}",
    operationId: "deleteWebhook",
    tag: "Webhooks",
    summary: "Remove a webhook",
    status: 200,
    response: Deleted,
    handle: ({ api, caller, params }) => api.deleteWebhook(caller, params.id),
  },
  {
    method: "GET",
    path: "/webhooks/{id}/deliveries",
    operationId: "listDeliveries",
    tag: "Webhooks",
    summary: "The delivery log, newest first",
    query: [limitQuery],
    status: 200,
    response: listOf(DeliverySchema),
    handle: async ({ api, caller, params, query }) => data(await api.webhookDeliveries(caller, params.id, query.get("limit"))),
  },
  {
    method: "POST",
    path: "/webhooks/{id}/test",
    operationId: "testWebhook",
    tag: "Webhooks",
    summary: "Send a test delivery now",
    status: 200,
    response: DeliverySchema,
    handle: ({ api, caller, params }) => api.testWebhook(caller, params.id),
  },
];

/** Finds the route for a method and a path under /api/v1, with its params. */
export function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | { allow: string[] } | null {
  const parts = path.split("/").filter(Boolean);
  const allow: string[] = [];
  for (const route of ROUTES) {
    const want = route.path.split("/").filter(Boolean);
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < want.length; i++) {
      const m = /^\{(\w+)\}$/.exec(want[i]);
      if (m) {
        let v: string;
        try {
          v = decodeURIComponent(parts[i]);
        } catch {
          ok = false;
          break;
        }
        if (!/^[A-Za-z0-9_.-]{1,100}$/.test(v)) {
          ok = false;
          break;
        }
        params[m[1]] = v;
      } else if (want[i] !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (route.method === method) return { route, params };
    allow.push(route.method);
  }
  return allow.length ? { allow } : null;
}
