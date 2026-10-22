/**
 * Holder credits (phase 17): their own pool beside paid credits, spendable on
 * runs only, gone at the end of their month, and never mixed with paid
 * credits in the ledger. Every money path: grants, spend order both ways,
 * charges and give-backs to the right pool, pipelines, refunds, expiry,
 * holds across a month's end, and the refusals.
 */
import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { SEED_AGENTS } from "@/lib/agents/seeds";
import type { AgentSpec } from "@/lib/agents/spec";
import type { Run } from "@/lib/runs/run";
import { as, testApp } from "@/lib/app/test-helpers";
import { SAMPLE_RUNS } from "@/lib/runs/samples";
import { Credits } from "./credits";
import { monthEnd } from "./pricing";
import { memoryCreditStore } from "./store";
import { holderPart, type HolderSpendOrder, type RunCredits } from "./types";

const WS = "ws_holder";
/** The repurposer's estimate is 31 credits, so a quoted estimate below that is held exactly. */
const SPEC = SEED_AGENTS.find((s) => s.id === "repurposer") as unknown as AgentSpec;
/** A real cost of 4,000 micro-dollars is exactly one credit (times the 2.5 margin). */
const COST_PER_CREDIT = 4_000;

function ledger(order: HolderSpendOrder = "after_paid", start = Date.UTC(2026, 9, 21, 12)) {
  const clock = { t: start };
  let n = 0;
  const c = new Credits({ store: memoryCreditStore(), now: () => new Date(clock.t), newId: () => `crd_${++n}`, config: { holderSpendOrder: order } });
  const paid = (credits: number, key = `p${++n}`) => c.adjust(WS, { amount: credits, key, by: "test", note: "Paid credits for the test" });
  const holder = (credits: number, sourceId = "usr_ada:2026-10", period = "2026-10") => c.grantHolder(WS, { credits, period, sourceId, by: "holders" });
  const hold = (runId: string, credits: number) => c.reserveRun({ workspaceId: WS, runId, spec: SPEC, agentWorkspaceId: "ws_wovi", billing: { userId: "usr_ada", quotedCredits: credits } });
  const end = (runId: string, rc: RunCredits, chargeCredits: number, status: Run["status"] = "succeeded") =>
    c.settleRun({ id: runId, workspaceId: WS, status, costMicroUsd: chargeCredits * COST_PER_CREDIT, credits: rc } as unknown as Run);
  const bal = () => c.balance(WS);
  const pools = async () => {
    const entries = await c.entries(WS);
    const holderSum = entries.reduce((t, e) => t + holderPart(e), 0);
    const total = entries.reduce((t, e) => t + e.amount, 0);
    return { total, holder: holderSum, paid: total - holderSum };
  };
  const advanceTo = (iso: string) => {
    clock.t = Date.parse(iso);
  };
  return { c, clock, paid, holder, hold, end, bal, pools, advanceTo };
}

