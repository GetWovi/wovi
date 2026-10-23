import { describe, expect, it } from "vitest";
import { as } from "@/lib/app/test-helpers";
import { SAMPLE_RUNS } from "@/lib/runs/samples";
import { MODEL_ROUTES } from "@/lib/agents/catalog";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { AgentSchema, ErrorSchema, MeSchema, PipelineRunSchema, RunSchema, listOf } from "./schemas";
import { toApiError } from "./errors";
import { openApiDocument } from "./openapi";
import { ROUTES } from "./routes";
import { testApi } from "./test-helpers";

const HOOK = SAMPLE_RUNS["hook-writer"].inputs;
const IDEA = "Gerald the sourdough starter turns nine on Saturday and gets his own cake";

/** Every string an agent's hidden half could leak: instructions, model ids, route ids. */
function secretsOfAgents(): string[] {
  const out = new Set<string>(["instructions", "routing", "maxCostUsd", "maxOutputTokens", "temperature"]);
  for (const r of MODEL_ROUTES) {
    out.add(r.id);
    if (r.model) out.add(r.model);
  }
  for (const a of LAUNCH_AGENTS) out.add(a.instructions.split("\n")[1].slice(0, 40));
  return [...out];
}

function expectNoSecrets(json: unknown, opts: { words?: boolean } = {}) {
  const text = JSON.stringify(json);
  for (const s of secretsOfAgents()) {
    // The docs may say in words that instructions and models stay hidden.
    if (opts.words === false && /^[a-zA-Z]+$/.test(s)) continue;
    expect(text, `leaked ${s}`).not.toContain(s);
  }
  for (const s of ['"calls"', '"model"', "costMicroUsd", "costUsd", "capMicroUsd", "tokensIn"]) expect(text, `leaked ${s}`).not.toContain(s);
}

describe("api: keys and scoping", () => {
  it("needs a live key, and answers in one error shape", async () => {
    const t = await testApi();
    const none = await t.call("GET", "/agents");
    expect(none.status).toBe(401);
    expect(none.json.error.code).toBe("unauthenticated");
    expect(none.headers.get("www-authenticate")).toContain("Bearer");
    expect(() => ErrorSchema.parse(none.json)).not.toThrow();

    expect((await t.call("GET", "/agents", { key: "wovi_sk_" + "x".repeat(43) })).status).toBe(401);
    expect((await t.call("GET", "/agents", { headers: { authorization: "Basic abc" } })).status).toBe(401);

    const key = await t.key("editor");
    const me = await t.call("GET", "/me", { key });
    expect(me.status).toBe(200);
    expect(MeSchema.parse(me.json)).toMatchObject({ workspace: { id: t.ws, name: "Team" }, key: { role: "editor" } });

    // Revoked: gone at once.
    const [row] = await t.accounts.apiKeys.list(t.ada, t.ws);
    await t.accounts.apiKeys.revoke(t.ada, t.ws, row.id);
    expect((await t.call("GET", "/me", { key })).status).toBe(401);
  });

  it("keeps a key inside its workspace: other workspaces answer not_found", async () => {
    const t = await testApi();
    await t.topUp();
    const key = await t.key("editor");
    const started = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK } });
    expect(started.status).toBe(202);
    await t.engine.waitForRun(t.ws, started.json.id);

    // Eve's own key, in her personal workspace.
    const eve = await t.accounts.getUser(t.eve.id);
    const eveKey = await t.key("admin", t.eve.id, eve!.personalWorkspaceId);
    const peek = await t.call("GET", `/runs/${started.json.id}`, { key: eveKey });
    expect(peek.status).toBe(404);
    expect(peek.json.error.code).toBe("not_found");
    expect((await t.call("POST", `/runs/${started.json.id}/cancel`, { key: eveKey })).status).toBe(404);
    expect((await t.call("GET", "/runs", { key: eveKey })).json.data).toEqual([]);
    // Eve sees no Brand Brains of the team.
    expect((await t.call("GET", "/brand-brains", { key: eveKey })).json.data).toEqual([]);
    expect((await t.call("GET", "/brand-brains", { key })).json.data.length).toBeGreaterThan(0);
  });

  it("acts with the lower of the key's role and its maker's, and stops when the maker leaves", async () => {
    const t = await testApi();
    await t.topUp();
    const viewer = await t.key("viewer");
    const refused = await t.call("POST", "/agents/hook-writer/runs", { key: viewer, body: { inputs: HOOK } });
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("forbidden");
    expect((await t.call("GET", "/agents", { key: viewer })).status).toBe(200);

    const bo = await t.join("bo@example.com", "admin");
    const boKey = await t.key("admin", bo.id);
    expect((await t.call("GET", "/me", { key: boKey })).status).toBe(200);
    await t.accounts.workspaces.setRole(t.ada, t.ws, bo.id, "viewer");
    expect((await t.call("POST", "/agents/hook-writer/runs", { key: boKey, body: { inputs: HOOK } })).status).toBe(403);
    await t.accounts.workspaces.removeMember(t.ada, t.ws, bo.id);
    expect((await t.call("GET", "/me", { key: boKey })).status).toBe(401);
  });
});

