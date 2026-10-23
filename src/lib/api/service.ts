/**
 * The public API (phase 14): what an API key may do, in one place, for both
 * the REST API and the MCP server. It sits on the same layers as the app
 * (AppApi, the guarded registry, engine, pipelines, credits), so a run from
 * Claude or from a script is held, charged, gated, reviewed and listed
 * exactly like one from the app.
 *
 * - The workspace is always the key's own. Ids from another workspace are
 *   not_found.
 * - Agents are their public view only: no instructions, no models.
 * - Keys never approve or reject (phase 11) and never top up or change
 *   limits (phase 13): those calls go through the same guards and answer
 *   forbidden.
 */
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import type { GuardedPipelines } from "@/lib/pipelines/guard";
import type { AppApi } from "@/lib/app/api";
import type { GuardedCredits } from "@/lib/credits/guard";
import type { PublicScorecard } from "@/lib/quality/scorecard";
import { CREDITS } from "@/lib/credits/config";
import { RUN_STATUSES, type RunStatus } from "@/lib/runs/run";
import type { Webhooks } from "@/lib/webhooks/webhooks";
import { ApiError } from "./errors";
import { DEFAULT_API_LIMITS, type ApiLimits } from "./limits";
import { CreateWebhookBody, FeedbackBody, FeedbackSchema, PickBody, StartPipelineBody, StartRunBody, type ApiAgent, type ApiBrandBrain, type ApiCredits, type ApiDelivery, type ApiMe, type ApiPipeline, type ApiPipelineRun, type ApiRun, type ApiWebhook } from "./schemas";
import { apiAgent, apiBrain, apiDelivery, apiPipeline, apiPipelineRun, apiRun, apiWebhook } from "./views";
import type { z } from "zod";

export type KeyCaller = Extract<Principal, { kind: "api_key" }>;

export type PublicApiOptions = {
  accounts: Accounts;
  app: AppApi;
  pipelines: GuardedPipelines;
  credits?: GuardedCredits;
  quality?: { scorecard(agentWorkspaceId: string, agentId: string): Promise<PublicScorecard> };
  webhooks: Webhooks;
  limits?: ApiLimits;
};

const IDEMPOTENCY = /^[A-Za-z0-9_.:-]{1,100}$/;

/** Body issues from zod, with paths like "inputs" or "confirmations.rights". */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  const issues = r.error.issues.map((i) => {
    const path = i.path.map(String).join(".") || "body";
    const message = i.code === "unrecognized_keys" ? `Unknown field${i.keys.length > 1 ? "s" : ""}: ${i.keys.join(", ")}.` : i.code === "invalid_type" && i.input === undefined ? "Required." : i.message;
    return { path, message };
  });
  throw new ApiError("invalid_input", "Some fields need a look.", issues);
}

export function checkIdempotencyKey(key: string | null | undefined): string | undefined {
  if (key === null || key === undefined || key === "") return undefined;
  if (!IDEMPOTENCY.test(key)) throw new ApiError("invalid_input", "The Idempotency-Key header needs a look.", [{ path: "Idempotency-Key", message: "Use 1 to 100 letters, digits, _ . : or -." }]);
  return key;
}

export class PublicApi {
  readonly limits: ApiLimits;

  constructor(readonly o: PublicApiOptions) {
    this.limits = o.limits ?? DEFAULT_API_LIMITS;
  }

  private get app() {
    return this.o.app;
  }

  /* ---------- The key ---------- */

  async me(caller: KeyCaller): Promise<ApiMe> {
    await this.o.accounts.authorize(caller, caller.workspaceId, "view");
    const ws = await this.o.accounts.store.workspaces.get(caller.workspaceId);
    const l = this.limits;
    const perMin = (w: { max: number; windowMs: number }) => Math.round((w.max * 60_000) / w.windowMs);
    return {
      workspace: { id: caller.workspaceId, name: ws?.name ?? "Workspace" },
      key: { id: caller.keyId, role: caller.role },
      limits: { requestsPerMinute: perMin(l.perKey), workspaceRequestsPerMinute: perMin(l.perWorkspace), startsPerMinute: perMin(l.startsPerKey), maxBodyBytes: l.maxBodyBytes },
    };
  }

  /* ---------- Agents ---------- */

