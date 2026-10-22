/**
 * Credits: a workspace's balance as an append-only ledger, holds while runs
 * and pipelines are in progress, top-ups through a payment provider, and
 * monthly limits. The run engine and the pipeline engine call it through
 * their billing hooks; the app reaches it through GuardedCredits (guard.ts).
 *
 * Rules every write keeps:
 * - Every entry has a key that is unique in its workspace. Writing the same
 *   key again returns the first entry, so a retry or a double click never
 *   charges twice. The same key with a different amount is refused.
 * - Writes for one workspace happen one at a time, and the balance check and
 *   the write are one step, so the balance never goes below zero.
 * - A run is never charged more than it held, and what it held is never more
 *   than the estimate the person was shown.
 */
import { randomUUID } from "node:crypto";
import type { AgentRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { AgentSpec } from "@/lib/agents/spec";
import { BillingRefusal, type RunBilling, type RunBillingRequest } from "@/lib/runs/billing";
import { toMicroUsd } from "@/lib/runs/prices";
import type { Run } from "@/lib/runs/run";
import { CREDITS, centsFor, creditWords, priceWords, type CreditsConfig } from "./config";
import type { PaymentProvider } from "./payments";
import { chargeFor, creditsForCost, estimateCredits, median, monthOf, staticRunMicroUsd } from "./pricing";
import type { CreditStore } from "./store";
import type { Balance, CreditLimits, GrantSource, HoldState, LedgerEntry, LedgerKind, LedgerRef, PipelineCredits, ReleaseReason, RunCredits, TopUp } from "./types";

export type { CreditsConfig };

export type CreditErrorCode = "invalid_request" | "not_found" | "not_enough_credits" | "over_limit" | "payments_closed" | "payment_failed" | "conflict";

export class CreditError extends Error {
  constructor(
    readonly code: CreditErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "CreditError";
  }
}

/** Where the typical cost of an agent comes from: its finished runs. */
export interface AgentHistory {
  runsOfAgent(agentWorkspaceId: string, agentId: string): Promise<Run[]>;
}

export type CreditsOptions = {
  store: CreditStore;
  /** The provider for top-ups. Null closes top-ups. */
  payments?: PaymentProvider | null;
  /** Full agent specs, for estimates by agent id. */
  registry?: AgentRegistry;
  /** Finished runs, for the typical cost. Left out, the estimate comes from the prompt alone. */
  history?: AgentHistory;
  config?: Partial<CreditsConfig>;
  now?: () => Date;
  newId?: () => string;
};

/** An entry before it is written: the ledger fills in the id, the balance and the time. */
type Draft = Pick<LedgerEntry, "key" | "kind" | "amount"> & Partial<Omit<LedgerEntry, "id" | "workspaceId" | "key" | "kind" | "amount" | "balanceAfter" | "createdAt">>;

/** One line of the credits page: a run, a pipeline, a top-up or a support entry, with its entries folded together. */
export type ActivityItem = {
  id: string;
  type: "run" | "pipeline_run" | "top_up" | "grant" | "refund" | "adjustment";
  label: string;
  /** The change to the balance once it is settled; the hold while it runs. */
  amount: number;
  held: number | null;
  charged: number | null;
  back: number | null;
  state: "held" | "charged" | "refunded" | "added" | "removed";
  reason: ReleaseReason | null;
  ref: LedgerRef | null;
  userId: string | null;
  by: string | null;
  test: boolean;
  note: string | null;
  at: string;
};

const POSITIVE_INT = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

export class Credits implements RunBilling {
  readonly cfg: CreditsConfig;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly locks = new Map<string, Promise<unknown>>();
  private history: AgentHistory | null;

  constructor(private readonly o: CreditsOptions) {
    this.cfg = { ...CREDITS, ...o.config };
    this.now = o.now ?? (() => new Date());
    this.newId = o.newId ?? (() => `crd_${randomUUID().replace(/-/g, "").slice(0, 20)}`);
    this.history = o.history ?? null;
  }

  /** The finished runs the typical cost reads. Set after the engine exists, since the engine also needs this service. */
  useHistory(history: AgentHistory) {
    this.history = history;
  }

  get payments(): PaymentProvider | null {
    return this.o.payments ?? null;
  }

  private iso() {
    return this.now().toISOString();
  }

  /* ---------- The ledger ---------- */

  /** Runs `fn` alone for this workspace: one write at a time, so a check and its write are one step. */
  private lock<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
    const before = this.locks.get(workspaceId) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(fn);
    this.locks.set(workspaceId, mine);
    return mine.finally(() => {
      if (this.locks.get(workspaceId) === mine) this.locks.delete(workspaceId);
    });
  }

  /** Every entry of the workspace, oldest first. */
  async entries(workspaceId: string): Promise<LedgerEntry[]> {
    // Rows come back in the order they were written; the sort is stable, so entries written together stay in order.
    return (await this.o.store.ledger.find({ workspaceId })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private sum(entries: LedgerEntry[]): number {
    return entries.reduce((t, e) => t + e.amount, 0);
  }

  /**
   * Writes entries together. Must run inside the workspace's lock. Entries
   * whose key exists are not written again; a key that exists with another
   * kind or amount is refused. Nothing is written when any entry would take
   * the balance below zero.
   */
  private async write(workspaceId: string, drafts: Draft[]): Promise<LedgerEntry[]> {
    const all = await this.entries(workspaceId);
    const byKey = new Map(all.map((e) => [e.key, e]));
    let balance = this.sum(all);
    const out: LedgerEntry[] = [];
    const fresh: LedgerEntry[] = [];
    const at = this.iso();
    for (const d of drafts) {
      if (!Number.isInteger(d.amount)) throw new CreditError("invalid_request", "Credits are whole numbers.");
      const have = byKey.get(d.key);
      if (have) {
        if (have.kind !== d.kind || have.amount !== d.amount) throw new CreditError("conflict", `The ledger already has "${d.key}" with another amount.`);
        out.push(have);
        continue;
      }
      balance += d.amount;
      if (balance < 0) {
        const available = balance - d.amount;
        throw new BillingRefusal("not_enough_credits", `This needs ${creditWords(-d.amount)}. The workspace has ${creditWords(available)}.`, { needed: -d.amount, available });
      }
      const entry: LedgerEntry = {
        id: this.newId(),
        workspaceId,
        key: d.key,
        kind: d.kind,
        amount: d.amount,
        balanceAfter: balance,
        holdId: d.holdId ?? null,
        ref: d.ref ?? null,
        userId: d.userId ?? null,
        by: d.by ?? null,
        label: d.label ?? "",
        note: d.note ?? null,
        reason: d.reason ?? null,
        grantSource: d.grantSource ?? null,
        test: d.test ?? false,
        costMicroUsd: d.costMicroUsd ?? null,
        createdAt: at,
      };
      byKey.set(d.key, entry);
      fresh.push(entry);
      out.push(entry);
    }
    for (const e of fresh) await this.o.store.ledger.insert(e);
    return out;
  }

  /** One hold as it stands, from its entries. Null when there is no such hold. */
  private holdFrom(entries: LedgerEntry[], holdId: string): HoldState | null {
    const mine = entries.filter((e) => e.holdId === holdId);
    const hold = mine.find((e) => e.kind === "hold");
    if (!hold) return null;
    const amount = -hold.amount;
    const released = mine.filter((e) => e.kind === "release").reduce((t, e) => t + e.amount, 0);
    const charged = mine.filter((e) => e.kind === "charge").reduce((t, e) => t - e.amount, 0);
    const closed = mine.some((e) => e.kind === "release" && e.reason !== "step");
    return { holdId, workspaceId: hold.workspaceId, amount, released, charged, open: closed ? 0 : amount - released, closed, userId: hold.userId, label: hold.label, ref: hold.ref, createdAt: hold.createdAt };
  }

  async hold(workspaceId: string, holdId: string): Promise<HoldState | null> {
    return this.holdFrom(await this.entries(workspaceId), holdId);
  }

  private openHolds(entries: LedgerEntry[]): HoldState[] {
    const ids = [...new Set(entries.filter((e) => e.kind === "hold").map((e) => e.holdId!))];
    return ids.map((id) => this.holdFrom(entries, id)!).filter((h) => !h.closed);
  }

  /* ---------- Balance and limits ---------- */

  async balance(workspaceId: string): Promise<Balance> {
    const entries = await this.entries(workspaceId);
    const held = this.openHolds(entries).reduce((t, h) => t + h.open, 0);
    return { workspaceId, available: this.sum(entries), held, usedThisMonth: this.used(entries, null) };
  }

  /**
   * Spent this calendar month (charges minus refunds of them), plus what is
   * held right now, for the workspace or one member.
   */
  private used(entries: LedgerEntry[], userId: string | null): number {
    const month = monthOf(this.iso());
    const mine = (e: { userId: string | null }) => userId === null || e.userId === userId;
    const spent = entries.filter((e) => mine(e) && monthOf(e.createdAt) === month && (e.kind === "charge" || e.kind === "refund")).reduce((t, e) => t - e.amount, 0);
    const held = this.openHolds(entries)
      .filter(mine)
      .reduce((t, h) => t + h.open, 0);
    return Math.max(0, spent) + held;
  }

  async usedThisMonth(workspaceId: string, userId: string | null = null): Promise<number> {
    return this.used(await this.entries(workspaceId), userId);
  }

  async limits(workspaceId: string): Promise<CreditLimits> {
    return (await this.o.store.limits.get(workspaceId)) ?? { id: workspaceId, workspaceId, monthly: null, members: {}, updatedBy: null, updatedAt: new Date(0).toISOString() };
  }

  /** Sets the monthly limits. Null or a missing member means no limit. */
  async setLimits(workspaceId: string, next: { monthly?: number | null; members?: Record<string, number | null> }, by: string): Promise<CreditLimits> {
    const check = (n: unknown, what: string) => {
      if (n === null) return;
      if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > this.cfg.maxMonthlyLimit) throw new CreditError("invalid_request", `${what} must be a whole number of credits from 0 to ${this.cfg.maxMonthlyLimit.toLocaleString("en-US")}.`);
    };
    if (next.monthly !== undefined) check(next.monthly, "The monthly limit");
    for (const v of Object.values(next.members ?? {})) check(v, "A member's limit");
    return this.lock(workspaceId, async () => {
      const current = await this.limits(workspaceId);
      const members = { ...current.members };
      for (const [userId, v] of Object.entries(next.members ?? {})) {
        if (v === null) delete members[userId];
        else members[userId] = v;
      }
      const row: CreditLimits = { ...current, monthly: next.monthly === undefined ? current.monthly : next.monthly, members, updatedBy: by, updatedAt: this.iso() };
      if (await this.o.store.limits.get(workspaceId)) await this.o.store.limits.update(row);
      else await this.o.store.limits.insert(row);
      return row;
    });
  }

  /** Refuses spending `add` more when it would pass the workspace's or the member's monthly limit. */
  private async checkLimits(workspaceId: string, userId: string | null, add: number, entries: LedgerEntry[]) {
    const limits = await this.limits(workspaceId);
    if (limits.monthly !== null) {
      const used = this.used(entries, null);
      if (used + add > limits.monthly) {
        throw new BillingRefusal("over_limit", `This would pass the workspace's monthly limit of ${creditWords(limits.monthly)}. ${creditWords(used)} used this month.`, { limit: limits.monthly, used, needed: add, scope: "workspace" });
      }
    }
    const own = userId ? limits.members[userId] : undefined;
    if (userId && own !== undefined) {
      const used = this.used(entries, userId);
      if (used + add > own) {
        throw new BillingRefusal("over_limit", `This would pass your monthly limit of ${creditWords(own)}. You have used ${creditWords(used)} this month.`, { limit: own, used, needed: add, scope: "member" });
      }
    }
  }

  /** Whether `add` more could be held now: balance and limits. Null when it can, else the refusal. */
  async canSpend(workspaceId: string, userId: string | null, add: number): Promise<BillingRefusal | null> {
    const entries = await this.entries(workspaceId);
    try {
      await this.checkLimits(workspaceId, userId, add, entries);
    } catch (err) {
      if (err instanceof BillingRefusal) return err;
      throw err;
    }
    const available = this.sum(entries);
    return available < add ? new BillingRefusal("not_enough_credits", `This needs ${creditWords(add)}. The workspace has ${creditWords(available)}.`, { needed: add, available }) : null;
  }

  /* ---------- Estimates ---------- */

  /**
   * The estimate for one run of an agent, in credits: the typical cost (the
   * middle cost of its last finished runs, or one full answer at its main
   * model until there are enough), times the headroom, never above its spend
   * cap, at least the minimum. A run never costs more than this.
   */
  async estimateAgent(spec: AgentSpec, agentWorkspaceId: string): Promise<number> {
    const cap = toMicroUsd(spec.routing.maxCostUsd);
    let typical = staticRunMicroUsd(spec);
    if (this.history) {
      const runs = (await this.history.runsOfAgent(agentWorkspaceId, spec.id).catch(() => [] as Run[]))
        // Bench runs in the platform workspace are tests, not what people pay for.
        .filter((r) => r.status === "succeeded" && r.workspaceId !== PLATFORM_WORKSPACE_ID)
        .slice(0, this.cfg.typicalCost.lastRuns);
      const mid = runs.length >= this.cfg.typicalCost.minRuns ? median(runs.map((r) => r.costMicroUsd)) : null;
      if (mid !== null) typical = mid;
    }
    return estimateCredits(typical, cap, this.cfg);
  }

  /** The estimate for an agent by id, from the registry. Null when there is no such agent. */
  async estimateById(agentWorkspaceId: string, agentId: string, version?: string): Promise<number | null> {
    const spec = await this.o.registry?.get(agentWorkspaceId, agentId, version);
    return spec ? this.estimateAgent(spec, agentWorkspaceId) : null;
  }

  /**
   * The estimate for a pipeline run: every step's own estimate, twice for a
   * step that may be rewritten, never above what the pipeline's spend cap
   * allows (with a credit of rounding per run).
   */
  async estimatePipeline(steps: { spec: AgentSpec; agentWorkspaceId: string; rewrite: boolean }[], capMicroUsd: number): Promise<number> {
    let sum = 0;
    let runs = 0;
    for (const s of steps) {
      const each = await this.estimateAgent(s.spec, s.agentWorkspaceId);
      const n = s.rewrite ? 2 : 1;
      sum += each * n;
      runs += n;
    }
    const bound = creditsForCost(capMicroUsd, this.cfg) + runs * this.cfg.minCreditsPerRun;
    return Math.max(this.cfg.minCreditsPerRun, Math.min(sum, bound));
  }

  /* ---------- Runs (the engine's hooks) ---------- */

  async reserveRun(input: { workspaceId: string; runId: string; spec: AgentSpec; agentWorkspaceId: string; billing: RunBillingRequest }): Promise<RunCredits> {
    const { workspaceId, runId, spec, billing } = input;
    const userId = billing.userId ?? null;
    if (billing.free === "bench") return { mode: "free", estimate: 0, holdId: null, state: "free", charged: 0, back: 0, userId };
    let estimate = await this.estimateAgent(spec, input.agentWorkspaceId);
    if (billing.quotedCredits !== undefined) {
      if (!POSITIVE_INT(billing.quotedCredits)) throw new CreditError("invalid_request", "The quoted estimate must be a whole number of credits.");
      estimate = Math.min(estimate, billing.quotedCredits);
    }

    if (billing.pipeline) {
      const holdId = billing.pipeline.holdId;
      // A step takes its part of the pipeline's hold. Steps run one after another, so what is open is what it can use.
      const hold = await this.hold(workspaceId, holdId);
      if (!hold || hold.closed) throw new BillingRefusal("hold_closed", "This pipeline run has ended.");
      return { mode: "pipeline", estimate: Math.min(estimate, hold.open), holdId, state: "held", charged: null, back: null, userId: hold.userId };
    }

    const holdId = `run:${runId}`;
    return this.lock(workspaceId, async () => {
      const entries = await this.entries(workspaceId);
      if (!entries.some((e) => e.key === `hold:${holdId}`)) await this.checkLimits(workspaceId, userId, estimate, entries);
      await this.write(workspaceId, [{ key: `hold:${holdId}`, kind: "hold", amount: -estimate, holdId, ref: { type: "run", id: runId }, userId, label: spec.name }]);
      return { mode: "own", estimate, holdId, state: "held", charged: null, back: null, userId };
    });
  }

  /**
   * Charges a finished run its real price, never more than it held, and gives
   * the rest back. A failed or cancelled run gives everything back. Once
   * settled, settling again returns the same answer.
   */
  async settleRun(run: Run): Promise<RunCredits | null> {
    const c = run.credits;
    if (!c || c.mode === "free" || !c.holdId) return c ?? null;
    if (!["succeeded", "failed", "cancelled"].includes(run.status)) return c;
    const paid = run.status === "succeeded" || this.cfg.chargeFailedRuns;
    const ws = run.workspaceId;
    const holdId = c.holdId;

    if (c.mode === "pipeline") {
      return this.lock(ws, async () => {
        const entries = await this.entries(ws);
        const have = entries.find((e) => e.key === `charge:run:${run.id}`);
        if (have) return { ...c, state: "charged", charged: -have.amount, back: null };
        const hold = this.holdFrom(entries, holdId);
        const amount = paid && hold ? Math.min(chargeFor(run.costMicroUsd, c.estimate, this.cfg), hold.open) : 0;
        if (amount <= 0) return { ...c, state: "refunded", charged: 0, back: null };
        await this.write(ws, [
          { key: `step:run:${run.id}`, kind: "release", amount, holdId, ref: { type: "run", id: run.id }, userId: c.userId, label: hold!.label, reason: "step" },
          { key: `charge:run:${run.id}`, kind: "charge", amount: -amount, holdId, ref: { type: "run", id: run.id }, userId: c.userId, label: hold!.label, costMicroUsd: run.costMicroUsd },
        ]);
        return { ...c, state: "charged", charged: amount, back: null };
      });
    }

    return this.lock(ws, async () => {
      const entries = await this.entries(ws);
      const hold = this.holdFrom(entries, holdId);
      if (!hold) return c;
      if (hold.closed) return { ...c, state: hold.charged > 0 ? "charged" : "refunded", charged: hold.charged, back: hold.amount - hold.charged };
      const amount = paid ? chargeFor(run.costMicroUsd, hold.amount, this.cfg) : 0;
      const reason: ReleaseReason = run.status === "succeeded" ? "settled" : run.status === "failed" ? "failed" : "cancelled";
      await this.write(ws, [
        { key: `release:${holdId}`, kind: "release", amount: hold.amount, holdId, ref: hold.ref, userId: hold.userId, label: hold.label, reason },
        ...(amount > 0 ? [{ key: `charge:${holdId}`, kind: "charge" as const, amount: -amount, holdId, ref: hold.ref, userId: hold.userId, label: hold.label, costMicroUsd: run.costMicroUsd }] : []),
      ]);
      return { ...c, state: amount > 0 ? "charged" : "refunded", charged: amount, back: hold.amount - amount };
    });
  }

  /* ---------- Pipelines ---------- */

  /** Holds a pipeline run's estimate. `attempt` counts tries, since a retry holds again. */
  async reservePipeline(input: { workspaceId: string; pipelineRunId: string; attempt: number; estimate: number; userId: string | null; label: string; previous?: PipelineCredits | null }): Promise<PipelineCredits> {
    const { workspaceId, pipelineRunId, attempt, estimate, userId, label } = input;
    if (!POSITIVE_INT(estimate)) throw new CreditError("invalid_request", "A pipeline estimate is a whole number of credits.");
    const holdId = `pip:${pipelineRunId}:${attempt}`;
    await this.lock(workspaceId, async () => {
      const entries = await this.entries(workspaceId);
      if (!entries.some((e) => e.key === `hold:${holdId}`)) await this.checkLimits(workspaceId, userId, estimate, entries);
      await this.write(workspaceId, [{ key: `hold:${holdId}`, kind: "hold", amount: -estimate, holdId, ref: { type: "pipeline_run", id: pipelineRunId }, userId, label }]);
    });
    const prev = input.previous;
    return { holdId, holdIds: [...(prev?.holdIds ?? []), holdId], estimate: (prev?.estimate ?? 0) + estimate, state: "held", charged: prev?.charged ?? 0, back: prev?.back ?? 0, userId };
  }

  /** What a pipeline run has been charged so far, over all its tries, and what came back. */
  async pipelineTotals(workspaceId: string, c: PipelineCredits): Promise<PipelineCredits> {
    const entries = await this.entries(workspaceId);
    let charged = 0;
    let back = 0;
    let open = false;
    for (const id of c.holdIds) {
      const h = this.holdFrom(entries, id);
      if (!h) continue;
      charged += h.charged;
      if (h.closed) back += h.amount - h.charged;
      else open = true;
    }
    return { ...c, charged, back, state: open ? "held" : "settled" };
  }

  /** Ends a pipeline run's hold: whatever its steps did not use comes back. Safe to call again. */
  async closePipeline(workspaceId: string, c: PipelineCredits, reason: ReleaseReason = "ended"): Promise<PipelineCredits> {
    await this.lock(workspaceId, async () => {
      const hold = this.holdFrom(await this.entries(workspaceId), c.holdId);
      if (!hold || hold.closed) return;
      // Zero still closes it, so the hold reads as ended.
      await this.write(workspaceId, [{ key: `release:${c.holdId}`, kind: "release", amount: hold.open, holdId: c.holdId, ref: hold.ref, userId: hold.userId, label: hold.label, reason }]);
    });
    return this.pipelineTotals(workspaceId, c);
  }

  /* ---------- Top-ups, grants, support ---------- */

  /**
   * Buys a pack through the payment provider. The test provider pays at
   * once and the top-up is marked as a test. With a key, a second call
   * returns the first top-up.
   */
  async topUp(workspaceId: string, input: { credits: number; by: string; idempotencyKey?: string }): Promise<TopUp> {
    const provider = this.payments;
    if (!provider) throw new CreditError("payments_closed", "Top-ups are not open yet.");
    if (!Number.isInteger(input.credits) || input.credits < this.cfg.minTopUpCredits) {
      throw new CreditError("invalid_request", `The smallest top-up is ${creditWords(this.cfg.minTopUpCredits)} (${priceWords(this.cfg.minTopUpCredits)}).`);
    }
    if (!this.cfg.packs.includes(input.credits)) throw new CreditError("invalid_request", `Pick one of the packs: ${this.cfg.packs.join(", ")} credits.`);
    if (input.idempotencyKey !== undefined && !/^[A-Za-z0-9_.:-]{1,100}$/.test(input.idempotencyKey)) throw new CreditError("invalid_request", "The idempotency key is not valid.");
    if (input.idempotencyKey) {
      const [have] = await this.o.store.topUps.find({ workspaceId, idempotencyKey: input.idempotencyKey });
      if (have) {
        if (have.credits !== input.credits) throw new CreditError("conflict", "This key was already used for another top-up.");
        return have;
      }
    }
    const row: TopUp = {
      id: this.newId().replace(/^crd_/, "top_"),
      workspaceId,
      credits: input.credits,
      amountCents: centsFor(input.credits),
      currency: "usd",
      provider: provider.id,
      providerRef: null,
      test: provider.test,
      status: "pending",
      idempotencyKey: input.idempotencyKey ?? null,
      by: input.by,
      createdAt: this.iso(),
      completedAt: null,
      error: null,
    };
    await this.o.store.topUps.insert(row);
    const result = await provider.checkout({ topUpId: row.id, workspaceId, credits: row.credits, amountCents: row.amountCents, currency: "usd" });
    if (result.status === "failed") {
      const failed = { ...row, status: "failed" as const, error: result.error, completedAt: this.iso() };
      await this.o.store.topUps.update(failed);
      throw new CreditError("payment_failed", `The payment did not go through: ${result.error}`);
    }
    const withRef = { ...row, providerRef: result.providerRef };
    await this.o.store.topUps.update(withRef);
    return result.status === "paid" ? this.completeTopUp(withRef) : withRef;
  }

  /** For a provider's webhook later: a pending top-up that has been paid lands in the ledger, once. */
  async confirmTopUp(workspaceId: string, topUpId: string): Promise<TopUp> {
    const row = await this.o.store.topUps.get(topUpId);
    if (!row || row.workspaceId !== workspaceId) throw new CreditError("not_found", "No such top-up.");
    if (row.status !== "pending" || !row.providerRef || !this.payments) return row;
    const state = await this.payments.confirm(row.providerRef);
    if (state === "paid") return this.completeTopUp(row);
    if (state === "failed") {
      const failed = { ...row, status: "failed" as const, completedAt: this.iso(), error: "The payment was not completed." };
      await this.o.store.topUps.update(failed);
      return failed;
    }
    return row;
  }

  private async completeTopUp(row: TopUp): Promise<TopUp> {
    await this.lock(row.workspaceId, () =>
      this.write(row.workspaceId, [{ key: `topup:${row.id}`, kind: "top_up", amount: row.credits, ref: { type: "top_up", id: row.id }, by: row.by, label: row.test ? `Test top-up, ${creditWords(row.credits)}` : `Top-up, ${creditWords(row.credits)}`, test: row.test }]),
    );
    const done = { ...row, status: "paid" as const, completedAt: this.iso() };
    await this.o.store.topUps.update(done);
    return done;
  }

  async topUps(workspaceId: string): Promise<TopUp[]> {
    return (await this.o.store.topUps.find({ workspaceId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * The hook for credits given rather than bought: holder credits (phase 17)
   * will call this. Nothing calls it yet. One grant per source id.
   */
  async grant(workspaceId: string, input: { credits: number; source: GrantSource; sourceId: string; by: string; note?: string }): Promise<LedgerEntry> {
    if (!POSITIVE_INT(input.credits)) throw new CreditError("invalid_request", "A grant is a whole number of credits.");
    if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(input.sourceId)) throw new CreditError("invalid_request", "The grant needs a source id.");
    const [e] = await this.lock(workspaceId, () =>
      this.write(workspaceId, [{ key: `grant:${input.source}:${input.sourceId}`, kind: "grant", amount: input.credits, ref: { type: "grant", id: input.sourceId }, by: input.by, label: `Grant, ${creditWords(input.credits)}`, grantSource: input.source, note: input.note ?? null }]),
    );
    return e;
  }

  /**
   * Credits paid for per call with x402 (phase 15): the quote lands as a
   * top-up once per payment, in the x402 workspace, just before its run
   * holds it. What the run does not use leaves again through `adjust`.
   */
  async payX402(workspaceId: string, input: { paymentId: string; credits: number; label: string; test: boolean }): Promise<LedgerEntry> {
    if (!POSITIVE_INT(input.credits)) throw new CreditError("invalid_request", "An x402 payment is a whole number of credits.");
    const [e] = await this.lock(workspaceId, () =>
      this.write(workspaceId, [{ key: `x402:${input.paymentId}`, kind: "top_up", amount: input.credits, ref: { type: "top_up", id: input.paymentId }, by: "x402", label: input.label, test: input.test }]),
    );
    return e;
  }

  /** A correction by support, plus or minus. Never takes the balance below zero. */
  async adjust(workspaceId: string, input: { amount: number; key: string; by: string; note: string }): Promise<LedgerEntry> {
    if (!Number.isInteger(input.amount) || input.amount === 0) throw new CreditError("invalid_request", "An adjustment is a whole number of credits, not zero.");
    if (!input.note?.trim()) throw new CreditError("invalid_request", "Say why in a note.");
    const [e] = await this.lock(workspaceId, () =>
      this.write(workspaceId, [{ key: `adjust:${input.key}`, kind: "adjustment", amount: input.amount, ref: { type: "manual", id: input.key }, by: input.by, label: "Adjustment", note: input.note.trim() }]),
    );
    return e;
  }

  /** Gives a run's charge back afterwards, once. */
  async refundRun(workspaceId: string, runId: string, input: { by: string; note: string }): Promise<LedgerEntry> {
    return this.lock(workspaceId, async () => {
      const entries = await this.entries(workspaceId);
      const charge = entries.find((e) => e.kind === "charge" && e.ref?.type === "run" && e.ref.id === runId);
      if (!charge) throw new CreditError("not_found", "That run was not charged.");
      const [e] = await this.write(workspaceId, [{ key: `refund:run:${runId}`, kind: "refund", amount: -charge.amount, ref: charge.ref, userId: charge.userId, by: input.by, label: charge.label, note: input.note.trim() || null }]);
      return e;
    });
  }

  /* ---------- Reading ---------- */

  /** The newest entries first. */
  async ledger(workspaceId: string, opts: { limit?: number; kinds?: LedgerKind[] } = {}): Promise<LedgerEntry[]> {
    const rows = (await this.entries(workspaceId)).reverse().filter((e) => !opts.kinds || opts.kinds.includes(e.kind));
    return opts.limit ? rows.slice(0, opts.limit) : rows;
  }

  /** The ledger folded into one line per run, pipeline run, top-up or support entry, newest first. */
  async activity(workspaceId: string, opts: { limit?: number } = {}): Promise<ActivityItem[]> {
    const entries = await this.entries(workspaceId);
    const items: ActivityItem[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      if (e.holdId) {
        if (seen.has(e.holdId)) continue;
        seen.add(e.holdId);
        const h = this.holdFrom(entries, e.holdId);
        if (!h) continue;
        const end = entries.filter((x) => x.holdId === e.holdId && x.kind === "release" && x.reason !== "step").pop();
        items.push({
          id: e.holdId,
          type: h.ref?.type === "pipeline_run" ? "pipeline_run" : "run",
          label: h.label,
          amount: h.closed ? -h.charged : -h.amount,
          held: h.amount,
          charged: h.closed ? h.charged : null,
          back: h.closed ? h.amount - h.charged : null,
          state: !h.closed ? "held" : h.charged > 0 ? "charged" : "refunded",
          reason: end?.reason ?? null,
          ref: h.ref,
          userId: h.userId,
          by: null,
          test: false,
          note: null,
          at: h.createdAt,
        });
        continue;
      }
      const type = e.kind === "top_up" ? "top_up" : e.kind === "grant" ? "grant" : e.kind === "refund" ? "refund" : "adjustment";
      items.push({ id: e.id, type, label: e.label, amount: e.amount, held: null, charged: null, back: null, state: e.amount >= 0 ? "added" : "removed", reason: null, ref: e.ref, userId: e.userId, by: e.by, test: e.test, note: e.note, at: e.createdAt });
    }
    const out = items.reverse();
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  /** The holds still open in a workspace. After a restart the engines settle the ones whose run has ended. */
  async openHoldsOf(workspaceId: string): Promise<HoldState[]> {
    return this.openHolds(await this.entries(workspaceId));
  }

  /** Every workspace with an open hold, for recovery after a restart. */
  async workspacesWithOpenHolds(): Promise<string[]> {
    const all = await this.o.store.ledger.find({});
    const ids = [...new Set(all.filter((e) => e.kind === "hold").map((e) => e.workspaceId))];
    const out: string[] = [];
    for (const ws of ids) if ((await this.openHoldsOf(ws)).length) out.push(ws);
    return out;
  }
}
