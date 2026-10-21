import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { goodSpec } from "@/lib/agents/test-helpers";
import { stubBrandBrains } from "./brand-brain";
import { RunEngine } from "./engine";
import { defaultAnswer, fakeProvider } from "./providers/fake";
import { ProviderError, type CompletionRequest, type ModelProvider } from "./providers/types";
import type { RunQueue } from "./queue";
import { publicRunView } from "./run";
import { SAMPLE_RUNS } from "./samples";
import { jsonFileRunStore } from "./store";
import { WS, goodRequest, rejectsWith, testEngine } from "./test-helpers";

const SONNET = "anthropic/claude-sonnet-5.5";
const LUNA = "openai/gpt-6-luna";

const until = async (fn: () => Promise<boolean>, ms = 2000) => {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 2));
  }
};

/** A reply that never comes until the request is aborted. */
const hang = (req: CompletionRequest) =>
  new Promise<never>((_, reject) => req.signal.addEventListener("abort", () => reject(new ProviderError("aborted", "aborted"))));

const good = (req: CompletionRequest) => defaultAnswer(req);

describe("run engine: submit", () => {
  it("runs an agent and records everything about the run", async () => {
    const { engine } = await testEngine();
    const queued = await engine.submitRun(goodRequest());
    expect(queued).toMatchObject({ status: "queued", workspaceId: WS, agent: { workspaceId: WS, id: "test-agent", version: "1.0.0" }, attempts: 0 });

    const run = await engine.waitForRun(WS, queued.id);
    expect(run.status).toBe("succeeded");
    expect(run.attempts).toBe(1);
    expect(run.output?.kind).toBe("list");
    expect(run.output && "items" in run.output && run.output.items).toHaveLength(3);
    expect(run.brandBrain).toMatchObject({ id: "bb_default", parts: ["voice"] });
    expect(run.model).toEqual({ route: "text-standard", provider: "fake", model: SONNET });
    expect(run.calls).toHaveLength(1);
    expect(run.tokensIn).toBeGreaterThan(0);
    expect(run.costMicroUsd).toBe(run.tokensIn * 2 + run.tokensOut * 10);
    expect(run.costUsd).toBe(run.costMicroUsd / 1e6);
    expect(run.capMicroUsd).toBe(50_000);
    expect(run.timings.startedAt).not.toBeNull();
    expect(run.timings.finishedAt).not.toBeNull();
    expect(run.checks.map((c) => c.guardrail)).toEqual(["no_misleading_claims"]);
    expect(run.needsReview).toBe(false);
  });

  it("pins the exact version asked for, even after a newer one is saved", async () => {
    const { engine, registry } = await testEngine();
    await registry.update(WS, "test-agent", { name: "Test Agent Two" });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest({ version: "1.0.0" }))).id);
    expect(run.agent.version).toBe("1.0.0");
    const latest = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(latest.agent.version).toBe("1.0.1");
  });

  it("refuses bad requests with clear errors and queues nothing", async () => {
    const { engine, fake } = await testEngine();
    await rejectsWith(engine.submitRun(goodRequest({ workspaceId: "Bad WS" })), "invalid_workspace");
    await rejectsWith(engine.submitRun(goodRequest({ agentId: "nope" })), "not_found");
    await rejectsWith(engine.submitRun(goodRequest({ version: "9.9.9" })), "not_found");
    const bad = await rejectsWith(engine.submitRun(goodRequest({ inputs: { tone: "angry" } })), "invalid_input");
    expect(bad.issues).toEqual(["topic: Required.", 'tone: Unknown option "angry". Pick one of: calm, loud.']);
    await rejectsWith(engine.submitRun(goodRequest({ idempotencyKey: "has spaces" })), "invalid_request");
    await rejectsWith(engine.submitRun(goodRequest({ maxCostUsd: -1 })), "invalid_request");
    expect(await engine.listRuns(WS)).toEqual([]);
    expect(fake.requests).toHaveLength(0);
  });

  it("refuses a Brand Brain the workspace does not have", async () => {
    const { engine } = await testEngine({ seeds: true });
    const err = await rejectsWith(
      engine.submitRun({ workspaceId: WS, agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", inputs: { ...SAMPLE_RUNS["hook-writer"].inputs, brand: "bb_other" } }),
      "invalid_input",
    );
    expect(err.issues).toEqual(['brand: No Brand Brain "bb_other" in this workspace.']);
  });

  it("runs another workspace's agent only when it is public and live", async () => {
    const { engine } = await testEngine({ seeds: true });
    const ok = await engine.submitRun({ workspaceId: WS, agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", inputs: SAMPLE_RUNS["hook-writer"].inputs });
    expect(ok.agent).toEqual({ workspaceId: PLATFORM_WORKSPACE_ID, id: "hook-writer", version: "1.0.0" });
    await rejectsWith(engine.submitRun({ workspaceId: WS, agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "storyboarder", inputs: {} }), "not_found");
    // test-agent is a draft in WS: its own workspace may run it, nobody else.
    await rejectsWith(engine.submitRun({ ...goodRequest(), workspaceId: "ws_other", agentWorkspaceId: WS }), "not_found");
  });

  it("refuses agents that cannot run yet, and routes with no provider", async () => {
    const { engine } = await testEngine({ seeds: true });
    const err = await rejectsWith(
      engine.submitRun({ workspaceId: PLATFORM_WORKSPACE_ID, agentId: "storyboarder", inputs: { script: "A script long enough to storyboard." } }),
      "not_runnable",
    );
    expect(err.issues).toEqual(['Output "storyboard" needs media tools that arrive in a later phase.']);
    const { engine: noKey } = await testEngine({ providerOverride: undefined });
    const e2 = await rejectsWith(noKey.submitRun(goodRequest()), "not_runnable");
    expect(e2.issues).toEqual(["No provider is set up for route text-standard.", "No provider is set up for route text-fast."]);
  });

  it("asks for the confirmations an agent's guardrails need", async () => {
    const { engine } = await testEngine({ seeds: true });
    const req = { workspaceId: WS, agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "repurposer", inputs: SAMPLE_RUNS.repurposer.inputs };
    const err = await rejectsWith(engine.submitRun(req), "confirmation_required");
    expect(err.issues[0]).toMatch(/confirmations\.rights/);
    const run = await engine.waitForRun(WS, (await engine.submitRun({ ...req, confirmations: { rights: true } })).id);
    expect(run.status).toBe("succeeded");
    expect(run.checks.find((c) => c.guardrail === "rights_confirmed")?.status).toBe("pass");
  });
});

describe("run engine: routing and spend", () => {
  it("falls back to the fallback route when the main model fails", async () => {
    const { engine, fake } = await testEngine({ maxAttempts: 1, fake: { respond: (r) => (r.model === SONNET ? new ProviderError("unavailable", "down") : undefined) } });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run.status).toBe("succeeded");
    expect(run.model).toEqual({ route: "text-fast", provider: "fake", model: LUNA });
    expect(run.calls.map((c) => [c.route, c.ok])).toEqual([["text-standard", false], ["text-fast", true]]);
    expect(run.calls[0].error).toBe("unavailable: down");
    expect(fake.requests.map((r) => r.model)).toEqual([SONNET, LUNA]);
  });

  it("falls back when the main model times out", async () => {
    const { engine } = await testEngine({ callTimeoutMs: 20, fake: { respond: (r) => (r.model === SONNET ? hang(r) : undefined) } });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run.status).toBe("succeeded");
    expect(run.calls[0]).toMatchObject({ route: "text-standard", ok: false, error: "timeout: No answer within 20 ms." });
    expect(run.model?.route).toBe("text-fast");
  });

  it("refuses at submit when even the cheapest first call would pass the cap", async () => {
    const { engine, fake } = await testEngine();
    const err = await rejectsWith(engine.submitRun(goodRequest({ maxCostUsd: 0.0001 })), "over_budget");
    expect(err.message).toMatch(/would cost up to \$0\.000\d+, above its cap of \$0\.0001/);
    expect(fake.requests).toHaveLength(0);
  });

  it("skips a route whose estimate would pass the cap, before calling it", async () => {
    const { engine, fake } = await testEngine();
    // Sonnet's estimate (about $0.011 with 1024 output tokens) is over $0.005; Luna's (about $0.0006) is under.
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest({ maxCostUsd: 0.005 }))).id);
    expect(run.status).toBe("succeeded");
    expect(run.capMicroUsd).toBe(5000);
    expect(run.calls[0]).toMatchObject({ route: "text-standard", ok: false, costMicroUsd: 0 });
    expect(run.calls[0].error).toMatch(/^skipped: estimate/);
    expect(fake.requests.map((r) => r.model)).toEqual([LUNA]);
  });

  it("fails a run whose actual cost passed the cap, and keeps the cost", async () => {
    const greedy: ModelProvider = { id: "fake", complete: async (req) => ({ text: defaultAnswer(req), tokensIn: 100_000, tokensOut: 0 }) };
    const { engine } = await testEngine({ providers: { fake: greedy } });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run.status).toBe("failed");
    expect(run.error?.code).toBe("spend_cap");
    expect(run.output).toBeNull();
    expect(run.costMicroUsd).toBe(200_000);
    expect(run.attempts).toBe(1);
  });
});

