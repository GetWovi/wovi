/**
 * Webhooks (phase 14): a workspace registers URLs for run.finished,
 * pipeline.waiting and pipeline.finished. Every event becomes one delivery
 * per endpoint that wants it: a JSON POST signed with the endpoint's secret,
 * tried again with backoff until it lands or the tries run out, and every
 * try logged.
 *
 * - Managing endpoints is `manage_webhooks` in the phase 4 policy: owners,
 *   admins and admin keys. Outsiders get not_found.
 * - The secret is shown once, when it is made or rotated, and stored sealed.
 * - A delivery's id comes from the endpoint and the event, so an event that
 *   is reported twice (after a restart, a second save) lands once.
 * - An endpoint stops getting deliveries when the person who made it can no
 *   longer manage webhooks there (left, removed, lower role).
 * - Deliveries only go through the WebhookSender. Locally that is the dev
 *   sender, which logs and sends nothing.
 */
import { createHash } from "node:crypto";
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import { newId } from "@/lib/accounts/crypto";
import { AccountError } from "@/lib/accounts/errors";
import { savedBy } from "@/lib/accounts/guard";
import { can } from "@/lib/accounts/policy";
import { newSigningSecret, openSecret, sealSecret, secretHint, signatureHeader } from "./signing";
import { checkWebhookUrl, type WebhookSender } from "./sender";
import type { WebhookStore } from "./store";
import { WEBHOOK_EVENTS, endpointView, type DeliveryType, type EndpointView, type WebhookDelivery, type WebhookEndpoint, type WebhookEvent } from "./types";

/** Waits before each try after the first: 10 s, 1 min, 5 min, 30 min, 2 h. Six tries in all. */
export const RETRY_DELAYS_MS = [10_000, 60_000, 300_000, 1_800_000, 7_200_000];
export const MAX_ENDPOINTS = 10;

export type WebhooksOptions = {
  accounts: Accounts;
  store: WebhookStore;
  sender: WebhookSender;
  /** The server secret that seals the signing secrets. */
  secret: string;
  /** Whether the app runs on this machine: plain http to localhost is allowed only then. */
  local: boolean;
  now?: () => Date;
  /** Runs `fn` after `ms`. The default is a timer that does not keep the process alive; tests pass their own. */
  schedule?: (fn: () => void, ms: number) => void;
  retryDelaysMs?: number[];
  log?: (line: string) => void;
};

export type NewEndpoint = { url: string; events: string[]; description?: string };

/** What the person or the key gets back once: the endpoint and its secret. */
export type CreatedEndpoint = { endpoint: EndpointView; secret: string };