describe("api: agents are their public view only", () => {
  it("lists the live agents with form, JSON Schema, output, scorecard and estimate, and never instructions or models", async () => {
    const t = await testApi();
    const key = await t.key("admin");
    const list = await t.call("GET", "/agents", { key });
    expect(list.status).toBe(200);
    const agents = listOf(AgentSchema).parse(list.json).data;
    expect(agents.map((a) => a.id)).toContain("hook-writer");
    // Trend Scout is live since the trend lookup exists.
    expect(agents.map((a) => a.id)).toContain("trend-scout");
    const hook = agents.find((a) => a.id === "hook-writer")!;
    expect(hook.inputs.map((i) => i.key)).toEqual(["idea", "platform", "who_for", "brand"]);
    expect(hook.inputSchema).toMatchObject({ type: "object", required: ["idea", "platform"], properties: { idea: { type: "string", minLength: 10, maxLength: 600 }, platform: { enum: expect.arrayContaining(["tiktok", "x"]) } } });
    expect(hook.output).toEqual({ kind: "list", count: 10, maxWordsPerItem: 12 });
    expect(hook.quality.bar).toBe(70);
    expect(hook.quality.scorecard.isNew).toBe(true);
    expect(hook.estimate.credits).toBeGreaterThan(0);
    expectNoSecrets(list.json);

    const one = await t.call("GET", "/agents/hook-writer", { key });
    expect(AgentSchema.parse(one.json).id).toBe("hook-writer");
    expectNoSecrets(one.json);
    expect((await t.call("GET", "/agents/trend-scout", { key })).status).toBe(200);
    expect((await t.call("GET", "/agents/nope", { key })).status).toBe(404);
  });
});

