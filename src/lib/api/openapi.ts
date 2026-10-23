/**
 * The OpenAPI 3.1 document for /api/v1 (phase 14), generated from the route
 * table and the zod schemas the API itself checks and builds with. Served at
 * /api/v1/openapi.json without a key, and read by the docs page in the app.
 */
import { z } from "zod";
import { API_ERROR_CODES, CODE_WORDS, STATUS } from "./errors";
import { ROUTES } from "./routes";
import * as S from "./schemas";
import { RECEIPT_SCHEME, X402_NAMED, withX402, x402Paths } from "@/lib/x402/openapi";

/** Named schemas, as components. Anything they share is a $ref. */
const NAMED: [string, z.ZodType][] = [
  ["Agent", S.AgentSchema],
  ["InputField", S.InputFieldSchema],
  ["OutputShape", S.OutputShapeSchema],
  ["Scorecard", S.ScorecardSchema],
  ["Run", S.RunSchema],
  ["RunOutput", S.RunOutputSchema],
  ["Quality", S.QualitySchema],
  ["Charge", S.ChargeSchema],
  ["Decision", S.DecisionSchema],
  ["Pipeline", S.PipelineSchema],
  ["PipelineRun", S.PipelineRunSchema],
  ["Option", S.OptionSchema],
  ["BrandBrain", S.BrandBrainSchema],
  ["Credits", S.CreditsSchema],
  ["Me", S.MeSchema],
  ["Webhook", S.WebhookSchema],
  ["WebhookCreated", S.WebhookCreatedSchema],
  ["Delivery", S.DeliverySchema],
  ["WebhookPayload", S.WebhookPayloadSchema],
  ["Confirmations", S.ConfirmationsSchema],
  ["StartRunBody", S.StartRunBody],
  ["StartPipelineBody", S.StartPipelineBody],
  ["PickBody", S.PickBody],
  ["FeedbackBody", S.FeedbackBody],
  ["Feedback", S.FeedbackSchema],
  ["CreateWebhookBody", S.CreateWebhookBody],
  ["Issue", S.IssueSchema],
  ["Error", S.ErrorSchema],
];

type Json = Record<string, unknown>;

function strip(schema: Json): Json {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, $id, ...rest } = schema;
  return rest;
}

