/**
 * Privacy (phase 18, GDPR): a person's own copy of their data (Art. 15 and
 * 20), deleting the account (Art. 17), consent to use their edits to improve
 * agents (Art. 7), and retention for logs (Art. 5(1)(e)).
 *
 * Deleting an account:
 * - Workspaces where the person is the only member are deleted with
 *   everything in them: Brand Brains, runs, pipelines, review items,
 *   comments, clients, links, webhooks, API keys, files. Paid credits left in
 *   them are written down as money owed back, for the owner to send.
 *   Holder credits have no cash value and end with the workspace.
 * - Shared workspaces stay with the team. The person leaves them; their
 *   name on comments, decisions and the activity log becomes "Deleted
 *   member", and the API keys they made stop working.
 * - The person's sign-in, sessions, passkeys, wallets, holder reading,
 *   onboarding, notifications and consents are deleted.
 * - Ledger entries, top-ups and $WOVI payments are kept for bookkeeping
 *   (bookkeeping law, seven years), with the person's id swapped
 *   for an anonymous one.
 * - A person who is the last owner of a workspace with other members makes
 *   someone else an owner first, so a team never loses its workspace.
 */
import { createHash } from "node:crypto";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Accounts } from "@/lib/accounts/accounts";
import type { EmailSender } from "@/lib/accounts/email";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { AppStore } from "@/lib/app/store";
import type { BrandStore } from "@/lib/brand/store";
import { centsFor } from "@/lib/credits/config";
import type { CreditStore } from "@/lib/credits/store";
import type { Balance } from "@/lib/credits/types";
import { CONTACT_EMAIL, IMPROVE_CONSENT, operatorLine } from "@/lib/legal/operator";
import type { PipelineStore } from "@/lib/pipelines/store";
import type { RunStore } from "@/lib/runs/store";
import type { ConsentRow, SafetyStore } from "@/lib/safety/store";
import type { TeamStore } from "@/lib/team/store";
import type { TokenStore } from "@/lib/token/store";
import type { ChainPayStore } from "@/lib/chainpay/store";
import type { WebhookStore } from "@/lib/webhooks/store";

export class PrivacyError extends Error {
  constructor(
    readonly code: "not_found" | "blocked" | "invalid_input",
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "PrivacyError";
  }
}

export type PrivacyOptions = {
  accounts: Accounts;
  runs: RunStore;
  brand: BrandStore;
  app: AppStore;
  team: TeamStore;
  credits: CreditStore;
  /** The balance of a workspace, for what deleting it would leave behind. */
  balance?: (workspaceId: string) => Promise<Balance>;
  pipelines: PipelineStore;
  token: TokenStore;
  /** USDC and ETH top-ups. Optional: missing, there are none to export or anonymise. */
  chainpay?: ChainPayStore;
  webhooks: WebhookStore;
  safety: SafetyStore;
  /** Where uploaded files live (<data dir>/files), one folder per workspace. */
  filesDir?: string | null;
  /** Where the dev mailer writes mail, for the retention sweep. */
  mailDir?: string | null;
  email?: EmailSender;
  now?: () => Date;
};

/** What deleting does to one workspace. */
export type WorkspacePlan = {
  id: string;
  name: string;
  role: string;
  members: number;
  /** delete: only member; leave: the team keeps it; blocked: last owner of a team. */
  action: "delete" | "leave" | "blocked";
  why: string;
  /** For deleted workspaces: what goes with it. */
  counts: { brandBrains: number; runs: number; pipelineRuns: number } | null;
  /** Paid credits left, which WOVI owes back on deletion. Null when the workspace stays. */
  paidCredits: number | null;
  holderCredits: number | null;
};

export type DeletionPlan = { userId: string; email: string | null; workspaces: WorkspacePlan[]; blocked: boolean; owedCredits: number };

/** How long each kind of log is kept before the retention sweep deletes it, in days. */
export const RETENTION = {
  /** Used or expired sign-in links, codes and challenges, and ended sessions. */
  signIn: 0,
  /** Webhook delivery logs (the payload and each try). */
  webhookDeliveries: 30,
  /** Notifications that were read. */
  readNotifications: 180,
  /** Mail written by the dev mailer on a local machine. */
  devMail: 30,
  /** A decided report keeps the reporter's name and email this long, then drops them. */
  reportContacts: 365,
  /** Unused $WOVI price quotes after they expired. */
  tokenQuotes: 30,
} as const;