describe("holder credits: the pool", () => {
  it("grants a month's holder credits once per person and month, for the current month only, with their end date", async () => {
    const t = ledger();
    const g = await t.holder(300);
    expect(g).toMatchObject({ kind: "grant", grantSource: "holder", amount: 300, holder: 300, period: "2026-10", expiresAt: "2026-11-01T00:00:00.000Z" });
    expect(g.label).toBe("Holder credits for October 2026");
    // The same person and month again: the first grant, nothing new.
    expect((await t.holder(300)).id).toBe(g.id);
    await rejectsCode(t.holder(500), "conflict");
    // Never for another month, never zero or a fraction.
    await rejectsCode(t.holder(300, "usr_ada:2026-11", "2026-11"), "invalid_request");
    await rejectsCode(t.holder(300, "usr_ada:2026-09", "2026-09"), "invalid_request");
    await rejectsCode(t.holder(0, "usr_bo:2026-10"), "invalid_request");
    await rejectsCode(t.holder(1.5, "usr_bo:2026-10"), "invalid_request");
    // Holder credits never come in through the support grant.
    await rejectsCode(t.c.grant(WS, { credits: 300, source: "holder", sourceId: "x", by: "test" }), "invalid_request");
    expect(await t.bal()).toMatchObject({ available: 300, paid: 0, holder: { available: 300, period: "2026-10", expiresAt: monthEnd("2026-10") } });
  });

  it("spends paid credits first by default, then holder credits, and charges each pool only what it gave", async () => {
    const t = ledger("after_paid");
    await t.paid(10);
    await t.holder(20);
    // A hold of 25: all 10 paid, then 15 holder.
    const rc = await t.hold("run_1", 25);
    let hold = (await t.c.entries(WS)).find((e) => e.kind === "hold")!;
    expect(hold).toMatchObject({ amount: -25, holder: -15, period: "2026-10" });
    expect(await t.bal()).toMatchObject({ available: 5, paid: 0, holder: { available: 5 }, held: 25 });
    // It costs 12: paid first, so 10 paid and 2 holder; 13 holder credits come back.
    await t.end("run_1", rc, 12);
    const entries = await t.c.entries(WS);
    hold = entries.find((e) => e.kind === "hold")!;
    expect(entries.find((e) => e.kind === "release")).toMatchObject({ amount: 25, holder: 15 });
    expect(entries.find((e) => e.kind === "charge")).toMatchObject({ amount: -12, holder: -2 });
    expect(await t.bal()).toMatchObject({ available: 18, paid: 0, holder: { available: 18 }, held: 0 });
    expect(await t.pools()).toEqual({ total: 18, holder: 18, paid: 0 });
  });

  it("spends holder credits first when set to before_paid", async () => {
    const t = ledger("before_paid");
    await t.paid(10);
    await t.holder(20);
    const rc = await t.hold("run_1", 25);
    expect((await t.c.entries(WS)).find((e) => e.kind === "hold")).toMatchObject({ amount: -25, holder: -20 });
    await t.end("run_1", rc, 12);
    // 12 from the holder part; 8 holder and all 5 paid come back.
    expect((await t.c.entries(WS)).find((e) => e.kind === "charge")).toMatchObject({ amount: -12, holder: -12 });
    expect(await t.bal()).toMatchObject({ available: 18, paid: 10, holder: { available: 8 } });
  });

  it("gives everything back to the pool it came from when a run fails or is stopped", async () => {
    for (const status of ["failed", "cancelled"] as const) {
      const t = ledger();
      await t.paid(4);
      await t.holder(10);
      const rc = await t.hold("run_1", 9);
      expect(await t.bal()).toMatchObject({ paid: 0, holder: { available: 5 } });
      await t.end("run_1", rc, 9, status);
      expect(await t.bal()).toMatchObject({ available: 14, paid: 4, holder: { available: 10 }, held: 0 });
      expect((await t.c.entries(WS)).some((e) => e.kind === "charge")).toBe(false);
    }
  });

  it("refuses a run that both pools together cannot cover, before anything is held", async () => {
    const t = ledger();
    await t.paid(3);
    await t.holder(4);
    const refused = await rejectsCode(t.hold("run_1", 8), "not_enough_credits");
    expect(refused.message).toBe("This needs 8 credits. The workspace has 7 credits.");
    expect((await t.c.entries(WS)).some((e) => e.kind === "hold")).toBe(false);
    expect(await t.c.canSpend(WS, null, 7)).toBeNull();
    expect((await t.c.canSpend(WS, null, 8))?.code).toBe("not_enough_credits");
    // Exactly what both hold together goes through.
    await t.hold("run_2", 7);
    expect(await t.bal()).toMatchObject({ available: 0, held: 7 });
  });

  it("never lets a correction take holder credits: adjustments and x402 work on paid credits only", async () => {
    const t = ledger();
    await t.paid(5);
    await t.holder(100);
    // 105 in the workspace, but only 5 of it can be taken back by support.
    await rejectsCode(t.c.adjust(WS, { amount: -6, key: "take", by: "support", note: "Too much" }), "not_enough_credits");
    await t.c.adjust(WS, { amount: -5, key: "take-5", by: "support", note: "Fine" });
    expect(await t.bal()).toMatchObject({ available: 100, paid: 0, holder: { available: 100 } });
    expect(await t.pools()).toEqual({ total: 100, holder: 100, paid: 0 });
  });

  it("refunds a charge back into the pool and month it came from", async () => {
    const t = ledger("before_paid");
    await t.paid(10);
    await t.holder(10);
    const rc = await t.hold("run_1", 6);
    await t.end("run_1", rc, 6);
    expect(await t.bal()).toMatchObject({ paid: 10, holder: { available: 4 } });
    const r = await t.c.refundRun(WS, "run_1", { by: "support", note: "Bad output" });
    expect(r).toMatchObject({ kind: "refund", amount: 6, holder: 6, period: "2026-10" });
    expect(await t.bal()).toMatchObject({ paid: 10, holder: { available: 10 } });
  });
});

