/**
 * The run engine: submitRun, getRun, cancelRun, listRuns, cost totals.
 *
 * submitRun checks everything it can before queueing (agent, access, inputs,
 * confirmations, budget) and refuses with a RunError that lists the problems.
 * A worker on the queue then runs the attempt (see execute.ts), retries
 * provider failures with backoff, and saves the result. Every run belongs to
 * one workspace, and one workspace never sees another's runs.
 *
 * Pipelines (phase 10) chain runs with submitRun plus waitForRun: the typed
 * output of one run becomes the inputs of the next, and `maxCostUsd` passes a
 * pipeline's remaining budget down to each step.
 */
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { findModelRoute, type ModelRoute } from "@/lib/agents/catalog";
import { AgentRegistry, RegistryError, isWorkspaceId, localRegistry } from "@/lib/agents/registry";
import type { AgentSpec } from "@/lib/agents/spec";
import { jsonFileBrandStore } from "@/lib/brand/store";
import { NO_REFERENCES, type QualityReferences } from "@/lib/quality/checks";
import type { QualityJudge } from "@/lib/quality/evaluate";
import { storeBrainSource } from "@/lib/brand/source";
import type { BrandBrain, BrandBrainSource } from "./brand-brain";
import { RunAborted, executeRun, type ExecResult } from "./execute";
import { runBeforeChecks, type Confirmations } from "./guardrails";
import { validateRunInputs, type RunInputs } from "./inputs";
import { isRunnableOutput } from "./output";
import { DEFAULT_MAX_OUTPUT_TOKENS, estimateCallMicroUsd, priceOf, toMicroUsd, toUsd } from "./prices";
import { assemblePrompt, promptText } from "./prompt";
import { providersFromEnv, type ModelProvider } from "./providers";
import { InProcessQueue, type ConcurrencyLimits, type QueueJob, type RunQueue } from "./queue";
import { FINISHED, type BrandPick, type Run } from "./run";
import { jsonFileRunStore, type RunFilter, type RunStore } from "./store";

export type SubmitRequest = {
  /** The workspace the run is for. Every record carries it. */
  workspaceId: string;
  agentId: string;
  /** An exact version to run. The agent's current version when left out. */
  version?: string;
  /** Where the agent lives, when it is another workspace's public agent (like the platform's). Defaults to workspaceId. */
  agentWorkspaceId?: string;
  /** The form values. */
  inputs: Record<string, unknown>;
  /**
   * The Brand Brain to run with, in the run's workspace. Wins over the agent's
   * profile input; the workspace default is used when neither names one.
   */
  brandBrainId?: string;
  /** The idea for this run. Fills {{brand.idea}} in place of the Brand Brain's standing idea. */
  brandIdea?: string;
  /** A second submit with the same key returns the first run instead of running again. */
  idempotencyKey?: string;
  confirmations?: Confirmations;
  /** Lowers the agent's spend cap for this run, for example to a pipeline's remaining budget. */
  maxCostUsd?: number;
  parent?: { pipelineRunId: string; step: number };
};

export type RunErrorCode =
  | "invalid_workspace"
  | "invalid_request"
  | "not_found"
  | "not_runnable"
  | "invalid_input"
  | "confirmation_required"
  | "over_budget"
  | "idempotency_conflict";

export class RunError extends Error {
  constructor(
    readonly code: RunErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(issues.length ? `${message}\n- ${issues.join("\n- ")}` : message);
    this.name = "RunError";
  }
}

export type CostTotal = { runs: number; tokensIn: number; tokensOut: number; costMicroUsd: number; costUsd: number };
export type CostTotals = { workspace: CostTotal; byAgent: Record<string, CostTotal> };