const DAY = 86_400_000;
export const DELETED_NAME = "Deleted member";

/** The anonymous id that stands in for a deleted person on records kept for bookkeeping. */
export function anonymousId(userId: string): string {
  return `deleted_${createHash("sha256").update(userId).digest("hex").slice(0, 16)}`;
}

export class Privacy {
  private readonly now: () => Date;

  constructor(private readonly o: PrivacyOptions) {
    this.now = o.now ?? (() => new Date());
  }

  private iso() {
    return this.now().toISOString();
  }

  /* ---------- Consent to use edits ---------- */

  /** Off unless the person turned it on. */
  async consent(userId: string): Promise<ConsentRow | null> {
    return this.o.safety.consents.get(userId);
  }

  async improves(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return false;
    return (await this.consent(userId))?.improveAgents === true;
  }

  /** Turns the consent on or off. Off is as easy as on, and takes effect at once. */
  async setConsent(userId: string, on: boolean): Promise<ConsentRow> {
    if (!(await this.o.accounts.store.users.get(userId))) throw new PrivacyError("not_found", "No such account.");
    const at = this.iso();
    const have = await this.consent(userId);
    const entry = { on: Boolean(on), at, version: IMPROVE_CONSENT.version };
    const row: ConsentRow = { id: userId, userId, improveAgents: Boolean(on), version: IMPROVE_CONSENT.version, at, history: [...(have?.history ?? []), entry].slice(-50) };
    if (have) await this.o.safety.consents.update(row);
    else await this.o.safety.consents.insert(row);
    return row;
  }

  /* ---------- Export ---------- */

