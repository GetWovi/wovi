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
 * - Two pools, never mixed (phase 17): paid credits and holder credits. Each
 *   entry carries its holder part and that part's month. A hold takes from
 *   the pools in the configured order (`holderSpendOrder`) and every release,
 *   charge and refund goes back to, or out of, the pool and month it came
 *   from. Neither pool ever goes below zero. Holder credits only come in
 *   through `grantHolder`, are never moved, swapped or paid out, and what is
 *   left of a month's at its end is written off by an `expire` entry.
 */
import { randomUUID } from "node:crypto";
import type { AgentRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { AgentSpec } from "@/lib/agents/spec";
import { BillingRefusal, type RunBilling, type RunBillingRequest } from "@/lib/runs/billing";
import { toMicroUsd } from "@/lib/runs/prices";
import type { Run } from "@/lib/runs/run";
import { CREDITS, centsFor, creditWords, monthWords, priceWords, type CreditsConfig } from "./config";
import type { PaymentProvider } from "./payments";
import { chargeFor, creditsForCost, estimateCredits, median, monthEnd, monthOf, staticRunMicroUsd } from "./pricing";
import type { CreditStore } from "./store";
import { holderPart, type Balance, type CreditLimits, type GrantSource, type HoldState, type LedgerEntry, type LedgerKind, type LedgerRef, type PipelineCredits, type ReleaseReason, type RunCredits, type TopUp } from "./types";

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
  type: "run" | "pipeline_run" | "top_up" | "grant" | "refund" | "adjustment" | "expire";
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
  /** Holder credits in it (phase 17): a holder grant, an expiry, or the holder part a run used. */
  holder: number;
  at: string;
};

/** The two pools as the ledger stands: paid credits, and holder credits per month. */
type Pools = { total: number; paid: number; holder: Map<string, number> };