describe("run engine: output", () => {
  it("repairs a misshapen answer once", async () => {
    const { engine } = await testEngine({ fake: { respond: (r, n) => (n === 1 ? '{"items": ["only one"]}' : good(r)) } });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run.status).toBe("succeeded");
    expect(run.calls.map((c) => c.purpose)).toEqual(["answer", "repair"]);
    expect(run.costMicroUsd).toBe(run.calls[0].costMicroUsd + run.calls[1].costMicroUsd);
  });

  it("the repair message carries the earlier answer and what was wrong", async () => {
    const { engine, fake } = await testEngine({ fake: { respond: (r, n) => (n === 1 ? "not json at all" : good(r)) } });
    await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    const repair = fake.requests[1].messages;
    expect(repair.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(repair[2].content).toBe("not json at all");
    expect(repair[3].content).toMatch(/^Your answer did not match the output format:\n- Not valid JSON/);
  });

  it("fails cleanly when the repair does not fit either, without retrying", async () => {
    const { engine, fake } = await testEngine({ fake: { respond: () => '{"items": []}' } });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run.status).toBe("failed");
    expect(run.error).toEqual({ code: "output_invalid", message: "The answer did not fit the output format, even after one repair: items: 0 items, need exactly 3." });
    expect(run.attempts).toBe(1);
    expect(fake.requests).toHaveLength(2);
  });

  it("marks a run for review when a guardrail fails, and keeps the output", async () => {
    const answer = JSON.stringify({ items: ["Gerald: guaranteed results", "Gerald turns nine", "Nine years of sourdough"] });
    const { engine } = await testEngine({ fake: { respond: () => answer } });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run.status).toBe("succeeded");
    expect(run.needsReview).toBe(true);
    expect(run.checks).toContainEqual(expect.objectContaining({ guardrail: "no_misleading_claims", status: "fail", findings: ["guaranteed results"] }));
    expect(run.output).not.toBeNull();
  });
});

