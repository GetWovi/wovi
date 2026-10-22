import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { as, testApp } from "@/lib/app/test-helpers";
import { testBuilder } from "@/lib/builder/test-helpers";
import { defaultAnswer } from "@/lib/runs/providers/fake";
import { ProviderError, type CompletionRequest } from "@/lib/runs/providers/types";
import { memoryRunStore } from "@/lib/runs/store";
import { RunEngine } from "@/lib/runs/engine";
import type { Run } from "@/lib/runs/run";
import { SAMPLE_RUNS } from "@/lib/runs/samples";
import { CREDITS, centsFor, creditWords, priceWords } from "./config";
import { Credits } from "./credits";
import { paymentProviderFromEnv, testPaymentProvider } from "./payments";
import { chargeFor, creditsForCost, estimateCredits, median } from "./pricing";
import { memoryCreditStore } from "./store";
import { chargeWords } from "./types";

/* ---------- Helpers ---------- */

const HOOK = SAMPLE_RUNS["hook-writer"].inputs;
const IDEA = "Gerald the sourdough starter turns nine on Saturday and gets his own cake";

function agentOf(req: CompletionRequest): string {
  const text = req.messages.map((m) => m.content).join("\n");
  if (text.includes("You write opening lines")) return "hook-writer";
  if (text.includes("You write short vertical video scripts")) return "script-writer";
  if (text.includes("You write captions for one small business")) return "caption-writer";
  if (text.includes("You help one post get found")) return "hashtag-picker";
  return "unknown";
}

/** A team workspace with credits on, the example Brand Brains, and shortcuts. */
async function shop(opts: Parameters<typeof testApp>[0] = {}) {
  const t = await testApp({ credits: true, ...opts });
  await t.seedTeamBrains();
  const crumb = (await t.brandStore.brains.find({ workspaceId: t.team.id, name: "Crumb and Co" }))[0];
  const me = as(t.ada.id);
  const c = t.credits!;
  const g = t.guardedCredits!;
  const ws = t.team.id;
  const topUp = (n = 500, key?: string) => g.topUp(me, ws, n, key);
  const run = (who = me, extra: Record<string, unknown> = {}) => t.api.startRun(who, ws, { agentId: "hook-writer", inputs: HOOK, ...extra });
  const finish = (id: string) => t.engine.waitForRun(ws, id);
  const balance = () => c.balance(ws);
  const hookEstimate = async () => (await c.estimateById(PLATFORM_WORKSPACE_ID, "hook-writer"))!;
  const settle = (id: string) => t.pipelineEngine.waitUntilSettled(ws, id);
  const ideaInputs = (extra: Record<string, unknown> = {}) => ({ start: "my_idea", idea: IDEA, platform: "tiktok", length: "s30", brand: crumb.id, ...extra });
  return { ...t, crumb, me, c, g, ws, topUp, run, finish, balance, hookEstimate, settle, ideaInputs };
}

/* ---------- Pricing ---------- */