describe("holder credits: the end of the month", () => {
  it("stops counting what is left at the month's end and writes it off, once, keeping paid credits whole", async () => {
    const t = ledger();
    await t.paid(20);
    await t.holder(200);
    t.advanceTo("2026-10-31T23:59:59.000Z");
    expect((await t.bal()).holder.available).toBe(200);
    t.advanceTo("2026-11-01T00:00:00.000Z");
    // The new month: nothing of October's is spendable any more, even before the write-off.
    expect(await t.bal()).toMatchObject({ available: 20, paid: 20, holder: { available: 0, period: "2026-11", expiresAt: "2026-12-01T00:00:00.000Z" } });
    await rejectsCode(t.hold("run_1", 25), "not_enough_credits");
    expect(await t.c.expireHolder(WS)).toBe(200);
    expect(await t.c.expireHolder(WS)).toBe(0);
    const expired = (await t.c.entries(WS)).filter((e) => e.kind === "expire");
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ amount: -200, holder: -200, period: "2026-10", key: "expire:holder:2026-10:1", label: "Holder credits for October 2026 expired" });
    expect(await t.pools()).toEqual({ total: 20, holder: 0, paid: 20 });
    // November's grant is its own.
    await t.holder(120, "usr_ada:2026-11", "2026-11");
    expect(await t.bal()).toMatchObject({ available: 140, holder: { available: 120 } });
  });

  it("writes off what is left before a new hold or a new month's grant", async () => {
    const t = ledger();
    await t.paid(10);
    await t.holder(30);
    t.advanceTo("2026-11-02T08:00:00.000Z");
    await t.hold("run_1", 5);
    const kinds = (await t.c.entries(WS)).map((e) => e.kind);
    expect(kinds.slice(-2)).toEqual(["expire", "hold"]);
    expect(await t.pools()).toEqual({ total: 5, holder: 0, paid: 5 });
  });

  it("charges a run held in one month and ended in the next from the first month, and writes off its give-back", async () => {
    const t = ledger("before_paid");
    await t.paid(10);
    await t.holder(30);
    const rc = await t.hold("run_1", 20);
    expect((await t.c.entries(WS)).find((e) => e.kind === "hold")).toMatchObject({ holder: -20, period: "2026-10" });
    // The month ends while the run works; the job writes off the 10 that were not held.
    t.advanceTo("2026-11-01T00:00:05.000Z");
    expect(await t.c.expireHolder(WS)).toBe(10);
    // The run costs 7: from its October holder part. The 13 given back belong to October and are written off next.
    await t.end("run_1", rc, 7);
    const after = await t.c.entries(WS);
    expect(after.find((e) => e.kind === "release")).toMatchObject({ amount: 20, holder: 20, period: "2026-10" });
    expect(after.find((e) => e.kind === "charge")).toMatchObject({ amount: -7, holder: -7, period: "2026-10" });
    expect(await t.bal()).toMatchObject({ available: 10, paid: 10, holder: { available: 0 } });
    expect(await t.c.expireHolder(WS)).toBe(13);
    expect((await t.c.entries(WS)).filter((e) => e.kind === "expire").map((e) => e.key)).toEqual(["expire:holder:2026-10:1", "expire:holder:2026-10:2"]);
    expect(await t.pools()).toEqual({ total: 10, holder: 0, paid: 10 });
  });

  it("keeps every entry's balance adding up, and neither pool below zero, through a month of use", async () => {
    const t = ledger();
    await t.paid(40);
    await t.holder(60);
    for (let i = 0; i < 6; i++) {
      const rc = await t.hold(`run_${i}`, 15);
      await t.end(`run_${i}`, rc, 3 + i);
    }
    t.advanceTo("2026-11-01T01:00:00.000Z");
    await t.c.expireHolder(WS);
    let total = 0;
    let paid = 0;
    let holder = 0;
    for (const e of await t.c.entries(WS)) {
      total += e.amount;
      holder += holderPart(e);
      paid += e.amount - holderPart(e);
      expect(e.balanceAfter).toBe(total);
      expect(paid).toBeGreaterThanOrEqual(0);
      expect(holder).toBeGreaterThanOrEqual(0);
    }
    // 3+4+5+6+7+8 = 33 charged, paid first: all 40 paid credits cover it, so 7 paid are left and all 60 holder expire.
    expect(await t.pools()).toEqual({ total: 7, holder: 0, paid: 7 });
    expect(await t.c.workspacesWithHolderCredits()).toEqual([WS]);
  });
});