describe("run engine: queue, retries, cancel, timeout", () => {
  it("keeps to the global and per-workspace concurrency limits", async () => {
    let now = 0;
    let max = 0;
    const perWs: Record<string, number> = {};
    const maxWs: Record<string, number> = {};
    const { engine, registry } = await testEngine({
      concurrency: { global: 3, perWorkspace: 2 },
      fake: {
        respond: async (r) => {
          const ws = /ws_\w+/.exec(r.messages[1].content)?.[0] ?? "?";
          now++;
          perWs[ws] = (perWs[ws] ?? 0) + 1;
          max = Math.max(max, now);
          maxWs[ws] = Math.max(maxWs[ws] ?? 0, perWs[ws]);
          await new Promise((res) => setTimeout(res, 10));
          now--;
          perWs[ws]--;
          return good(r);
        },
      },
    });
    await registry.create("ws_two", goodSpec());
    const ids: [string, string][] = [];
    for (const ws of [WS, "ws_two"]) {
      for (let i = 0; i < 4; i++) {
        const run = await engine.submitRun({ workspaceId: ws, agentId: "test-agent", inputs: { topic: `${ws} topic ${i}` } });
        ids.push([ws, run.id]);
      }
    }
    await engine.idle();
    expect(max).toBe(3);
    expect(maxWs[WS]).toBe(2);
    expect(maxWs.ws_two).toBe(2);
    for (const [ws, id] of ids) expect((await engine.getRun(ws, id))?.status).toBe("succeeded");
  });

  it("retries provider errors with backoff, then succeeds", async () => {
    const { engine, fake } = await testEngine({ fake: { respond: (r, n) => (n <= 4 ? new ProviderError("rate_limited", "busy") : good(r)) } });
    const started = Date.now();
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run.status).toBe("succeeded");
    expect(run.attempts).toBe(3);
    expect(run.error).toBeNull();
    expect(fake.requests).toHaveLength(5); // two routes failed on attempts 1 and 2
    expect(Date.now() - started).toBeGreaterThanOrEqual(5 + 10 - 2); // backoff 5 ms, then 10 ms
  });

  it("gives up after the last attempt", async () => {
    const { engine } = await testEngine({ fake: { respond: () => new ProviderError("unavailable", "down") } });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run).toMatchObject({ status: "failed", attempts: 3, error: { code: "provider_error", message: "The model did not answer after 3 attempts." } });
    expect(run.calls).toHaveLength(6);
  });

  it("does not retry errors that will not go away", async () => {
    const { engine } = await testEngine({ fake: { respond: () => new ProviderError("auth", "bad key") } });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run).toMatchObject({ status: "failed", attempts: 1, error: { code: "provider_error" } });
  });

  it("cancels a queued run before it starts", async () => {
    const { engine, fake } = await testEngine({ concurrency: { global: 1, perWorkspace: 1 }, fake: { latencyMs: 30 } });
    const first = await engine.submitRun(goodRequest());
    const second = await engine.submitRun(goodRequest({ inputs: { topic: "Second topic for Gerald" } }));
    const cancelled = await engine.cancelRun(WS, second.id);
    expect(cancelled.status).toBe("cancelled");
    expect((await engine.waitForRun(WS, first.id)).status).toBe("succeeded");
    await engine.idle();
    expect((await engine.getRun(WS, second.id))?.attempts).toBe(0);
    expect(fake.requests).toHaveLength(1);
  });

  it("cancels a running run and stops its model call", async () => {
    const { engine } = await testEngine({ fake: { respond: hang } });
    const run = await engine.submitRun(goodRequest());
    await until(async () => (await engine.getRun(WS, run.id))?.status === "running");
    const waiting = engine.waitForRun(WS, run.id);
    await engine.cancelRun(WS, run.id);
    expect((await waiting).status).toBe("cancelled");
    await engine.idle();
    const final = await engine.getRun(WS, run.id);
    expect(final?.status).toBe("cancelled");
    expect(final?.calls).toEqual([]);
    // A finished run stays as it is.
    expect((await engine.cancelRun(WS, run.id)).status).toBe("cancelled");
    await rejectsWith(engine.cancelRun(WS, "run_missing"), "not_found");
  });

  it("fails a run that takes longer than the run timeout", async () => {
    const { engine } = await testEngine({ runTimeoutMs: 30, fake: { respond: hang } });
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    expect(run).toMatchObject({ status: "failed", error: { code: "timeout" } });
    expect(run.timings.runMs).toBeGreaterThanOrEqual(25);
  });
});