describe("api: runs", () => {
  it("runs an agent end to end on the fake provider: held, charged, gated, typed", async () => {
    const t = await testApi();
    await t.topUp(1000);
    const admin = await t.key("admin");
    const editor = await t.key("editor");
    const before = (await t.call("GET", "/credits", { key: admin })).json;
    expect(before.available).toBe(1000);

    const started = await t.call("POST", "/agents/hook-writer/runs", { key: editor, body: { inputs: HOOK, idea: "Open on the 6 a.m. door" } });
    expect(started.status).toBe(202);
    expect(started.headers.get("location")).toBe(`/api/v1/runs/${started.json.id}`);
    expect(["queued", "running"]).toContain(started.json.status);
    expect(RunSchema.parse(started.json).agent).toMatchObject({ id: "hook-writer", name: "Hook Writer" });

    await t.engine.waitForRun(t.ws, started.json.id);
    const asEditor = await t.call("GET", `/runs/${started.json.id}`, { key: editor });
    const run = RunSchema.parse(asEditor.json);
    expect(run.status).toBe("succeeded");
    expect(run.output?.kind).toBe("list");
    expect((run.output as unknown as { items: string[] }).items).toHaveLength(10);
    expect(run.quality).toMatchObject({ bar: 70, verdict: expect.stringMatching(/ready|needs_review/) });
    expect(run.quality!.checks.length).toBeGreaterThan(3);
    expect(run.brandBrain).not.toBeNull();
    // Editors do not see costs; admins do.
    expect(run.charge).toBeNull();
    const asAdmin = RunSchema.parse((await t.call("GET", `/runs/${run.id}`, { key: admin })).json);
    expect(asAdmin.charge).toMatchObject({ state: "charged" });
    expect(asAdmin.charge!.charged).toBeGreaterThan(0);
    expectNoSecrets(asAdmin);

    const after = (await t.call("GET", "/credits", { key: editor })).json;
    expect(after.available).toBe(1000 - asAdmin.charge!.charged!);
    expect(after.held).toBe(0);
    expect(run.sources).toEqual([]);

    // Trend Scout's run carries the pages its lookup found.
    const scout = await t.call("POST", "/agents/trend-scout/runs", { key: editor, body: { inputs: { niche: "small bakery", platform: "tiktok" } } });
    expect(scout.status).toBe(202);
    await t.engine.waitForRun(t.ws, scout.json.id);
    const scoutRun = RunSchema.parse((await t.call("GET", `/runs/${scout.json.id}`, { key: editor })).json);
    expect(scoutRun.status).toBe("succeeded");
    expect(scoutRun.sources.length).toBeGreaterThanOrEqual(5);
    expect(scoutRun.sources[0]).toMatchObject({ url: expect.stringMatching(/^https:\/\//), searchedAt: expect.any(String) });

    const list = await t.call("GET", "/runs?limit=5&status=succeeded&agent=hook-writer", { key: editor });
    expect(listOf(RunSchema).parse(list.json).data.map((r) => r.id)).toEqual([run.id]);
    expect((await t.call("GET", "/runs?status=done", { key: editor })).json.error.issues[0].path).toBe("status");
    expect((await t.call("GET", "/runs?limit=500", { key: editor })).json.error.issues[0].path).toBe("limit");

    // The run is the app's like any other: in History, with its maker recorded for review.
    const history = await t.app.runs(t.ada, t.ws);
    expect(history.map((h) => h.run.id)).toContain(run.id);
  });

  it("starts one run per Idempotency-Key, and refuses the same key with another body", async () => {
    const t = await testApi();
    await t.topUp(1000);
    const key = await t.key("editor");
    const headers = { "idempotency-key": "order-42" };
    const [a, b] = await Promise.all([t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK }, headers }), t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK }, headers })]);
    expect(a.status).toBe(202);
    expect(b.json.id).toBe(a.json.id);
    await t.engine.idle();
    expect((await t.call("GET", "/runs", { key })).json.data).toHaveLength(1);
    // One hold only.
    const holds = (await t.credits!.entries(t.ws)).filter((e) => e.kind === "hold");
    expect(holds).toHaveLength(1);

    const other = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: { ...HOOK, platform: "x" } }, headers });
    expect(other.status).toBe(409);
    expect(other.json.error.code).toBe("idempotency_conflict");
    const bad = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK }, headers: { "idempotency-key": "no spaces allowed" } });
    expect(bad.status).toBe(422);
    expect(bad.json.error.issues[0].path).toBe("Idempotency-Key");
  });

  it("cancels a run and gives every credit back", async () => {
    const t = await testApi({ fake: { latencyMs: 400 } });
    await t.topUp(1000);
    const key = await t.key("admin");
    const started = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK } });
    expect((await t.call("GET", "/credits", { key })).json.held).toBeGreaterThan(0);
    const cancelled = await t.call("POST", `/runs/${started.json.id}/cancel`, { key });
    expect(cancelled.status).toBe(200);
    expect(cancelled.json.status).toBe("cancelled");
    expect(cancelled.json.charge.state).toBe("refunded");
    await t.engine.idle();
    const c = (await t.call("GET", "/credits", { key })).json;
    expect(c).toMatchObject({ available: 1000, held: 0 });
    // Cancelling again changes nothing.
    expect((await t.call("POST", `/runs/${started.json.id}/cancel`, { key })).json.status).toBe("cancelled");
  });
});