  async listAgents(caller: KeyCaller): Promise<ApiAgent[]> {
    const ws = caller.workspaceId;
    const lineup = (await this.app.lineup(caller, ws)).filter((a) => a.status === "live" && a.spec);
    const out: ApiAgent[] = [];
    for (const a of lineup) {
      const found = await this.app.agent(caller, ws, a.id);
      if (found) out.push(await this.describeAgent(caller, found.spec, found.agentWorkspaceId));
    }
    return out;
  }

  async getAgent(caller: KeyCaller, id: string): Promise<ApiAgent> {
    const found = await this.app.agent(caller, caller.workspaceId, id);
    if (!found) throw new ApiError("not_found", `No agent "${id}" for this workspace.`);
    return this.describeAgent(caller, found.spec, found.agentWorkspaceId);
  }

  private async describeAgent(caller: KeyCaller, spec: Parameters<typeof apiAgent>[0], home: string): Promise<ApiAgent> {
    const [scorecard, estimate] = await Promise.all([this.o.quality?.scorecard(home, spec.id) ?? null, this.o.credits?.estimateAgent(caller, caller.workspaceId, home, spec.id) ?? null]);
    return apiAgent(spec, { scorecard, estimate });
  }

  /* ---------- Runs ---------- */

  async startRun(caller: KeyCaller, agentId: string, rawBody: unknown, idempotencyKey?: string | null): Promise<ApiRun> {
    const body = parseBody(StartRunBody, rawBody);
    const key = checkIdempotencyKey(idempotencyKey);
    const found = await this.app.agent(caller, caller.workspaceId, agentId);
    if (!found) throw new ApiError("not_found", `No agent "${agentId}" for this workspace.`);
    const run = await this.app.startRun(caller, caller.workspaceId, {
      agentId,
      agentWorkspaceId: found.agentWorkspaceId,
      inputs: body.inputs,
      ...(body.brandBrainId ? { brandBrainId: body.brandBrainId } : {}),
      ...(body.idea ? { brandIdea: body.idea } : {}),
      ...(body.confirmations ? { confirmations: body.confirmations } : {}),
      ...(key ? { idempotencyKey: key } : {}),
      ...(body.maxCredits !== undefined ? { quotedCredits: body.maxCredits } : {}),
    });
    return this.getRun(caller, run.id);
  }

  async getRun(caller: KeyCaller, id: string): Promise<ApiRun> {
    const view = await this.app.run(caller, caller.workspaceId, id);
    if (!view) throw new ApiError("not_found", `No run "${id}" in this workspace.`);
    return apiRun(view.run, view.agent?.name ?? null, view.review);
  }