describe("run engine: idempotency", () => {
  it("a second submit with the same key returns the first run and runs once", async () => {
    const { engine, fake } = await testEngine();
    const a = await engine.submitRun(goodRequest({ idempotencyKey: "click-1" }));
    await engine.idle();
    const b = await engine.submitRun(goodRequest({ idempotencyKey: "click-1" }));
    expect(b.id).toBe(a.id);
    expect(b.status).toBe("succeeded");
    expect(fake.requests).toHaveLength(1);
  });

  it("two submits at the same moment still make one run", async () => {
    const { engine, fake } = await testEngine();
    const [a, b] = await Promise.all([engine.submitRun(goodRequest({ idempotencyKey: "k" })), engine.submitRun(goodRequest({ idempotencyKey: "k" }))]);
    expect(a.id).toBe(b.id);
    await engine.idle();
    expect(await engine.listRuns(WS)).toHaveLength(1);
    expect(fake.requests).toHaveLength(1);
  });

  it("refuses the same key with a different request, and keys are per workspace", async () => {
    const { engine, registry } = await testEngine();
    await engine.submitRun(goodRequest({ idempotencyKey: "k" }));
    await rejectsWith(engine.submitRun(goodRequest({ idempotencyKey: "k", inputs: { topic: "Something else" } })), "idempotency_conflict");
    await registry.create("ws_two", goodSpec());
    const other = await engine.submitRun({ ...goodRequest({ idempotencyKey: "k" }), workspaceId: "ws_two" });
    expect(other.workspaceId).toBe("ws_two");
    await engine.idle();
  });
});

