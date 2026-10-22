/**
 * SERVER ONLY. $WOVI holders (phase 17): who holds, as far as WOVI needs to
 * know, and their monthly holder credits.
 *
 * A person links wallets to their account by signing a message (no
 * transaction; accounts/wallets.ts). Their holding is the $WOVI across all
 * their linked wallets, read on Robinhood Chain with balanceOf, exact in wei:
 *
 * - The badge: a holding at or above WOVI_HOLDER_MIN. Read when a wallet is
 *   linked or unlinked, and again for everyone every WOVI_HOLDER_CHECK_HOURS.
 *   Pages read the stored status, never the chain. Only "holder" is shown,
 *   never a balance, except to the person themselves.
 * - Holder credits (off unless WOVI_HOLDER_CREDITS sets tiers): once a month,
 *   one snapshot reads every linked wallet at ONE block, so a token sits in
 *   exactly one wallet and is counted once, however it is moved around. Each
 *   person's total picks the highest tier it reaches; that tier's credits go
 *   into their personal workspace as holder credits for the month (one grant
 *   per person and month), spendable on runs only, never moved, swapped or
 *   paid out, gone at the month's end. The month's snapshot is the first
 *   hourly check in it that finds at least one person at a tier; until then
 *   nothing is kept. Someone who links after it waits for the next month: a
 *   second read could count tokens already counted in another wallet. Many
 *   wallets on one account add up to one allocation; the top tier is the cap.
 * - At a month's end, what is left of the last month's holder credits is
 *   written off (Credits.expireHolder).
 *
 * The allocation is a perk for using WOVI, not a return: it is credits for
 * runs and nothing else.
 */
import type { Accounts } from "@/lib/accounts/accounts";
import type { Credits } from "@/lib/credits/credits";
import { monthOf } from "@/lib/credits/pricing";
import { isHolder, tierFor, type TokenConfig } from "./config";
import { ZERO, type TokenReader } from "./chain";
import { put, type HolderRow, type SnapshotRow, type SnapshotUser, type TokenStore } from "./store";

export type HolderView = {
  /** Holder status is read on this server (the burn pot is set). */
  on: boolean;
  holder: boolean;
  /** The person's own holding, in wei, as last read. Only ever shown to them. */
  totalWei: string | null;
  checkedAt: string | null;
  /** What the badge needs, in whole $WOVI. */
  minWhole: string;
  /** Holder credits: on when tiers are set. */
  creditsOn: boolean;
  /** The credits this holding would bring at the next snapshot (0 below every tier). */
  monthlyCredits: number;
  tiers: { minWhole: string; credits: number }[];
  /** This month's snapshot: when, and what this person got from it. */
  thisMonth: { at: string; block: number; credits: number } | null;
};

export type HolderDeps = {
  config: TokenConfig;
  reader: TokenReader;
  store: TokenStore;
  accounts: Accounts;
  /** Null when credits are off: the badge still works. */
  credits: Credits | null;
  tokenAddress: () => Promise<string | null>;
  now?: () => Date;
};

export class Holders {
  constructor(private readonly d: HolderDeps) {}

  private now() {
    return this.d.now?.() ?? new Date();
  }