describe("api: pipelines", () => {
  it("runs Idea to ready post through a pick to the package, and keys cannot approve it", async () => {
    const t = await testApi();
    await t.topUp(5000);
    const key = await t.key("editor");
    const crumb = (await t.call("GET", "/brand-brains", { key })).json.data.find((b: { name: string }) => b.name === "Crumb and Co");

    const pipelines = await t.call("GET", "/pipelines", { key });
    const idea = pipelines.json.data.find((p: { id: string }) => p.id === "idea-to-post");
    expect(idea.steps.map((s: { agent: { id: string } }) => s.agent.id)).toEqual(["idea-generator", "hook-writer", "script-writer", "caption-writer", "hashtag-picker"]);
    expect(idea.estimate.credits).toBeGreaterThan(0);
    expectNoSecrets(pipelines.json);

    const started = await t.call("POST", "/pipelines/idea-to-post/runs", { key, body: { inputs: { start: "my_idea", idea: IDEA, platform: "tiktok", length: "s30" }, brandBrainId: crumb.id }, headers: { "idempotency-key": "pipe-1" } });
    expect(started.status).toBe(202);
    expect(started.headers.get("location")).toBe(`/api/v1/pipeline-runs/${started.json.id}`);
    await t.pipelineEngine.waitUntilSettled(t.ws, started.json.id);

    const waiting = PipelineRunSchema.parse((await t.call("GET", `/pipeline-runs/${started.json.id}`, { key })).json);
    expect(waiting.status).toBe("waiting");
    expect(waiting.brandBrain?.name).toBe("Crumb and Co");
    expect(waiting.waiting).toMatchObject({ step: "hooks", prompt: "Pick the hook you like best" });
    expect(waiting.waiting!.options).toHaveLength(10);
    expect(waiting.waiting!.options[3].index).toBe(3);

    const tooFar = await t.call("POST", `/pipeline-runs/${waiting.id}/pick`, { key, body: { index: 10 } });
    expect(tooFar.status).toBe(422);
    expect(tooFar.json.error.issues).toEqual([{ path: "index", message: "Pick from 0 to 9." }]);
    expect((await t.call("POST", `/pipeline-runs/${waiting.id}/pick`, { key, body: { step: "script", index: 0 } })).json.error.code).toBe("not_ready");

    const picked = await t.call("POST", `/pipeline-runs/${waiting.id}/pick`, { key, body: { step: "hooks", index: 2 } });
    expect(picked.status).toBe(200);
    await t.pipelineEngine.waitUntilSettled(t.ws, waiting.id);
    const ready = PipelineRunSchema.parse((await t.call("GET", `/pipeline-runs/${waiting.id}`, { key })).json);
    expect(ready.status).toBe("ready");
    expect(ready.steps.find((s) => s.id === "hooks")!.picked).toEqual({ index: 2, by: "person" });
    expect(ready.package!.map((p) => p.step)).toEqual(["hooks", "script", "caption", "tags"]);
    expect(ready.waiting).toBeNull();
    expect((await t.call("POST", `/pipeline-runs/${waiting.id}/pick`, { key, body: { index: 0 } })).json.error.code).toBe("not_ready");

    // People approve. A key never does, whatever its role.
    const admin = await t.key("admin");
    const approve = await t.call("POST", `/pipeline-runs/${waiting.id}/approve`, { key: admin });
    expect(approve.status).toBe(403);
    expect(approve.json.error.code).toBe("forbidden");
    expect((await t.call("GET", `/pipeline-runs/${waiting.id}`, { key })).json.status).toBe("ready");
    expect((await t.call("GET", "/pipeline-runs?pipeline=idea-to-post", { key })).json.data).toHaveLength(1);
  });

  it("cancels a waiting pipeline run", async () => {
    const t = await testApi();
    await t.topUp(5000);
    const key = await t.key("editor");
    const started = await t.call("POST", "/pipelines/caption-and-tags/runs", { key, body: { inputs: { post: "Time-lapse of Gerald, our nine-year-old sourdough starter, rising overnight.", platform: "tiktok" } } });
    expect(started.status).toBe(202);
    await t.pipelineEngine.waitUntilSettled(t.ws, started.json.id);
    expect((await t.call("GET", `/pipeline-runs/${started.json.id}`, { key })).json.status).toBe("waiting");
    const cancelled = await t.call("POST", `/pipeline-runs/${started.json.id}/cancel`, { key });
    expect(cancelled.json.status).toBe("cancelled");
  });
});

