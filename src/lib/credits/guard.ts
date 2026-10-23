/**
 * Credits as the app reaches them: every call names its caller and the
 * phase 4 policy decides.
 *
 * - Everyone in the workspace sees the balance, the estimate before a run,
 *   and their own monthly limit, so they know whether a run will start.
 * - Owners and admins (see_costs) see what each run was charged and the
 *   whole history.
 * - Owners and admins (manage_credits) top up and set limits. API keys never.
 */
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import { AccountError } from "@/lib/accounts/errors";
import { savedBy, seesCosts } from "@/lib/accounts/guard";
import { can } from "@/lib/accounts/policy";
import type { ActivityItem, Credits } from "./credits";
import type { Balance, CreditLimits, TopUp } from "./types";

export type CreditSummary = {
  balance: Balance;
  /** May top up and set limits. */
  canManage: boolean;
  /** May see charges and the history. */
  seesCosts: boolean;
  /** The caller's own limit and use this month. */
  mine: { limit: number | null; used: number };
  /** The workspace's limits, for people who manage them. */
  limits: CreditLimits | null;
  /** The provider for top-ups, or null when top-ups are closed. */
  payments: { id: string; label: string; test: boolean } | null;
  packs: number[];
  /** The smallest top-up, in credits. */
  minTopUp: number;
};

export class GuardedCredits {
  constructor(
    readonly credits: Credits,
    private readonly accounts: Accounts,
  ) {}

  private via(caller: Principal) {
    return caller.kind === "api_key" ? ("api_key" as const) : ("user" as const);
  }

  async summary(caller: Principal, workspaceId: string): Promise<CreditSummary> {
    const role = await this.accounts.authorize(caller, workspaceId, "view");
    const manage = can(role, "manage_credits", this.via(caller));
    const [balance, limits, used] = await Promise.all([this.credits.balance(workspaceId), this.credits.limits(workspaceId), this.credits.usedThisMonth(workspaceId, caller.userId)]);
    const p = this.credits.payments;
    return {
      balance,
      canManage: manage,
      seesCosts: seesCosts(caller, role),
      mine: { limit: limits.members[caller.userId] ?? null, used },
      limits: manage ? limits : null,
      payments: p ? { id: p.id, label: p.label, test: p.test } : null,
      packs: this.credits.cfg.packs.filter((p) => p >= this.credits.cfg.minTopUpCredits),
      minTopUp: this.credits.cfg.minTopUpCredits,
    };
  }

  /** The balance alone, for the header. */
  async balance(caller: Principal, workspaceId: string): Promise<Balance> {
    await this.accounts.authorize(caller, workspaceId, "view");
    return this.credits.balance(workspaceId);
  }

  /** What one run of an agent costs before it starts. Null when there is no such agent. */
  async estimateAgent(caller: Principal, workspaceId: string, agentWorkspaceId: string, agentId: string): Promise<number | null> {
    await this.accounts.authorize(caller, workspaceId, "view");
    return this.credits.estimateById(agentWorkspaceId, agentId);
  }

  /** Whether the caller could hold `add` now: null when yes, else why not, in words. */
  async blocker(caller: Principal, workspaceId: string, add: number): Promise<{ code: "not_enough_credits" | "over_limit"; message: string } | null> {
    await this.accounts.authorize(caller, workspaceId, "view");
    const r = await this.credits.canSpend(workspaceId, caller.userId, add);
    return r && r.code !== "hold_closed" ? { code: r.code, message: r.message } : null;
  }

  async activity(caller: Principal, workspaceId: string, opts: { limit?: number } = {}): Promise<ActivityItem[]> {
    await this.accounts.authorize(caller, workspaceId, "see_costs");
    return this.credits.activity(workspaceId, opts);
  }

  /** Each member's use this month, for people who manage limits. */
  async usage(caller: Principal, workspaceId: string, userIds: string[]): Promise<Record<string, number>> {
    await this.accounts.authorize(caller, workspaceId, "see_costs");
    const out: Record<string, number> = {};
    for (const id of userIds) out[id] = await this.credits.usedThisMonth(workspaceId, id);
    return out;
  }

  async topUp(caller: Principal, workspaceId: string, credits: number, idempotencyKey?: string, consent?: { at: string; wording: string }): Promise<TopUp> {
    await this.accounts.authorize(caller, workspaceId, "manage_credits");
    return this.credits.topUp(workspaceId, { credits, by: savedBy(caller), ...(idempotencyKey ? { idempotencyKey } : {}), ...(consent ? { consent } : {}) });
  }

  async topUps(caller: Principal, workspaceId: string): Promise<TopUp[]> {
    await this.accounts.authorize(caller, workspaceId, "see_costs");
    return this.credits.topUps(workspaceId);
  }

  /** Sets the workspace's limit and members' limits. Only members of the workspace can have one. */
  async setLimits(caller: Principal, workspaceId: string, next: { monthly?: number | null; members?: Record<string, number | null> }): Promise<CreditLimits> {
    await this.accounts.authorize(caller, workspaceId, "manage_credits");
    const members = await this.accounts.store.members.find({ workspaceId });
    for (const userId of Object.keys(next.members ?? {})) {
      if (!members.some((m) => m.userId === userId)) throw new AccountError("not_found", "That person is not in this workspace.");
    }
    return this.credits.setLimits(workspaceId, next, savedBy(caller));
  }
}