describe("credits: pricing", () => {
  it("prices a run at its real cost times the margin, rounded up to whole credits, at least one", () => {
    expect(CREDITS.microUsdPerCredit).toBe(10_000);
    expect(CREDITS.marginMultiplier).toBe(2.5);
    expect(creditsForCost(0)).toBe(1);
    expect(creditsForCost(1)).toBe(1);
    // $0.004 times 2.5 is exactly one cent: one credit.
    expect(creditsForCost(4_000)).toBe(1);
    // One micro-dollar more rounds up.
    expect(creditsForCost(4_001)).toBe(2);
    expect(creditsForCost(100_000)).toBe(25);
    expect(creditsForCost(123_456)).toBe(31);
    expect(() => creditsForCost(-1)).toThrow();
    // Other settings, in one place.
    expect(creditsForCost(10_000, { ...CREDITS, marginMultiplier: 1.5 })).toBe(2);
    expect(creditsForCost(0, { ...CREDITS, minCreditsPerRun: 3 })).toBe(3);
  });

  it("estimates from the typical cost with headroom, never above the spend cap, and never charges above it", () => {
    // $0.01 typical, times 1.5, times 2.5: 3.75, so 4 credits.
    expect(estimateCredits(10_000, 50_000)).toBe(4);
    // A cap of $0.004 holds it to 1 credit.
    expect(estimateCredits(10_000, 4_000)).toBe(1);
    expect(chargeFor(4_000, 3)).toBe(1);
    expect(chargeFor(5_000, 3)).toBe(2);
    expect(chargeFor(1_000_000, 3)).toBe(3);
    expect(chargeFor(1_000_000, 0)).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBeNull();
  });

  it("keeps a credit at a fixed $0.01, never swappable, and gives non-holders nothing free", () => {
    expect(centsFor(500)).toBe(500);
    expect(priceWords(2500)).toBe("$25.00");
    expect(creditWords(1)).toBe("1 credit");
    expect(creditWords(1250)).toBe("1,250 credits");
    expect(CREDITS.swappable).toBe(false);
    expect(CREDITS.starterCredits).toBe(0);
    expect(chargeWords({ estimate: 4, charged: 1, back: 3, state: "charged" })).toBe("Charged 1 credit of the 4 held, 3 back");
    expect(chargeWords({ estimate: 4, charged: 0, back: 4, state: "refunded" })).toBe("Nothing charged. The 4 credits held came back");
    expect(JSON.stringify(chargeWords({ estimate: 4, charged: null, back: null, state: "held" }))).not.toContain("\u2014");
  });
});

/* ---------- The ledger ---------- */

describe("credits: the ledger", () => {
  it("tops up through the test provider, marked as a test, once per key", async () => {
    const t = await shop();
    expect((await t.balance()).available).toBe(0);
    const a = await t.topUp(500, "pack-1");
    expect(a).toMatchObject({ status: "paid", credits: 500, amountCents: 500, provider: "test", test: true });
    // The same key again: the same top-up, no new credits.
    expect((await t.topUp(500, "pack-1")).id).toBe(a.id);
    await rejectsCode(t.topUp(1000, "pack-1"), "conflict");
    expect((await t.balance()).available).toBe(500);
    const [entry] = await t.c.ledger(t.ws);
    expect(entry).toMatchObject({ kind: "top_up", amount: 500, balanceAfter: 500, test: true, label: "Test top-up, 500 credits" });
    // At least $5, and only the packs.
    expect(CREDITS.minTopUpCredits).toBe(500);
    const small = await rejectsCode(t.topUp(123), "invalid_request");
    expect(small.message).toBe("The smallest top-up is 500 credits ($5.00).");
    await rejectsCode(t.topUp(750), "invalid_request");
    // A pack under the minimum is refused too, whatever the pack list says.
    const cheap = await shop({ credits: { config: { packs: [100, 500] } } });
    await rejectsCode(cheap.topUp(100), "invalid_request");
    expect((await cheap.topUp(500)).status).toBe("paid");
  });

  it("keeps top-ups closed without a provider, and a failed payment adds nothing", async () => {
    const closed = await shop({ credits: { payments: null } });
    await rejectsCode(closed.topUp(), "payments_closed");
    const failing = await shop({ credits: { payments: testPaymentProvider({ fail: true }) } });
    await rejectsCode(failing.topUp(), "payment_failed");
    expect((await failing.balance()).available).toBe(0);
    expect((await failing.c.topUps(failing.ws))[0]).toMatchObject({ status: "failed" });
    // The test provider is for a local app only, unless switched on.
    expect(paymentProviderFromEnv({ WOVI_APP_URL: "http://localhost:3900" })?.test).toBe(true);
    expect(paymentProviderFromEnv({ WOVI_APP_URL: "https://wovi.app" })).toBeNull();
    expect(paymentProviderFromEnv({ WOVI_APP_URL: "https://wovi.app", WOVI_TEST_PAYMENTS: "on" })?.test).toBe(true);
    expect(paymentProviderFromEnv({ WOVI_TEST_PAYMENTS: "off" })).toBeNull();
  });

  it("writes each key once, refuses the same key with another amount, and never goes below zero", async () => {
    const t = await shop();
    await t.topUp(500);
    const a = await t.c.adjust(t.ws, { amount: 25, key: "fix-1", by: "support", note: "A missed top-up" });
    const again = await t.c.adjust(t.ws, { amount: 25, key: "fix-1", by: "support", note: "A missed top-up" });
    expect(again.id).toBe(a.id);
    await rejectsCode(t.c.adjust(t.ws, { amount: 30, key: "fix-1", by: "support", note: "Different" }), "conflict");
    expect((await t.balance()).available).toBe(525);
    await rejectsCode(t.c.adjust(t.ws, { amount: -600, key: "fix-2", by: "support", note: "Too much" }), "not_enough_credits");
    expect((await t.balance()).available).toBe(525);
    // Support grants: one per source id. Holder credits only come in through grantHolder (phase 17).
    const g1 = await t.c.grant(t.ws, { credits: 50, source: "support", sourceId: "2026-11", by: "test" });
    expect((await t.c.grant(t.ws, { credits: 50, source: "support", sourceId: "2026-11", by: "test" })).id).toBe(g1.id);
    await rejectsCode(t.c.grant(t.ws, { credits: 50, source: "holder", sourceId: "2026-11", by: "test" }), "invalid_request");
    expect((await t.balance()).available).toBe(575);
    // Every balanceAfter adds up.
    const entries = await t.c.entries(t.ws);
    let sum = 0;
    for (const e of entries) {
      sum += e.amount;
      expect(e.balanceAfter).toBe(sum);
      expect(e.balanceAfter).toBeGreaterThanOrEqual(0);
    }
  });

  it("serializes holds so racing runs never spend more than the balance", async () => {
    const t = await shop({ fake: { latencyMs: 100 } });
    const each = await t.hookEstimate();
    await t.c.adjust(t.ws, { amount: each * 2, key: "two-runs", by: "support", note: "Room for two runs" });
    const tries = await Promise.allSettled([t.run(), t.run(), t.run()]);
    expect(tries.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const refused = tries.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason.code).toBe("not_enough_credits");
    expect((await t.balance()).available).toBe(0);
    await t.engine.idle();
    const after = await t.balance();
    expect(after.held).toBe(0);
    expect(after.available).toBeGreaterThan(0);
  });
});