describe("run engine: reading runs and costs", () => {
  it("lists a workspace's runs newest first, filters them, and never shows another workspace's", async () => {
    let t = 0;
    const { engine } = await testEngine({ seeds: true, now: () => new Date(Date.UTC(2026, 9, 21, 12, 0, t++)) });
    const a = await engine.submitRun(goodRequest());
    const b = await engine.submitRun({ workspaceId: WS, agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", inputs: SAMPLE_RUNS["hook-writer"].inputs });
    await engine.idle();
    expect((await engine.listRuns(WS)).map((r) => r.id)).toEqual([b.id, a.id]);
    expect((await engine.listRuns(WS, { agentId: "hook-writer" })).map((r) => r.id)).toEqual([b.id]);
    expect(await engine.listRuns(WS, { status: "failed" })).toEqual([]);
    expect(await engine.listRuns("ws_other")).toEqual([]);
    expect(await engine.getRun("ws_other", a.id)).toBeNull();
  });

  it("totals cost per workspace and per agent, failed runs included", async () => {
    const { engine } = await testEngine({ seeds: true, fake: { respond: (r) => (/FAILME/.test(r.messages[1].content) ? "bad" : good(r)) } });
    await engine.submitRun(goodRequest({ inputs: { topic: "FAILME Gerald" } }));
    await engine.submitRun(goodRequest({ inputs: { topic: "Croissants take three days" } }));
    await engine.submitRun({ workspaceId: WS, agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "hashtag-picker", inputs: SAMPLE_RUNS["hashtag-picker"].inputs });
    await engine.idle();
    const runs = await engine.listRuns(WS);
    expect(runs.map((r) => r.status).sort()).toEqual(["failed", "succeeded", "succeeded"]);
    const totals = await engine.costTotals(WS);
    const sum = runs.reduce((s, r) => s + r.costMicroUsd, 0);
    expect(totals.workspace).toMatchObject({ runs: 3, costMicroUsd: sum, costUsd: sum / 1e6 });
    expect(Object.keys(totals.byAgent).sort()).toEqual(["hashtag-picker", "test-agent"]);
    expect(totals.byAgent["test-agent"].runs).toBe(2);
    expect(totals.byAgent["test-agent"].costMicroUsd + totals.byAgent["hashtag-picker"].costMicroUsd).toBe(sum);
    for (const r of runs) expect(r.costMicroUsd).toBe(r.calls.reduce((s, c) => s + c.costMicroUsd, 0));
  });

  it("the public view hides the model, the calls and the cost", async () => {
    const { engine } = await testEngine();
    const run = await engine.waitForRun(WS, (await engine.submitRun(goodRequest())).id);
    const view = publicRunView(run);
    expect(Object.keys(view)).not.toEqual(expect.arrayContaining(["model"]));
    expect(JSON.stringify(view)).not.toMatch(/claude|gpt|openrouter|costMicroUsd|calls/);
  });
});

describe("run engine: JSON store and restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "wovi-runs-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps runs on disk and picks up queued runs after a restart", async () => {
    const file = join(dir, "runs.json");
    const stalled: RunQueue = { start() {}, enqueue() {}, cancel: () => "unknown", idle: async () => {}, stats: () => ({ waiting: 0, running: 0 }) };
    const { engine: before, registry } = await testEngine({ store: jsonFileRunStore(file), queue: stalled });
    const queued = await before.submitRun(goodRequest());

    const after = new RunEngine({ registry, store: jsonFileRunStore(file), brandBrains: stubBrandBrains(), providers: { fake: fakeProvider() }, providerOverride: "fake" });
    expect(await after.recover()).toBe(1);
    const run = await after.waitForRun(WS, queued.id);
    expect(run.status).toBe("succeeded");
    expect((await jsonFileRunStore(file).get(WS, queued.id))?.status).toBe("succeeded");
  });
});