describe("holder credits: through the app", () => {
  it("runs and pipelines on holder credits, each step charged from the right pool, and the rest back where it came from", async () => {
    const t = await testApp({ credits: { config: { holderSpendOrder: "before_paid" } } });
    await t.seedTeamBrains();
    const crumb = (await t.brandStore.brains.find({ workspaceId: t.team.id, name: "Crumb and Co" }))[0];
    const me = as(t.ada.id);
    const ws = t.team.id;
    const c = t.credits!;
    await c.adjust(ws, { amount: 20, key: "paid", by: "test", note: "Paid credits" });
    await c.grantHolder(ws, { credits: 500, period: "2026-10", sourceId: `${t.ada.id}:2026-10`, by: "holders" });
    expect(await c.balance(ws)).toMatchObject({ available: 520, paid: 20, holder: { available: 500 } });

    const run = await t.api.startRun(me, ws, { agentId: "hook-writer", inputs: SAMPLE_RUNS["hook-writer"].inputs });
    const done = await t.engine.waitForRun(ws, run.id);
    const charged = done.credits!.charged!;
    expect(charged).toBeGreaterThan(0);
    // Holder credits first; paid credits never touched.
    expect(await c.balance(ws)).toMatchObject({ paid: 20, holder: { available: 500 - charged }, held: 0 });

    const started = await t.api.startPipeline(me, ws, { pipelineId: "idea-to-post", inputs: { start: "my_idea", idea: "Gerald the sourdough starter turns nine on Saturday and gets his own cake", platform: "tiktok", length: "s30", brand: crumb.id } });
    await t.pipelineEngine.waitUntilSettled(ws, started.id);
    await t.api.pickInPipeline(me, ws, started.id, "hooks", 0);
    const piped = await t.pipelineEngine.waitUntilSettled(ws, started.id);
    expect(piped.status).toBe("ready");
    const steps = piped.credits!.charged;
    expect(steps).toBeGreaterThan(0);
    expect(await c.balance(ws)).toMatchObject({ available: 520 - charged - steps, paid: 20, holder: { available: 500 - charged - steps }, held: 0 });
    // Every step's charge is all holder credits, and the pipeline's hold gave the rest back to the holder pool.
    const entries = await c.entries(ws);
    for (const e of entries.filter((x) => x.kind === "charge")) expect(holderPart(e)).toBe(e.amount);
    let paid = 0;
    for (const e of entries) {
      paid += e.amount - holderPart(e);
      expect(paid).toBeGreaterThanOrEqual(0);
    }
    // The history says how much of a run was holder credits.
    const activity = await c.activity(ws);
    expect(activity.find((a) => a.type === "run")).toMatchObject({ holder: charged });
    expect(activity.find((a) => a.type === "grant")).toMatchObject({ amount: 500, holder: 500 });
  });
});