describe("api: errors and codes", () => {
  it("names each field that needs a look, and every other refusal by its code", async () => {
    const t = await testApi();
    const key = await t.key("editor");
    // No credits yet.
    const broke = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK } });
    expect(broke.status).toBe(402);
    expect(broke.json.error.code).toBe("not_enough_credits");
    await t.topUp(1000);

    const short = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: { idea: "short", platform: "fax" } } });
    expect(short.status).toBe(422);
    expect(short.json.error.code).toBe("invalid_input");
    expect(short.json.error.issues.map((i: { path: string }) => i.path)).toEqual(["inputs.idea", "inputs.platform"]);

    const unknown = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK, model: "anthropic/claude" } });
    expect(unknown.json.error).toMatchObject({ code: "invalid_input", issues: [{ path: "body", message: "Unknown field: model." }] });
    const noInputs = await t.call("POST", "/agents/hook-writer/runs", { key, body: {} });
    expect(noInputs.json.error.issues).toEqual([{ path: "inputs", message: "Required." }]);
    const brain = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK, brandBrainId: "bb_nope" } });
    expect(brain.json.error.issues[0].path).toBe("brandBrainId");
    const rights = await t.call("POST", "/agents/repurposer/runs", { key, body: { inputs: { post: "We stopped taking wedding cake orders so the bakery could open at 6 a.m. again.", posted_on: "tiktok", to: "x" } } });
    expect(rights.json.error).toMatchObject({ code: "invalid_input", issues: [{ path: "confirmations" }] });

    const badJson = await t.call("POST", "/agents/hook-writer/runs", { key, body: "{ not json" });
    expect(badJson.status).toBe(400);
    expect(badJson.json.error.code).toBe("invalid_request");
    expect((await t.call("POST", "/agents/nope/runs", { key, body: { inputs: HOOK } })).json.error.code).toBe("not_found");
    expect((await t.call("GET", "/nothing-here", { key })).status).toBe(404);
    const wrong = await t.call("DELETE", "/agents", { key });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("GET");

    const big = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: { idea: "x".repeat(200 * 1024) } } });
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe("payload_too_large");
    for (const r of [short, unknown, badJson, big, wrong]) expect(() => ErrorSchema.parse(r.json)).not.toThrow();
  });

  it("never lets a key top up, change limits, approve or reject", async () => {
    const t = await testApi();
    await t.topUp(1000);
    const admin = await t.key("admin");
    const topUp = await t.call("POST", "/credits/top-up", { key: admin, body: { credits: 500 } });
    expect(topUp.status).toBe(403);
    expect(topUp.json.error.code).toBe("forbidden");
    expect((await t.call("PUT", "/credits/limits", { key: admin, body: { monthly: 1 } })).status).toBe(403);
    expect((await t.call("GET", "/credits", { key: admin })).json.available).toBe(1000);

    const run = await t.call("POST", "/agents/hook-writer/runs", { key: admin, body: { inputs: HOOK } });
    await t.engine.waitForRun(t.ws, run.json.id);
    for (const verb of ["approve", "reject"]) {
      const r = await t.call("POST", `/runs/${run.json.id}/${verb}`, { key: admin });
      expect(r.status).toBe(403);
    }
    expect((await t.call("GET", `/runs/${run.json.id}`, { key: admin })).json.decision).toBeNull();
    // A person can, and the key reads the decision.
    await t.app.review(t.ada, t.ws, run.json.id, "approved", "Good");
    expect((await t.call("GET", `/runs/${run.json.id}`, { key: admin })).json.decision).toMatchObject({ decision: "approved", note: "Good" });
  });
});

describe("api: rate limits", () => {
  it("limits each key and each workspace, says how long to wait, and opens again after the window", async () => {
    const t = await testApi({ limits: { perKey: { max: 3, windowMs: 60_000 }, perWorkspace: { max: 5, windowMs: 60_000 } } });
    const a = await t.key("editor");
    const b = await t.key("viewer");
    const first = await t.call("GET", "/me", { key: a });
    expect(first.headers.get("ratelimit-limit")).toBe("3");
    expect(first.headers.get("ratelimit-remaining")).toBe("2");
    await t.call("GET", "/me", { key: a });
    await t.call("GET", "/me", { key: a });
    const limited = await t.call("GET", "/me", { key: a });
    expect(limited.status).toBe(429);
    expect(limited.json.error.code).toBe("rate_limited");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(limited.json.error.retryAfter).toBeGreaterThan(0);

    // The workspace's own limit counts every key: b gets two more, then the workspace is full.
    expect((await t.call("GET", "/me", { key: b })).status).toBe(200);
    expect((await t.call("GET", "/me", { key: b })).status).toBe(200);
    expect((await t.call("GET", "/me", { key: b })).json.error.message).toContain("workspace");

    t.advance(61_000);
    expect((await t.call("GET", "/me", { key: a })).status).toBe(200);
  });

  it("limits run starts per key and unknown keys per address", async () => {
    const t = await testApi({ limits: { startsPerKey: { max: 1, windowMs: 60_000 }, badKeysPerIp: { max: 2, windowMs: 60_000 } } });
    await t.topUp(1000);
    const key = await t.key("editor");
    expect((await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK } })).status).toBe(202);
    const second = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK } });
    expect(second.status).toBe(429);
    expect(second.json.error.message).toContain("started too many runs");
    expect((await t.call("GET", "/runs", { key })).status).toBe(200);

    const guess = "wovi_sk_" + "a".repeat(43);
    const ip = { "x-forwarded-for": "203.0.113.9" };
    expect((await t.call("GET", "/me", { key: guess, headers: ip })).status).toBe(401);
    expect((await t.call("GET", "/me", { key: guess, headers: ip })).status).toBe(401);
    expect((await t.call("GET", "/me", { key: guess, headers: ip })).status).toBe(429);
    await t.engine.idle();
  });
});