/* ---------- Runs ---------- */

describe("credits: runs", () => {
  it("holds the estimate at submit, charges the real price at the end and gives the rest back", async () => {
    const t = await shop();
    await t.topUp(500);
    const estimate = await t.hookEstimate();
    expect(estimate).toBeGreaterThanOrEqual(1);
    const started = await t.run();
    expect(started.charge).toMatchObject({ estimate, state: "held" });
    const mid = await t.balance();
    expect(mid.available + mid.held).toBe(500);
    const done = await t.finish(started.id);
    expect(done.status).toBe("succeeded");
    const charged = creditsForCost(done.costMicroUsd);
    expect(done.credits).toMatchObject({ mode: "own", estimate, state: "charged", charged: Math.min(charged, estimate), back: estimate - Math.min(charged, estimate) });
    expect((await t.balance()).available).toBe(500 - done.credits!.charged!);
    expect((await t.c.ledger(t.ws, { kinds: ["hold", "release", "charge"] })).map((e) => e.kind).reverse()).toEqual(["hold", "release", "charge"]);
    // The charge on the result, for an owner.
    expect((await t.api.run(t.me, t.ws, started.id))!.run.charge).toMatchObject({ state: "charged", charged: done.credits!.charged });
    // Settling again changes nothing.
    await t.c.settleRun(done);
    expect((await t.balance()).available).toBe(500 - done.credits!.charged!);
  });

  it("refuses a run without enough credits before anything is queued", async () => {
    const t = await shop();
    const err = await rejectsCode(t.run(), "not_enough_credits");
    expect(err.message).toMatch(/^This needs \d+ credits?\. The workspace has 0 credits\.$/);
    expect(await t.engine.listRuns(t.ws)).toHaveLength(0);
    expect(await t.c.ledger(t.ws)).toHaveLength(0);
    // The form knows before the person presses run.
    const price = (await t.api.agentPrice(t.me, t.ws, "hook-writer"))!;
    expect(price).toMatchObject({ estimate: await t.hookEstimate(), available: 0, canManage: true });
    expect(price.blocked?.code).toBe("not_enough_credits");
  });

  it("gives everything back when a run fails or is cancelled", async () => {
    const failing = await shop({ fake: { respond: () => new ProviderError("unavailable", "Down.") }, engine: { maxAttempts: 1 } });
    await failing.topUp(500);
    const f = await failing.finish((await failing.run()).id);
    expect(f.status).toBe("failed");
    expect(f.credits).toMatchObject({ state: "refunded", charged: 0 });
    expect(await failing.balance()).toMatchObject({ available: 500, held: 0 });
    const [release] = await failing.c.ledger(failing.ws, { kinds: ["release"] });
    expect(release.reason).toBe("failed");

    const slow = await shop({ fake: { latencyMs: 300 } });
    await slow.topUp(500);
    const s = await slow.run();
    await new Promise((r) => setTimeout(r, 30));
    await slow.api.cancelRun(slow.me, slow.ws, s.id);
    await slow.engine.idle();
    const c = (await slow.engine.getRun(slow.ws, s.id))!;
    expect(c.status).toBe("cancelled");
    expect(c.credits).toMatchObject({ state: "refunded", charged: 0 });
    expect(await slow.balance()).toMatchObject({ available: 500, held: 0 });
  });

  it("never charges above the estimate shown, even when the run costs more or the gate rewrites it", async () => {
    // Every draft has stock lines, so the quality gate rewrites it twice: more calls, more cost.
    const slop = (req: CompletionRequest) => {
      const a = JSON.parse(defaultAnswer(req)) as { items: unknown[] };
      if (typeof a.items?.[0] !== "string") return undefined;
      a.items[0] = "A game-changing way to unlock your potential";
      return JSON.stringify(a);
    };
    const t = await shop({ fake: { respond: (req) => (agentOf(req) === "hook-writer" ? slop(req) : undefined) } });
    await t.topUp(500);
    const run = await t.finish((await t.run(t.me, { quotedCredits: 1 })).id);
    expect(run.status).toBe("succeeded");
    expect(run.calls.filter((c) => c.purpose === "rewrite").length).toBeGreaterThan(0);
    expect(creditsForCost(run.costMicroUsd)).toBeGreaterThan(1);
    // Quoted 1, held 1, charged 1.
    expect(run.credits).toMatchObject({ estimate: 1, charged: 1, back: 0 });
    expect((await t.balance()).available).toBe(499);
    // A quote must be a whole number.
    await rejectsCode(t.run(t.me, { quotedCredits: 1.5 }), "invalid_request");
  });

  it("estimates from the agent's typical cost once it has enough finished runs", async () => {
    const t = await shop();
    await t.topUp(500);
    const before = await t.hookEstimate();
    for (let i = 0; i < CREDITS.typicalCost.minRuns; i++) await t.finish((await t.run()).id);
    const runs = (await t.engine.listRuns(t.ws)).filter((r) => r.status === "succeeded");
    const typical = median(runs.map((r) => r.costMicroUsd))!;
    const spec = (await t.registry.get(PLATFORM_WORKSPACE_ID, "hook-writer"))!;
    const after = await t.hookEstimate();
    expect(after).toBe(estimateCredits(typical, Math.round(spec.routing.maxCostUsd * 1_000_000)));
    // The fake provider's runs are shorter than a full answer, so the estimate comes down.
    expect(after).toBeLessThanOrEqual(before);
  });

  it("settles a run left holding after a restart", async () => {
    const t = await shop();
    await t.topUp(500);
    // Billing that cannot settle: the run ends still holding, as after a crash.
    let broken = true;
    const flaky = Object.create(t.c) as Credits;
    flaky.settleRun = async (run: Run) => {
      if (broken) throw new Error("disk full");
      return t.c.settleRun(run);
    };
    const store = memoryRunStore();
    const engine = new RunEngine({ registry: t.registry, store, brandBrains: { get: async () => null }, providers: { fake: t.fake }, providerOverride: "fake", billing: flaky });
    const run = await engine.submitRun({ workspaceId: t.ws, agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", inputs: HOOK, billing: { userId: t.ada.id } });
    const ended = await engine.waitForRun(t.ws, run.id);
    expect(ended.credits?.state).toBe("held");
    expect((await t.balance()).held).toBeGreaterThan(0);
    broken = false;
    const again = new RunEngine({ registry: t.registry, store, brandBrains: { get: async () => null }, providers: { fake: t.fake }, providerOverride: "fake", billing: flaky });
    await again.recover();
    expect((await again.getRun(t.ws, run.id))!.credits?.state).toBe("charged");
    expect((await t.balance()).held).toBe(0);
  });
});

/* ---------- Pipelines ---------- */

describe("credits: pipelines", () => {
  it("holds a pipeline's estimate, charges each step inside it, and gives the rest back at the end", async () => {
    const t = await shop();
    await t.topUp(2500);
    const price = (await t.api.pipelinePrice(t.me, t.ws, "idea-to-post", PLATFORM_WORKSPACE_ID))!;
    expect(price.estimate).toBeGreaterThan(0);
    const started = await t.api.startPipeline(t.me, t.ws, { pipelineId: "idea-to-post", inputs: t.ideaInputs(), quotedCredits: price.estimate });
    expect(started.charge).toMatchObject({ estimate: price.estimate, state: "held" });
    expect((await t.balance()).held).toBe(price.estimate);
    await t.settle(started.id);
    await t.api.pickInPipeline(t.me, t.ws, started.id, "hooks", 0);
    const done = await t.settle(started.id);
    expect(done.status).toBe("ready");
    const steps = await t.engine.listRuns(t.ws);
    expect(steps.every((r) => r.credits?.mode === "pipeline" && r.credits.holdId === done.credits!.holdId)).toBe(true);
    // Every step run is charged its own price, inside its part of the hold.
    for (const r of steps) expect(r.credits!.charged).toBe(Math.min(creditsForCost(r.costMicroUsd), r.credits!.estimate));
    const charged = steps.reduce((n, r) => n + r.credits!.charged!, 0);
    expect(done.credits).toMatchObject({ state: "settled", charged, back: price.estimate - charged });
    expect(charged).toBeLessThanOrEqual(price.estimate);
    expect(await t.balance()).toMatchObject({ available: 2500 - charged, held: 0 });
  });

  it("charges a step's rewrite inside the same hold", async () => {
    const t = await shop({
      fake: {
        respond: (req) => {
          if (agentOf(req) !== "script-writer") return undefined;
          const stepRewrite = req.messages.some((m) => m.role === "user" && m.content.includes("Rewrite it. The last draft failed"));
          return stepRewrite ? defaultAnswer(req) : defaultAnswer(req).replace(/"spoken": "/, '"spoken": "Our artisanal ');
        },
      },
    });
    await t.topUp(2500);
    const started = await t.api.startPipeline(t.me, t.ws, { pipelineId: "idea-to-post", inputs: t.ideaInputs() });
    await t.settle(started.id);
    await t.api.pickInPipeline(t.me, t.ws, started.id, "hooks", 0);
    const done = await t.settle(started.id);
    const script = done.steps[2];
    expect(script.runIds).toHaveLength(2);
    const both = await Promise.all(script.runIds.map((id) => t.engine.getRun(t.ws, id)));
    expect(both.every((r) => r!.credits?.state === "charged" && r!.credits.holdId === done.credits!.holdId)).toBe(true);
    const all = await t.engine.listRuns(t.ws);
    const charged = all.reduce((n, r) => n + (r.credits?.charged ?? 0), 0);
    expect(done.credits!.charged).toBe(charged);
    expect(charged).toBeLessThanOrEqual(done.credits!.estimate);
    expect((await t.balance()).available).toBe(2500 - charged);
  });

  it("refuses a pipeline without enough credits before anything runs", async () => {
    const t = await shop();
    await t.c.adjust(t.ws, { amount: 3, key: "a-little", by: "support", note: "Not enough for a chain" });
    await rejectsCode(t.api.startPipeline(t.me, t.ws, { pipelineId: "idea-to-post", inputs: t.ideaInputs() }), "not_enough_credits");
    expect(await t.pipelineEngine.list(t.ws)).toHaveLength(0);
    expect(await t.engine.listRuns(t.ws)).toHaveLength(0);
    expect((await t.balance()).available).toBe(3);
  });

  it("keeps finished steps charged when a step fails, refunds the failed one, and holds again on retry", async () => {
    let broken = true;
    const t = await shop({
      fake: { respond: (req) => (broken && agentOf(req) === "hashtag-picker" ? new ProviderError("unavailable", "Down for a moment.") : undefined) },
      engine: { maxAttempts: 1 },
    });
    await t.topUp(500);
    const run = await t.settle((await t.api.startPipeline(t.me, t.ws, { pipelineId: "caption-and-tags", inputs: { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok" } })).id);
    await t.api.pickInPipeline(t.me, t.ws, run.id, "caption", 1);
    const failed = await t.settle(run.id);
    expect(failed.status).toBe("failed");
    const caption = (await t.engine.getRun(t.ws, failed.steps[0].runId!))!;
    const tagRuns = await Promise.all(failed.steps[1].runIds.map((id) => t.engine.getRun(t.ws, id)));
    expect(caption.credits?.state).toBe("charged");
    expect(tagRuns.every((r) => r!.credits?.state === "refunded")).toBe(true);
    expect(failed.credits).toMatchObject({ state: "settled", charged: caption.credits!.charged });
    expect(await t.balance()).toMatchObject({ available: 500 - caption.credits!.charged!, held: 0 });

    broken = false;
    const retryPrice = (await t.api.retryPrice(t.me, t.ws, run.id))!;
    expect(retryPrice.estimate).toBeGreaterThan(0);
    await t.api.retryPipeline(t.me, t.ws, run.id);
    const ready = await t.settle(run.id);
    expect(ready.status).toBe("ready");
    expect(ready.credits!.holdIds).toHaveLength(2);
    const all = await t.engine.listRuns(t.ws);
    const charged = all.reduce((n, r) => n + (r.credits?.charged ?? 0), 0);
    expect(ready.credits).toMatchObject({ state: "settled", charged });
    expect(await t.balance()).toMatchObject({ available: 500 - charged, held: 0 });
  });

  it("gives the hold back when a pipeline is cancelled", async () => {
    const t = await shop({ fake: { latencyMs: 200 } });
    await t.topUp(500);
    const run = await t.api.startPipeline(t.me, t.ws, { pipelineId: "caption-and-tags", inputs: { post: "Gerald the starter turns nine, with a candle on the jar", platform: "tiktok" } });
    await new Promise((r) => setTimeout(r, 40));
    await t.api.cancelPipeline(t.me, t.ws, run.id);
    await t.pipelineEngine.idle();
    await t.engine.idle();
    const after = (await t.pipelineEngine.get(t.ws, run.id))!;
    expect(after.credits).toMatchObject({ state: "settled", charged: 0 });
    expect(await t.balance()).toMatchObject({ available: 500, held: 0 });
  });
});

/* ---------- Limits and roles ---------- */

describe("credits: limits and roles", () => {
  it("enforces the workspace's monthly limit and each member's at submit, counting what is held", async () => {
    const t = await shop();
    await t.topUp(500);
    const each = await t.hookEstimate();
    const ed = await t.join("ed@example.com", "editor");
    await t.g.setLimits(t.me, t.ws, { members: { [ed.id]: each } });
    // Ed's first run fits his limit; a second while the first is held does not.
    const first = await t.run(as(ed.id));
    const err = await rejectsCode(t.run(as(ed.id)), "over_limit");
    expect(err.message).toMatch(/your monthly limit/);
    // Ada has no limit of her own.
    await t.finish((await t.run()).id);
    await t.finish(first.id);
    expect(await t.c.usedThisMonth(t.ws, ed.id)).toBeLessThanOrEqual(each);

    const used = (await t.balance()).usedThisMonth;
    await t.g.setLimits(t.me, t.ws, { monthly: used + each - 1 });
    const ws = await rejectsCode(t.run(), "over_limit");
    expect(ws.message).toMatch(/^This would pass the workspace's monthly limit/);
    expect((await t.api.agentPrice(t.me, t.ws, "hook-writer"))!.blocked?.code).toBe("over_limit");
    // Lifting it lets runs start again.
    await t.g.setLimits(t.me, t.ws, { monthly: null, members: { [ed.id]: null } });
    await t.finish((await t.run(as(ed.id))).id);
    // Limits are whole numbers within reason, and only for members.
    await rejectsCode(t.g.setLimits(t.me, t.ws, { monthly: -1 }), "invalid_request");
    await rejectsCode(t.g.setLimits(t.me, t.ws, { members: { [t.eve.id]: 10 } }), "not_found");
  });

  it("lets owners and admins top up and set limits, shows charges to people who see costs, and never to keys", async () => {
    const t = await shop();
    const admin = as((await t.join("al@example.com", "admin")).id);
    const editor = as((await t.join("ed@example.com", "editor")).id);
    const viewer = as((await t.join("vi@example.com", "viewer")).id);
    await t.g.topUp(admin, t.ws, 500);
    await rejectsCode(t.g.topUp(editor, t.ws, 500), "forbidden");
    await rejectsCode(t.g.topUp(viewer, t.ws, 500), "forbidden");
    await rejectsCode(t.g.setLimits(editor, t.ws, { monthly: 10 }), "forbidden");
    await rejectsCode(t.g.topUp(as(t.eve.id), t.ws, 500), "not_found");
    // Everyone in the workspace sees the balance and the estimate.
    for (const who of [admin, editor, viewer]) expect((await t.g.summary(who, t.ws)).balance.available).toBe(500);
    expect((await t.g.summary(viewer, t.ws)).canManage).toBe(false);
    expect((await t.g.summary(admin, t.ws)).canManage).toBe(true);
    // An editor's run: the editor does not see the charge, the owner does.
    const run = await t.run(editor);
    expect(run.charge).toBeNull();
    await t.finish(run.id);
    expect((await t.api.run(editor, t.ws, run.id))!.run.charge).toBeNull();
    expect((await t.api.run(t.me, t.ws, run.id))!.run.charge?.state).toBe("charged");
    await rejectsCode(t.g.activity(editor, t.ws), "forbidden");
    expect((await t.g.activity(admin, t.ws)).map((a) => a.type)).toEqual(["run", "top_up"]);
    // An admin key runs agents and may see costs, but never tops up or sets limits.
    const { key } = await t.accounts.apiKeys.create(t.me, t.ws, { name: "Bot", role: "admin" });
    const bot = (await t.accounts.apiKeys.authenticate(key))!;
    await rejectsCode(t.g.topUp(bot, t.ws, 500), "forbidden");
    await rejectsCode(t.g.setLimits(bot, t.ws, { monthly: 1 }), "forbidden");
    const byKey = await t.run(bot);
    expect((await t.finish(byKey.id)).credits?.userId).toBe(t.ada.id);
  });

  it("charges a change request's new draft to the person who asked", async () => {
    const t = await shop();
    await t.topUp(500);
    const first = await t.finish((await t.run()).id);
    const { reRun } = await t.teamReview.decide(t.me, t.ws, first.id, "request_changes", "Shorter, please");
    expect(reRun).toBeTruthy();
    const second = await t.finish(reRun!);
    expect(second.credits).toMatchObject({ mode: "own", state: "charged", userId: t.ada.id });
  });

  it("never charges a builder's bench runs", async () => {
    const credits = new Credits({ store: memoryCreditStore(), payments: testPaymentProvider() });
    const t = await testBuilder({ engine: { billing: credits } });
    const { me } = await t.joinBuilder();
    await t.builder.addSample(me, "hook-writer", { title: "A", inputs: { idea: "Gerald, our sourdough starter, turns nine this week.", platform: "tiktok" }, idealOutput: "1. Gerald is nine. He has never missed a bake." });
    const bench = await t.builder.bench.run(me, "hook-writer");
    await t.engine.idle();
    const runs = await t.engine.listRuns(PLATFORM_WORKSPACE_ID);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((r) => r.status === "succeeded" && r.credits?.mode === "free" && r.credits.state === "free")).toBe(true);
    expect(await credits.ledger(PLATFORM_WORKSPACE_ID)).toHaveLength(0);
    expect(bench.id).toBeTruthy();
    // Anyone else's run in the same engine without credits is refused.
    await rejectsCode(t.engine.submitRun({ workspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", inputs: HOOK }), "not_enough_credits");
  });
});
