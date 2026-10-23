/**
 * Review, approve and workspaces for teams (phase 11).
 *
 * - The review queue: every run and pipeline run of a workspace (not a
 *   pipeline's own step runs) as an item with one state: draft, needs review,
 *   approved, changes asked or rejected. Filters by client, brand, agent,
 *   assignee and state.
 * - Decisions under the workspace's approval rules: who may decide (anyone who
 *   edits, or admins and owners only) and how many yeses it takes (one or
 *   two). Asking for changes needs a note and starts a re-run with it, the
 *   same way a quick edit does, linked to the original.
 * - Comments in threads with @mentions, assignments, an activity log per item
 *   and in-app notifications, also sent through the email sender.
 * - Clients: a workspace holds clients, each tied to its own Brand Brains,
 *   and share links that let a client see and decide only their own items.
 *
 * Every member call names its caller and goes through the phase 4 policy
 * (Accounts.authorize). Client calls carry a share link token instead and see
 * only items whose Brand Brain belongs to that link's client.
 *
 * The phase 9 decision on a run (the app's reviews table) and the phase 10
 * decision on a pipeline run are kept in step, so History and the run pages
 * read the same answer.
 */
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import { newId, randomToken, sha256 } from "@/lib/accounts/crypto";
import { AccountError } from "@/lib/accounts/errors";
import { savedBy, type PublicRun } from "@/lib/accounts/guard";
import { can } from "@/lib/accounts/policy";
import type { AgentRegistry } from "@/lib/agents/registry";
import type { AppStore } from "@/lib/app/store";
import { pipelineTitle } from "@/lib/app/pipelines";
import { applyNote } from "@/lib/app/quick-edits";
import { runTitle } from "@/lib/app/results";
import type { BrandBrains } from "@/lib/brand/brains";
import type { PipelineEngine } from "@/lib/pipelines/engine";
import { publicPipelineRun, type PackageItem, type PipelineRun, type PublicPipelineRun } from "@/lib/pipelines/run";
import type { RunEngine } from "@/lib/runs/engine";
import type { RunOutput } from "@/lib/runs/output";
import { publicRunView, type Run } from "@/lib/runs/run";
import { applyDecision, DecisionError, deciderProblem, DEFAULT_LINK_DAYS, isDecided, itemState, LINK_DAYS, linkOpen, memberHandles, parseMentions, sourceOfPipeline, sourceOfRun, type Decider, type Handle, type SourceState } from "./rules";
import type { TeamStore } from "./store";
import {
  CLIENT_ACTIVITY,
  DECISIONS,
  DEFAULT_SETTINGS,
  ITEM_STATES,
  type ActivityKind,
  type ActivityRow,
  type Approval,
  type ClientRow,
  type CommentRow,
  type Decision,
  type DecisionRecord,
  type ItemKind,
  type ItemRow,
  type ItemState,
  type NotificationKind,
  type NotificationRow,
  type ReviewSettings,
  type ShareLinkRow,
} from "./types";

export type TeamErrorCode = "invalid_request" | "not_found" | "not_ready" | "conflict" | "forbidden" | "invalid_link";

export class TeamError extends Error {
  constructor(
    readonly code: TeamErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "TeamError";
  }
}

export type TeamOptions = {
  accounts: Accounts;
  /** The raw engines: the service checks access itself, and share links have no caller. */
  runs: RunEngine;
  pipelines?: PipelineEngine;
  /** The raw registry, for the agent's form when a change request runs it again. */
  registry: AgentRegistry;
  brands: BrandBrains;
  /** The phase 9 tables: the decision on a run is mirrored there. */
  app: AppStore;
  store: TeamStore;
  now?: () => Date;
  /**
   * Live stats: told about every decision, after it is saved, so an approval
   * counts as a use and a change request as a regenerate. A listener that
   * throws never breaks a decision.
   */
  onDecided?: (e: TeamDecisionEvent) => void | Promise<void>;
};

/** One decision on an item, for listeners. `by` is a user id, `key:<id>` or `link:<id>`. */
export type TeamDecisionEvent = {
  workspaceId: string;
  kind: "run" | "pipeline";
  id: string;
  outcome: "approval_added" | "approved" | "changes_requested" | "rejected";
  by: string;
  via: "member" | "client";
};

type Ref = { id: string; name: string };

/** An item as the queue and the screens show it. */
export type ItemView = {
  id: string;
  kind: ItemKind;
  workspaceId: string;
  state: ItemState;
  /** Where the run behind it is. A running draft cannot be decided yet. */
  source: SourceState;
  title: string;
  /** The agent or the pipeline. */
  what: Ref & { kind: ItemKind };
  brand: { id: string; name: string | null } | null;
  client: Ref | null;
  assignee: Ref | null;
  maker: Ref | null;
  /** A guardrail flagged it: worth a closer look. */
  flagged: boolean;
  approvals: Approval[];
  approvalsNeeded: number;
  last: DecisionRecord | null;
  reRunOf: string | null;
  reRuns: string[];
  comments: number;
  createdAt: string;
  updatedAt: string;
};

export type QueueFilter = {
  state?: ItemState | "all" | "open";
  clientId?: string;
  brandBrainId?: string;
  /** "agent:<id>" or "pipeline:<id>". */
  what?: string;
  /** "me", "none" or a user id. */
  assignee?: string;
  q?: string;
  limit?: number;
};

export type Thread = CommentRow & { replies: CommentRow[] };

export type ItemDetail = {
  item: ItemView;
  run: PublicRun | null;
  pipeline: PublicPipelineRun | null;
  threads: Thread[];
  activity: ActivityRow[];
  /** Members by @handle, for mentions and the assignee picker. */
  members: (Handle & { role: string })[];
  can: { decide: boolean; why: string | null; send: boolean; assign: boolean; comment: boolean; internal: boolean };
};

export type ClientView = ClientRow & {
  brands: { id: string; name: string }[];
  defaultBrand: { id: string; name: string } | null;
  counts: { needsReview: number; approved: number; total: number };
  /** Only for people who manage clients. */
  links: ShareLinkView[];
};

export type ShareLinkView = Omit<ShareLinkRow, "tokenHash"> & { open: boolean };

/** What a client sees of an item: the result and the decision, nothing internal. */
export type ClientItemView = {
  id: string;
  kind: ItemKind;
  state: ItemState;
  title: string;
  what: string;
  brand: string | null;
  approvals: { name: string; at: string }[];
  approvalsNeeded: number;
  last: { decision: Decision; name: string; at: string; note: string } | null;
  reRunOf: string | null;
  reRuns: string[];
  comments: number;
  createdAt: string;
};

