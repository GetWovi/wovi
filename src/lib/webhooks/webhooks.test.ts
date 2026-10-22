import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliverySchema, RunSchema, WebhookCreatedSchema, WebhookPayloadSchema, WebhookSchema, listOf } from "@/lib/api/schemas";
import { testApi } from "@/lib/api/test-helpers";
import { SAMPLE_RUNS } from "@/lib/runs/samples";
import { checkWebhookUrl, devWebhookSender, httpWebhookSender } from "./sender";
import { openSecret, sealSecret, signatureHeader, verifySignature } from "./signing";
import { RETRY_DELAYS_MS } from "./webhooks";

const HOOK = SAMPLE_RUNS["hook-writer"].inputs;
const CLIP = { post: "Time-lapse of Gerald, our nine-year-old sourdough starter, rising overnight.", platform: "tiktok" };

afterEach(() => vi.restoreAllMocks());

async function withHook(opts: Parameters<typeof testApi>[0] = {}, events = ["run.finished", "pipeline.waiting", "pipeline.finished"]) {
  const t = await testApi(opts);
  await t.topUp(5000);
  const admin = await t.key("admin");
  const made = await t.call("POST", "/webhooks", { key: admin, body: { url: "https://hooks.example.com/wovi", events, description: "Our CRM" } });
  return { ...t, admin, hook: made.json as { id: string; secret: string }, made };
}

describe("webhooks: registering", () => {
  it("lets owners, admins and admin keys register a URL, shows the secret once and keeps it sealed", async () => {
    const t = await withHook();
    expect(t.made.status).toBe(201);
    const created = WebhookCreatedSchema.parse(t.made.json);
    expect(created.secret).toMatch(/^whsec_/);
    expect(created.secretHint).toBe(`whsec_...${created.secret.slice(-4)}`);

    const list = await t.call("GET", "/webhooks", { key: t.admin });
    const rows = listOf(WebhookSchema).parse(list.json).data;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(list.json)).not.toContain(created.secret);
    expect(JSON.stringify(await t.webhooks["o"].store.endpoints.find())).not.toContain(created.secret);

    // Editors and viewers cannot; other workspaces see nothing.
    const editor = await t.key("editor");
    expect((await t.call("GET", "/webhooks", { key: editor })).status).toBe(403);
    expect((await t.call("POST", "/webhooks", { key: editor, body: { url: "https://x.example.com", events: ["run.finished"] } })).status).toBe(403);
    const eve = await t.accounts.getUser(t.eve.id);
    const eveKey = await t.key("admin", t.eve.id, eve!.personalWorkspaceId);
    expect((await t.call("GET", `/webhooks/${created.id}`, { key: eveKey })).status).toBe(404);
    expect((await t.call("DELETE", `/webhooks/${created.id}`, { key: eveKey })).status).toBe(404);

    // People manage them too, and rotate the secret.
    const rotated = await t.webhooks.rotateSecret(t.ada, t.ws, created.id);
    expect(rotated.secret).not.toBe(created.secret);
    expect((await t.webhooks.list(t.ada, t.ws))[0].secretHint).toBe(`whsec_...${rotated.secret.slice(-4)}`);
  });

  it("checks the URL and the events, with the field paths", async () => {
    const t = await withHook();
    const bad = async (body: unknown) => (await t.call("POST", "/webhooks", { key: t.admin, body })).json.error;
    expect((await bad({ url: "http://hooks.example.com", events: ["run.finished"] })).issues[0]).toMatchObject({ path: "url" });
    expect((await bad({ url: "ftp://hooks.example.com", events: ["run.finished"] })).issues[0]).toMatchObject({ path: "url" });
    expect((await bad({ url: "https://user:pw@hooks.example.com", events: ["run.finished"] })).issues[0].message).toContain("password");
    expect((await bad({ url: "https://hooks.example.com", events: ["run.started"] })).issues[0]).toMatchObject({ path: "events.0" });
    expect((await bad({ url: "https://hooks.example.com", events: [] })).issues[0]).toMatchObject({ path: "events" });
    // Locally, plain http to this machine works for testing.
    expect((await t.call("POST", "/webhooks", { key: t.admin, body: { url: "http://localhost:4000/hook", events: ["run.finished"] } })).status).toBe(201);

    expect(checkWebhookUrl("http://localhost:4000", { local: false })).toContain("https");
    expect(checkWebhookUrl("https://10.0.0.4/hook", { local: false })).toContain("private");
    expect(checkWebhookUrl("https://192.168.1.2/hook", { local: false })).toContain("private");
    expect(checkWebhookUrl("https://metadata.internal/hook", { local: false })).toContain("private");
    expect(checkWebhookUrl("https://hooks.example.com/x", { local: false })).toBeNull();
  });
});