  /** Waits up to `ms` for the run to finish, then returns it as it is. For MCP. */
  async waitForRun(caller: KeyCaller, id: string, ms: number): Promise<ApiRun> {
    const first = await this.getRun(caller, id);
    if (["succeeded", "failed", "cancelled"].includes(first.status) || ms <= 0) return first;
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, Math.min(250, Math.max(10, deadline - Date.now()))));
      const now = await this.getRun(caller, id);
      if (["succeeded", "failed", "cancelled"].includes(now.status)) return now;
    }
    return this.getRun(caller, id);
  }

  async listRuns(caller: KeyCaller, q: { limit?: string | number | null; status?: string | null; agent?: string | null } = {}): Promise<ApiRun[]> {
    const limit = pageSize(q.limit);
    const status = q.status ?? null;
    if (status && !(RUN_STATUSES as readonly string[]).includes(status)) {
      throw new ApiError("invalid_input", "Some fields need a look.", [{ path: "status", message: `Use one of: ${RUN_STATUSES.join(", ")}.` }]);
    }
    const views = await this.app.runs(caller, caller.workspaceId, q.agent ? { agentId: q.agent } : {});
    return views
      .filter((v) => !status || v.run.status === (status as RunStatus))
      .slice(0, limit)
      .map((v) => apiRun(v.run, v.agent?.name ?? null, v.review));
  }

  async cancelRun(caller: KeyCaller, id: string): Promise<ApiRun> {
    await this.getRun(caller, id);
    await this.app.cancelRun(caller, caller.workspaceId, id);
    return this.getRun(caller, id);
  }

  /** Use, Edit, Regenerate or a rating on a finished run, for the agent's live stats. Same rule as the app: one of each per run. */
  async feedback(caller: KeyCaller, id: string, rawBody: unknown, source: "api" | "mcp" = "api"): Promise<z.infer<typeof FeedbackSchema>> {
    const body = parseBody(FeedbackBody, rawBody);
    if (body.action === "edit" && !body.text) throw new ApiError("invalid_input", "Some fields need a look.", [{ path: "text", message: "Send the whole text the person kept." }]);
    if (body.action === "rating" && !body.rating) throw new ApiError("invalid_input", "Some fields need a look.", [{ path: "rating", message: "Required for a rating: up or down." }]);
    await this.getRun(caller, id);
    return this.app.giveFeedback(caller, caller.workspaceId, id, { action: body.action, how: body.action === "use" ? "api" : null, ...(body.text ? { text: body.text } : {}), ...(body.rating ? { rating: body.rating } : {}), ...(body.note ? { note: body.note } : {}) }, source);
  }

  /** Keys never approve or reject: the phase 11 guard answers forbidden. Kept so the API says so plainly. */
  async decideRun(caller: KeyCaller, id: string, decision: "approved" | "rejected"): Promise<never> {
    await this.getRun(caller, id);
    await this.app.review(caller, caller.workspaceId, id, decision, "");
    throw new ApiError("forbidden", "People approve. An API key cannot approve or reject.");
  }

  /* ---------- Pipelines ---------- */

  async listPipelines(caller: KeyCaller): Promise<ApiPipeline[]> {
    const list = await this.app.pipelines(caller, caller.workspaceId);
    const out: ApiPipeline[] = [];
    for (const p of list) {
      const estimate = this.o.credits ? await this.o.pipelines.estimate(caller, caller.workspaceId, p.spec.id, p.workspaceId) : null;
      out.push(apiPipeline(p.spec, p.steps, p.confirmations, estimate));
    }
    return out;
  }

  async startPipeline(caller: KeyCaller, pipelineId: string, rawBody: unknown, idempotencyKey?: string | null): Promise<ApiPipelineRun> {
    const body = parseBody(StartPipelineBody, rawBody);
    const key = checkIdempotencyKey(idempotencyKey);
    const info = await this.app.pipeline(caller, caller.workspaceId, pipelineId);
    if (!info) throw new ApiError("not_found", `No pipeline "${pipelineId}" for this workspace.`);
    const inputs = { ...body.inputs };
    const brandKey = info.spec.brand.input;
    if (body.brandBrainId) {
      if (!brandKey) throw new ApiError("invalid_input", "Some fields need a look.", [{ path: "brandBrainId", message: "This pipeline does not take a Brand Brain." }]);
      inputs[brandKey] = body.brandBrainId;
    }
    const run = await this.app.startPipeline(caller, caller.workspaceId, {
      pipelineId,
      pipelineWorkspaceId: info.workspaceId,
      inputs,
      ...(body.confirmations ? { confirmations: body.confirmations } : {}),
      ...(key ? { idempotencyKey: key } : {}),
      ...(body.maxCredits !== undefined ? { quotedCredits: body.maxCredits } : {}),
    });
    return this.getPipelineRun(caller, run.id);
  }

  async getPipelineRun(caller: KeyCaller, id: string): Promise<ApiPipelineRun> {
    const view = await this.app.pipelineRun(caller, caller.workspaceId, id);
    if (!view) throw new ApiError("not_found", `No pipeline run "${id}" in this workspace.`);
    return apiPipelineRun(view.run);
  }

  /** Waits up to `ms` for the pipeline to settle (waiting, ready, failed, cancelled), then returns it. For MCP. */
  async waitForPipeline(caller: KeyCaller, id: string, ms: number): Promise<ApiPipelineRun> {
    const deadline = Date.now() + ms;
    let now = await this.getPipelineRun(caller, id);
    while (now.status === "running" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, Math.min(250, Math.max(10, deadline - Date.now()))));
      now = await this.getPipelineRun(caller, id);
    }
    return now;
  }

  async listPipelineRuns(caller: KeyCaller, q: { limit?: string | number | null; pipeline?: string | null } = {}): Promise<ApiPipelineRun[]> {
    const views = await this.app.pipelineRuns(caller, caller.workspaceId, { ...(q.pipeline ? { pipelineId: q.pipeline } : {}), limit: pageSize(q.limit) });
    return views.map((v) => apiPipelineRun(v.run));
  }

  async cancelPipelineRun(caller: KeyCaller, id: string): Promise<ApiPipelineRun> {
    await this.getPipelineRun(caller, id);
    await this.app.cancelPipeline(caller, caller.workspaceId, id);
    return this.getPipelineRun(caller, id);
  }

  async pick(caller: KeyCaller, id: string, rawBody: unknown): Promise<ApiPipelineRun> {
    const body = parseBody(PickBody, rawBody);
    const run = await this.getPipelineRun(caller, id);
    if (!run.waiting) throw new ApiError("not_ready", "No step of this run waits for a pick.");
    const step = body.step ?? run.waiting.step;
    if (step !== run.waiting.step) throw new ApiError("not_ready", `Step "${step}" is not waiting. Step "${run.waiting.step}" is.`);
    const n = run.waiting.options.length;
    if (body.index >= n) throw new ApiError("invalid_input", "Some fields need a look.", [{ path: "index", message: `Pick from 0 to ${n - 1}.` }]);
    await this.app.pickInPipeline(caller, caller.workspaceId, id, step, body.index);
    return this.getPipelineRun(caller, id);
  }

  async decidePipeline(caller: KeyCaller, id: string, decision: "approved" | "rejected"): Promise<never> {
    await this.getPipelineRun(caller, id);
    await this.app.decidePipeline(caller, caller.workspaceId, id, decision, "");
    throw new ApiError("forbidden", "People approve. An API key cannot approve or reject.");
  }

  /* ---------- Brand Brains and credits (read only) ---------- */

  async listBrandBrains(caller: KeyCaller): Promise<ApiBrandBrain[]> {
    return (await this.app.brains(caller, caller.workspaceId)).map(apiBrain);
  }

  async credits(caller: KeyCaller): Promise<ApiCredits> {
    if (!this.o.credits) {
      await this.o.accounts.authorize(caller, caller.workspaceId, "view");
      return { available: 0, held: 0, usedThisMonth: 0, monthlyLimit: null, creditUsd: CREDITS.microUsdPerCredit / 1_000_000 };
    }
    const s = await this.o.credits.summary(caller, caller.workspaceId);
    return { available: s.balance.available, held: s.balance.held, usedThisMonth: s.mine.used, monthlyLimit: s.mine.limit, creditUsd: CREDITS.microUsdPerCredit / 1_000_000 };
  }

  /** Keys never top up or change limits (phase 13): the credits guard answers forbidden. */
  async topUp(caller: KeyCaller, credits: unknown): Promise<never> {
    if (!this.o.credits) throw new ApiError("forbidden", "An API key cannot top up credits.");
    await this.o.credits.topUp(caller, caller.workspaceId, Number(credits) || 0);
    throw new ApiError("forbidden", "An API key cannot top up credits.");
  }

  async setLimits(caller: KeyCaller, monthly: unknown): Promise<never> {
    if (!this.o.credits) throw new ApiError("forbidden", "An API key cannot change limits.");
    await this.o.credits.setLimits(caller, caller.workspaceId, { monthly: typeof monthly === "number" ? monthly : null });
    throw new ApiError("forbidden", "An API key cannot change limits.");
  }

  /* ---------- Webhooks ---------- */

  async listWebhooks(caller: KeyCaller): Promise<ApiWebhook[]> {
    return (await this.o.webhooks.list(caller, caller.workspaceId)).map(apiWebhook);
  }

  async getWebhook(caller: KeyCaller, id: string): Promise<ApiWebhook> {
    return apiWebhook(await this.o.webhooks.get(caller, caller.workspaceId, id));
  }

  async createWebhook(caller: KeyCaller, rawBody: unknown): Promise<ApiWebhook & { secret: string }> {
    const body = parseBody(CreateWebhookBody, rawBody);
    const made = await this.o.webhooks.create(caller, caller.workspaceId, body);
    return { ...apiWebhook(made.endpoint), secret: made.secret };
  }

  async deleteWebhook(caller: KeyCaller, id: string): Promise<{ deleted: true; id: string }> {
    await this.o.webhooks.remove(caller, caller.workspaceId, id);
    return { deleted: true, id };
  }

  async webhookDeliveries(caller: KeyCaller, id: string, limit?: string | number | null): Promise<ApiDelivery[]> {
    return (await this.o.webhooks.deliveries(caller, caller.workspaceId, id, pageSize(limit))).map(apiDelivery);
  }

  async testWebhook(caller: KeyCaller, id: string): Promise<ApiDelivery> {
    return apiDelivery(await this.o.webhooks.sendTest(caller, caller.workspaceId, id));
  }
}

function pageSize(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 20;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new ApiError("invalid_input", "Some fields need a look.", [{ path: "limit", message: "Use a whole number from 1 to 100." }]);
  return n;
}