/** Every schema the document needs, as components, and a way to point at one. */
function components(extra: [string, z.ZodType][]): { schemas: Record<string, Json>; ref: (s: z.ZodType) => Json } {
  const reg = z.registry<{ id: string }>();
  const ids = new Map<z.ZodType, string>();
  for (const [id, schema] of [...NAMED, ...extra]) {
    if (ids.has(schema)) continue;
    reg.add(schema, { id });
    ids.set(schema, id);
  }
  const out = z.toJSONSchema(reg, { target: "draft-2020-12", uri: (id) => `#/components/schemas/${id}`, unrepresentable: "any" }) as { schemas: Record<string, Json> };
  const schemas = Object.fromEntries(Object.entries(out.schemas).map(([k, v]) => [k, strip(v)]));
  return { schemas, ref: (s) => ({ $ref: `#/components/schemas/${ids.get(s)}` }) };
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

export function openApiDocument(appUrl: string): Json {
  const visible = ROUTES.filter((r) => !r.hidden);
  // Responses like { data: Agent[] } get a name from their route: ListAgentsResponse.
  const { schemas, ref } = components([...visible.map((r): [string, z.ZodType] => [`${capital(r.operationId)}Response`, r.response]), ...X402_NAMED]);

  const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });

  const paths: Record<string, Json> = {};
  for (const r of visible) {
    const params = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const query = (r.query ?? []).map((q) => ({ name: q.name, in: "query", required: false, description: q.description, schema: q.schema }));
    const headers = r.idempotent ? [{ name: "Idempotency-Key", in: "header", required: false, description: "Any 1 to 100 letters, digits, _ . : or -. The same key with the same body returns the first run; with a different body, idempotency_conflict.", schema: { type: "string", maxLength: 100 } }] : [];
    const op: Json = {
      operationId: r.operationId,
      tags: [r.tag],
      summary: r.summary,
      ...(r.description ? { description: r.description } : {}),
      ...(params.length || query.length || headers.length ? { parameters: [...params, ...query, ...headers] } : {}),
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: ref(r.body) } } } } : {}),
      responses: {
        [String(r.status)]: { description: r.status === 202 ? "Accepted. The run is queued." : r.status === 201 ? "Made." : "OK.", content: { "application/json": { schema: ref(r.response) } } },
        "401": errorResponse(CODE_WORDS.unauthenticated),
        "404": errorResponse(CODE_WORDS.not_found),
        "429": errorResponse(CODE_WORDS.rate_limited),
        ...(r.body ? { "422": errorResponse(CODE_WORDS.invalid_input) } : {}),
        ...(r.starts ? { "402": errorResponse(`${CODE_WORDS.not_enough_credits} Or over_limit: ${CODE_WORDS.over_limit}`), "409": errorResponse(CODE_WORDS.idempotency_conflict) } : {}),
        ...(r.method !== "GET" ? { "403": errorResponse(CODE_WORDS.forbidden) } : {}),
      },
    };
    // The two starts also take x402: no key, a 402 with the price, then X-PAYMENT (phase 15).
    paths[r.path] = { ...(paths[r.path] as Json | undefined), [r.method.toLowerCase()]: r.starts ? withX402(op) : op };
  }
  Object.assign(paths, x402Paths(ref(S.PickBody)));

  return {
    openapi: "3.1.0",
    info: {
      title: "WOVI API",
      version: "1.0.0",
      description: [
        "Run WOVI's agents and pipelines from your own software. The same engine as the app: typed inputs, your Brand Brain, the quality gate, credits held and charged the same way.",
        "",
        "Authenticate with an API key from Settings, API: `Authorization: Bearer wovi_sk_...`. A key works in one workspace with one role. Keys never approve or reject results, top up credits or change limits.",
        "",
        "No key? The two start endpoints also take x402: call without Authorization, get a 402 with the price, pay on Robinhood Chain, send the call again with X-PAYMENT. See GET /x402. MCP stays on API keys.",
        "",
        `Errors: ${API_ERROR_CODES.map((c) => `\`${c}\` (${STATUS[c]})`).join(", ")}.`,
      ].join("\n"),
    },
    servers: [{ url: `${appUrl.replace(/\/$/, "")}/api/v1` }],
    security: [{ apiKey: [] }],
    tags: ["Key", "Agents", "Runs", "Pipelines", "Brand Brains", "Credits", "Webhooks", "x402"].map((name) => ({ name })),
    paths,
    webhooks: {
      "run.finished": webhookOp("A run finished: it succeeded, failed or was stopped. data.run is the run."),
      "pipeline.waiting": webhookOp("A pipeline step waits for a person to pick. data.pipelineRun.waiting has the options."),
      "pipeline.finished": webhookOp("A pipeline is ready for approval, failed or was stopped. data.pipelineRun is the run."),
    },
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", bearerFormat: "wovi_sk_...", description: "An API key from Settings, API." }, receipt: RECEIPT_SCHEME },
      schemas,
    },
  };
}

function webhookOp(description: string): Json {
  return {
    post: {
      summary: description,
      parameters: [
        { name: "Wovi-Signature", in: "header", required: true, description: "t=<unix seconds>,v1=<hex HMAC-SHA256 of `t.body` with your signing secret>. Refuse it when t is more than 5 minutes off.", schema: { type: "string" } },
        { name: "Wovi-Event", in: "header", required: true, schema: { type: "string" } },
        { name: "Wovi-Delivery", in: "header", required: true, schema: { type: "string" } },
      ],
      requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookPayload" } } } },
      responses: { "200": { description: "Any 2xx counts as delivered. Anything else is tried again with backoff." } },
    },
  };
}