  /** Everything WOVI holds about the person, as one JSON-ready object. */
  async export(userId: string): Promise<Record<string, unknown>> {
    const s = this.o.accounts.store;
    const user = await s.users.get(userId);
    if (!user) throw new PrivacyError("not_found", "No such account.");
    const memberships = (await s.members.find({ userId })).filter((m) => m.workspaceId !== PLATFORM_WORKSPACE_ID || user.builder);
    const workspaces = [];
    for (const m of memberships) {
      const ws = await s.workspaces.get(m.workspaceId);
      const owner = m.role === "owner";
      const base = { id: m.workspaceId, name: ws?.name ?? null, personal: ws?.personal ?? false, role: m.role, joinedAt: m.createdAt };
      // An owner gets the workspace's own content too; anyone else gets what they made or said in it.
      if (owner && m.workspaceId !== PLATFORM_WORKSPACE_ID) {
        workspaces.push({ ...base, content: await this.workspaceContent(m.workspaceId) });
      } else {
        workspaces.push({ ...base, yours: await this.contributions(m.workspaceId, userId) });
      }
    }
    return {
      about: `Your data at WOVI, as of ${this.iso()}. Kept by ${operatorLine()}. Questions: ${CONTACT_EMAIL}.`,
      exportedAt: this.iso(),
      account: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, updatedAt: user.updatedAt, ...(user.builder ? { builder: true } : {}) },
      consents: { improveAgents: (await this.consent(userId)) ?? { improveAgents: false, note: "Never turned on." } },
      sessions: (await s.sessions.find({ userId })).map((x) => ({ id: x.id, method: x.method, device: x.userAgent, createdAt: x.createdAt, lastSeenAt: x.lastSeenAt, expiresAt: x.expiresAt })),
      passkeys: (await s.passkeys.find({ userId })).map((p) => ({ name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt })),
      wallets: (await s.wallets.find({ userId })).map((w) => ({ address: w.address, chainId: w.chainId, linkedAt: w.linkedAt })),
      holder: await this.o.token.holders.get(userId),
      woviPayments: await this.o.token.payments.find({ userId }),
      chainPayments: this.o.chainpay ? await this.o.chainpay.payments.find({ userId }) : [],
      workspaces,
      onboarding: await this.o.app.onboarding.find({ userId }),
      notifications: await this.o.team.notifications.find({ userId }),
      uploadsConfirmed: await this.o.safety.rights.find({ userId }),
      reportsMade: (await this.o.safety.reports.find({ reporterUserId: userId })).map((r) => ({ ref: r.ref, reason: r.reason, details: r.details, target: r.target.given, status: r.status, createdAt: r.createdAt, decision: r.decision ? { outcome: r.decision.outcome, ground: r.decision.ground, at: r.decision.at } : null })),
    };
  }

  /** A workspace's own content, for its owner's copy. */
  private async workspaceContent(workspaceId: string) {
    const where = { workspaceId };
    return {
      brandBrains: await this.o.brand.brains.find(where),
      runs: (await this.o.runs.list(workspaceId)).map((r) => ({ id: r.id, agent: r.agent.id, version: r.agent.version, status: r.status, inputs: r.inputs, output: r.withheld ? null : r.output, createdAt: r.createdAt, aiGenerated: true, aiLabel: r.aiLabel ?? null })),
      pipelineRuns: (await this.o.pipelines.pipelineRuns.find(where)).map((p) => ({ id: p.id, pipeline: p.pipeline, status: p.status, inputs: p.inputs, createdAt: p.createdAt })),
      decisions: await this.o.app.reviews.find(where),
      reviewItems: await this.o.team.items.find(where),
      comments: await this.o.team.comments.find(where),
      clients: await this.o.team.clients.find(where),
      credits: { ledger: await this.o.credits.ledger.find(where), topUps: await this.o.credits.topUps.find(where) },
      webhooks: (await this.o.webhooks.endpoints.find(where)).map((e) => ({ id: e.id, url: e.url, createdAt: e.createdAt })),
    };
  }

  /** What one person made or said in a workspace someone else owns. */
  private async contributions(workspaceId: string, userId: string) {
    const items = await this.o.team.items.find({ workspaceId });
    const made = new Set(items.filter((i) => i.makerId === userId).map((i) => i.id));
    return {
      runsYouStarted: (await this.o.runs.list(workspaceId)).filter((r) => made.has(r.id) || r.credits?.userId === userId).map((r) => ({ id: r.id, agent: r.agent.id, status: r.status, inputs: r.inputs, output: r.withheld ? null : r.output, createdAt: r.createdAt, aiGenerated: true })),
      comments: await this.o.team.comments.find({ workspaceId, authorId: userId }),
      activity: await this.o.team.activity.find({ workspaceId, by: userId }),
      decisions: await this.o.app.reviews.find({ workspaceId, by: userId }),
      creditEntries: (await this.o.credits.ledger.find({ workspaceId })).filter((e) => e.userId === userId || e.by === userId),
    };
  }

  /* ---------- Deletion ---------- */

  /** What deleting the account would do, workspace by workspace. Nothing changes. */
  async deletionPlan(userId: string): Promise<DeletionPlan> {
    const s = this.o.accounts.store;
    const user = await s.users.get(userId);
    if (!user) throw new PrivacyError("not_found", "No such account.");
    const plans: WorkspacePlan[] = [];
    for (const m of await s.members.find({ userId })) {
      const ws = await s.workspaces.get(m.workspaceId);
      const members = await s.members.find({ workspaceId: m.workspaceId });
      const owners = members.filter((x) => x.role === "owner");
      const base = { id: m.workspaceId, name: ws?.name ?? m.workspaceId, role: m.role, members: members.length, counts: null, paidCredits: null, holderCredits: null };
      if (m.workspaceId === PLATFORM_WORKSPACE_ID) {
        plans.push({ ...base, name: "WOVI (builders)", action: "leave", why: "The platform's agents stay. You leave the builders." });
      } else if (members.length === 1) {
        const bal = this.o.balance ? await this.o.balance(m.workspaceId).catch(() => null) : null;
        plans.push({
          ...base,
          action: "delete",
          why: "You are the only member, so it is deleted with everything in it.",
          counts: {
            brandBrains: (await this.o.brand.brains.find({ workspaceId: m.workspaceId })).length,
            runs: (await this.o.runs.list(m.workspaceId)).length,
            pipelineRuns: (await this.o.pipelines.pipelineRuns.find({ workspaceId: m.workspaceId })).length,
          },
          paidCredits: bal ? bal.paid : null,
          holderCredits: bal ? bal.holder.available : null,
        });
      } else if (m.role === "owner" && owners.length === 1) {
        plans.push({ ...base, action: "blocked", why: `You are its only owner and ${members.length - 1} other ${members.length === 2 ? "person is" : "people are"} in it. Make one of them an owner first, or remove them.` });
      } else {
        plans.push({ ...base, action: "leave", why: "The team keeps it. You leave, and your name on comments and decisions becomes \"Deleted member\"." });
      }
    }
    return { userId, email: user.email, workspaces: plans, blocked: plans.some((p) => p.action === "blocked"), owedCredits: plans.reduce((n, p) => n + (p.paidCredits ?? 0), 0) };
  }

  /**
   * Deletes the account. `confirm` is the person's email (or "delete" for a
   * passkey-only account), so it never happens by accident.
   */
  async deleteAccount(userId: string, confirm: string): Promise<{ workspacesDeleted: number; workspacesLeft: number; owedCredits: number }> {
    const plan = await this.deletionPlan(userId);
    const expected = plan.email ?? "delete";
    if (String(confirm ?? "").trim().toLowerCase() !== expected.toLowerCase()) {
      throw new PrivacyError("invalid_input", "Type your email address to confirm.", [`confirm: Type ${plan.email ? "your email address" : "the word delete"} exactly.`]);
    }
    if (plan.blocked) throw new PrivacyError("blocked", "Make someone else an owner of your shared workspaces first.", plan.workspaces.filter((w) => w.action === "blocked").map((w) => `${w.name}: ${w.why}`));
    const s = this.o.accounts.store;
    const anon = anonymousId(userId);
    const at = this.iso();
    let ledgerKept = 0;

    for (const w of plan.workspaces) {
      if (w.action === "delete") {
        ledgerKept += await this.deleteWorkspace(w.id, anon);
        if ((w.paidCredits ?? 0) > 0) {
          const topUps = await this.o.credits.topUps.find({ workspaceId: w.id, status: "paid" });
          await this.o.safety.owed.insert({
            id: `owed_${createHash("sha256").update(`${w.id}:${at}`).digest("hex").slice(0, 16)}`,
            kind: "account_deleted",
            workspaceId: w.id,
            topUpId: null,
            credits: w.paidCredits!,
            amountCents: centsFor(w.paidCredits!),
            currency: "usd",
            test: topUps.length > 0 && topUps.every((t) => t.test),
            contact: plan.email,
            status: "owed",
            createdAt: at,
            paidAt: null,
            paidBy: null,
          });
        }
      } else {
        ledgerKept += await this.leaveWorkspace(w.id, userId, anon);
      }
    }

    // The person.
    for (const t of await s.sessions.find({ userId })) await s.sessions.delete(t.id);
    for (const p of await s.passkeys.find({ userId })) await s.passkeys.delete(p.id);
    for (const w of await s.wallets.find({ userId })) await s.wallets.delete(w.id);
    for (const c of await s.challenges.find({ userId })) await s.challenges.delete(c.id);
    if (plan.email) {
      for (const r of await s.signInRequests.find({ email: plan.email })) await s.signInRequests.delete(r.id);
      for (const i of await s.invites.find({ email: plan.email })) if (!i.acceptedAt) await s.invites.delete(i.id);
    }
    for (const c of await s.builderCodes.find({ usedBy: userId })) await s.builderCodes.update({ ...c, usedBy: anon });
    await this.o.token.holders.delete(userId);
    for (const q of await this.o.token.quotes.find({ userId })) await this.o.token.quotes.delete(q.id);
    for (const p of await this.o.token.payments.find({ userId })) await this.o.token.payments.update({ ...p, userId: anon });
    if (this.o.chainpay) {
      for (const q of await this.o.chainpay.quotes.find({ userId })) await this.o.chainpay.quotes.delete(q.id);
      for (const p of await this.o.chainpay.payments.find({ userId })) await this.o.chainpay.payments.update({ ...p, userId: anon });
    }
    for (const o of await this.o.app.onboarding.find({ userId })) await this.o.app.onboarding.delete(o.id);
    for (const n of await this.o.team.notifications.find({ userId })) await this.o.team.notifications.delete(n.id);
    await this.o.safety.consents.delete(userId);
    for (const r of await this.o.safety.rights.find({ userId })) await this.o.safety.rights.delete(r.id);
    for (const r of await this.o.safety.reports.find({ reporterUserId: userId })) await this.o.safety.reports.update({ ...r, reporterUserId: null, reporterName: null, reporterEmail: null });
    await s.users.delete(userId);

    const workspacesDeleted = plan.workspaces.filter((w) => w.action === "delete").length;
    const workspacesLeft = plan.workspaces.length - workspacesDeleted;
    await this.o.safety.deletions.insert({ id: anon, at, workspacesDeleted, workspacesLeft, ledgerEntriesKept: ledgerKept }).catch(() => undefined);
    if (plan.email && this.o.email) {
      await this.o.email
        .send({
          to: plan.email,
          subject: "Your WOVI account is deleted",
          text: [
            "Your WOVI account and the workspaces only you were in are deleted.",
            plan.owedCredits > 0 ? `You had ${plan.owedCredits} paid credits left. We owe you that money back and will send it to the way you paid. We keep this email address only until that is done.` : "",
            "Payment records are kept for bookkeeping as the law asks, without your name.",
            `${operatorLine()}. ${CONTACT_EMAIL}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        })
        .catch(() => undefined);
    }
    return { workspacesDeleted, workspacesLeft, owedCredits: plan.owedCredits };
  }

  /** Deletes a workspace and its content. Returns how many ledger entries were kept (anonymised). */
  private async deleteWorkspace(workspaceId: string, anon: string): Promise<number> {
    const s = this.o.accounts.store;
    const where = { workspaceId };
    const drop = async <T extends { id: string }>(c: { find(w: Partial<T>): Promise<T[]>; delete(id: string): Promise<boolean> }) => {
      for (const r of await c.find(where as unknown as Partial<T>)) await c.delete(r.id);
    };
    await drop(this.o.brand.brains);
    await drop(this.o.brand.brainVersions);
    await drop(this.o.brand.proposals);
    await this.o.runs.deleteWorkspace(workspaceId);
    await drop(this.o.app.onboarding);
    await drop(this.o.app.reviews);
    for (const t of [this.o.team.items, this.o.team.comments, this.o.team.activity, this.o.team.notifications, this.o.team.clients, this.o.team.shareLinks, this.o.team.settings]) await drop(t as never);
    await drop(this.o.pipelines.pipelines);
    await drop(this.o.pipelines.pipelineVersions);
    await drop(this.o.pipelines.pipelineRuns);
    await drop(this.o.webhooks.endpoints);
    await drop(this.o.webhooks.deliveries);
    await drop(this.o.credits.limits);
    await drop(this.o.safety.rights);
    await drop(s.members);
    await drop(s.invites);
    await drop(s.apiKeys);
    await s.workspaces.delete(workspaceId);
    if (this.o.filesDir) rmSync(join(this.o.filesDir, workspaceId), { recursive: true, force: true });
    // Bookkeeping stays: ledger entries and top-ups, with the person's id swapped out.
    return this.anonymiseCredits(workspaceId, null, anon);
  }

  /** Leaves a shared workspace: membership and keys go, the name on the team's records becomes "Deleted member". */
  private async leaveWorkspace(workspaceId: string, userId: string, anon: string): Promise<number> {
    const s = this.o.accounts.store;
    await s.members.delete(`${workspaceId}:${userId}`);
    const at = this.iso();
    for (const k of await s.apiKeys.find({ workspaceId, createdBy: userId })) if (!k.revokedAt) await s.apiKeys.update({ ...k, revokedAt: at });
    for (const c of await this.o.team.comments.find({ workspaceId, authorId: userId })) await this.o.team.comments.update({ ...c, authorId: anon, authorName: DELETED_NAME, mentions: c.mentions.filter((m) => m !== userId) });
    for (const a of await this.o.team.activity.find({ workspaceId, by: userId })) await this.o.team.activity.update({ ...a, by: anon, byName: DELETED_NAME });
    for (const it of await this.o.team.items.find({ workspaceId })) {
      const touches = it.makerId === userId || it.assigneeId === userId || it.sentBy === userId || it.approvals.some((x) => x.by === userId) || it.last?.by === userId;
      if (!touches) continue;
      await this.o.team.items.update({
        ...it,
        makerId: it.makerId === userId ? null : it.makerId,
        assigneeId: it.assigneeId === userId ? null : it.assigneeId,
        sentBy: it.sentBy === userId ? anon : it.sentBy,
        approvals: it.approvals.map((x) => (x.by === userId ? { ...x, by: anon, name: DELETED_NAME } : x)),
        last: it.last?.by === userId ? { ...it.last, by: anon, name: DELETED_NAME } : it.last,
      });
    }
    for (const r of await this.o.app.reviews.find({ workspaceId, by: userId })) await this.o.app.reviews.update({ ...r, by: anon });
    for (const l of await this.o.credits.limits.find({ workspaceId })) {
      if (userId in l.members) {
        const members = { ...l.members };
        delete members[userId];
        await this.o.credits.limits.update({ ...l, members });
      }
    }
    for (const o of await this.o.app.onboarding.find({ workspaceId, userId })) await this.o.app.onboarding.delete(o.id);
    return this.anonymiseCredits(workspaceId, userId, anon);
  }

  /** Swaps the person's id for the anonymous one on ledger entries and top-ups. Returns how many entries were looked at and kept. */
  private async anonymiseCredits(workspaceId: string, userId: string | null, anon: string): Promise<number> {
    const entries = await this.o.credits.ledger.find({ workspaceId });
    const mine = (v: string | null) => v !== null && (userId === null ? v.startsWith("usr_") : v === userId);
    for (const e of entries) {
      if (mine(e.userId) || mine(e.by)) await this.o.credits.ledger.update({ ...e, userId: mine(e.userId) ? anon : e.userId, by: mine(e.by) ? anon : e.by });
    }
    for (const t of await this.o.credits.topUps.find({ workspaceId })) if (mine(t.by)) await this.o.credits.topUps.update({ ...t, by: anon });
    return entries.length;
  }

  /* ---------- Retention ---------- */

  /**
   * Deletes logs past their retention (RETENTION). Off unless switched on
   * (WOVI_RETENTION_SWEEP=on), so an existing data dir never loses anything
   * on upgrade without the owner choosing it. Never touches the ledger,
   * top-ups, payments, runs or Brand Brains.
   */
  async sweep(): Promise<Record<string, number>> {
    const now = this.now().getTime();
    const older = (iso: string | null | undefined, days: number) => iso !== null && iso !== undefined && Date.parse(iso) < now - days * DAY;
    const out: Record<string, number> = { signIn: 0, webhookDeliveries: 0, readNotifications: 0, reportContacts: 0, tokenQuotes: 0, devMail: 0 };
    const s = this.o.accounts.store;
    const before = (await s.signInRequests.find()).length + (await s.challenges.find()).length + (await s.sessions.find()).length;
    await this.o.accounts.sweep();
    out.signIn = before - ((await s.signInRequests.find()).length + (await s.challenges.find()).length + (await s.sessions.find()).length);
    for (const d of await this.o.webhooks.deliveries.find()) if (older(d.createdAt, RETENTION.webhookDeliveries) && (await this.o.webhooks.deliveries.delete(d.id))) out.webhookDeliveries++;
    for (const n of await this.o.team.notifications.find()) if (n.readAt && older(n.readAt, RETENTION.readNotifications) && (await this.o.team.notifications.delete(n.id))) out.readNotifications++;
    for (const r of await this.o.safety.reports.find({ status: "decided" })) {
      if (older(r.decision?.at, RETENTION.reportContacts) && (r.reporterEmail || r.reporterName)) {
        await this.o.safety.reports.update({ ...r, reporterEmail: null, reporterName: null });
        out.reportContacts++;
      }
    }
    for (const q of await this.o.token.quotes.find()) if (!q.usedAt && older(q.expiresAt, RETENTION.tokenQuotes) && (await this.o.token.quotes.delete(q.id))) out.tokenQuotes++;
    if (this.o.mailDir) out.devMail = sweepDir(this.o.mailDir, now - RETENTION.devMail * DAY);
    return out;
  }
}

/** Deletes files in a folder older than `before` (ms). Returns how many. */
function sweepDir(dir: string, before: number): number {
  let n = 0;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    const p = join(dir, name);
    try {
      const st = statSync(p);
      if (st.isFile() && st.mtimeMs < before) {
        rmSync(p, { force: true });
        n++;
      }
    } catch {
      /* gone already */
    }
  }
  return n;
}

/** Whether the retention sweep is switched on. */
export function retentionSweepOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.WOVI_RETENTION_SWEEP === "on";
}