describe("webhooks: deliveries", () => {
  it("sends run.finished signed with the endpoint's secret, with the run as the API shows it", async () => {
    const t = await withHook();
    const key = await t.key("editor");
    const run = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK } });
    await t.engine.waitForRun(t.ws, run.json.id);
    await t.webhooks.idle();

    expect(t.sender.sent).toHaveLength(1);
    const req = t.sender.sent[0];
    expect(req.url).toBe("https://hooks.example.com/wovi");
    expect(req.headers["Wovi-Event"]).toBe("run.finished");
    const now = Math.floor(t.clock.t / 1000);
    expect(verifySignature(t.hook.secret, req.headers["Wovi-Signature"], req.body, now)).toBe(true);
    expect(verifySignature(t.hook.secret, req.headers["Wovi-Signature"], req.body.replace("succeeded", "failed"), now)).toBe(false);
    expect(verifySignature("whsec_other", req.headers["Wovi-Signature"], req.body, now)).toBe(false);
    expect(verifySignature(t.hook.secret, req.headers["Wovi-Signature"], req.body, now + 3600)).toBe(false);

    const payload = WebhookPayloadSchema.parse(JSON.parse(req.body));
    expect(payload).toMatchObject({ type: "run.finished", workspaceId: t.ws });
    const sent = RunSchema.parse(payload.data.run);
    expect(sent).toMatchObject({ id: run.json.id, status: "succeeded", agent: { name: "Hook Writer" } });
    expect(req.body).not.toContain("instructions");

    const log = await t.call("GET", `/webhooks/${t.hook.id}/deliveries`, { key: t.admin });
    const [d] = listOf(DeliverySchema).parse(log.json).data;
    expect(d).toMatchObject({ type: "run.finished", status: "delivered", attempts: [{ n: 1, status: 200, sender: "memory" }] });

    // The same event reported again (a restart, a second save) lands once.
    const raw = (await t.engine.getRun(t.ws, run.json.id))!;
    await t.webhooks.dispatch(t.ws, "run.finished", `run.finished:${raw.id}`, { run: sent });
    await t.webhooks.idle();
    expect(t.sender.sent).toHaveLength(1);
  });

  it("tries again with backoff, logs every try, and stops after the last", async () => {
    let fails = 2;
    const t = await withHook({ respond: () => (fails-- > 0 ? 500 : 200) });
    const key = await t.key("editor");
    const run = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK } });
    await t.engine.waitForRun(t.ws, run.json.id);
    await t.webhooks.idle();

    let [d] = await t.webhooks.deliveries(t.ada, t.ws, t.hook.id);
    expect(d.status).toBe("pending");
    expect(d.attempts[0]).toMatchObject({ n: 1, status: 500, error: "The endpoint answered 500." });
    expect(Date.parse(d.nextAttemptAt!) - t.clock.t).toBe(RETRY_DELAYS_MS[0]);

    // Not due yet.
    expect(await t.webhooks.runDue()).toBe(0);
    t.advance(RETRY_DELAYS_MS[0]);
    expect(await t.webhooks.runDue()).toBe(1);
    [d] = await t.webhooks.deliveries(t.ada, t.ws, t.hook.id);
    expect(d.attempts.map((a) => a.status)).toEqual([500, 500]);
    expect(Date.parse(d.nextAttemptAt!) - t.clock.t).toBe(RETRY_DELAYS_MS[1]);
    t.advance(RETRY_DELAYS_MS[1]);
    await t.webhooks.runDue();
    [d] = await t.webhooks.deliveries(t.ada, t.ws, t.hook.id);
    expect(d).toMatchObject({ status: "delivered", nextAttemptAt: null });
    expect(d.attempts.map((a) => a.status)).toEqual([500, 500, 200]);
    // Every try is signed again, with its own time.
    expect(t.sender.sent).toHaveLength(3);
    expect(new Set(t.sender.sent.map((r) => r.headers["Wovi-Delivery"])).size).toBe(1);

    const down = await withHook({ respond: () => new Error("Could not connect.") });
    const k2 = await down.key("editor");
    const r2 = await down.call("POST", "/agents/hook-writer/runs", { key: k2, body: { inputs: HOOK } });
    await down.engine.waitForRun(down.ws, r2.json.id);
    await down.webhooks.idle();
    for (const wait of RETRY_DELAYS_MS) {
      down.advance(wait);
      await down.webhooks.runDue();
    }
    const [gone] = await down.webhooks.deliveries(down.ada, down.ws, down.hook.id);
    expect(gone.status).toBe("failed");
    expect(gone.attempts).toHaveLength(RETRY_DELAYS_MS.length + 1);
    expect(gone.attempts[0]).toMatchObject({ status: null, error: "Could not connect." });
    down.advance(10 * 3_600_000);
    expect(await down.webhooks.runDue()).toBe(0);
  });

  it("sends pipeline.waiting when a step waits for a pick and pipeline.finished when it is ready, and nothing for step runs", async () => {
    const t = await withHook({}, ["pipeline.waiting", "pipeline.finished"]);
    const key = await t.key("editor");
    const started = await t.call("POST", "/pipelines/caption-and-tags/runs", { key, body: { inputs: CLIP } });
    await t.pipelineEngine.waitUntilSettled(t.ws, started.json.id);
    await t.webhooks.idle();
    expect(t.sender.sent.map((r) => r.headers["Wovi-Event"])).toEqual(["pipeline.waiting"]);
    const waiting = WebhookPayloadSchema.parse(JSON.parse(t.sender.sent[0].body));
    expect(waiting.data.pipelineRun?.waiting?.step).toBe("caption");

    await t.call("POST", `/pipeline-runs/${started.json.id}/pick`, { key, body: { index: 1 } });
    await t.pipelineEngine.waitUntilSettled(t.ws, started.json.id);
    await t.pipelineEngine.idle();
    await t.webhooks.idle();
    expect(t.sender.sent.map((r) => r.headers["Wovi-Event"])).toEqual(["pipeline.waiting", "pipeline.finished"]);
    const done = WebhookPayloadSchema.parse(JSON.parse(t.sender.sent[1].body));
    expect(done.data.pipelineRun?.status).toBe("ready");
    expect(done.data.pipelineRun?.package?.length).toBeGreaterThan(0);
  });

  it("stops when the endpoint is paused or its maker can no longer manage webhooks, and sends a ping on request", async () => {
    const t = await testApi();
    await t.topUp(5000);
    const bo = await t.join("bo@example.com", "admin");
    const made = await t.webhooks.create({ kind: "user", userId: bo.id }, t.ws, { url: "https://hooks.example.com/bo", events: ["run.finished"] });
    const key = await t.key("editor");
    const go = async () => {
      const r = await t.call("POST", "/agents/hook-writer/runs", { key, body: { inputs: HOOK } });
      await t.engine.waitForRun(t.ws, r.json.id);
      await t.webhooks.idle();
    };
    await go();
    expect(t.sender.sent).toHaveLength(1);
    await t.webhooks.setPaused(t.ada, t.ws, made.endpoint.id, true);
    await go();
    expect(t.sender.sent).toHaveLength(1);
    await t.webhooks.setPaused(t.ada, t.ws, made.endpoint.id, false);
    await t.accounts.workspaces.setRole(t.ada, t.ws, bo.id, "editor");
    await go();
    expect(t.sender.sent).toHaveLength(1);

    const admin = await t.key("admin");
    const ping = await t.call("POST", `/webhooks/${made.endpoint.id}/test`, { key: admin });
    expect(DeliverySchema.parse(ping.json)).toMatchObject({ type: "ping", status: "delivered" });
    expect(t.sender.sent).toHaveLength(2);
    expect((await t.call("DELETE", `/webhooks/${made.endpoint.id}`, { key: admin })).json).toEqual({ deleted: true, id: made.endpoint.id });
    expect((await t.call("GET", "/webhooks", { key: admin })).json.data).toEqual([]);
  });
});

