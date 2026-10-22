/**
 * The review rules (phase 11), pure: an item's state from its run and its
 * row, who may decide under the workspace's approval rules, what a decision
 * does to an item, and @mentions. No storage, so tests and screens share them.
 */
import { atLeast, can, type Role } from "@/lib/accounts/policy";
import type { Approval, Decision, DecisionRecord, ItemRow, ItemState, ReviewSettings } from "./types";

/** Where the work behind an item is: still going, finished, or stopped without a result. */
export type SourceState = "running" | "finished" | "stopped";

export function sourceOfRun(status: string): SourceState {
  if (status === "succeeded") return "finished";
  if (status === "failed" || status === "cancelled") return "stopped";
  return "running";
}

export function sourceOfPipeline(status: string): SourceState {
  if (status === "ready" || status === "approved" || status === "rejected") return "finished";
  if (status === "failed" || status === "cancelled") return "stopped";
  return "running";
}

const DECIDED: readonly ItemState[] = ["approved", "changes_requested", "rejected"];

export function isDecided(state: ItemState): boolean {
  return DECIDED.includes(state);
}

/**
 * The state a person sees.
 *
 * - A decision on the row wins.
 * - Work still going (or stopped) is a draft.
 * - A finished draft is in review when someone sent it, when it is a re-run
 *   from a change request, or when the workspace sends finished work on its
 *   own (the default).
 * - With no row yet, a phase 9 or 10 decision counts; else the default above.
 */
export function itemState(source: SourceState, row: Pick<ItemRow, "status" | "submitOnFinish"> | null, legacy: "approved" | "rejected" | null, settings: Pick<ReviewSettings, "autoSubmit">): ItemState {
  if (row && isDecided(row.status)) return row.status;
  if (legacy) return legacy;
  if (source !== "finished") return "draft";
  if (row && (row.status === "needs_review" || row.submitOnFinish)) return "needs_review";
  return settings.autoSubmit ? "needs_review" : "draft";
}

/** Why this role may not decide under these rules, or null when it may. Clients are checked by their link. */
export function deciderProblem(role: Role, settings: Pick<ReviewSettings, "approvers">): string | null {
  if (!can(role, "decide")) return `Your role (${role}) cannot approve, reject or ask for changes in this workspace.`;
  if (settings.approvers === "admins" && !atLeast(role, "admin")) return "Only admins and owners decide in this workspace.";
  return null;
}

export type Decider = { by: string; name: string; via: "member" | "client" };

export type DecisionOutcome = {
  row: ItemRow;
  /** What happened, as the activity log names it. */
  kind: "approval_added" | "approved" | "changes_requested" | "rejected";
  /** The round closed with this decision. */
  final: boolean;
};

export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionError";
  }
}

/**
 * Applies a decision to an item. A yes adds an approval and closes the round
 * once enough people said yes; the same person cannot say yes twice in one
 * round. A no or a change request closes the round at once. Deciding on a
 * closed round starts a new one, so a decision can be replaced.
 */
export function applyDecision(row: ItemRow, current: ItemState, decision: Decision, who: Decider, note: string, needed: number, at: string): DecisionOutcome {
  const fresh = isDecided(current);
  const approvals: Approval[] = fresh ? [] : [...row.approvals];
  const round = fresh ? row.round + 1 : row.round;
  const record: DecisionRecord = { decision, by: who.by, name: who.name, at, note, via: who.via };
  if (decision === "approve") {
    if (approvals.some((a) => a.by === who.by)) throw new DecisionError(needed > 1 ? "You already said yes. This needs someone else's yes too." : "You already approved this.");
    approvals.push({ by: who.by, name: who.name, at, note, via: who.via });
    if (approvals.length >= needed) return { row: { ...row, status: "approved", approvals, round, last: record, updatedAt: at }, kind: "approved", final: true };
    return { row: { ...row, status: "needs_review", approvals, round, sentAt: row.sentAt ?? at, sentBy: row.sentBy ?? who.by, updatedAt: at }, kind: "approval_added", final: false };
  }
  const status: ItemState = decision === "reject" ? "rejected" : "changes_requested";
  return { row: { ...row, status, approvals: [], round, last: record, updatedAt: at }, kind: status, final: true };
}

/* ---------- Mentions ---------- */

export type Handle = { userId: string; handle: string; name: string };

/**
 * One short handle per member, from the first word of their name or the part
 * of the email before the @, lowercased; a number is added when two clash.
 */
export function memberHandles(members: { userId: string; name: string | null; email: string | null }[]): Handle[] {
  const taken = new Set<string>();
  const out: Handle[] = [];
  for (const m of [...members].sort((a, b) => a.userId.localeCompare(b.userId))) {
    const source = m.name?.trim() ? m.name.trim().split(/\s+/)[0] : (m.email?.split("@")[0] ?? "member");
    const base = source.toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/\.+$/, "") || "member";
    let handle = base;
    for (let n = 2; taken.has(handle); n++) handle = `${base}${n}`;
    taken.add(handle);
    out.push({ userId: m.userId, handle, name: m.name?.trim() || m.email || handle });
  }
  return out;
}

/** The members a text mentions with @handle, once each, in order. Unknown handles are plain text. */
export function parseMentions(body: string, handles: Handle[]): string[] {
  const by = new Map(handles.map((h) => [h.handle, h.userId]));
  const out: string[] = [];
  for (const m of body.matchAll(/(^|[^\w@])@([a-z0-9._-]+)/gi)) {
    const id = by.get(m[2].toLowerCase().replace(/\.+$/, ""));
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/* ---------- Share links ---------- */

export const LINK_DAYS = [1, 7, 14, 30, 90] as const;
export const DEFAULT_LINK_DAYS = 14;

/** Whether a share link opens right now. */
export function linkOpen(link: { expiresAt: string; revokedAt: string | null }, now: number): boolean {
  return !link.revokedAt && Date.parse(link.expiresAt) > now;
}