  /** Every linked wallet, grouped by person, in lower case. */
  private async walletsByUser(): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    for (const w of await this.d.accounts.store.wallets.find()) {
      const list = out.get(w.userId) ?? [];
      list.push(w.address.toLowerCase());
      out.set(w.userId, list);
    }
    return out;
  }

  /** Reads these people's wallets at one block and stores their status. */
  private async readAndSave(byUser: Map<string, string[]>, block?: number): Promise<HolderRow[]> {
    const token = await this.d.tokenAddress();
    const all = [...new Set([...byUser.values()].flat())];
    const got = token && all.length ? await this.d.reader.balances(token, all, block) : [];
    const bal = new Map(all.map((a, i) => [a, got[i] ?? null]));
    const rows: HolderRow[] = [];
    const at = this.now().toISOString();
    for (const [userId, wallets] of byUser) {
      const list = wallets.map((address) => ({ address, wei: token ? (bal.get(address)?.toString() ?? null) : null }));
      // A wallet the node did not answer for counts as nothing this time, so a gap never makes someone a holder.
      const total = list.reduce((s, w) => s + (w.wei === null ? ZERO : BigInt(w.wei)), ZERO);
      const row: HolderRow = { id: userId, userId, wallets: list, totalWei: total.toString(), holder: Boolean(token) && isHolder(this.d.config, total), checkedAt: at };
      await put(this.d.store.holders, row);
      rows.push(row);
    }
    return rows;
  }

  /** One person's status read again now: after they link or unlink a wallet. Never throws; false when it could not read. */
  async refreshUser(userId: string): Promise<boolean> {
    if (!this.d.config.holder.on) return false;
    const wallets = (await this.d.accounts.store.wallets.find({ userId })).map((w) => w.address.toLowerCase());
    try {
      if (!wallets.length) {
        await this.d.store.holders.delete(userId);
        return true;
      }
      await this.readAndSave(new Map([[userId, wallets]]));
      return true;
    } catch {
      return false;
    }
  }

  /** Everyone's status, read at one block. For the periodic check. */
  async refreshAll(): Promise<{ people: number; holders: number }> {
    if (!this.d.config.holder.on) return { people: 0, holders: 0 };
    const byUser = await this.walletsByUser();
    // People who unlinked their last wallet lose their status.
    for (const row of await this.d.store.holders.find()) if (!byUser.has(row.userId)) await this.d.store.holders.delete(row.id);
    if (!byUser.size) return { people: 0, holders: 0 };
    const block = await this.d.reader.head();
    const rows = await this.readAndSave(byUser, block);
    return { people: rows.length, holders: rows.filter((r) => r.holder).length };
  }

  /** Whether the badge shows for this person. Reads the stored status only. */
  async isHolder(userId: string): Promise<boolean> {
    if (!this.d.config.holder.on) return false;
    return (await this.d.store.holders.get(userId))?.holder ?? false;
  }

  async view(userId: string): Promise<HolderView> {
    const c = this.d.config;
    const row = c.holder.on ? await this.d.store.holders.get(userId) : null;
    const snap = await this.d.store.snapshots.get(monthOf(this.now().toISOString()));
    const mine = snap?.users.find((u) => u.userId === userId);
    const total = row ? BigInt(row.totalWei) : null;
    return {
      on: c.holder.on,
      holder: row?.holder ?? false,
      totalWei: row?.totalWei ?? null,
      checkedAt: row?.checkedAt ?? null,
      minWhole: c.holder.minWhole,
      creditsOn: c.holder.tiers.length > 0,
      monthlyCredits: total === null ? 0 : (tierFor(c.holder.tiers, total)?.credits ?? 0),
      tiers: c.holder.tiers.map((t) => ({ minWhole: t.minWhole, credits: t.credits })),
      thisMonth: snap ? { at: snap.at, block: snap.block, credits: mine?.credits ?? 0 } : null,
    };
  }

  /**
   * This month's holder credits: the snapshot (every linked wallet at one
   * block, taken once per month) and a grant per person from it. Safe to run
   * again: a snapshot already taken is reused, never read again, and each
   * grant lands once. Does nothing while tiers are unset or before the launch.
   */
  async allocate(): Promise<{ done: "off" | "no_token" | "granted"; period: string; people?: number; credits?: number }> {
    const c = this.d.config;
    const period = monthOf(this.now().toISOString());
    if (!c.holder.on || !c.holder.tiers.length || !this.d.credits) return { done: "off", period };
    const token = await this.d.tokenAddress();
    if (!token) return { done: "no_token", period };

    let snap = await this.d.store.snapshots.get(period);
    if (!snap) {
      const byUser = await this.walletsByUser();
      const block = await this.d.reader.head();
      const all = [...new Set([...byUser.values()].flat())];
      const got = all.length ? await this.d.reader.balances(token, all, block) : [];
      const bal = new Map(all.map((a, i) => [a, got[i] ?? null]));
      const users: SnapshotUser[] = [];
      for (const [userId, wallets] of byUser) {
        const total = wallets.reduce((s, w) => s + (bal.get(w) ?? ZERO), ZERO);
        const tier = tierFor(c.holder.tiers, total);
        const user = await this.d.accounts.store.users.get(userId);
        if (!tier || !user) continue;
        users.push({ userId, workspaceId: user.personalWorkspaceId, wallets, totalWei: total.toString(), credits: tier.credits });
      }
      // Nobody reaches a tier yet: nothing to count twice, so nothing is kept and a later check this month tries again.
      if (!users.length) return { done: "granted", period, people: 0, credits: 0 };
      snap = { id: period, period, block, at: this.now().toISOString(), users, granted: [], credits: users.reduce((s, u) => s + u.credits, 0) };
      // Written before any grant, so a crash halfway resumes from these same numbers, never a second read.
      await this.d.store.snapshots.insert(snap);
    }

    for (const u of snap.users) {
      if (snap.granted.includes(u.userId)) continue;
      await this.d.credits.grantHolder(u.workspaceId, { credits: u.credits, period, sourceId: `${u.userId}:${period}`, by: "holders", note: `$WOVI holder snapshot at block ${snap.block}` });
      snap = { ...snap, granted: [...snap.granted, u.userId] };
      await this.d.store.snapshots.update(snap);
    }
    return { done: "granted", period, people: snap.users.length, credits: snap.credits };
  }

  /** Writes off holder credits left from months that have ended, in every workspace that had some. */
  async expire(): Promise<number> {
    if (!this.d.credits) return 0;
    let n = 0;
    for (const ws of await this.d.credits.workspacesWithHolderCredits()) n += await this.d.credits.expireHolder(ws);
    return n;
  }

  /** For the owner's card. */
  async summary(): Promise<{ people: number; holders: number; lastCheck: string | null; snapshot: SnapshotRow | null }> {
    const rows = await this.d.store.holders.find();
    const snap = await this.d.store.snapshots.get(monthOf(this.now().toISOString()));
    const last = rows.map((r) => r.checkedAt).sort().pop() ?? null;
    return { people: rows.length, holders: rows.filter((r) => r.holder).length, lastCheck: last, snapshot: snap };
  }
}