const idFor = (prefix: string, key: string) => `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;

export class Webhooks {
  private readonly now: () => Date;
  private readonly delays: number[];
  private readonly inFlight = new Set<string>();
  private readonly pending = new Set<Promise<unknown>>();

  constructor(private readonly o: WebhooksOptions) {
    this.now = o.now ?? (() => new Date());
    this.delays = o.retryDelaysMs ?? RETRY_DELAYS_MS;
  }

  private iso() {
    return this.now().toISOString();
  }

  get senderName(): string {
    return this.o.sender.name;
  }

  /* ---------- Endpoints, for people and admin keys ---------- */

  async list(caller: Principal, workspaceId: string): Promise<EndpointView[]> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_webhooks");
    return (await this.o.store.endpoints.find({ workspaceId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(endpointView);
  }

  async get(caller: Principal, workspaceId: string, id: string): Promise<EndpointView> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_webhooks");
    return endpointView(await this.own(workspaceId, id));
  }

  async create(caller: Principal, workspaceId: string, input: NewEndpoint): Promise<CreatedEndpoint> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_webhooks");
    const issues: { path: string; message: string }[] = [];
    const bad = checkWebhookUrl(input?.url, { local: this.o.local });
    if (bad) issues.push({ path: "url", message: bad });
    const events = Array.isArray(input?.events) ? [...new Set(input.events)] : [];
    if (!events.length) issues.push({ path: "events", message: `Pick at least one event: ${WEBHOOK_EVENTS.join(", ")}.` });
    const unknown = events.filter((e) => !(WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (unknown.length) issues.push({ path: "events", message: `Unknown event ${unknown.map((u) => JSON.stringify(u)).join(", ")}. Use: ${WEBHOOK_EVENTS.join(", ")}.` });
    const description = typeof input?.description === "string" ? input.description.trim() : "";
    if (description.length > 120) issues.push({ path: "description", message: "Keep the description to 120 characters." });
    if (issues.length) throw new WebhookInputError(issues);
    if ((await this.o.store.endpoints.find({ workspaceId })).length >= MAX_ENDPOINTS) {
      throw new AccountError("invalid_request", `A workspace can have ${MAX_ENDPOINTS} webhooks. Remove one first.`);
    }

    const secret = newSigningSecret();
    const at = this.iso();
    const row: WebhookEndpoint = {
      id: newId("whk"),
      workspaceId,
      url: String(input.url).trim(),
      events: WEBHOOK_EVENTS.filter((e) => events.includes(e)),
      description,
      secretSealed: sealSecret(this.o.secret, secret),
      secretHint: secretHint(secret),
      createdBy: caller.userId,
      createdVia: caller.kind === "user" ? "user" : savedBy(caller),
      createdAt: at,
      updatedAt: at,
      pausedAt: null,
    };
    await this.o.store.endpoints.insert(row);
    return { endpoint: endpointView(row), secret };
  }

  /** A new secret, shown once. The old one stops signing at once. */
  async rotateSecret(caller: Principal, workspaceId: string, id: string): Promise<CreatedEndpoint> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_webhooks");
    const row = await this.own(workspaceId, id);
    const secret = newSigningSecret();
    const next: WebhookEndpoint = { ...row, secretSealed: sealSecret(this.o.secret, secret), secretHint: secretHint(secret), updatedAt: this.iso() };
    await this.o.store.endpoints.update(next);
    return { endpoint: endpointView(next), secret };
  }

  async setPaused(caller: Principal, workspaceId: string, id: string, paused: boolean): Promise<EndpointView> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_webhooks");
    const row = await this.own(workspaceId, id);
    const next: WebhookEndpoint = { ...row, pausedAt: paused ? (row.pausedAt ?? this.iso()) : null, updatedAt: this.iso() };
    await this.o.store.endpoints.update(next);
    return endpointView(next);
  }

  async remove(caller: Principal, workspaceId: string, id: string): Promise<void> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_webhooks");
    await this.own(workspaceId, id);
    await this.o.store.endpoints.delete(id);
    for (const d of await this.o.store.deliveries.find({ endpointId: id })) await this.o.store.deliveries.delete(d.id);
  }

  /** The delivery log of one endpoint, newest first. */
  async deliveries(caller: Principal, workspaceId: string, endpointId: string, limit = 50): Promise<WebhookDelivery[]> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_webhooks");
    await this.own(workspaceId, endpointId);
    const rows = await this.o.store.deliveries.find({ endpointId });
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, Math.max(1, Math.min(200, limit)));
  }

  /** Sends a ping to one endpoint now, whatever events it takes. */
  async sendTest(caller: Principal, workspaceId: string, endpointId: string): Promise<WebhookDelivery> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_webhooks");
    const endpoint = await this.own(workspaceId, endpointId);
    const key = `ping:${endpointId}:${newId("p")}`;
    const delivery = await this.makeDelivery(endpoint, "ping", key, { message: "A test delivery from WOVI. Check its signature with your secret." });
    await this.attempt(delivery.id);
    return (await this.o.store.deliveries.get(delivery.id))!;
  }

  private async own(workspaceId: string, id: string): Promise<WebhookEndpoint> {
    const row = typeof id === "string" ? await this.o.store.endpoints.get(id) : null;
    if (!row || row.workspaceId !== workspaceId) throw new AccountError("not_found", "No such webhook.");
    return row;
  }

  /* ---------- Events ---------- */

  /**
   * One event in a workspace. `key` names it uniquely ("run.finished:run_1"),
   * so the same event reported twice makes no second delivery. Returns the
   * deliveries made now.
   */
  dispatch(workspaceId: string, type: WebhookEvent, key: string, data: Record<string, unknown>): Promise<WebhookDelivery[]> {
    const p = this.deliver(workspaceId, type, key, data);
    this.track(p);
    return p;
  }

  private async deliver(workspaceId: string, type: WebhookEvent, key: string, data: Record<string, unknown>): Promise<WebhookDelivery[]> {
    const endpoints = (await this.o.store.endpoints.find({ workspaceId })).filter((e) => !e.pausedAt && e.events.includes(type));
    const made: WebhookDelivery[] = [];
    for (const e of endpoints) {
      if (!(await this.makerMayManage(e))) continue;
      const d = await this.makeDelivery(e, type, key, data);
      if (d.attempts.length === 0 && d.status === "pending") made.push(d);
    }
    for (const d of made) this.track(this.attempt(d.id));
    return made;
  }

  /** Tries every pending delivery that is due now. The timers call it; so does a restart. */
  async runDue(): Promise<number> {
    const now = this.now().getTime();
    const due = (await this.o.store.deliveries.find({ status: "pending" })).filter((d) => !d.nextAttemptAt || Date.parse(d.nextAttemptAt) <= now);
    for (const d of due) await this.attempt(d.id);
    return due.length;
  }

  /** Resolves when no delivery started by dispatch is still going. For tests and scripts. */
  async idle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  /** Keeps a piece of work in view, so idle() waits for it. Errors are logged, never thrown. */
  track(p: Promise<unknown>) {
    const q = p.catch((err) => this.log(`A webhook delivery failed inside the service: ${err instanceof Error ? err.message : String(err)}`)).finally(() => this.pending.delete(q));
    this.pending.add(q);
  }

  private log(line: string) {
    (this.o.log ?? console.error)(line);
  }

  private async makerMayManage(e: WebhookEndpoint): Promise<boolean> {
    const role = await this.o.accounts.roleIn({ kind: "user", userId: e.createdBy }, e.workspaceId);
    return Boolean(role && can(role, "manage_webhooks"));
  }

  private async makeDelivery(e: WebhookEndpoint, type: DeliveryType, key: string, data: Record<string, unknown>): Promise<WebhookDelivery> {
    const id = idFor("dlv", `${e.id}\u0000${key}`);
    const existing = await this.o.store.deliveries.get(id);
    if (existing) return existing;
    const at = this.iso();
    const eventId = idFor("evt", key);
    const body = JSON.stringify({ id: eventId, type, createdAt: at, workspaceId: e.workspaceId, data });
    const row: WebhookDelivery = { id, workspaceId: e.workspaceId, endpointId: e.id, eventId, type, body, status: "pending", attempts: [], nextAttemptAt: at, createdAt: at, updatedAt: at };
    try {
      await this.o.store.deliveries.insert(row);
    } catch {
      // Another report of the same event got there first.
      return (await this.o.store.deliveries.get(id)) ?? row;
    }
    return row;
  }

  /** One try of one delivery: sign, send, log, and plan the next try or stop. */
  private async attempt(id: string): Promise<void> {
    if (this.inFlight.has(id)) return;
    this.inFlight.add(id);
    try {
      const d = await this.o.store.deliveries.get(id);
      if (!d || d.status !== "pending") return;
      const endpoint = await this.o.store.endpoints.get(d.endpointId);
      if (!endpoint) {
        await this.o.store.deliveries.update({ ...d, status: "failed", nextAttemptAt: null, updatedAt: this.iso() });
        return;
      }
      const at = this.now();
      const secret = openSecret(this.o.secret, endpoint.secretSealed);
      const headers = {
        "Content-Type": "application/json",
        "User-Agent": "WOVI-Webhooks/1.0",
        "Wovi-Event": d.type,
        "Wovi-Delivery": d.id,
        "Wovi-Signature": signatureHeader(secret, d.body, Math.floor(at.getTime() / 1000)),
      };
      const res = await this.o.sender.send({ url: endpoint.url, headers, body: d.body });
      const n = d.attempts.length + 1;
      const ok = res.status !== null && res.status >= 200 && res.status < 300;
      const attempt = { n, at: at.toISOString(), status: res.status, ms: res.ms, sender: this.o.sender.name, ...(res.error ? { error: res.error } : !ok ? { error: `The endpoint answered ${res.status}.` } : {}) };
      const wait = this.delays[n - 1];
      const next: WebhookDelivery = {
        ...d,
        attempts: [...d.attempts, attempt],
        status: ok ? "delivered" : wait === undefined ? "failed" : "pending",
        nextAttemptAt: ok || wait === undefined ? null : new Date(at.getTime() + wait).toISOString(),
        updatedAt: this.iso(),
      };
      await this.o.store.deliveries.update(next);
      if (next.status === "pending" && wait !== undefined) this.later(() => void this.attempt(id), wait);
    } finally {
      this.inFlight.delete(id);
    }
  }

  private later(fn: () => void, ms: number) {
    if (this.o.schedule) return this.o.schedule(fn, ms);
    const t = setTimeout(fn, ms);
    t.unref?.();
  }
}

/** Fields of a webhook form that need a look, each with its path. */
export class WebhookInputError extends Error {
  readonly code = "invalid_input";
  constructor(readonly issues: { path: string; message: string }[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
    this.name = "WebhookInputError";
  }
}