describe("api: the OpenAPI document", () => {
  it("is generated from the same schemas and routes, served without a key", async () => {
    const t = await testApi();
    const res = await t.call("GET", "/openapi.json");
    expect(res.status).toBe(200);
    const doc = res.json;
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe("http://localhost:3900/api/v1");
    expect(doc.components.securitySchemes.apiKey).toMatchObject({ type: "http", scheme: "bearer" });
    // Every public route is in it, and none of the forbidden-only ones.
    for (const r of ROUTES) {
      const op = doc.paths[r.path]?.[r.method.toLowerCase()];
      if (r.hidden) expect(op, `${r.method} ${r.path}`).toBeUndefined();
      else expect(op?.operationId, `${r.method} ${r.path}`).toBe(r.operationId);
    }
    expect(doc.paths["/agents/{id}/runs"].post.requestBody.content["application/json"].schema).toEqual({ $ref: "#/components/schemas/StartRunBody" });
    expect(doc.paths["/agents/{id}/runs"].post.parameters.map((p: { name: string }) => p.name)).toEqual(["id", "Idempotency-Key"]);
    expect(doc.paths["/agents/{id}/runs"].post.responses["202"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/Run" });
    expect(doc.paths["/agents"].get.responses["200"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/ListAgentsResponse" });
    expect(doc.components.schemas.ListAgentsResponse.properties.data.items).toEqual({ $ref: "#/components/schemas/Agent" });
    expect(doc.components.schemas.StartRunBody.required).toEqual(["inputs"]);
    expect(doc.components.schemas.StartRunBody.additionalProperties).toBe(false);
    expect(doc.components.schemas.Error.properties.error.properties.code.enum).toContain("not_enough_credits");
    expect(Object.keys(doc.webhooks)).toEqual(["run.finished", "pipeline.waiting", "pipeline.finished"]);
    // Every $ref points at a schema that exists.
    const refs = JSON.stringify(doc).match(/#\/components\/schemas\/[A-Za-z0-9]+/g) ?? [];
    for (const r of new Set(refs)) expect(doc.components.schemas[r.split("/").pop()!], r).toBeDefined();
    expectNoSecrets(doc, { words: false });
    expect((openApiDocument("https://wovi.app/") as { servers: { url: string }[] }).servers[0].url).toBe("https://wovi.app/api/v1");
  });
});

describe("api: errors from another bundle", () => {
  it("maps errors by their class name, since Next.js bundles each route with its own copy of the classes", () => {
    const foreign = (name: string, code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error("From elsewhere"), { name, code, issues: [], ...extra });
    expect(toApiError(foreign("AccountError", "forbidden")).code).toBe("forbidden");
    expect(toApiError(foreign("AccountError", "rate_limited", { retryAfterSec: 7 })).retryAfterSec).toBe(7);
    expect(toApiError(foreign("RunError", "invalid_input", { issues: ["idea: Required."] })).issues).toEqual([{ path: "inputs.idea", message: "Required." }]);
    expect(toApiError(foreign("AppError", "invalid_request", { cause: foreign("RunError", "not_enough_credits") })).code).toBe("not_enough_credits");
    expect(toApiError(foreign("PipelineError", "not_ready")).code).toBe("not_ready");
    expect(toApiError(new Error("boom")).code).toBe("internal_error");
    expect(toApiError(new Error("boom")).message).not.toContain("boom");
  });
});

describe("api: keys stay secret", () => {
  it("never writes a key into a response or a log line", async () => {
    const lines: string[] = [];
    const t = await testApi();
    const key = await t.key("editor");
    const rest = new (t.rest.constructor as typeof import("./rest").RestApi)({ api: t.api, accounts: t.accounts, appUrl: "http://localhost:3900", log: (l) => lines.push(l) });
    const res = await rest.handle(new Request("http://localhost:3900/api/v1/me", { headers: { authorization: `Bearer ${key}` } }));
    expect(await res.text()).not.toContain(key);
    const bad = await rest.handle(new Request("http://localhost:3900/api/v1/me", { headers: { authorization: `Bearer ${key}x` } }));
    expect(await bad.text()).not.toContain(key);
    expect(lines.join("\n")).not.toContain("wovi_sk_");
    // Stored as a hash only.
    expect(JSON.stringify(await t.accounts.store.apiKeys.find())).not.toContain(key);
    expect(as).toBeTypeOf("function");
  });
});