/** What a hold can take now: paid credits and this month's holder credits. */
type Spendable = { paid: number; holder: number; period: string; available: number };

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
    const pools = this.pools(all);
    const out: LedgerEntry[] = [];
    const fresh: LedgerEntry[] = [];
    const at = this.iso();
    for (const d of drafts) {
      if (!Number.isInteger(d.amount)) throw new CreditError("invalid_request", "Credits are whole numbers.");
      const h = d.holder ?? 0;
      // The holder part is whole, on the same side as the amount, never more than it, and always names its month.
      if (!Number.isInteger(h) || (h !== 0 && (Math.sign(h) !== Math.sign(d.amount) || Math.abs(h) > Math.abs(d.amount) || !d.period))) {
        throw new CreditError("invalid_request", "The holder part of an entry must be a whole part of its amount, with its month.");
      }
      const have = byKey.get(d.key);
      if (have) {
        if (have.kind !== d.kind || have.amount !== d.amount || holderPart(have) !== h) throw new CreditError("conflict", `The ledger already has "${d.key}" with another amount.`);
        out.push(have);
        continue;
      }
      const available = this.spendableOf(pools).available;
      balance += d.amount;
      pools.paid += d.amount - h;
      const month = h ? (pools.holder.get(d.period!) ?? 0) + h : 0;
      if (h) pools.holder.set(d.period!, month);
      // Neither the whole nor either pool may go below zero.
      if (balance < 0 || pools.paid < 0 || month < 0) {
        throw new BillingRefusal("not_enough_credits", `This needs ${creditWords(-d.amount)}. The workspace has ${creditWords(Math.max(0, available))}.`, { needed: -d.amount, available });
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
        holder: h,
        period: h ? d.period! : null,
        expiresAt: d.expiresAt ?? null,
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
    const holder = -holderPart(hold);
    const holderReleased = mine.filter((e) => e.kind === "release").reduce((t, e) => t + holderPart(e), 0);
    return {
      holdId,
      workspaceId: hold.workspaceId,
      amount,
      released,
      charged,
      open: closed ? 0 : amount - released,
      closed,
      userId: hold.userId,
      label: hold.label,
      ref: hold.ref,
      createdAt: hold.createdAt,
      holder,
      holderOpen: closed ? 0 : holder - holderReleased,
      period: hold.period ?? null,
    };
  }

  /* ---------- The two pools (phase 17) ---------- */

  private pools(entries: LedgerEntry[]): Pools {
    const holder = new Map<string, number>();
    let total = 0;
    let paid = 0;
    for (const e of entries) {
      const h = holderPart(e);
      total += e.amount;
      paid += e.amount - h;
      if (h) holder.set(e.period!, (holder.get(e.period!) ?? 0) + h);
    }
    return { total, paid, holder };
  }

  /** Paid credits plus this month's holder credits. Holder credits from a month that has ended do not count. */
  private spendableOf(p: Pools): Spendable {
    const period = monthOf(this.iso());
    const holder = Math.max(0, p.holder.get(period) ?? 0);
    const paid = Math.max(0, p.paid);
    return { paid, holder, period, available: paid + holder };
  }

  /**
   * How much of `amount` comes out of the holder pool, given what is there in
   * each: after paid credits by default (paid first, holder credits for the
   * rest), or before them.
   */
  private holderTake(amount: number, paid: number, holder: number): number {
    if (this.cfg.holderSpendOrder === "before_paid") return Math.min(holder, amount);
    return Math.min(holder, Math.max(0, amount - paid));
  }

  /**
   * Entries that write off holder credits left in months that have ended.
   * A hold that gave its holder part back after its month ended leaves some
   * again, so a month can expire more than once; each time has its own key.
   */
  private expiryDrafts(entries: LedgerEntry[]): Draft[] {
    const now = monthOf(this.iso());
    const out: Draft[] = [];
    for (const [period, left] of this.pools(entries).holder) {
      if (period >= now || left <= 0) continue;
      const n = entries.filter((e) => e.kind === "expire" && e.period === period).length;
      out.push({ key: `expire:holder:${period}:${n + 1}`, kind: "expire", amount: -left, holder: -left, period, label: `Holder credits for ${monthWords(period)} expired`, ref: { type: "grant", id: period } });
    }
    return out;
  }

  /** Writes off holder credits left from months that have ended. Returns what expired. Safe to call any time. */
  async expireHolder(workspaceId: string): Promise<number> {
    return this.lock(workspaceId, async () => {
      const drafts = this.expiryDrafts(await this.entries(workspaceId));
      if (!drafts.length) return 0;
      await this.write(workspaceId, drafts);
      return drafts.reduce((t, d) => t - d.amount, 0);
    });
  }

  /** Every workspace that has ever had holder credits: for the month-end expiry. */
  async workspacesWithHolderCredits(): Promise<string[]> {
    const grants = await this.o.store.ledger.find({ kind: "grant", grantSource: "holder" });
    return [...new Set(grants.map((e) => e.workspaceId))];
  }

  /**
   * Takes `amount` for a new hold from the two pools, after writing off any
   * expired holder credits. Refuses when the two together are short.
   */
  private holdDrafts(entries: LedgerEntry[], amount: number, paidOnly = false): { expire: Draft[]; holder: number; period: string } {
    const expire = this.expiryDrafts(entries);
    const s = this.spendableOf(this.pools(entries));
    // Holder credits are for running agents only; other paid jobs take paid credits.
    const available = paidOnly ? s.paid : s.available;
    if (amount > available) throw new BillingRefusal("not_enough_credits", `This needs ${creditWords(amount)}. The workspace has ${creditWords(available)}${paidOnly && s.holder ? " in paid credits (holder credits are for agent runs only)" : ""}.`, { needed: amount, available });
    return { expire, holder: paidOnly ? 0 : this.holderTake(amount, s.paid, s.holder), period: s.period };
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
    const s = this.spendableOf(this.pools(entries));
    return { workspaceId, available: s.available, paid: s.paid, holder: { available: s.holder, period: s.period, expiresAt: monthEnd(s.period) }, held, usedThisMonth: this.used(entries, null) };
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
    const available = this.spendableOf(this.pools(entries)).available;
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
      if (entries.some((e) => e.key === `hold:${holdId}`)) return { mode: "own", estimate, holdId, state: "held", charged: null, back: null, userId };
      await this.checkLimits(workspaceId, userId, estimate, entries);
      const take = this.holdDrafts(entries, estimate);
      await this.write(workspaceId, [...take.expire, { key: `hold:${holdId}`, kind: "hold", amount: -estimate, holder: -take.holder, period: take.period, holdId, ref: { type: "run", id: runId }, userId, label: spec.name }]);
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
        // The step is charged inside the pipeline's hold, from the hold's two parts in the same order as any spend.
        const h = this.holderTake(amount, hold!.open - hold!.holderOpen, hold!.holderOpen);
        const period = hold!.period ?? undefined;
        await this.write(ws, [
          { key: `step:run:${run.id}`, kind: "release", amount, holder: h, period, holdId, ref: { type: "run", id: run.id }, userId: c.userId, label: hold!.label, reason: "step" },
          { key: `charge:run:${run.id}`, kind: "charge", amount: -amount, holder: -h, period, holdId, ref: { type: "run", id: run.id }, userId: c.userId, label: hold!.label, costMicroUsd: run.costMicroUsd },
        ]);
        return { ...c, state: "charged", charged: amount, back: null };
      });
    }

    const reason: ReleaseReason = run.status === "succeeded" ? "settled" : run.status === "failed" ? "failed" : "cancelled";
    return this.settleOwn(ws, c, holdId, paid, run.costMicroUsd, reason);
  }

  /** Charges an own hold its real cost (never more than it held) and gives the rest back, once. */
  private settleOwn(ws: string, c: RunCredits, holdId: string, paid: boolean, cost: number, reason: ReleaseReason): Promise<RunCredits> {
    return this.lock(ws, async () => {
      const entries = await this.entries(ws);
      const hold = this.holdFrom(entries, holdId);
      if (!hold) return c;
      if (hold.closed) return { ...c, state: hold.charged > 0 ? "charged" : "refunded", charged: hold.charged, back: hold.amount - hold.charged };
      const amount = paid ? chargeFor(cost, hold.amount, this.cfg) : 0;
      // Everything goes back to the pools it came from; the charge takes from the hold's two parts in spend order.
      const h = this.holderTake(amount, hold.amount - hold.holder, hold.holder);
      const period = hold.period ?? undefined;
      await this.write(ws, [
        { key: `release:${holdId}`, kind: "release", amount: hold.amount, holder: hold.holder, period, holdId, ref: hold.ref, userId: hold.userId, label: hold.label, reason },
        ...(amount > 0 ? [{ key: `charge:${holdId}`, kind: "charge" as const, amount: -amount, holder: -h, period, holdId, ref: hold.ref, userId: hold.userId, label: hold.label, costMicroUsd: cost }] : []),
      ]);
      return { ...c, state: amount > 0 ? "charged" : "refunded", charged: amount, back: hold.amount - amount };
    });
  }

  /* ---------- Other paid jobs ---------- */

  /**
   * The estimate for a paid job that is not an agent run (reading past posts
   * into a Brand Brain): its typical cost times the headroom, never above its
   * cap, at least the minimum. The most it can be charged.
   */
  estimateJob(typicalMicroUsd: number, capMicroUsd: number): number {
    return estimateCredits(typicalMicroUsd, capMicroUsd, this.cfg);
  }

  /**
   * Holds a job's estimate, like a run: refused (BillingRefusal) when the
   * balance or a monthly limit does not cover it. A job hold left open by a
   * crash for more than 15 minutes is given back first.
   */
  async reserveJob(input: { workspaceId: string; jobId: string; estimate: number; userId: string | null; label: string }): Promise<RunCredits> {
    const { workspaceId, jobId, estimate, userId, label } = input;
    if (!POSITIVE_INT(estimate)) throw new CreditError("invalid_request", "A job's estimate must be a whole number of credits.");
    const stale = (await this.openHoldsOf(workspaceId)).filter((h) => h.ref?.type === "job" && Date.parse(h.createdAt) < this.now().getTime() - 15 * 60_000);
    for (const h of stale) await this.settleOwn(workspaceId, { mode: "own", estimate: h.amount, holdId: h.holdId, state: "held", charged: null, back: null, userId: h.userId }, h.holdId, false, 0, "failed");
    const holdId = `job:${jobId}`;
    return this.lock(workspaceId, async () => {
      const entries = await this.entries(workspaceId);
      if (entries.some((e) => e.key === `hold:${holdId}`)) return { mode: "own", estimate, holdId, state: "held", charged: null, back: null, userId };
      await this.checkLimits(workspaceId, userId, estimate, entries);
      const take = this.holdDrafts(entries, estimate, true);
      await this.write(workspaceId, [...take.expire, { key: `hold:${holdId}`, kind: "hold", amount: -estimate, holder: 0, period: take.period, holdId, ref: { type: "job", id: jobId }, userId, label }]);
      return { mode: "own", estimate, holdId, state: "held", charged: null, back: null, userId };
    });
  }

  /** Charges a job its real cost when it was done, or gives the hold back. Settling twice changes nothing. */
  async settleJob(workspaceId: string, c: RunCredits, result: { done: boolean; costMicroUsd: number }): Promise<RunCredits> {
    if (c.mode !== "own" || !c.holdId) return c;
    return this.settleOwn(workspaceId, c, c.holdId, result.done, result.costMicroUsd, result.done ? "settled" : "failed");
  }

  /* ---------- Pipelines ---------- */

  /** Holds a pipeline run's estimate. `attempt` counts tries, since a retry holds again. */
  async reservePipeline(input: { workspaceId: string; pipelineRunId: string; attempt: number; estimate: number; userId: string | null; label: string; previous?: PipelineCredits | null }): Promise<PipelineCredits> {
    const { workspaceId, pipelineRunId, attempt, estimate, userId, label } = input;
    if (!POSITIVE_INT(estimate)) throw new CreditError("invalid_request", "A pipeline estimate is a whole number of credits.");
    const holdId = `pip:${pipelineRunId}:${attempt}`;
    await this.lock(workspaceId, async () => {
      const entries = await this.entries(workspaceId);
      if (entries.some((e) => e.key === `hold:${holdId}`)) return;
      await this.checkLimits(workspaceId, userId, estimate, entries);
      const take = this.holdDrafts(entries, estimate);
      await this.write(workspaceId, [...take.expire, { key: `hold:${holdId}`, kind: "hold", amount: -estimate, holder: -take.holder, period: take.period, holdId, ref: { type: "pipeline_run", id: pipelineRunId }, userId, label }]);
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
      await this.write(workspaceId, [{ key: `release:${c.holdId}`, kind: "release", amount: hold.open, holder: hold.holderOpen, period: hold.period ?? undefined, holdId: c.holdId, ref: hold.ref, userId: hold.userId, label: hold.label, reason }]);
    });
    return this.pipelineTotals(workspaceId, c);
  }

  /* ---------- Top-ups, grants, support ---------- */

  /**
   * Buys a pack through the payment provider. The test provider pays at
   * once and the top-up is marked as a test. With a key, a second call
   * returns the first top-up.
   */
  async topUp(workspaceId: string, input: { credits: number; by: string; idempotencyKey?: string; consent?: { at: string; wording: string } }): Promise<TopUp> {
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
      ...(input.consent ? { consent: input.consent } : {}),
    };
    await this.o.store.topUps.insert(row);
    const result = await provider.checkout({ topUpId: row.id, workspaceId, credits: row.credits, amountCents: row.amountCents, currency: "usd" });
    if (result.status === "failed") {
      const failed = { ...row, status: "failed" as const, error: result.error, completedAt: this.iso() };
      await this.o.store.topUps.update(failed);
      throw new CreditError("payment_failed", `The payment did not go through: ${result.error}`);
    }
    const withRef: TopUp = { ...row, providerRef: result.providerRef, ...(result.status === "pending" ? { checkoutUrl: result.redirectUrl } : {}) };
    await this.o.store.topUps.update(withRef);
    return result.status === "paid" ? this.completeTopUp(withRef) : withRef;
  }

  /** One top-up by its id, any workspace. For a payment provider's webhook. */
  async topUpById(topUpId: string): Promise<TopUp | null> {
    return this.o.store.topUps.get(topUpId);
  }

  /** Top-ups matching every given field, any workspace. For a payment provider's webhook. */
  async findTopUps(where: Partial<TopUp>): Promise<TopUp[]> {
    return this.o.store.topUps.find(where);
  }

  /**
   * A pending top-up the provider says is paid, from its verified webhook:
   * the ledger entry lands once (its key is the top-up), and what was paid is
   * kept on the row. Calling it again changes nothing.
   */
  async markTopUpPaid(topUpId: string, payment: { ref: string; amount: number; currency: string }): Promise<TopUp> {
    const row = await this.o.store.topUps.get(topUpId);
    if (!row) throw new CreditError("not_found", "No such top-up.");
    if (row.status === "paid") {
      // A replay after a crash between the ledger and the row is finished by the same idempotent write.
      await this.lock(row.workspaceId, () => this.write(row.workspaceId, [this.topUpDraft(row)]));
      return row;
    }
    return this.completeTopUp({ ...row, payment, checkoutUrl: null, error: null });
  }

  /**
   * How many credits of a top-up have already left the balance because its
   * money went back: a withdrawal (`adjust:withdraw:<id>`) and refunds
   * through the provider (`adjust:refund:<id>:<share>`, keyed by the refunded
   * share of the top-up they bring it to), added up. A refund that pays for a
   * withdrawal takes nothing more, since the withdrawal already took them.
   */
  async removedFromTopUp(workspaceId: string, topUpId: string): Promise<number> {
    let removed = 0;
    for (const e of await this.entries(workspaceId)) {
      if (e.kind === "adjustment" && (e.key === `adjust:withdraw:${topUpId}` || e.key.startsWith(`adjust:refund:${topUpId}:`))) removed -= e.amount;
    }
    return removed;
  }

  /** Whether the ledger has this key in this workspace. */
  async hasKey(workspaceId: string, key: string): Promise<boolean> {
    return (await this.entries(workspaceId)).some((e) => e.key === key);
  }

  /** A pending top-up that will not be paid (the checkout expired or failed). A paid one stays paid. */
  async failTopUp(topUpId: string, error: string): Promise<TopUp | null> {
    const row = await this.o.store.topUps.get(topUpId);
    if (!row || row.status !== "pending") return row;
    const failed: TopUp = { ...row, status: "failed", error, checkoutUrl: null, completedAt: this.iso() };
    await this.o.store.topUps.update(failed);
    return failed;
  }

  /**
   * A top-up already paid outside a checkout: a stablecoin or ETH sent on Robinhood
   * Chain and checked there (chainpay). The row and its ledger entry are
   * written once: the id and the ledger key come from the payment, so the
   * same payment again returns the first row.
   */
  async recordPaidTopUp(workspaceId: string, input: { id: string; provider: string; providerRef: string; credits: number; amountCents: number; by: string; label: string; ledgerKey: string; consent?: { at: string; wording: string } | null; chain?: TopUp["chain"] }): Promise<TopUp> {
    if (!POSITIVE_INT(input.credits)) throw new CreditError("invalid_request", "A top-up is a whole number of credits.");
    if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(input.id) || !/^[A-Za-z0-9_.:-]{1,160}$/.test(input.ledgerKey)) throw new CreditError("invalid_request", "The top-up needs an id.");
    return this.lock(workspaceId, async () => {
      let row = await this.o.store.topUps.get(input.id);
      if (row && (row.workspaceId !== workspaceId || row.credits !== input.credits)) throw new CreditError("conflict", "This payment was already recorded with other details.");
      if (!row) {
        const at = this.iso();
        row = {
          id: input.id,
          workspaceId,
          credits: input.credits,
          amountCents: input.amountCents,
          currency: "usd",
          provider: input.provider,
          providerRef: input.providerRef,
          test: false,
          status: "paid",
          idempotencyKey: null,
          by: input.by,
          createdAt: at,
          completedAt: at,
          error: null,
          ...(input.consent ? { consent: input.consent } : {}),
          ...(input.chain ? { chain: input.chain } : {}),
        };
        await this.o.store.topUps.insert(row);
      }
      await this.write(workspaceId, [{ key: input.ledgerKey, kind: "top_up", amount: input.credits, ref: { type: "top_up", id: input.id }, by: input.by, label: input.label }]);
      return row;
    });
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

  private topUpDraft(row: TopUp): Draft {
    const label = row.provider === "stripe" ? `Paid by card${row.test ? " in Stripe test mode" : ""}, ${creditWords(row.credits)}` : row.test ? `Test top-up, ${creditWords(row.credits)}` : `Top-up, ${creditWords(row.credits)}`;
    return { key: `topup:${row.id}`, kind: "top_up", amount: row.credits, ref: { type: "top_up", id: row.id }, by: row.by, label, test: row.test };
  }

  private async completeTopUp(row: TopUp): Promise<TopUp> {
    await this.lock(row.workspaceId, () => this.write(row.workspaceId, [this.topUpDraft(row)]));
    const done = { ...row, status: "paid" as const, completedAt: this.iso() };
    await this.o.store.topUps.update(done);
    return done;
  }

  async topUps(workspaceId: string): Promise<TopUp[]> {
    return (await this.o.store.topUps.find({ workspaceId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Paid credits given rather than bought, by support. One grant per source
   * id. Holder credits never come in this way: they are their own pool and
   * only `grantHolder` writes them.
   */
  async grant(workspaceId: string, input: { credits: number; source: GrantSource; sourceId: string; by: string; note?: string }): Promise<LedgerEntry> {
    if (!POSITIVE_INT(input.credits)) throw new CreditError("invalid_request", "A grant is a whole number of credits.");
    if (input.source === "holder") throw new CreditError("invalid_request", "Holder credits are granted with grantHolder.");
    if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(input.sourceId)) throw new CreditError("invalid_request", "The grant needs a source id.");
    const [e] = await this.lock(workspaceId, () =>
      this.write(workspaceId, [{ key: `grant:${input.source}:${input.sourceId}`, kind: "grant", amount: input.credits, ref: { type: "grant", id: input.sourceId }, by: input.by, label: `Grant, ${creditWords(input.credits)}`, grantSource: input.source, note: input.note ?? null }]),
    );
    return e;
  }

  /**
   * A $WOVI holder's credits for one month (phase 17), into their personal
   * workspace: the holder pool, spendable on runs only, never moved, swapped
   * or paid out, and written off at the end of `period` (UTC). Once per
   * person and month (`sourceId`); the same call again returns the first.
   * Any holder credits left from months that have ended expire first.
   */
  async grantHolder(workspaceId: string, input: { credits: number; period: string; sourceId: string; by: string; label?: string; note?: string }): Promise<LedgerEntry> {
    if (!POSITIVE_INT(input.credits)) throw new CreditError("invalid_request", "Holder credits are a whole number above zero.");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new CreditError("invalid_request", "A month looks like 2026-10.");
    if (input.period !== monthOf(this.iso())) throw new CreditError("invalid_request", "Holder credits are granted for the current month only.");
    if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(input.sourceId)) throw new CreditError("invalid_request", "The grant needs a source id.");
    return this.lock(workspaceId, async () => {
      const entries = await this.entries(workspaceId);
      const key = `grant:holder:${input.sourceId}`;
      const have = entries.find((e) => e.key === key);
      if (have) {
        if (have.amount !== input.credits) throw new CreditError("conflict", `The ledger already has "${key}" with another amount.`);
        return have;
      }
      const out = await this.write(workspaceId, [
        ...this.expiryDrafts(entries),
        { key, kind: "grant", amount: input.credits, holder: input.credits, period: input.period, expiresAt: monthEnd(input.period), ref: { type: "grant", id: input.sourceId }, by: input.by, label: input.label ?? `Holder credits for ${monthWords(input.period)}`, grantSource: "holder", note: input.note ?? null },
      ]);
      return out[out.length - 1];
    });
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

  /**
   * Paid credits bought with $WOVI sent to the burn pot (phase 17): once per
   * transaction, checked on chain before this is called (token/pay.ts).
   */
  async payWithToken(workspaceId: string, input: { paymentId: string; credits: number; by: string; label: string }): Promise<LedgerEntry> {
    if (!POSITIVE_INT(input.credits)) throw new CreditError("invalid_request", "A $WOVI payment is a whole number of credits.");
    const [e] = await this.lock(workspaceId, () =>
      this.write(workspaceId, [{ key: `wovi:${input.paymentId}`, kind: "top_up", amount: input.credits, ref: { type: "top_up", id: input.paymentId }, by: input.by, label: input.label }]),
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
      // Back to the pool the charge came from: holder credits return to their month (and expire with it).
      const [e] = await this.write(workspaceId, [{ key: `refund:run:${runId}`, kind: "refund", amount: -charge.amount, holder: -holderPart(charge), period: charge.period ?? undefined, ref: charge.ref, userId: charge.userId, by: input.by, label: charge.label, note: input.note.trim() || null }]);
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
          holder: h.closed ? -entries.filter((x) => x.holdId === e.holdId && x.kind === "charge").reduce((t, x) => t + holderPart(x), 0) : h.holder,
          at: h.createdAt,
        });
        continue;
      }
      const type = e.kind === "top_up" ? "top_up" : e.kind === "grant" ? "grant" : e.kind === "refund" ? "refund" : e.kind === "expire" ? "expire" : "adjustment";
      items.push({ id: e.id, type, label: e.label, amount: e.amount, held: null, charged: null, back: null, state: e.amount >= 0 ? "added" : "removed", reason: null, ref: e.ref, userId: e.userId, by: e.by, test: e.test, note: e.note, holder: holderPart(e), at: e.createdAt });
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