describe("webhooks: senders and signing", () => {
  it("the dev sender logs and saves a delivery and never opens a connection", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const dir = mkdtempSync(join(tmpdir(), "wovi-hooks-"));
    const lines: string[] = [];
    try {
      const dev = devWebhookSender(dir, (l) => lines.push(l));
      const res = await dev.send({ url: "https://hooks.example.com", headers: { "Wovi-Event": "ping", "Wovi-Delivery": "dlv_1", "Wovi-Signature": "t=1,v1=ab" }, body: JSON.stringify({ hello: true }) });
      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(lines[0]).toContain("logged, not sent");
      const saved = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), "utf8"));
      expect(saved.body).toEqual({ hello: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the HTTP sender refuses inside addresses off this machine, and seals, signs and verifies", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const http = httpWebhookSender({ local: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await http.send({ url: "https://10.1.2.3/x", headers: {}, body: "{}" })).error).toContain("private");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await http.send({ url: "https://hooks.example.com/x", headers: {}, body: "{}" })).status).toBe(204);
    expect(fetchImpl).toHaveBeenCalledWith("https://hooks.example.com/x", expect.objectContaining({ method: "POST", redirect: "manual" }));

    const sealed = sealSecret("server-secret-server-secret-server-secret", "whsec_abc");
    expect(sealed).not.toContain("whsec_abc");
    expect(openSecret("server-secret-server-secret-server-secret", sealed)).toBe("whsec_abc");
    expect(() => openSecret("another-secret-another-secret-another-sec", sealed)).toThrow();
    const header = signatureHeader("whsec_abc", "{}", 1000);
    expect(verifySignature("whsec_abc", header, "{}", 1100)).toBe(true);
    expect(verifySignature("whsec_abc", header, "{}", 1000 + 301)).toBe(false);
    expect(verifySignature("whsec_abc", "garbage", "{}", 1000)).toBe(false);
  });
});