export type ClientItemDetail = {
  item: ClientItemView;
  output: RunOutput | null;
  package: PackageItem[] | null;
  threads: Thread[];
  activity: ActivityRow[];
};

export type ClientSession = { link: ShareLinkView; client: { id: string; name: string }; workspaceName: string };

const ITEM_ID = /^(run|pip)_[a-z0-9]{6,40}$/;
const NOTE_MAX = 500;
const COMMENT_MAX = 2000;
/** What a client may see: work sent to review and what came of it. Drafts stay with the team. */
const CLIENT_STATES: readonly ItemState[] = ["needs_review", "approved", "changes_requested", "rejected"];

/** What sits behind an item: a run or a pipeline run, with what the queue needs from it. */
type Source = {
  kind: ItemKind;
  id: string;
  workspaceId: string;
  source: SourceState;
  title: string;
  what: Ref & { kind: ItemKind };
  brand: { id: string; name: string | null } | null;
  flagged: boolean;
  legacy: "approved" | "rejected" | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  run: Run | null;
  pipeline: PipelineRun | null;
};

function clean(text: unknown, max: number): string {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

const short = (text: string, max = 140) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 3).trimEnd()}...` : line;
};

export class Team {
  private readonly now: () => Date;

  constructor(private readonly o: TeamOptions) {
    this.now = o.now ?? (() => new Date());
  }

  private iso(offsetMs = 0) {
    return new Date(this.now().getTime() + offsetMs).toISOString();
  }

  private get s() {
    return this.o.store;
  }

  /* ---------- Settings ---------- */

  private async rules(workspaceId: string): Promise<ReviewSettings> {
    return (await this.s.settings.get(workspaceId)) ?? { id: workspaceId, workspaceId, ...DEFAULT_SETTINGS };
  }

  async settings(caller: Principal, workspaceId: string): Promise<ReviewSettings> {
    await this.o.accounts.authorize(caller, workspaceId, "view");
    return this.rules(workspaceId);
  }

  /** Changes the approval rules. Owners and admins. Counts already given stay; the new rule applies from the next decision. */
  async saveSettings(caller: Principal, workspaceId: string, patch: Partial<Pick<ReviewSettings, "approvers" | "approvalsNeeded" | "autoSubmit" | "emailNotifications">>): Promise<ReviewSettings> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_review_rules");
    const cur = await this.rules(workspaceId);
    const next: ReviewSettings = { ...cur };
    if (patch.approvers !== undefined) {
      if (patch.approvers !== "editors" && patch.approvers !== "admins") throw new TeamError("invalid_request", "Pick editors or admins.");
      next.approvers = patch.approvers;
    }
    if (patch.approvalsNeeded !== undefined) {
      if (patch.approvalsNeeded !== 1 && patch.approvalsNeeded !== 2) throw new TeamError("invalid_request", "One or two approvals.");
      next.approvalsNeeded = patch.approvalsNeeded;
    }
    if (patch.autoSubmit !== undefined) next.autoSubmit = Boolean(patch.autoSubmit);
    if (patch.emailNotifications !== undefined) next.emailNotifications = Boolean(patch.emailNotifications);
    next.updatedBy = savedBy(caller);
    next.updatedAt = this.iso();
    if (await this.s.settings.get(workspaceId)) await this.s.settings.update(next);
    else await this.s.settings.insert(next);
    return next;
  }

  /* ---------- Names ---------- */

  private async nameOf(by: string | null, cache = new Map<string, string>()): Promise<string> {
    if (!by) return "Someone";
    const hit = cache.get(by);
    if (hit) return hit;
    let name = "Someone";
    if (by.startsWith("key:")) name = "An API key";
    else if (by.startsWith("link:")) {
      const link = await this.s.shareLinks.get(by.slice(5));
      name = link ? link.label : "A client";
    } else {
      const u = await this.o.accounts.getUser(by);
      name = u?.name ?? u?.email ?? "Someone";
    }
    cache.set(by, name);
    return name;
  }

  private async ref(by: string | null, cache: Map<string, string>): Promise<Ref | null> {
    return by ? { id: by, name: await this.nameOf(by, cache) } : null;
  }

  /* ---------- Sources ---------- */

  private agentNames = async (cache: Map<string, string>, workspaceId: string, id: string): Promise<string> => {
    const key = `${workspaceId}/${id}`;
    if (!cache.has(key)) cache.set(key, (await this.o.registry.get(workspaceId, id))?.name ?? id);
    return cache.get(key)!;
  };

  private async fromRun(run: Run, names: Map<string, string>): Promise<Source> {
    const spec = await this.o.registry.get(run.agent.workspaceId, run.agent.id, run.agent.version).catch(() => null);
    const review = await this.o.app.reviews.get(run.id);
    return {
      kind: "run",
      id: run.id,
      workspaceId: run.workspaceId,
      source: sourceOfRun(run.status),
      title: runTitle(run, spec),
      what: { kind: "run", id: run.agent.id, name: spec?.name ?? (await this.agentNames(names, run.agent.workspaceId, run.agent.id)) },
      brand: run.brandBrain ? { id: run.brandBrain.id, name: run.brandBrain.name ?? null } : null,
      flagged: run.needsReview,
      legacy: review && review.workspaceId === run.workspaceId ? review.decision : null,
      createdBy: null,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      run,
      pipeline: null,
    };
  }

  private fromPipeline(pr: PipelineRun): Source {
    return {
      kind: "pipeline",
      id: pr.id,
      workspaceId: pr.workspaceId,
      source: sourceOfPipeline(pr.status),
      title: pipelineTitle(pr),
      what: { kind: "pipeline", id: pr.pipeline.id, name: pr.pipeline.name },
      brand: pr.brandBrain ? { id: pr.brandBrain.id, name: pr.brandBrain.name } : null,
      flagged: pr.needsReview,
      legacy: pr.decision?.decision ?? null,
      createdBy: pr.createdBy,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      run: null,
      pipeline: pr,
    };
  }

  /** The run or pipeline run behind an item id, in this workspace only. */
  private async source(workspaceId: string, id: string, names = new Map<string, string>()): Promise<Source | null> {
    if (typeof id !== "string" || !ITEM_ID.test(id)) return null;
    if (id.startsWith("run_")) {
      const run = await this.o.runs.getRun(workspaceId, id);
      // A pipeline's own step runs are reviewed as part of their pipeline run.
      return run && run.workspaceId === workspaceId && !run.parent ? this.fromRun(run, names) : null;
    }
    const pr = this.o.pipelines ? await this.o.pipelines.get(workspaceId, id) : null;
    return pr ? this.fromPipeline(pr) : null;
  }

  private async sources(workspaceId: string): Promise<Source[]> {
    const names = new Map<string, string>();
    const runs = (await this.o.runs.listRuns(workspaceId)).filter((r) => !r.parent);
    const out: Source[] = [];
    for (const r of runs) out.push(await this.fromRun(r, names));
    if (this.o.pipelines) for (const p of await this.o.pipelines.list(workspaceId)) out.push(this.fromPipeline(p));
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  private async row(workspaceId: string, id: string): Promise<ItemRow | null> {
    const r = await this.s.items.get(id);
    return r && r.workspaceId === workspaceId ? r : null;
  }

  private stateOf(src: Source, row: ItemRow | null, settings: ReviewSettings): ItemState {
    return itemState(src.source, row, src.legacy, settings);
  }

  /** The item's row, made from what the run says when nobody has acted on it yet. */
  private async ensureRow(src: Source, settings: ReviewSettings): Promise<ItemRow> {
    const have = await this.row(src.workspaceId, src.id);
    if (have) return have;
    const at = this.iso();
    const state = this.stateOf(src, null, settings);
    const row: ItemRow = {
      id: src.id,
      workspaceId: src.workspaceId,
      kind: src.kind,
      status: state,
      makerId: src.createdBy && src.createdBy.startsWith("usr_") ? src.createdBy : null,
      submitOnFinish: false,
      sentBy: null,
      sentAt: state === "needs_review" ? at : null,
      assigneeId: null,
      approvals: [],
      round: 1,
      last: src.legacy ? { decision: src.legacy === "approved" ? "approve" : "reject", by: "", name: "Someone", at: src.updatedAt, note: "", via: "member" } : null,
      reRunOf: null,
      reRuns: [],
      createdAt: at,
      updatedAt: at,
    };
    await this.s.items.insert(row);
    return row;
  }

  private async clientsOf(workspaceId: string): Promise<ClientRow[]> {
    return this.s.clients.find({ workspaceId });
  }

  private clientFor(brandId: string | null | undefined, clients: ClientRow[]): ClientRow | null {
    return brandId ? (clients.find((c) => c.brandBrainIds.includes(brandId)) ?? null) : null;
  }

  private async view(src: Source, row: ItemRow | null, settings: ReviewSettings, clients: ClientRow[], names: Map<string, string>, comments: number): Promise<ItemView> {
    const client = this.clientFor(src.brand?.id, clients);
    return {
      id: src.id,
      kind: src.kind,
      workspaceId: src.workspaceId,
      state: this.stateOf(src, row, settings),
      source: src.source,
      title: src.title,
      what: src.what,
      brand: src.brand,
      client: client ? { id: client.id, name: client.name } : null,
      assignee: await this.ref(row?.assigneeId ?? null, names),
      maker: await this.ref(row?.makerId ?? (src.createdBy?.startsWith("usr_") ? src.createdBy : null), names),
      flagged: src.flagged,
      approvals: row?.approvals ?? [],
      approvalsNeeded: settings.approvalsNeeded,
      last: row?.last ?? null,
      reRunOf: row?.reRunOf ?? null,
      reRuns: row?.reRuns ?? [],
      comments,
      createdAt: src.createdAt,
      updatedAt: row && row.updatedAt > src.updatedAt ? row.updatedAt : src.updatedAt,
    };
  }

  /* ---------- The queue ---------- */

  /** Every item of the workspace, newest first, with the filters. Runs that failed or were stopped stay in History. */
  async queue(caller: Principal, workspaceId: string, filter: QueueFilter = {}): Promise<ItemView[]> {
    await this.o.accounts.authorize(caller, workspaceId, "view");
    const me = savedBy(caller);
    return this.list(workspaceId, filter, me);
  }

  private async list(workspaceId: string, filter: QueueFilter, me: string | null, only?: (src: Source) => boolean, publicOnly = false): Promise<ItemView[]> {
    const settings = await this.rules(workspaceId);
    const clients = await this.clientsOf(workspaceId);
    const rows = new Map((await this.s.items.find({ workspaceId })).map((r) => [r.id, r]));
    const counts = new Map<string, number>();
    for (const c of await this.s.comments.find({ workspaceId })) if (!publicOnly || !c.internal) counts.set(c.itemId, (counts.get(c.itemId) ?? 0) + 1);
    const names = new Map<string, string>();
    const q = filter.q?.trim().toLowerCase() ?? "";
    const client = filter.clientId ? clients.find((c) => c.id === filter.clientId) : null;
    if (filter.clientId && !client) return [];
    const out: ItemView[] = [];
    for (const src of await this.sources(workspaceId)) {
      if (src.source === "stopped") continue;
      if (only && !only(src)) continue;
      const row = rows.get(src.id) ?? null;
      const v = await this.view(src, row, settings, clients, names, counts.get(src.id) ?? 0);
      if (filter.state && filter.state !== "all") {
        if (filter.state === "open" ? v.state !== "needs_review" : v.state !== filter.state) continue;
      }
      if (client && !(src.brand && client.brandBrainIds.includes(src.brand.id))) continue;
      if (filter.brandBrainId && src.brand?.id !== filter.brandBrainId) continue;
      if (filter.what && `${src.kind === "run" ? "agent" : "pipeline"}:${src.what.id}` !== filter.what) continue;
      if (filter.assignee) {
        const want = filter.assignee === "me" ? me : filter.assignee;
        if (filter.assignee === "none" ? v.assignee !== null : v.assignee?.id !== want) continue;
      }
      if (q && ![v.title, v.what.name, v.brand?.name ?? "", v.client?.name ?? ""].join("\n").toLowerCase().includes(q)) continue;
      out.push(v);
      if (filter.limit && out.length >= filter.limit) break;
    }
    return out;
  }

  /** How many items wait in review: for the nav. */
  async waitingCount(caller: Principal, workspaceId: string): Promise<number> {
    return (await this.queue(caller, workspaceId, { state: "open" })).length;
  }

  /** One item with its result, comments, activity and what the caller may do. */
  async item(caller: Principal, workspaceId: string, id: string): Promise<ItemDetail | null> {
    const role = await this.o.accounts.authorize(caller, workspaceId, "view");
    const src = await this.source(workspaceId, id);
    if (!src) return null;
    const settings = await this.rules(workspaceId);
    const row = await this.row(workspaceId, id);
    const names = new Map<string, string>();
    const comments = await this.s.comments.find({ workspaceId, itemId: id });
    const item = await this.view(src, row, settings, await this.clientsOf(workspaceId), names, comments.length);
    const members = await this.handles(caller, workspaceId);
    const why = caller.kind === "api_key" ? "An API key cannot decide. People approve." : deciderProblem(role, settings);
    return {
      item,
      run: src.run ? publicRunView(src.run) : null,
      pipeline: src.pipeline ? publicPipelineRun(src.pipeline) : null,
      threads: threads(comments),
      activity: (await this.s.activity.find({ workspaceId, itemId: id })).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
      members,
      can: {
        decide: why === null,
        why,
        send: can(role, "send_for_review", caller.kind),
        assign: can(role, "assign", caller.kind),
        comment: can(role, "comment", caller.kind),
        internal: true,
      },
    };
  }

  private async handles(caller: Principal, workspaceId: string): Promise<(Handle & { role: string })[]> {
    const members = await this.o.accounts.workspaces.members(caller, workspaceId);
    const hs = memberHandles(members.map((m) => ({ userId: m.userId, name: m.name, email: m.email })));
    return hs.map((h) => ({ ...h, role: members.find((m) => m.userId === h.userId)?.role ?? "viewer" }));
  }

  /* ---------- Acting on an item ---------- */

  private async log(workspaceId: string, itemId: string, kind: ActivityKind, by: string, note = "", ref: string | null = null) {
    await this.s.activity.insert({ id: newId("act"), workspaceId, itemId, kind, by, byName: await this.nameOf(by), at: this.iso(), note, ref });
  }

  private async requireSource(workspaceId: string, id: string): Promise<Source> {
    const src = await this.source(workspaceId, id);
    if (!src) throw new TeamError("not_found", "No such item.");
    return src;
  }

  /**
   * Called by the app when a person starts a run or a pipeline run, so the
   * item knows its maker. Never fails the run: a problem here is logged.
   */
  async recordMade(caller: Principal, workspaceId: string, id: string, kind: ItemKind): Promise<void> {
    try {
      if (await this.s.items.get(id)) return;
      const at = this.iso();
      const by = savedBy(caller);
      await this.s.items.insert({ id, workspaceId, kind, status: "draft", makerId: caller.kind === "user" ? caller.userId : null, submitOnFinish: false, sentBy: null, sentAt: null, assigneeId: null, approvals: [], round: 1, last: null, reRunOf: null, reRuns: [], createdAt: at, updatedAt: at });
      await this.log(workspaceId, id, "made", by);
    } catch (err) {
      console.error("Could not record the item:", err);
    }
  }

  /** Sends a finished draft to review. */
  async send(caller: Principal, workspaceId: string, id: string): Promise<ItemView> {
    await this.o.accounts.authorize(caller, workspaceId, "send_for_review");
    const src = await this.requireSource(workspaceId, id);
    if (src.source !== "finished") throw new TeamError("not_ready", "It can go to review once it has finished.");
    const settings = await this.rules(workspaceId);
    const row = await this.ensureRow(src, settings);
    const state = this.stateOf(src, row, settings);
    if (isDecided(state)) throw new TeamError("conflict", "This one is already decided. Reopen it first.");
    if (row.status !== "needs_review") {
      await this.s.items.update({ ...row, status: "needs_review", sentBy: savedBy(caller), sentAt: this.iso(), updatedAt: this.iso() });
      await this.log(workspaceId, id, "sent", savedBy(caller));
    }
    return this.viewOf(workspaceId, id);
  }

  private async viewOf(workspaceId: string, id: string): Promise<ItemView> {
    const src = await this.requireSource(workspaceId, id);
    const settings = await this.rules(workspaceId);
    const comments = (await this.s.comments.find({ workspaceId, itemId: id })).length;
    return this.view(src, await this.row(workspaceId, id), settings, await this.clientsOf(workspaceId), new Map(), comments);
  }

  /** Assigns an item to a member, or to nobody with null. */
  async assign(caller: Principal, workspaceId: string, id: string, userId: string | null): Promise<ItemView> {
    await this.o.accounts.authorize(caller, workspaceId, "assign");
    const src = await this.requireSource(workspaceId, id);
    if (userId !== null && !(await this.o.accounts.roleIn({ kind: "user", userId }, workspaceId))) throw new TeamError("invalid_request", "That person is not a member of this workspace.");
    const row = await this.ensureRow(src, await this.rules(workspaceId));
    if (row.assigneeId === userId) return this.viewOf(workspaceId, id);
    await this.s.items.update({ ...row, assigneeId: userId, updatedAt: this.iso() });
    const by = savedBy(caller);
    if (userId) {
      await this.log(workspaceId, id, "assigned", by, await this.nameOf(userId), userId);
      if (userId !== by) await this.notify(workspaceId, [userId], "assigned", id, src.title, by, "");
    } else await this.log(workspaceId, id, "unassigned", by);
    return this.viewOf(workspaceId, id);
  }

  /** A comment, or an answer to one. @handles notify the members they name. Internal comments never reach a client. */
  async comment(caller: Principal, workspaceId: string, id: string, input: { body: string; parentId?: string | null; internal?: boolean }): Promise<CommentRow> {
    await this.o.accounts.authorize(caller, workspaceId, "comment");
    const src = await this.requireSource(workspaceId, id);
    const body = clean(input?.body, COMMENT_MAX);
    if (!body) throw new TeamError("invalid_request", "Write something first.");
    const parentId = await this.threadRoot(workspaceId, id, input.parentId ?? null);
    const handles = await this.handles(caller, workspaceId);
    const by = savedBy(caller);
    const mentions = parseMentions(body, handles).filter((u) => u !== by);
    const row: CommentRow = { id: newId("cmt"), workspaceId, itemId: id, parentId, body, mentions, authorId: by, authorName: await this.nameOf(by), internal: Boolean(input.internal), createdAt: this.iso() };
    await this.s.comments.insert(row);
    await this.log(workspaceId, id, "commented", by, row.internal ? "Team only" : "");
    await this.notify(workspaceId, mentions, "mentioned", id, src.title, by, body);
    const item = await this.row(workspaceId, id);
    const others = [item?.assigneeId, item?.makerId ?? (src.createdBy?.startsWith("usr_") ? src.createdBy : null)].filter((u): u is string => Boolean(u) && u !== by && !mentions.includes(u!));
    await this.notify(workspaceId, others, "comment", id, src.title, by, body);
    return row;
  }

  private async threadRoot(workspaceId: string, itemId: string, parentId: string | null): Promise<string | null> {
    if (!parentId) return null;
    const parent = await this.s.comments.get(parentId);
    if (!parent || parent.workspaceId !== workspaceId || parent.itemId !== itemId) throw new TeamError("not_found", "No such comment.");
    return parent.parentId ?? parent.id;
  }

  /**
   * Approve, ask for changes or reject, under the workspace's approval rules.
   * Asking for changes needs a note, and starts a new draft with it.
   */
  async decide(caller: Principal, workspaceId: string, id: string, decision: Decision, note = ""): Promise<{ item: ItemView; reRun: string | null }> {
    const role = await this.o.accounts.authorize(caller, workspaceId, "decide");
    if (!DECISIONS.includes(decision)) throw new TeamError("invalid_request", "Approve, ask for changes or reject.");
    const settings = await this.rules(workspaceId);
    const problem = deciderProblem(role, settings);
    if (problem) throw new AccountError("forbidden", problem);
    const by = savedBy(caller);
    return this.decideAs(workspaceId, id, decision, note, { by, name: await this.nameOf(by), via: "member" }, settings);
  }

  private async decideAs(workspaceId: string, id: string, decision: Decision, noteIn: string, who: Decider, settings: ReviewSettings): Promise<{ item: ItemView; reRun: string | null }> {
    const src = await this.requireSource(workspaceId, id);
    if (src.source !== "finished") throw new TeamError("not_ready", "Only a finished result can be approved, rejected or sent back.");
    const note = clean(noteIn, NOTE_MAX);
    if (decision === "request_changes" && note.length < 3) throw new TeamError("invalid_request", "Say what to change, so the next draft can do it.");
    const row = await this.ensureRow(src, settings);
    const current = this.stateOf(src, row, settings);
    let outcome;
    try {
      outcome = applyDecision(row, current, decision, who, note, settings.approvalsNeeded, this.iso());
    } catch (err) {
      if (err instanceof DecisionError) throw new TeamError("conflict", err.message);
      throw err;
    }
    let next = outcome.row;
    if (!next.sentAt) next = { ...next, sentAt: this.iso() };
    await this.s.items.update(next);
    await this.log(workspaceId, id, outcome.kind, who.by, note);
    await this.mirror(src, outcome.final ? next.status : null, note, who.by);

    let reRun: string | null = null;
    if (outcome.kind === "changes_requested") reRun = await this.reRun(src, next, note, who);
    if (this.o.onDecided) {
      try {
        await this.o.onDecided({ workspaceId, kind: src.kind, id, outcome: outcome.kind, by: who.by, via: who.via });
      } catch (err) {
        console.error("A decision listener failed:", err);
      }
    }

    const people = [next.makerId, next.assigneeId, next.sentBy].filter((u): u is string => Boolean(u) && u!.startsWith("usr_") && u !== who.by);
    if (outcome.kind === "approved") await this.notify(workspaceId, people, "approved", id, src.title, who.by, note);
    if (outcome.kind === "changes_requested") await this.notify(workspaceId, people, "changes_requested", id, src.title, who.by, note);
    return { item: await this.viewOf(workspaceId, id), reRun };
  }

  /** Opens a decided item again: a new round in review. */
  async reopen(caller: Principal, workspaceId: string, id: string): Promise<ItemView> {
    const role = await this.o.accounts.authorize(caller, workspaceId, "decide");
    const settings = await this.rules(workspaceId);
    const problem = deciderProblem(role, settings);
    if (problem) throw new AccountError("forbidden", problem);
    const src = await this.requireSource(workspaceId, id);
    const row = await this.ensureRow(src, settings);
    const state = this.stateOf(src, row, settings);
    if (!isDecided(state) && row.approvals.length === 0) throw new TeamError("not_ready", "Nothing to take back.");
    await this.s.items.update({ ...row, status: "needs_review", approvals: [], last: null, round: row.round + 1, updatedAt: this.iso() });
    await this.mirror(src, null, "", savedBy(caller));
    await this.log(workspaceId, id, "reopened", savedBy(caller));
    return this.viewOf(workspaceId, id);
  }

  /** Keeps the phase 9 decision on a run, and the phase 10 decision on a pipeline run, in step with the item. */
  private async mirror(src: Source, state: ItemState | null, note: string, by: string) {
    const decision = state === "approved" ? "approved" : state === "rejected" || state === "changes_requested" ? "rejected" : null;
    const text = state === "changes_requested" ? `Changes asked: ${note}`.slice(0, NOTE_MAX) : note;
    if (src.kind === "run") {
      const have = await this.o.app.reviews.get(src.id);
      if (!decision) {
        if (have) await this.o.app.reviews.delete(src.id);
        return;
      }
      const row = { id: src.id, workspaceId: src.workspaceId, runId: src.id, decision, note: text, by, at: this.iso() } as const;
      if (have) await this.o.app.reviews.update(row);
      else await this.o.app.reviews.insert(row);
      return;
    }
    const engine = this.o.pipelines;
    if (!engine) return;
    const pr = await engine.get(src.workspaceId, src.id);
    if (!pr) return;
    if (decision) await engine.decide(src.workspaceId, src.id, decision, text, by);
    else if (pr.status === "approved" || pr.status === "rejected") await engine.clearDecision(src.workspaceId, src.id);
  }

  /** A new draft from a change request: the same job with the note on the main text input, linked both ways. */
  private async reRun(src: Source, original: ItemRow, note: string, who: Decider): Promise<string | null> {
    const text = `Changes asked for: ${note}`;
    let newId_: string | null = null;
    try {
      if (src.run) {
        const run = src.run;
        const spec = await this.o.registry.get(run.agent.workspaceId, run.agent.id);
        const edited = spec ? applyNote(spec, run.inputs, text) : null;
        if (spec && edited) {
          const made = await this.o.runs.submitRun({
            workspaceId: run.workspaceId,
            agentId: run.agent.id,
            agentWorkspaceId: run.agent.workspaceId,
            inputs: edited.inputs,
            ...(run.brandBrain ? { brandBrainId: run.brandBrain.id } : {}),
            ...(run.brandPick?.idea ? { brandIdea: run.brandPick.idea } : {}),
            confirmations: run.confirmations,
            // The new draft costs credits like any run: toward the person who asked, or the workspace for a client.
            billing: { userId: who.via === "member" && who.by.startsWith("usr_") ? who.by : null },
          });
          newId_ = made.id;
        }
      } else if (src.pipeline && this.o.pipelines) {
        const pr = src.pipeline;
        const edited = applyNote({ inputs: pr.spec.inputs }, pr.inputs, text);
        if (edited) {
          const made = await this.o.pipelines.submit({
            workspaceId: pr.workspaceId,
            pipelineId: pr.pipeline.id,
            pipelineWorkspaceId: pr.pipeline.workspaceId,
            inputs: edited.inputs,
            confirmations: pr.confirmations,
            createdBy: who.via === "member" ? who.by : pr.createdBy,
            billing: { userId: who.via === "member" && who.by.startsWith("usr_") ? who.by : null },
          });
          newId_ = made.id;
        }
      }
    } catch (err) {
      await this.log(src.workspaceId, src.id, "rerun_started", who.by, `Could not start a new draft: ${(err as Error).message.split("\n")[0]}`);
      return null;
    }
    if (!newId_) {
      await this.log(src.workspaceId, src.id, "rerun_started", who.by, "This one has no text field to carry the note, so no new draft was started.");
      return null;
    }
    const at = this.iso();
    await this.s.items.insert({
      id: newId_,
      workspaceId: src.workspaceId,
      kind: src.kind,
      status: "draft",
      makerId: original.makerId,
      submitOnFinish: true,
      sentBy: who.by,
      sentAt: null,
      assigneeId: original.assigneeId,
      approvals: [],
      round: 1,
      last: null,
      reRunOf: src.id,
      reRuns: [],
      createdAt: at,
      updatedAt: at,
    });
    const fresh = await this.row(src.workspaceId, src.id);
    if (fresh) await this.s.items.update({ ...fresh, reRuns: [...fresh.reRuns, newId_], updatedAt: at });
    await this.log(src.workspaceId, src.id, "rerun_started", who.by, note, newId_);
    await this.log(src.workspaceId, newId_, "rerun_of", who.by, note, src.id);
    return newId_;
  }

  /* ---------- Notifications ---------- */

  private async notify(workspaceId: string, userIds: string[], kind: NotificationKind, itemId: string, title: string, actor: string, text: string) {
    const unique = [...new Set(userIds)].filter((u) => u.startsWith("usr_"));
    if (!unique.length) return;
    const settings = await this.rules(workspaceId);
    const actorName = await this.nameOf(actor);
    const ws = await this.o.accounts.store.workspaces.get(workspaceId);
    for (const userId of unique) {
      // Only members hear about a workspace's work.
      if (!(await this.o.accounts.roleIn({ kind: "user", userId }, workspaceId))) continue;
      const row: NotificationRow = { id: newId("ntf"), workspaceId, userId, kind, itemId, actorName, title, text: short(text), createdAt: this.iso(), readAt: null };
      await this.s.notifications.insert(row);
      if (!settings.emailNotifications) continue;
      const user = await this.o.accounts.getUser(userId);
      if (!user?.email) continue;
      const verb: Record<NotificationKind, string> = {
        assigned: "assigned you",
        mentioned: "mentioned you on",
        changes_requested: "asked for changes on",
        approved: "approved",
        comment: "commented on",
      };
      await this.o.accounts.email
        .send({
          to: user.email,
          subject: `${actorName} ${verb[kind]} "${short(title, 60)}"`,
          text: [
            `${actorName} ${verb[kind]} "${title}" in ${ws?.name ?? "your workspace"} on WOVI.`,
            ...(row.text ? ["", row.text] : []),
            "",
            "Open it here:",
            `${this.o.accounts.cfg.appUrl}/app/review/${itemId}`,
            "",
            "These emails can be turned off in Settings, Team and approvals.",
          ].join("\n"),
        })
        .catch((err: unknown) => console.error("Could not send the notification email:", err));
    }
  }

  async notifications(caller: Principal, workspaceId: string, opts: { unread?: boolean; limit?: number } = {}): Promise<NotificationRow[]> {
    await this.o.accounts.authorize(caller, workspaceId, "view");
    if (caller.kind !== "user") return [];
    const rows = (await this.s.notifications.find({ workspaceId, userId: caller.userId }))
      .filter((n) => !opts.unread || !n.readAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return opts.limit ? rows.slice(0, opts.limit) : rows;
  }

  async unreadCount(caller: Principal, workspaceId: string): Promise<number> {
    return (await this.notifications(caller, workspaceId, { unread: true })).length;
  }

  /** Marks some (or, with "all", every) notification of the caller's as read. */
  async markRead(caller: Principal, workspaceId: string, ids: string[] | "all"): Promise<number> {
    const mine = await this.notifications(caller, workspaceId, { unread: true });
    let n = 0;
    for (const row of mine) {
      if (ids !== "all" && !ids.includes(row.id)) continue;
      await this.s.notifications.update({ ...row, readAt: this.iso() });
      n++;
    }
    return n;
  }

  /* ---------- Clients ---------- */

  private async requireClient(workspaceId: string, id: string): Promise<ClientRow> {
    const c = await this.s.clients.get(id);
    if (!c || c.workspaceId !== workspaceId) throw new TeamError("not_found", "No such client.");
    return c;
  }

  async clients(caller: Principal, workspaceId: string): Promise<ClientView[]> {
    const role = await this.o.accounts.authorize(caller, workspaceId, "view");
    const manage = can(role, "manage_clients", caller.kind);
    const brains = await this.o.brands.list(caller, workspaceId);
    const items = await this.list(workspaceId, {}, null);
    const links = manage ? await this.s.shareLinks.find({ workspaceId }) : [];
    const now = this.now().getTime();
    return (await this.clientsOf(workspaceId))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const mine = items.filter((i) => i.client?.id === c.id);
        const brands = c.brandBrainIds.map((id) => brains.find((b) => b.id === id)).filter((b): b is (typeof brains)[number] => Boolean(b)).map((b) => ({ id: b.id, name: b.name }));
        return {
          ...c,
          brands,
          defaultBrand: brands.find((b) => b.id === c.defaultBrandBrainId) ?? null,
          counts: { needsReview: mine.filter((i) => i.state === "needs_review").length, approved: mine.filter((i) => i.state === "approved").length, total: mine.length },
          links: links
            .filter((l) => l.clientId === c.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((l) => linkView(l, now)),
        };
      });
  }

  async client(caller: Principal, workspaceId: string, id: string): Promise<ClientView | null> {
    return (await this.clients(caller, workspaceId)).find((c) => c.id === id) ?? null;
  }

  private async checkBrains(caller: Principal, workspaceId: string, ids: unknown, defaultId: unknown, self: string | null): Promise<{ ids: string[]; defaultId: string | null }> {
    const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string"))] : [];
    const brains = await this.o.brands.list(caller, workspaceId);
    for (const id of list) if (!brains.some((b) => b.id === id)) throw new TeamError("invalid_request", "That Brand Brain is not in this workspace.");
    for (const other of await this.clientsOf(workspaceId)) {
      if (other.id === self) continue;
      const clash = list.find((id) => other.brandBrainIds.includes(id));
      if (clash) throw new TeamError("conflict", `${brains.find((b) => b.id === clash)?.name ?? "That Brand Brain"} already belongs to ${other.name}. A Brand Brain belongs to one client.`);
    }
    const def = typeof defaultId === "string" && defaultId ? defaultId : (list[0] ?? null);
    if (def && !list.includes(def)) throw new TeamError("invalid_request", "The default brand has to be one of the client's Brand Brains.");
    return { ids: list, defaultId: def };
  }

  private cleanName(name: unknown): string {
    const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
    if (n.length < 1 || n.length > 60) throw new TeamError("invalid_request", "A client name is 1 to 60 characters.");
    return n;
  }

  async createClient(caller: Principal, workspaceId: string, input: { name: string; brandBrainIds?: string[]; defaultBrandBrainId?: string | null }): Promise<ClientRow> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_clients");
    const name = this.cleanName(input?.name);
    if ((await this.clientsOf(workspaceId)).some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new TeamError("conflict", `There is already a client called ${name}.`);
    const brains = await this.checkBrains(caller, workspaceId, input.brandBrainIds ?? [], input.defaultBrandBrainId, null);
    const at = this.iso();
    const row: ClientRow = { id: newId("cli"), workspaceId, name, brandBrainIds: brains.ids, defaultBrandBrainId: brains.defaultId, createdBy: savedBy(caller), createdAt: at, updatedAt: at };
    await this.s.clients.insert(row);
    return row;
  }

  async updateClient(caller: Principal, workspaceId: string, id: string, patch: { name?: string; brandBrainIds?: string[]; defaultBrandBrainId?: string | null }): Promise<ClientRow> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_clients");
    const c = await this.requireClient(workspaceId, id);
    const name = patch.name !== undefined ? this.cleanName(patch.name) : c.name;
    if (name !== c.name && (await this.clientsOf(workspaceId)).some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) throw new TeamError("conflict", `There is already a client called ${name}.`);
    const brains = await this.checkBrains(caller, workspaceId, patch.brandBrainIds ?? c.brandBrainIds, patch.defaultBrandBrainId !== undefined ? patch.defaultBrandBrainId : c.defaultBrandBrainId && (patch.brandBrainIds ?? c.brandBrainIds).includes(c.defaultBrandBrainId) ? c.defaultBrandBrainId : null, id);
    const next: ClientRow = { ...c, name, brandBrainIds: brains.ids, defaultBrandBrainId: brains.defaultId, updatedAt: this.iso() };
    await this.s.clients.update(next);
    return next;
  }

  /** Removes a client and closes every link it had. Its Brand Brains and work stay in the workspace. */
  async removeClient(caller: Principal, workspaceId: string, id: string): Promise<void> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_clients");
    await this.requireClient(workspaceId, id);
    for (const l of await this.s.shareLinks.find({ workspaceId, clientId: id, revokedAt: null })) await this.s.shareLinks.update({ ...l, revokedAt: this.iso() });
    await this.s.clients.delete(id);
  }

  /** The client a Brand Brain belongs to, for pre-picking it while working for that client. */
  async clientOfBrand(caller: Principal, workspaceId: string, brandBrainId: string): Promise<ClientRow | null> {
    await this.o.accounts.authorize(caller, workspaceId, "view");
    return this.clientFor(brandBrainId, await this.clientsOf(workspaceId));
  }

  /* ---------- Share links ---------- */

  /** A link for a client, shown once. It expires, and can be withdrawn at any time. */
  async createShareLink(caller: Principal, workspaceId: string, clientId: string, input: { label: string; days?: number; canApprove?: boolean }): Promise<{ link: ShareLinkView; token: string; url: string }> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_clients");
    const client = await this.requireClient(workspaceId, clientId);
    const label = typeof input?.label === "string" ? input.label.trim().replace(/\s+/g, " ") : "";
    if (label.length < 1 || label.length > 60) throw new TeamError("invalid_request", "Say who the link is for, in 1 to 60 characters.");
    const days = input.days ?? DEFAULT_LINK_DAYS;
    if (!(LINK_DAYS as readonly number[]).includes(days)) throw new TeamError("invalid_request", `A link lasts ${LINK_DAYS.join(", ")} days.`);
    const token = `wovi_client_${randomToken()}`;
    const row: ShareLinkRow = {
      id: newId("shl"),
      workspaceId,
      clientId: client.id,
      label,
      tokenHash: sha256(token),
      suffix: token.slice(-6),
      canApprove: input.canApprove ?? true,
      createdBy: savedBy(caller),
      createdAt: this.iso(),
      expiresAt: this.iso(days * 86_400_000),
      revokedAt: null,
      lastUsedAt: null,
    };
    await this.s.shareLinks.insert(row);
    return { link: linkView(row, this.now().getTime()), token, url: `${this.o.accounts.cfg.appUrl}/client/${token}` };
  }

  async revokeShareLink(caller: Principal, workspaceId: string, linkId: string): Promise<void> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_clients");
    const l = await this.s.shareLinks.get(linkId);
    if (!l || l.workspaceId !== workspaceId) throw new TeamError("not_found", "No such link.");
    await this.s.shareLinks.updateIf(linkId, { revokedAt: null }, { revokedAt: this.iso() });
  }

  /* ---------- The client's side: a share link, no account ---------- */

  private async openLinkRow(token: unknown): Promise<{ link: ShareLinkRow; client: ClientRow }> {
    const bad = new TeamError("invalid_link", "This link has expired or was withdrawn. Ask your contact for a new one.");
    if (typeof token !== "string" || !/^wovi_client_[A-Za-z0-9_-]{40,60}$/.test(token)) throw bad;
    const link = (await this.s.shareLinks.find({ tokenHash: sha256(token) }))[0];
    if (!link || !linkOpen(link, this.now().getTime())) throw bad;
    const client = await this.s.clients.get(link.clientId);
    if (!client || client.workspaceId !== link.workspaceId) throw bad;
    return { link, client };
  }

  /** Who the link is for, or null when it does not open. */
  async openLink(token: string): Promise<ClientSession | null> {
    try {
      const { link, client } = await this.openLinkRow(token);
      await this.s.shareLinks.update({ ...link, lastUsedAt: this.iso() });
      const ws = await this.o.accounts.store.workspaces.get(link.workspaceId);
      return { link: linkView(link, this.now().getTime()), client: { id: client.id, name: client.name }, workspaceName: ws?.name ?? "" };
    } catch (err) {
      if (err instanceof TeamError) return null;
      throw err;
    }
  }

  /** Only this client's items, only the ones sent to review or decided. */
  private ofClient(client: ClientRow) {
    return (src: Source) => Boolean(src.brand && client.brandBrainIds.includes(src.brand.id));
  }

  async clientItems(token: string, filter: { state?: ItemState | "all" | "open" } = {}): Promise<ClientItemView[]> {
    const { link, client } = await this.openLinkRow(token);
    const items = await this.list(link.workspaceId, { state: filter.state }, null, this.ofClient(client), true);
    return items.filter((i) => CLIENT_STATES.includes(i.state)).map(clientView);
  }

  private async clientSource(token: string, id: string) {
    const { link, client } = await this.openLinkRow(token);
    const src = await this.source(link.workspaceId, id);
    if (!src || !this.ofClient(client)(src)) throw new TeamError("not_found", "No such item.");
    const settings = await this.rules(link.workspaceId);
    const row = await this.row(link.workspaceId, id);
    const state = this.stateOf(src, row, settings);
    if (!CLIENT_STATES.includes(state) || src.source === "stopped") throw new TeamError("not_found", "No such item.");
    return { link, client, src, settings };
  }

  async clientItem(token: string, id: string): Promise<ClientItemDetail> {
    const { link, src, settings } = await this.clientSource(token, id);
    const comments = (await this.s.comments.find({ workspaceId: link.workspaceId, itemId: id })).filter((c) => !c.internal);
    const item = await this.view(src, await this.row(link.workspaceId, id), settings, await this.clientsOf(link.workspaceId), new Map(), comments.length);
    return {
      item: clientView(item),
      // Phase 18: an output taken down after a report is hidden here too.
      output: src.run && !src.run.withheld ? src.run.output : null,
      package: src.pipeline?.package ?? null,
      threads: threads(comments),
      activity: (await this.s.activity.find({ workspaceId: link.workspaceId, itemId: id })).filter((a) => CLIENT_ACTIVITY.includes(a.kind)).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
    };
  }

  /** A client approves or asks for changes. Rejecting stays with the team. */
  async clientDecide(token: string, id: string, decision: "approve" | "request_changes", note = ""): Promise<ClientItemView> {
    const { link, src, settings } = await this.clientSource(token, id);
    if (!link.canApprove) throw new TeamError("forbidden", "This link can look and comment, not approve.");
    if (decision !== "approve" && decision !== "request_changes") throw new TeamError("invalid_request", "Approve or ask for changes.");
    await this.o.accounts.limiter.hit(`client-link:${link.id}`, { max: 60, windowMs: 3_600_000 }, "Too many changes from this link. Try again in a while.");
    await this.decideAs(link.workspaceId, src.id, decision, note, { by: `link:${link.id}`, name: link.label, via: "client" }, settings);
    return (await this.clientItem(token, id)).item;
  }

  /** A client's comment: never internal, no mentions. The assignee and the maker hear about it. */
  async clientComment(token: string, id: string, input: { body: string; parentId?: string | null }): Promise<CommentRow> {
    const { link, src } = await this.clientSource(token, id);
    await this.o.accounts.limiter.hit(`client-link:${link.id}`, { max: 60, windowMs: 3_600_000 }, "Too many changes from this link. Try again in a while.");
    const body = clean(input?.body, COMMENT_MAX);
    if (!body) throw new TeamError("invalid_request", "Write something first.");
    let parentId = await this.threadRoot(link.workspaceId, id, input.parentId ?? null);
    if (parentId && (await this.s.comments.get(parentId))?.internal) parentId = null;
    const by = `link:${link.id}`;
    const row: CommentRow = { id: newId("cmt"), workspaceId: link.workspaceId, itemId: id, parentId, body, mentions: [], authorId: by, authorName: link.label, internal: false, createdAt: this.iso() };
    await this.s.comments.insert(row);
    await this.log(link.workspaceId, id, "commented", by, "From the client");
    const item = await this.row(link.workspaceId, id);
    const people = [item?.assigneeId, item?.makerId ?? (src.createdBy?.startsWith("usr_") ? src.createdBy : null), item?.sentBy].filter((u): u is string => Boolean(u));
    await this.notify(link.workspaceId, people, "comment", id, src.title, by, body);
    return row;
  }
}

function linkView(l: ShareLinkRow, now: number): ShareLinkView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tokenHash, ...rest } = l;
  return { ...rest, open: linkOpen(l, now) };
}

function threads(comments: CommentRow[]): Thread[] {
  const sorted = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const roots: Thread[] = sorted.filter((c) => !c.parentId).map((c) => ({ ...c, replies: [] }));
  for (const c of sorted) {
    if (!c.parentId) continue;
    const root = roots.find((r) => r.id === c.parentId);
    if (root) root.replies.push(c);
  }
  return roots;
}

function clientView(i: ItemView): ClientItemView {
  return {
    id: i.id,
    kind: i.kind,
    state: i.state,
    title: i.title,
    what: i.what.name,
    brand: i.brand?.name ?? null,
    approvals: i.approvals.map((a) => ({ name: a.name, at: a.at })),
    approvalsNeeded: i.approvalsNeeded,
    last: i.last ? { decision: i.last.decision, name: i.last.name, at: i.last.at, note: i.last.note } : null,
    reRunOf: i.reRunOf,
    reRuns: i.reRuns,
    comments: i.comments,
    createdAt: i.createdAt,
  };
}

export { ITEM_STATES };