export type EngineOptions = {
  registry: AgentRegistry;
  store: RunStore;
  brandBrains: BrandBrainSource;
  providers: Record<string, ModelProvider>;
  /** Serve every route with this provider instead of the route's own. "fake" in tests and local dev. */
  providerOverride?: string;
  queue?: RunQueue;
  /** Used when no queue is passed. */
  concurrency?: ConcurrencyLimits;
  /** Attempts per run, counting the first. Only provider failures are retried. */
  maxAttempts?: number;
  /** Retry delay: baseMs, doubled each attempt, at most maxMs. */
  backoff?: { baseMs: number; maxMs: number };
  /** One model call. When it passes, the call fails as a timeout and the fallback route is tried. */
  callTimeoutMs?: number;
  /** The whole run, from its first start, across retries. */
  runTimeoutMs?: number;
  now?: () => Date;
  newId?: () => string;
  /**
   * The agent's golden and bad samples for the quality gate's reference
   * anchoring (phase 12). The app reads them from the builder's samples.
   * Left out, only the Brand Brain's own posts are compared.
   */
  references?: ReferenceSource;
  /** The optional model judge for the quality gate. Off (null) unless given. */
  judge?: QualityJudge | null;
};

/** Where the quality gate finds an agent's golden and bad samples. */
export interface ReferenceSource {
  get(agent: { workspaceId: string; id: string; version: string }): Promise<QualityReferences>;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{1,128}$/;
/** The longest per-run idea, in characters. */
export const MAX_BRAND_IDEA = 1000;

const emptyTotal = (): CostTotal => ({ runs: 0, tokensIn: 0, tokensOut: 0, costMicroUsd: 0, costUsd: 0 });

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export class RunEngine {
  private readonly queue: RunQueue;
  private readonly cfg: Required<Pick<EngineOptions, "maxAttempts" | "backoff" | "callTimeoutMs" | "runTimeoutMs" | "now" | "newId">>;
  private readonly keyLocks = new Map<string, Promise<unknown>>();
  private readonly waiters = new Map<string, ((run: Run) => void)[]>();

  constructor(private readonly opts: EngineOptions) {
    this.cfg = {
      maxAttempts: opts.maxAttempts ?? 3,
      backoff: opts.backoff ?? { baseMs: 1000, maxMs: 30_000 },
      callTimeoutMs: opts.callTimeoutMs ?? 60_000,
      runTimeoutMs: opts.runTimeoutMs ?? 300_000,
      now: opts.now ?? (() => new Date()),
      newId: opts.newId ?? (() => `run_${randomUUID().replace(/-/g, "").slice(0, 20)}`),
    };
    this.queue = opts.queue ?? new InProcessQueue(opts.concurrency);
    this.queue.start((job, signal) => this.work(job, signal));
  }

  /* ---------- API ---------- */

  async submitRun(req: SubmitRequest): Promise<Run> {
    if (!isWorkspaceId(req?.workspaceId)) throw new RunError("invalid_workspace", `Workspace id ${JSON.stringify(req?.workspaceId)} is not valid.`);
    if (req.idempotencyKey === undefined) return this.submitNew(req, null);
    if (!IDEMPOTENCY_KEY.test(req.idempotencyKey)) {
      throw new RunError("invalid_request", "idempotencyKey must be 1 to 128 letters, digits, _ . : or -.");
    }

    // One submit per key at a time, so a double click cannot slip through.
    const slot = `${req.workspaceId}\u0000${req.idempotencyKey}`;
    const before = this.keyLocks.get(slot) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(async () => {
      const hash = this.requestHash(req);
      const existing = await this.opts.store.findByIdempotencyKey(req.workspaceId, req.idempotencyKey!);
      if (existing) {
        if (existing.requestHash !== hash) {
          throw new RunError("idempotency_conflict", "This idempotency key was already used for a different request.");
        }
        return existing;
      }
      return this.submitNew(req, req.idempotencyKey!);
    });
    this.keyLocks.set(slot, mine);
    try {
      return await mine;
    } finally {
      if (this.keyLocks.get(slot) === mine) this.keyLocks.delete(slot);
    }
  }

  async getRun(workspaceId: string, runId: string): Promise<Run | null> {
    if (!isWorkspaceId(workspaceId)) return null;
    return this.opts.store.get(workspaceId, runId);
  }

  async listRuns(workspaceId: string, filter: RunFilter = {}): Promise<Run[]> {
    if (!isWorkspaceId(workspaceId)) throw new RunError("invalid_workspace", `Workspace id ${JSON.stringify(workspaceId)} is not valid.`);
    return this.opts.store.list(workspaceId, filter);
  }

  /** Stops a queued or running run. A finished run is returned as it is. */
  async cancelRun(workspaceId: string, runId: string): Promise<Run> {
    const run = await this.getRun(workspaceId, runId);
    if (!run) throw new RunError("not_found", `No run "${runId}" in this workspace.`);
    if (FINISHED.includes(run.status)) return run;
    this.finishFields(run, "cancelled");
    run.nextAttemptAt = null;
    await this.opts.store.update(run);
    this.queue.cancel(runId);
    this.notify(run);
    return run;
  }

  /** Resolves when the run has finished: succeeded, failed or cancelled. */
  async waitForRun(workspaceId: string, runId: string): Promise<Run> {
    const run = await this.getRun(workspaceId, runId);
    if (!run) throw new RunError("not_found", `No run "${runId}" in this workspace.`);
    if (FINISHED.includes(run.status)) return run;
    return new Promise((resolve) => {
      this.waiters.set(runId, [...(this.waiters.get(runId) ?? []), resolve]);
      // The run may have finished while it was being read; look once more so the waiter is never lost.
      void this.getRun(workspaceId, runId).then((now) => now && this.notify(now));
    });
  }

  /**
   * Every run of one agent across all workspaces, newest first. Only for
   * counting: the public scorecard and the builder roll-up (phase 12).
   */
  async runsOfAgent(agentWorkspaceId: string, agentId: string): Promise<Run[]> {
    if (!isWorkspaceId(agentWorkspaceId)) throw new RunError("invalid_workspace", `Workspace id ${JSON.stringify(agentWorkspaceId)} is not valid.`);
    return this.opts.store.listForAgent(agentWorkspaceId, agentId);
  }

  /** Resolves when the queue has nothing waiting or running. */
  idle(): Promise<void> {
    return this.queue.idle();
  }

  /** Spend for a workspace, in total and per agent. Failed and cancelled runs count too; their calls were paid for. */
  async costTotals(workspaceId: string): Promise<CostTotals> {
    const runs = await this.listRuns(workspaceId);
    const totals: CostTotals = { workspace: emptyTotal(), byAgent: {} };
    for (const r of runs) {
      for (const t of [totals.workspace, (totals.byAgent[r.agent.id] ??= emptyTotal())]) {
        t.runs++;
        t.tokensIn += r.tokensIn;
        t.tokensOut += r.tokensOut;
        t.costMicroUsd += r.costMicroUsd;
        t.costUsd = toUsd(t.costMicroUsd);
      }
    }
    return totals;
  }

  /** After a restart: queues every run that was queued or running again. Returns how many. */
  async recover(): Promise<number> {
    const runs = await this.opts.store.listByStatus(["queued", "running"]);
    for (const run of runs) {
      if (run.status === "running") {
        run.status = "queued";
        await this.opts.store.update(run);
      }
      this.queue.enqueue({ runId: run.id, workspaceId: run.workspaceId, notBefore: run.nextAttemptAt ? Date.parse(run.nextAttemptAt) : undefined });
    }
    return runs.length;
  }

  /* ---------- Submit ---------- */

  private requestHash(req: SubmitRequest): string {
    const { workspaceId, agentId, version, agentWorkspaceId, inputs, confirmations, maxCostUsd, parent, brandBrainId, brandIdea } = req;
    const body = { workspaceId, agentId, version, agentWorkspaceId, inputs, confirmations, maxCostUsd, parent, brandBrainId, brandIdea };
    return createHash("sha256").update(stableJson(body)).digest("hex");
  }

  private async submitNew(req: SubmitRequest, idempotencyKey: string | null): Promise<Run> {
    const spec = await this.loadAgent(req);
    this.checkRunnable(spec);

    const checked = validateRunInputs(spec, req.inputs);
    if (!checked.ok) throw new RunError("invalid_input", "Some inputs are not valid.", checked.errors);
    const inputs = checked.value;

    let capUsd = spec.routing.maxCostUsd;
    if (req.maxCostUsd !== undefined) {
      if (typeof req.maxCostUsd !== "number" || !(req.maxCostUsd > 0)) throw new RunError("invalid_request", "maxCostUsd must be a positive number.");
      capUsd = Math.min(capUsd, req.maxCostUsd);
    }
    const capMicroUsd = toMicroUsd(capUsd);

    const pick = this.checkBrandPick(req);
    const brain = await this.loadBrain(req.workspaceId, req.agentWorkspaceId ?? req.workspaceId, spec, inputs, pick);
    const confirmations = req.confirmations ?? {};
    const before = runBeforeChecks({ spec, inputs, confirmations });
    const missing = before.filter((c) => c.status === "fail");
    if (missing.length) throw new RunError("confirmation_required", "This agent needs a confirmation first.", missing.map((c) => c.message));

    // Refuse up front when even the cheapest route's first call would pass the cap.
    const text = promptText(assemblePrompt(spec, inputs, brain));
    const maxOut = spec.routing.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const estimates = [spec.routing.model, spec.routing.fallback].map((id) => estimateCallMicroUsd(findModelRoute(id)!.model!, text, maxOut));
    const cheapest = Math.min(...estimates);
    if (cheapest > capMicroUsd) {
      throw new RunError("over_budget", `This run would cost up to $${toUsd(cheapest)}, above its cap of $${toUsd(capMicroUsd)}. Shorten the inputs.`);
    }

    const now = this.cfg.now().toISOString();
    const run: Run = {
      id: this.cfg.newId(),
      workspaceId: req.workspaceId,
      agent: { workspaceId: req.agentWorkspaceId ?? req.workspaceId, id: spec.id, version: spec.version },
      inputs,
      confirmations,
      brandBrain: null,
      brandPick: pick,
      parent: req.parent ?? null,
      idempotencyKey,
      requestHash: this.requestHash(req),
      status: "queued",
      attempts: 0,
      nextAttemptAt: null,
      output: null,
      error: null,
      checks: before,
      needsReview: false,
      model: null,
      calls: [],
      tokensIn: 0,
      tokensOut: 0,
      capMicroUsd,
      costMicroUsd: 0,
      costUsd: 0,
      timings: { queuedAt: now, startedAt: null, finishedAt: null, queueMs: null, runMs: null },
      createdAt: now,
      updatedAt: now,
    };
    await this.opts.store.insert(run);
    this.queue.enqueue({ runId: run.id, workspaceId: run.workspaceId });
    return run;
  }

  private async loadAgent(req: SubmitRequest): Promise<AgentSpec> {
    const home = req.agentWorkspaceId ?? req.workspaceId;
    const notFound = () => new RunError("not_found", `No agent "${req.agentId}"${req.version ? ` version ${req.version}` : ""} for this workspace.`);
    let spec: AgentSpec | null;
    try {
      spec = await this.opts.registry.get(home, req.agentId, req.version);
    } catch (err) {
      if (err instanceof RegistryError) throw new RunError("invalid_workspace", err.message);
      throw err;
    }
    if (!spec) throw notFound();
    // Another workspace's agent runs only when it is public and live. Owners may run their own drafts.
    if (home !== req.workspaceId && (spec.visibility !== "public" || spec.status !== "live")) throw notFound();
    return spec;
  }

  private checkRunnable(spec: AgentSpec) {
    const problems: string[] = [];
    if (!isRunnableOutput(spec.output)) problems.push(`Output "${spec.output.kind}" needs media tools that arrive in a later phase.`);
    for (const id of [spec.routing.model, spec.routing.fallback]) {
      const route = findModelRoute(id);
      if (!route || route.modality !== "text") problems.push(`Route ${id} is not a text route; only text runs for now.`);
      else if (!route.model || !priceOf(route.model)) problems.push(`Route ${id} has no priced model.`);
      else if (!this.providerFor(route)) problems.push(`No provider is set up for route ${id}.`);
    }
    if (problems.length) throw new RunError("not_runnable", `Agent "${spec.id}" cannot run yet.`, problems);
  }

  private providerFor(route: ModelRoute): ModelProvider | null {
    const id = this.opts.providerOverride ?? route.provider;
    return id ? (this.opts.providers[id] ?? null) : null;
  }

  private checkBrandPick(req: SubmitRequest): BrandPick {
    const { brandBrainId, brandIdea } = req;
    if (brandBrainId !== undefined && (typeof brandBrainId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(brandBrainId))) {
      throw new RunError("invalid_request", "brandBrainId must be a Brand Brain id.");
    }
    if (brandIdea !== undefined && (typeof brandIdea !== "string" || brandIdea.length > MAX_BRAND_IDEA)) {
      throw new RunError("invalid_request", `brandIdea must be text of at most ${MAX_BRAND_IDEA} characters.`);
    }
    const idea = brandIdea?.trim();
    return { id: brandBrainId ?? null, idea: idea || null };
  }

  /**
   * The Brand Brain for a run: the one the request names, else the one the
   * agent's profile input names, else the workspace default. The source adds
   * the agent's own references (its mood board). A per-run idea replaces the
   * standing idea.
   */
  private async loadBrain(workspaceId: string, agentWorkspaceId: string, spec: AgentSpec, inputs: RunInputs, pick: BrandPick | null | undefined): Promise<BrandBrain | null> {
    const profile = spec.inputs.find((i) => i.type === "profile");
    const fromInput = profile ? (inputs[profile.key] as string | undefined) : undefined;
    const picked = pick?.id ?? fromInput;
    let brain = await this.opts.brandBrains.get(workspaceId, picked, { workspaceId: agentWorkspaceId, id: spec.id });
    if (picked && !brain) {
      const where = pick?.id ? "brandBrainId" : profile!.key;
      throw new RunError("invalid_input", "Some inputs are not valid.", [`${where}: No Brand Brain "${picked}" in this workspace.`]);
    }
    if (pick?.idea) {
      brain ??= { id: "run_idea", workspaceId, name: "This run", updatedAt: new Date(0).toISOString(), voice: "", mood_board: [], references: [], dos_donts: { dos: [], donts: [], bannedWords: [] }, idea: "" };
      brain = { ...brain, idea: pick.idea };
    }
    return brain;
  }

  /* ---------- Worker ---------- */

  private async work(job: QueueJob, signal: AbortSignal): Promise<void> {
    const run = await this.opts.store.get(job.workspaceId, job.runId);
    if (!run || run.status !== "queued") return;

    const spec = await this.opts.registry.get(run.agent.workspaceId, run.agent.id, run.agent.version);
    if (!spec) return this.fail(run, "agent_missing", `Agent ${run.agent.id}@${run.agent.version} could not be loaded.`);

    const startedAt = this.cfg.now();
    run.status = "running";
    run.attempts += 1;
    run.nextAttemptAt = null;
    run.timings.startedAt ??= startedAt.toISOString();
    run.timings.queueMs ??= startedAt.getTime() - Date.parse(run.timings.queuedAt);
    run.updatedAt = startedAt.toISOString();
    await this.opts.store.update(run);

    const left = Date.parse(run.timings.startedAt) + this.cfg.runTimeoutMs - startedAt.getTime();
    if (left <= 0) return this.fail(run, "timeout", `The run took longer than ${this.cfg.runTimeoutMs} ms.`);
    const deadline = AbortSignal.timeout(left);
    const runSignal = AbortSignal.any([signal, deadline]);

    let result: ExecResult;
    try {
      const brain = await this.loadBrain(run.workspaceId, run.agent.workspaceId, spec, run.inputs, run.brandPick).catch(() => null);
      const references = this.opts.references ? await this.opts.references.get(run.agent).catch(() => NO_REFERENCES) : NO_REFERENCES;
      result = await executeRun({
        spec,
        run,
        brain,
        providerFor: (r) => this.providerFor(r),
        signal: runSignal,
        callTimeoutMs: this.cfg.callTimeoutMs,
        now: this.cfg.now,
        references,
        judge: this.opts.judge ?? null,
      });
    } catch (err) {
      if (!(err instanceof RunAborted)) {
        console.error(`Run ${run.id} failed inside the engine:`, err);
        return this.fail(run, "internal_error", "Something went wrong inside the engine.");
      }
      result = { ok: false, code: "timeout", message: "", retryable: false };
    }

    const latest = await this.opts.store.get(run.workspaceId, run.id);
    if (signal.aborted || latest?.status === "cancelled") {
      this.finishFields(run, "cancelled");
      return this.save(run);
    }
    if (deadline.aborted) return this.fail(run, "timeout", `The run took longer than ${this.cfg.runTimeoutMs} ms.`);

    if (result.ok) {
      run.output = result.output;
      run.checks = [...run.checks, ...result.checks];
      run.quality = result.quality;
      // Never "ready" below the gate: a failed check or a score under the agent's bar sends it to review.
      run.needsReview = run.checks.some((c) => c.status === "fail") || result.quality.verdict !== "ready";
      run.model = result.model;
      run.error = null;
      this.finishFields(run, "succeeded");
      return this.save(run);
    }

    if (result.retryable && run.attempts < this.cfg.maxAttempts) {
      const delay = Math.min(this.cfg.backoff.maxMs, this.cfg.backoff.baseMs * 2 ** (run.attempts - 1));
      const at = this.cfg.now().getTime() + delay;
      run.status = "queued";
      run.nextAttemptAt = new Date(at).toISOString();
      run.error = { code: result.code, message: result.message };
      run.updatedAt = this.cfg.now().toISOString();
      await this.opts.store.update(run);
      this.queue.enqueue({ runId: run.id, workspaceId: run.workspaceId, notBefore: Date.now() + delay });
      return;
    }

    const message = result.code === "provider_error" ? `The model did not answer after ${run.attempts} attempt${run.attempts === 1 ? "" : "s"}.` : result.message;
    return this.fail(run, result.code, message);
  }

  private finishFields(run: Run, status: "succeeded" | "failed" | "cancelled") {
    const at = this.cfg.now();
    run.status = status;
    run.timings.finishedAt = at.toISOString();
    run.timings.runMs = run.timings.startedAt ? at.getTime() - Date.parse(run.timings.startedAt) : null;
    run.updatedAt = at.toISOString();
  }

  private async fail(run: Run, code: NonNullable<Run["error"]>["code"], message: string) {
    run.error = { code, message };
    this.finishFields(run, "failed");
    await this.save(run);
  }

  private async save(run: Run) {
    await this.opts.store.update(run);
    this.notify(run);
  }

  private notify(run: Run) {
    if (!FINISHED.includes(run.status)) return;
    const list = this.waiters.get(run.id);
    if (!list) return;
    this.waiters.delete(run.id);
    list.forEach((resolve) => resolve(structuredClone(run)));
  }
}

/**
 * The engine on the local JSON stores in .data/ (or WOVI_DATA_DIR), with the
 * workspace's Brand Brains from .data/brand-brains.json unless another source
 * is given. Uses the fake provider
 * unless OPENROUTER_API_KEY is set, and always when `fake` is true.
 */
export function localEngine(opts: { dataDir?: string; fake?: boolean; brandBrains?: BrandBrainSource; references?: ReferenceSource } = {}): RunEngine {
  const dataDir = opts.dataDir ?? process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data");
  const providers = providersFromEnv();
  const fake = opts.fake ?? !providers.openrouter;
  return new RunEngine({
    registry: localRegistry(dataDir),
    store: jsonFileRunStore(join(dataDir, "runs.json")),
    brandBrains: opts.brandBrains ?? storeBrainSource(jsonFileBrandStore(join(dataDir, "brand-brains.json"))),
    providers: fake ? { fake: providers.fake } : providers,
    providerOverride: fake ? "fake" : undefined,
    references: opts.references,
  });
}
