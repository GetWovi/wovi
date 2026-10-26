/**
 * Pipeline runs: a chain of agent runs through the existing run engine and
 * its queue (so the workspace's concurrency limits hold), where each step's
 * typed output becomes the next step's input and the person's Brand Brain
 * steers every step.
 *
 * - Submit checks everything first: the pipeline, the exact agent versions
 *   ("current" is resolved and pinned for the whole run), the chain against
 *   those versions, the person's inputs, the confirmations any agent asks
 *   for, the Brand Brain and the budget. An idempotency key makes a double
 *   click one run.
 * - Each step is a submitRun with a pinned version, `parent` set to the
 *   pipeline run, and `maxCostUsd` set to what is left of the pipeline's
 *   total cap (or the step's own cap when lower). Costs are summed from the
 *   step runs, so the total never passes the cap by more than the engine's
 *   own per-run check allows.
 * - A step whose checks fail is run once more with the failure as a note
 *   (the rewrite loop), then kept for review, or stops the pipeline.
 * - A step can pick one item: a fixed one, the best brand fit, or the person
 *   picks (the run waits).
 * - A step whose run fails on a provider error or a timeout is tried again
 *   once; then the pipeline stops with the steps so far kept and the failed
 *   step marked. `retry` picks it up from there.
 * - The end is the human approve step: the package waits as "ready".
 *
 * Every step run is recorded on the step, so history shows the whole chain.
 * The engine trusts the workspace id it is given; callers go through
 * GuardedPipelines (guard.ts).
 */
import { refusalLines, screen } from "@/lib/safety/screen";
import { createHash, randomUUID } from "node:crypto";
import type { AgentSpec } from "@/lib/agents/spec";
import { explainCheck } from "@/lib/app/results";
import type { BrandBrain, BrandBrainSource } from "@/lib/runs/brand-brain";
import { brandFit, describeFlag } from "@/lib/runs/brand-fit";
import type { PipelineCredits, ReleaseReason } from "@/lib/credits/types";
import { BillingRefusal } from "@/lib/runs/billing";
import { RunEngine, RunError, requestTexts } from "@/lib/runs/engine";
import { runBeforeChecks, type CheckResult, type Confirmations } from "@/lib/runs/guardrails";
import { validateRunInputs, type RunInputs } from "@/lib/runs/inputs";
import { toMicroUsd, toUsd } from "@/lib/runs/prices";
import type { Run, RunRelease } from "@/lib/runs/run";
import { PipelineError } from "./errors";
import type { PipelineRegistry, ResolvedAgent } from "./registry";
import { ENDED, SETTLED, type Candidate, type PackageItem, type PipelineFailure, type PipelineRun, type StepRun } from "./run";
import type { PipelineSpec, PipelineStep } from "./spec";
import type { PipelineStore } from "./store";
import { checkPipeline, type AgentShape } from "./validate";
import { outputItems, resolveStepInputs, withNote, type ResolveContext } from "./values";

export type PipelineSubmitRequest = {
  workspaceId: string;
  pipelineId: string;
  /** An exact pipeline version. The current one when left out. */
  version?: string;
  /** Where the pipeline lives, when it is another workspace's public one (like the platform's templates). */
  pipelineWorkspaceId?: string;
  inputs: Record<string, unknown>;
  confirmations?: Confirmations;
  /** Lowers the pipeline's total cap for this run. */
  maxCostUsd?: number;
  idempotencyKey?: string;
  /** Who started it, for the record. */
  createdBy?: string | null;
  /** Credits (phase 13): whose limit it counts toward and the estimate they were shown. */
  billing?: { userId?: string | null; quotedCredits?: number };
};

/**
 * Credits for pipelines (phase 13), implemented by the credits service. A
 * pipeline run holds its estimate at submit; each step run is charged inside
 * that hold; whatever is left comes back when the run ends.
 */
export interface PipelineBilling {
  estimatePipeline(steps: { spec: AgentSpec; agentWorkspaceId: string; rewrite: boolean }[], capMicroUsd: number): Promise<number>;
  reservePipeline(input: { workspaceId: string; pipelineRunId: string; attempt: number; estimate: number; userId: string | null; label: string; previous?: PipelineCredits | null }): Promise<PipelineCredits>;
  pipelineTotals(workspaceId: string, c: PipelineCredits): Promise<PipelineCredits>;
  closePipeline(workspaceId: string, c: PipelineCredits, reason?: ReleaseReason): Promise<PipelineCredits>;
}

export type PipelineEngineOptions = {
  registry: PipelineRegistry;
  runs: RunEngine;
  brandBrains: BrandBrainSource;
  store: PipelineStore;
  /** Tries of a step whose run failed on a provider error or a timeout, after the first. */
  stepRetries?: number;
  /** Credits (phase 13). Left out, pipeline runs cost no credits, as before. */
  billing?: PipelineBilling | null;
  now?: () => Date;
  newId?: () => string;
};

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{1,100}$/;
const RETRYABLE = ["provider_error", "timeout"];
const ACTIVE = ["todo", "running", "rewriting"];

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

const isBrandCheck = (c: CheckResult) => c.guardrail === "brand_voice_check";

/** The failed checks a step's condition reacts to. Without a condition, every failed check. */
function failsFor(def: PipelineStep, checks: CheckResult[]): CheckResult[] {
  return checks.filter((c) => c.status === "fail" && (def.onFail?.when !== "brand" || isBrandCheck(c)));
}

/** A failed check as a short line: "Uses words your brand avoids: artisanal". */
function checkLine(c: CheckResult): string {
  const title = explainCheck(c)?.title ?? c.message;
  const found = (c.findings ?? []).filter((f) => !f.startsWith("Closest sample line"));
  return found.length ? `${title}: ${found.slice(0, 3).join(", ")}` : title;
}

export function rewriteNote(fails: CheckResult[]): string {
  return `Rewrite it. The last draft failed these checks: ${fails.map(checkLine).join("; ")}. Fix them and keep everything else the same.`;
}

export class PipelineEngine {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly drivers = new Map<string, Promise<void>>();
  private readonly again = new Set<string>();
  private readonly waiters = new Map<string, ((r: PipelineRun) => void)[]>();
  private readonly keyLocks = new Map<string, Promise<unknown>>();
  private readonly listeners = new Set<(run: PipelineRun) => void>();

  constructor(private readonly o: PipelineEngineOptions) {
    this.now = o.now ?? (() => new Date());
    this.newId = o.newId ?? (() => `pip_${randomUUID().replace(/-/g, "").slice(0, 20)}`);
  }

  get registry(): PipelineRegistry {
    return this.o.registry;
  }

  /* ---------- Submit ---------- */

  async submit(req: PipelineSubmitRequest): Promise<PipelineRun> {
    if (!req || typeof req.workspaceId !== "string" || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(req.workspaceId)) {
      throw new PipelineError("invalid_workspace", `Workspace id ${JSON.stringify(req?.workspaceId)} is not valid.`);
    }
    if (req.idempotencyKey === undefined) return this.submitNew(req, null);
    if (typeof req.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(req.idempotencyKey)) {
      throw new PipelineError("invalid_request", "idempotencyKey must be 1 to 100 letters, digits, _ . : or -.");
    }
    const slot = `${req.workspaceId}\u0000${req.idempotencyKey}`;
    const before = this.keyLocks.get(slot) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(async () => {
      const hash = this.requestHash(req);
      const [existing] = await this.o.store.pipelineRuns.find({ workspaceId: req.workspaceId, idempotencyKey: req.idempotencyKey });
      if (existing) {
        if (existing.requestHash !== hash) throw new PipelineError("idempotency_conflict", "This idempotency key was already used for a different request.");
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

  private requestHash(req: PipelineSubmitRequest): string {
    const { workspaceId, pipelineId, version, pipelineWorkspaceId, inputs, confirmations, maxCostUsd } = req;
    return createHash("sha256").update(stableJson({ workspaceId, pipelineId, version, pipelineWorkspaceId, inputs, confirmations, maxCostUsd })).digest("hex");
  }

  private async submitNew(req: PipelineSubmitRequest, idempotencyKey: string | null): Promise<PipelineRun> {
    const ws = req.workspaceId;
    const home = req.pipelineWorkspaceId ?? ws;
    const notFound = () => new PipelineError("not_found", `No pipeline "${req.pipelineId}"${req.version ? ` version ${req.version}` : ""} for this workspace.`);
    const spec = await this.o.registry.get(home, req.pipelineId, req.version);
    if (!spec) throw notFound();
    const shared = home !== ws;
    if (shared && (spec.visibility !== "public" || spec.status !== "live")) throw notFound();

    // Pin every agent now, and check the chain against exactly these versions.
    const agents: ResolvedAgent[] = [];
    const missing: string[] = [];
    for (const [n, s] of spec.steps.entries()) {
      const r = await this.o.registry.resolveAgent(home, s.agent.id, s.agent.version);
      if (!r) missing.push(`steps[${n}].agent: No agent "${s.agent.id}"${s.agent.version === "current" ? "" : ` at version ${s.agent.version}`}.`);
      else if (r.workspaceId !== ws && (r.spec.visibility !== "public" || r.spec.status !== "live")) missing.push(`steps[${n}].agent: ${r.spec.name} is not live.`);
      else agents.push(r);
    }
    if (missing.length) throw new PipelineError("invalid_pipeline", "This pipeline cannot run: an agent it uses is missing.", missing);
    // Canary releases: a step that follows "current" goes where a single run would; pinned steps stay exact.
    const releases = await this.routeSteps(ws, spec, agents);
    const byRef = new Map(spec.steps.map((s, n) => [`${s.agent.id}@${s.agent.version}`, agents[n].spec as AgentShape]));
    const broken = checkPipeline(spec, (id, v) => byRef.get(`${id}@${v}`) ?? null);
    if (broken.length) throw new PipelineError("invalid_pipeline", "This pipeline no longer fits its agents. A builder needs to fix it.", broken);

    const checked = validateRunInputs({ inputs: spec.inputs }, req.inputs);
    if (!checked.ok) throw new PipelineError("invalid_input", "Some inputs are not valid.", checked.errors);
    const inputs = checked.value;
    // Phase 18: the content rules read the pipeline's inputs before anything is held. Each step's run reads its own again.
    const screening = screen(requestTexts({ inputs: spec.inputs }, inputs, null), { where: "request" });
    if (screening.blocked) throw new PipelineError("blocked", "WOVI cannot make this.", refusalLines(screening.findings));

    const confirmations = req.confirmations ?? {};
    const missingConfirm = [...new Set(agents.flatMap((a) => runBeforeChecks({ spec: a.spec, inputs: {}, confirmations }).filter((c) => c.status === "fail").map((c) => c.message)))];
    if (missingConfirm.length) throw new PipelineError("confirmation_required", "This pipeline needs a confirmation first.", missingConfirm);

    let capUsd = spec.maxCostUsd;
    if (req.maxCostUsd !== undefined) {
      if (typeof req.maxCostUsd !== "number" || !(req.maxCostUsd > 0)) throw new PipelineError("invalid_request", "maxCostUsd must be a positive number.");
      capUsd = Math.min(capUsd, req.maxCostUsd);
    }

    const named = spec.brand.input ? (inputs[spec.brand.input] as string | undefined) : undefined;
    const brain = await this.o.brandBrains.get(ws, named);
    if (named && !brain) throw new PipelineError("invalid_input", "Some inputs are not valid.", [`${spec.brand.input}: No Brand Brain "${named}" in this workspace.`]);
    const idea = spec.brand.idea ? inputs[spec.brand.idea] : undefined;

    const at = this.now().toISOString();
    const { owner, status, visibility, ...body } = spec;
    void owner;
    void status;
    void visibility;
    const id = this.newId();
    // Credits last, once everything else passed: hold the estimate for every step, or refuse before anything runs.
    const credits = await this.reserve(ws, id, 0, spec.name, spec.steps.map((s, n) => ({ def: s, agent: agents[n] })), toMicroUsd(capUsd), req.billing, null);
    const run: PipelineRun = {
      id,
      workspaceId: ws,
      pipeline: { workspaceId: home, id: spec.id, version: spec.version, name: spec.name },
      spec: body,
      inputs,
      brandBrain: brain ? { id: brain.id, name: brain.name } : null,
      brandIdea: typeof idea === "string" && idea.trim() ? idea.trim() : null,
      confirmations,
      idempotencyKey,
      requestHash: this.requestHash(req),
      status: "running",
      needsReview: false,
      steps: spec.steps.map((s, n) => ({
        id: s.id,
        label: s.label,
        agent: { workspaceId: agents[n].workspaceId, id: s.agent.id, version: agents[n].spec.version, name: agents[n].spec.name },
        ...(releases[n] ? { release: releases[n] } : {}),
        status: "todo",
        runIds: [],
        runId: null,
        retries: 0,
        rewrite: null,
        inputs: null,
        output: null,
        candidates: [],
        suggested: null,
        picked: null,
        brandFit: null,
        checks: [],
        quality: null,
        costMicroUsd: 0,
        error: null,
        startedAt: null,
        finishedAt: null,
      })),
      package: null,
      decision: null,
      error: null,
      capMicroUsd: toMicroUsd(capUsd),
      costMicroUsd: 0,
      costUsd: 0,
      ...(credits ? { credits } : {}),
      createdBy: req.createdBy ?? null,
      createdAt: at,
      updatedAt: at,
      finishedAt: null,
    };
    try {
      await this.o.store.pipelineRuns.insert(run);
    } catch (err) {
      if (credits) await this.o.billing!.closePipeline(ws, credits, "cancelled").catch(() => undefined);
      throw err;
    }
    this.kick(ws, run.id);
    return run;
  }

  /** The estimate for these steps, and the hold for it. Null when the engine bills nothing. */
  private async reserve(ws: string, id: string, attempt: number, label: string, steps: { def: PipelineStep; agent: { spec: AgentSpec; workspaceId: string } }[], capMicroUsd: number, billing: PipelineSubmitRequest["billing"], previous: PipelineCredits | null): Promise<PipelineCredits | null> {
    const b = this.o.billing;
    if (!b) return null;
    let estimate = await b.estimatePipeline(
      steps.map((s) => ({ spec: s.agent.spec, agentWorkspaceId: s.agent.workspaceId, rewrite: Boolean(s.def.onFail?.rewrite) })),
      capMicroUsd,
    );
    const quoted = billing?.quotedCredits;
    if (quoted !== undefined) {
      if (!Number.isInteger(quoted) || quoted <= 0) throw new PipelineError("invalid_request", "The quoted estimate must be a whole number of credits.");
      estimate = Math.min(estimate, quoted);
    }
    try {
      return await b.reservePipeline({ workspaceId: ws, pipelineRunId: id, attempt, estimate, userId: billing?.userId ?? previous?.userId ?? null, label, previous });
    } catch (err) {
      if (err instanceof BillingRefusal && err.code !== "hold_closed") throw new PipelineError(err.code, err.message);
      throw err;
    }
  }

  /** The estimate for a pipeline before it starts, in credits. Null when the engine bills nothing. */
  async estimate(workspaceId: string, pipelineId: string, pipelineWorkspaceId?: string): Promise<number | null> {
    const b = this.o.billing;
    if (!b) return null;
    const home = pipelineWorkspaceId ?? workspaceId;
    const spec = await this.o.registry.get(home, pipelineId);
    if (!spec) return null;
    const steps: { spec: AgentSpec; agentWorkspaceId: string; rewrite: boolean }[] = [];
    for (const s of spec.steps) {
      const r = await this.o.registry.resolveAgent(home, s.agent.id, s.agent.version);
      if (!r) return null;
      steps.push({ spec: r.spec, agentWorkspaceId: r.workspaceId, rewrite: Boolean(s.onFail?.rewrite) });
    }
    return b.estimatePipeline(steps, toMicroUsd(spec.maxCostUsd));
  }

  /** The estimate to try a failed run again from the step that failed. Null when the engine bills nothing. */
  async retryEstimate(workspaceId: string, id: string): Promise<number | null> {
    const b = this.o.billing;
    const pr = await this.get(workspaceId, id);
    if (!b || !pr || pr.status !== "failed") return null;
    const left = await this.stepsLeft(pr);
    return left.length ? b.estimatePipeline(left.map((s) => ({ spec: s.agent.spec, agentWorkspaceId: s.agent.workspaceId, rewrite: Boolean(s.def.onFail?.rewrite) })), Math.max(0, pr.capMicroUsd - pr.costMicroUsd)) : null;
  }

  /** The steps a retry would still run: the failed one and everything after it. */
  private async stepsLeft(pr: PipelineRun) {
    const from = pr.steps.findIndex((s) => s.status === "failed" || s.status === "todo");
    const out: { def: PipelineStep; agent: { spec: AgentSpec; workspaceId: string } }[] = [];
    if (from === -1) return out;
    for (let i = from; i < pr.steps.length; i++) {
      const step = pr.steps[i];
      const spec = await this.agentOf(step);
      if (spec) out.push({ def: pr.spec.steps[i], agent: { spec, workspaceId: step.agent.workspaceId } });
    }
    return out;
  }

  /** Ends the run's hold: what the steps did not use comes back. */
  private async closeCredits(pr: PipelineRun, reason: ReleaseReason = "ended") {
    if (!this.o.billing || !pr.credits) return;
    try {
      pr.credits = await this.o.billing.closePipeline(pr.workspaceId, pr.credits, reason);
    } catch (err) {
      // Left open; recover() closes it after a restart.
      console.error(`Credits for pipeline run ${pr.id} could not be settled:`, err);
    }
  }

  /* ---------- Reading ---------- */

  async get(workspaceId: string, id: string): Promise<PipelineRun | null> {
    const run = await this.o.store.pipelineRuns.get(id);
    return run && run.workspaceId === workspaceId ? run : null;
  }

  /** Newest first. */
  async list(workspaceId: string, filter: { limit?: number; pipelineId?: string } = {}): Promise<PipelineRun[]> {
    const rows = (await this.o.store.pipelineRuns.find({ workspaceId }))
      .filter((r) => !filter.pipelineId || r.pipeline.id === filter.pipelineId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  /** Every engine run the pipeline run made, step by step, in order. */
  async stepRuns(workspaceId: string, id: string): Promise<Run[]> {
    const pr = await this.require(workspaceId, id);
    const out: Run[] = [];
    for (const s of pr.steps) for (const rid of s.runIds) {
      const r = await this.o.runs.getRun(workspaceId, rid);
      if (r) out.push(r);
    }
    return out;
  }

  /** Resolves once the run settles: waiting for a pick, ready, decided, failed or cancelled. */
  async waitUntilSettled(workspaceId: string, id: string): Promise<PipelineRun> {
    const pr = await this.require(workspaceId, id);
    if (SETTLED.includes(pr.status)) return pr;
    return new Promise((resolve) => {
      this.waiters.set(id, [...(this.waiters.get(id) ?? []), resolve]);
      // It may have settled while it was being read; look once more so the waiter is never lost.
      void this.get(workspaceId, id).then((now) => {
        if (!now || !SETTLED.includes(now.status)) return;
        const list = this.waiters.get(id);
        this.waiters.delete(id);
        list?.forEach((r) => r(structuredClone(now)));
      });
    });
  }

  /**
   * Calls `listener` with a copy of a pipeline run each time it is saved in a
   * settled state: waiting for a pick, ready, decided, failed or cancelled.
   * Webhooks (phase 14) listen here and dedupe, since one state can be saved
   * more than once. Returns a function that stops listening.
   */
  onSettled(listener: (run: PipelineRun) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Resolves when no pipeline run is being driven in this process. */
  async idle(): Promise<void> {
    while (this.drivers.size) await Promise.allSettled([...this.drivers.values()]);
  }

  /** After a restart: drives every running pipeline run again. Step runs are found again by their keys. */
  async recover(): Promise<number> {
    if (this.o.billing) {
      for (const pr of await this.o.store.pipelineRuns.find({})) {
        if (pr.credits?.state === "held" && pr.status !== "running" && pr.status !== "waiting") {
          await this.closeCredits(pr);
          await this.o.store.pipelineRuns.update(pr);
        }
      }
    }
    const rows = await this.o.store.pipelineRuns.find({ status: "running" });
    rows.forEach((r) => this.kick(r.workspaceId, r.id));
    return rows.length;
  }

  /* ---------- The person ---------- */

  /** The person picks one item where a step asked them to. */
  async pick(workspaceId: string, id: string, stepId: string, index: number, userId?: string): Promise<PipelineRun> {
    const pr = await this.require(workspaceId, id);
    const step = pr.steps.find((s) => s.id === stepId);
    if (!step) throw new PipelineError("not_found", `No step "${stepId}" in this run.`);
    if (pr.status !== "waiting" || step.status !== "waiting") throw new PipelineError("not_ready", "This step is not waiting for a pick.");
    if (!Number.isInteger(index) || index < 0 || index >= step.candidates.length) throw new PipelineError("invalid_request", `Pick a number from 1 to ${step.candidates.length}.`);
    step.picked = { index, by: "person", at: this.now().toISOString(), ...(userId ? { userId } : {}) };
    step.status = step.checks.some((c) => c.status === "fail") ? "flagged" : "done";
    step.finishedAt = this.now().toISOString();
    pr.status = "running";
    await this.save(pr);
    this.kick(workspaceId, id);
    return pr;
  }

  /** Stops a running or waiting pipeline run, and the step run that is going. An ended or ready run is returned as it is. */
  async cancel(workspaceId: string, id: string): Promise<PipelineRun> {
    const pr = await this.require(workspaceId, id);
    if (pr.status !== "running" && pr.status !== "waiting") return pr;
    // Stopping a "Try again" on one part: the step goes back to what it had and the package waits again.
    const redo = pr.steps.findIndex((s) => s.redo?.before);
    if (redo !== -1) {
      const s = pr.steps[redo];
      const going = s.status === "running" || s.status === "rewriting" ? s.runIds[s.runIds.length - 1] : null;
      await this.undoRedo(pr, redo, null, "cancelled");
      if (going) await this.o.runs.cancelRun(workspaceId, going).catch(() => undefined);
      return pr;
    }
    const at = this.now().toISOString();
    pr.status = "cancelled";
    pr.finishedAt = at;
    const live: string[] = [];
    for (const s of pr.steps) {
      if (s.status === "running" || s.status === "rewriting" || s.status === "waiting") {
        if (s.status !== "waiting") live.push(s.runIds[s.runIds.length - 1]);
        s.status = "cancelled";
        s.finishedAt = at;
      }
    }
    await this.save(pr);
    for (const rid of live) if (rid) await this.o.runs.cancelRun(workspaceId, rid).catch(() => undefined);
    if (pr.credits) {
      await this.closeCredits(pr, "cancelled");
      await this.save(pr);
    }
    return pr;
  }

  /** The human approve step. Deciding again replaces the decision. */
  async decide(workspaceId: string, id: string, decision: "approved" | "rejected", note: string, by: string): Promise<PipelineRun> {
    const pr = await this.require(workspaceId, id);
    if (!["ready", "approved", "rejected"].includes(pr.status)) throw new PipelineError("not_ready", "Only a finished pipeline run can be approved or rejected.");
    if (decision !== "approved" && decision !== "rejected") throw new PipelineError("invalid_request", "Approve or reject.");
    const at = this.now().toISOString();
    pr.decision = { decision, note: String(note ?? "").trim().slice(0, 500), by, at };
    pr.status = decision;
    pr.finishedAt = at;
    await this.save(pr);
    return pr;
  }

  /** Takes the decision back, so the package waits again. */
  async clearDecision(workspaceId: string, id: string): Promise<PipelineRun> {
    const pr = await this.require(workspaceId, id);
    if (pr.status !== "approved" && pr.status !== "rejected") throw new PipelineError("not_ready", "No decision on this run.");
    pr.decision = null;
    pr.status = "ready";
    pr.finishedAt = null;
    await this.save(pr);
    return pr;
  }

  /** Picks a failed pipeline run up again at the step that failed. The steps before it are kept. */
  async retry(workspaceId: string, id: string): Promise<PipelineRun> {
    const pr = await this.require(workspaceId, id);
    if (pr.status !== "failed") throw new PipelineError("not_ready", "Only a failed pipeline run can be tried again.");
    if (this.o.billing && pr.credits) {
      // A new try holds again, for the steps it still has to run.
      const left = await this.stepsLeft(pr);
      const next = await this.reserve(workspaceId, id, pr.credits.holdIds.length, pr.pipeline.name, left, Math.max(0, pr.capMicroUsd - pr.costMicroUsd) || pr.capMicroUsd, { userId: pr.credits.userId }, pr.credits);
      if (next) pr.credits = next;
    }
    const step = pr.steps.find((s) => s.status === "failed");
    if (step) {
      step.status = "todo";
      step.error = null;
      step.retries += 1;
      step.rewrite = null;
      step.finishedAt = null;
    }
    pr.status = "running";
    pr.error = null;
    pr.finishedAt = null;
    await this.save(pr);
    this.kick(workspaceId, id);
    return pr;
  }

  /**
   * "Try again" on one part of a package that waits for its yes or no: that
   * step runs once more with the same inputs (the steps before it are as
   * they were), through the same queue with its own credit hold, inside what
   * is left of the run's total cap, with the rewrite loop and the pick like
   * the first time. The steps after it keep what they made. When the new try
   * does not land, the step gets back what it had and the package is as it
   * was, with the reason on the step.
   */
  async redoStep(workspaceId: string, id: string, stepId: string): Promise<PipelineRun> {
    const pr = await this.require(workspaceId, id);
    const i = pr.steps.findIndex((s) => s.id === stepId);
    if (i === -1) throw new PipelineError("not_found", `No step "${stepId}" in this run.`);
    if (pr.status !== "ready") throw new PipelineError("not_ready", "Only a package that waits for its yes or no can have a part tried again.");
    const step = pr.steps[i];
    const def = pr.spec.steps[i];
    if (!step.runId || !step.output || (step.status !== "done" && step.status !== "flagged")) throw new PipelineError("not_ready", `"${step.label}" has no result to try again.`);
    if (this.budget(pr, def) === null) throw new PipelineError("spend_cap", `This run's budget is used up, so "${step.label}" cannot run again. Start a new run instead.`);
    const agent = await this.agentOf(step);
    if (!agent) throw new PipelineError("not_found", `${step.agent.name} is not available any more.`);
    if (this.o.billing && pr.credits) {
      // A new try holds again, for this one step.
      const next = await this.reserve(workspaceId, id, pr.credits.holdIds.length, pr.pipeline.name, [{ def, agent: { spec: agent, workspaceId: step.agent.workspaceId } }], pr.capMicroUsd - pr.costMicroUsd, { userId: pr.credits.userId }, pr.credits);
      if (next) pr.credits = next;
    }
    const { status, runId, retries, rewrite, output, candidates, suggested, picked, brandFit, checks, quality, error, startedAt, finishedAt } = step;
    step.redo = { count: (step.redo?.count ?? 0) + 1, before: { status, runId, retries, rewrite, output, candidates, suggested, picked, brandFit, checks, quality, error, startedAt, finishedAt } };
    Object.assign(step, { status: "todo", retries: 0, rewrite: null, candidates: [], suggested: null, picked: null, error: null, startedAt: null, finishedAt: null });
    pr.status = "running";
    pr.finishedAt = null;
    await this.save(pr);
    this.kick(workspaceId, id);
    return pr;
  }

  /** A "Try again" that did not land: the step gets back what it had, the package is built again, the reason stays on the step. */
  private async undoRedo(pr: PipelineRun, i: number, why: { code: string; message: string } | null, reason: ReleaseReason): Promise<void> {
    const step = pr.steps[i];
    if (!step.redo?.before) return;
    Object.assign(step, step.redo.before, { error: why });
    step.redo = { count: step.redo.count, before: null };
    return this.finish(pr, reason);
  }

  /* ---------- Driving ---------- */

  private kick(workspaceId: string, id: string) {
    const k = `${workspaceId}:${id}`;
    if (this.drivers.has(k)) {
      this.again.add(k);
      return;
    }
    const p = this.drive(workspaceId, id)
      .catch(async (err) => {
        console.error(`Pipeline run ${id} failed inside the engine:`, err);
        const pr = await this.get(workspaceId, id);
        if (pr && !ENDED.includes(pr.status)) await this.failRun(pr, null, "internal_error", "Something went wrong inside the pipeline engine.");
      })
      .finally(() => {
        this.drivers.delete(k);
        if (this.again.delete(k)) this.kick(workspaceId, id);
      });
    this.drivers.set(k, p);
  }

  private async drive(ws: string, id: string): Promise<void> {
    for (;;) {
      const pr = await this.get(ws, id);
      if (!pr || pr.status !== "running") return;
      const i = pr.steps.findIndex((s) => ACTIVE.includes(s.status));
      if (i === -1) return this.finish(pr);
      const step = pr.steps[i];
      if (step.status === "todo") {
        await this.startStep(pr, i);
        continue;
      }
      const run = await this.o.runs.waitForRun(ws, step.runIds[step.runIds.length - 1]);
      await this.afterRun(ws, id, i, run);
    }
  }

  private context(pr: PipelineRun): ResolveContext {
    return {
      inputs: pr.inputs,
      inputDefs: pr.spec.inputs,
      steps: Object.fromEntries(pr.steps.map((s) => [s.id, { skipped: s.status === "skipped", output: s.output, picked: s.picked?.index ?? null }])),
    };
  }

  /** What is left of the total cap, in USD, capped by the step's own cap. Null when nothing is left. */
  private budget(pr: PipelineRun, def: PipelineStep): number | null {
    const left = pr.capMicroUsd - pr.costMicroUsd;
    if (left <= 0) return null;
    return Math.min(toUsd(left), def.maxCostUsd ?? Infinity);
  }

  /** The start of a step's idempotency keys: one per step, and one per "Try again" on it, so a restart finds each run again. */
  private stepKey(pr: PipelineRun, i: number): string {
    const step = pr.steps[i];
    return `${pr.id}.${step.id}${step.redo?.count ? `.again${step.redo.count}` : ""}`;
  }

  private async submitStep(pr: PipelineRun, i: number, inputs: RunInputs, key: string, capUsd: number): Promise<Run> {
    const step = pr.steps[i];
    const agent = await this.agentOf(step);
    return this.o.runs.submitRun({
      workspaceId: pr.workspaceId,
      agentId: step.agent.id,
      version: step.agent.version,
      agentWorkspaceId: step.agent.workspaceId,
      inputs,
      ...(pr.brandBrain ? { brandBrainId: pr.brandBrain.id } : {}),
      ...(pr.brandIdea && agent?.brandBrain.includes("idea") ? { brandIdea: pr.brandIdea } : {}),
      confirmations: pr.confirmations,
      idempotencyKey: key,
      maxCostUsd: capUsd,
      parent: { pipelineRunId: pr.id, step: i },
      ...(pr.credits ? { billing: { userId: pr.credits.userId, pipeline: { holdId: pr.credits.holdId } } } : {}),
      ...(step.release ? { release: step.release } : {}),
    });
  }

  /**
   * Canary releases: each step that follows "current" asks the run engine's
   * router, like a single run would, and its agent is swapped for the routed
   * version in place. If the chain does not fit the routed versions, every
   * routed step goes back to the stable one. Returns the release per step
   * (null for pinned steps and agents with no canary).
   */
  private async routeSteps(ws: string, spec: PipelineSpec, agents: ResolvedAgent[]): Promise<(RunRelease | null)[]> {
    const router = this.o.runs.router;
    const out: (RunRelease | null)[] = spec.steps.map(() => null);
    if (!router) return out;
    const stable = [...agents];
    for (const [n, s] of spec.steps.entries()) {
      if (s.agent.version !== "current") continue;
      const routed = await router.route({ agentWorkspaceId: agents[n].workspaceId, agentId: s.agent.id, workspaceId: ws }).catch(() => null);
      if (!routed) continue;
      out[n] = routed.release;
      if (routed.version === agents[n].spec.version) continue;
      const other = await this.o.registry.agents.get(agents[n].workspaceId, s.agent.id, routed.version).catch(() => null);
      if (other) agents[n] = { workspaceId: agents[n].workspaceId, spec: other };
      else out[n] = { ...routed.release, arm: "stable" };
    }
    const byRef = new Map(spec.steps.map((s, n) => [`${s.agent.id}@${s.agent.version}`, agents[n].spec as AgentShape]));
    if (checkPipeline(spec, (id, v) => byRef.get(`${id}@${v}`) ?? null).length) {
      for (const n of spec.steps.keys()) {
        if (agents[n] === stable[n]) continue;
        agents[n] = stable[n];
        const r = out[n];
        out[n] = r ? { ...r, arm: "stable" } : null;
      }
    }
    return out;
  }

  private async startStep(pr: PipelineRun, i: number): Promise<void> {
    const step = pr.steps[i];
    const def = pr.spec.steps[i];
    const at = this.now().toISOString();
    if (def.runIf && pr.inputs[def.runIf.input] !== def.runIf.equals) {
      step.status = "skipped";
      step.finishedAt = at;
      return this.save(pr);
    }
    const inputs = resolveStepInputs(def.inputs, this.context(pr));
    const cap = this.budget(pr, def);
    if (cap === null) return this.failRun(pr, i, "spend_cap", `The pipeline's budget ran out before "${step.label}".`);
    let run: Run;
    try {
      run = await this.submitStep(pr, i, inputs, `${this.stepKey(pr, i)}.${step.retries}`, cap);
    } catch (err) {
      if (!(err instanceof RunError)) throw err;
      if (err.code === "over_budget") return this.failRun(pr, i, "spend_cap", `The pipeline's budget ran out before "${step.label}". ${err.message.split("\n")[0]}`);
      if (err.code === "invalid_input") return this.failRun(pr, i, "bad_handoff", `"${step.label}" could not take what the steps before it gave: ${err.issues.join(" ")}`);
      if (err.code === "not_found" || err.code === "not_runnable") return this.failRun(pr, i, "agent_missing", `${step.agent.name} could not run: ${err.message.split("\n")[0]}`);
      if (err.code === "blocked") return this.failRun(pr, i, "step_failed", `"${step.label}" was refused: ${err.issues.map((x) => x.replace(/^[a-z_]+: /, "")).join(" ")}`);
      return this.failRun(pr, i, "step_failed", err.message.split("\n")[0]);
    }
    // Stopped while the run was handed over (a cancel, or a "Try again" put back): that run is not wanted.
    const now = await this.get(pr.workspaceId, pr.id);
    if (!now || now.status !== "running" || now.steps[i].status !== "todo") {
      await this.o.runs.cancelRun(pr.workspaceId, run.id).catch(() => undefined);
      return;
    }
    step.inputs ??= inputs;
    if (!step.runIds.includes(run.id)) step.runIds.push(run.id);
    step.status = "running";
    step.startedAt ??= at;
    await this.save(pr);
  }

  private async afterRun(ws: string, id: string, i: number, run: Run): Promise<void> {
    const pr = await this.get(ws, id);
    if (!pr || pr.status !== "running") return;
    const step = pr.steps[i];
    const def = pr.spec.steps[i];
    if (step.runIds[step.runIds.length - 1] !== run.id) return;
    await this.sumCosts(pr);
    if (this.o.billing && pr.credits) pr.credits = await this.o.billing.pipelineTotals(ws, pr.credits);

    if (run.status === "cancelled") {
      if (step.redo?.before) return this.undoRedo(pr, i, null, "cancelled");
      step.status = "cancelled";
      step.finishedAt = this.now().toISOString();
      pr.status = "cancelled";
      pr.finishedAt = step.finishedAt;
      await this.closeCredits(pr, "cancelled");
      return this.save(pr);
    }
    if (run.status === "failed") {
      const code = run.error?.code ?? "internal_error";
      // A rewrite that failed leaves the first draft in place.
      if (step.status === "rewriting") {
        const first = await this.o.runs.getRun(ws, step.runIds[step.runIds.length - 2]);
        if (first?.status === "succeeded") return this.settleStep(pr, i, first, ws);
      }
      if (RETRYABLE.includes(code) && step.retries < (this.o.stepRetries ?? 1) && step.status === "running") {
        step.retries += 1;
        step.status = "todo";
        return this.save(pr);
      }
      if (code === "spend_cap") return this.failRun(pr, i, "spend_cap", `"${step.label}" reached the budget: ${run.error?.message ?? ""}`.trim());
      return this.failRun(pr, i, "step_failed", `"${step.label}" did not finish: ${run.error?.message ?? "the run failed."}`);
    }

    // Succeeded. The rewrite loop: once, with the failure as a note.
    const fails = failsFor(def, run.checks);
    if (step.status === "running" && def.onFail?.rewrite && fails.length && !step.rewrite) {
      const rewrite = await this.startRewrite(pr, i, run, fails);
      if (rewrite) return;
    }
    if (step.status === "rewriting") {
      const first = await this.o.runs.getRun(ws, step.runIds[step.runIds.length - 2]);
      // The draft with fewer failed checks wins; the rewrite wins a tie.
      const use = first?.status === "succeeded" && failsFor(def, first.checks).length < fails.length ? first : run;
      return this.settleStep(pr, i, use, ws);
    }
    return this.settleStep(pr, i, run, ws);
  }

  /** Runs the step again with the failure as a note on its main text input. False when it cannot. */
  private async startRewrite(pr: PipelineRun, i: number, run: Run, fails: CheckResult[]): Promise<boolean> {
    const step = pr.steps[i];
    const agent = await this.agentOf(step);
    const text = (inp: AgentSpec["inputs"][number]) => inp.type === "text" || inp.type === "long_text";
    const main = agent?.inputs.find((inp) => inp.required && text(inp) && typeof run.inputs[inp.key] === "string") ?? agent?.inputs.find((inp) => text(inp) && typeof run.inputs[inp.key] === "string");
    if (!main || (main.type !== "text" && main.type !== "long_text")) return false;
    const cap = this.budget(pr, pr.spec.steps[i]);
    if (cap === null) return false;
    const note = rewriteNote(fails);
    const inputs = { ...run.inputs, [main.key]: withNote(String(run.inputs[main.key]), note, main.limits.maxLength) };
    let next: Run;
    try {
      next = await this.submitStep(pr, i, inputs, `${this.stepKey(pr, i)}.rw${step.retries}`, cap);
    } catch (err) {
      if (err instanceof RunError) return false;
      throw err;
    }
    step.rewrite = { note, runId: next.id };
    if (!step.runIds.includes(next.id)) step.runIds.push(next.id);
    step.status = "rewriting";
    await this.save(pr);
    return true;
  }

  /** The step's output is in: its checks, its items, its pick. */
  private async settleStep(pr: PipelineRun, i: number, run: Run, ws: string): Promise<void> {
    const step = pr.steps[i];
    const def = pr.spec.steps[i];
    step.runId = run.id;
    step.output = run.output;
    step.checks = run.checks;
    step.brandFit = run.checks.find((c) => c.check === "brand_fit" && typeof c.score === "number")?.score ?? null;
    step.quality = run.quality
      ? { score: run.quality.score, threshold: run.quality.threshold, verdict: run.quality.verdict, rewrites: run.quality.rewrites, firstScore: run.quality.firstScore, reasons: run.quality.reasons }
      : null;
    // The same gate as every run: a failed check, or a score under the agent's bar, flags the step for review.
    const flagged = run.checks.some((c) => c.status === "fail") || run.quality?.verdict === "needs_review";
    const remaining = failsFor(def, run.checks);

    if (def.onFail?.then === "stop" && remaining.length) {
      step.candidates = run.output ? await this.candidates(pr, run, ws) : [];
      return this.failRun(pr, i, "checks_failed", `"${step.label}" still failed its checks${step.rewrite ? " after a rewrite" : ""}: ${remaining.map(checkLine).join("; ")}.`);
    }

    if (def.choose && run.output) {
      step.candidates = await this.candidates(pr, run, ws);
      const scored = step.candidates.map((c, n) => ({ n, s: c.brandFit ?? -1 }));
      const best = scored.reduce((a, b) => (b.s > a.s ? b : a), scored[0])?.n ?? 0;
      const hasFit = step.candidates.some((c) => c.brandFit !== null);
      const at = this.now().toISOString();
      if (def.choose.kind === "item") step.picked = { index: Math.min(def.choose.index, step.candidates.length - 1), by: "rule", at };
      else if (def.choose.kind === "best_brand_fit") step.picked = { index: best, by: hasFit ? "brand_fit" : "rule", at };
      else if (step.candidates.length <= 1) step.picked = { index: 0, by: "rule", at };
      else {
        step.suggested = best;
        step.status = "waiting";
        pr.status = "waiting";
        return this.save(pr);
      }
    }
    step.status = flagged ? "flagged" : "done";
    step.finishedAt = this.now().toISOString();
    await this.save(pr);
  }

  private async brainOf(pr: PipelineRun): Promise<BrandBrain | null> {
    return pr.brandBrain ? this.o.brandBrains.get(pr.workspaceId, pr.brandBrain.id) : null;
  }

  /** Every item of the output with its own brand fit. */
  private async candidates(pr: PipelineRun, run: Run, ws: string): Promise<Candidate[]> {
    void ws;
    const brain = await this.brainOf(pr);
    return outputItems(run.output!).map((it) => {
      if (!brain) return { ...it, brandFit: null, flags: [] };
      const fit = brandFit(it.fields ? Object.values(it.fields) : [it.text], brain);
      return { ...it, brandFit: fit.score, flags: fit.flags.map(describeFlag) };
    });
  }

  /** Every step is done: the package for the approve step. */
  private async finish(pr: PipelineRun, reason: ReleaseReason = "ended"): Promise<void> {
    // A "Try again" that landed: what the step had before is not needed any more.
    for (const s of pr.steps) if (s.redo?.before) s.redo = { count: s.redo.count, before: null };
    const items: PackageItem[] = [];
    for (const part of pr.spec.package) {
      const step = pr.steps.find((s) => s.id === part.step);
      if (!step || step.status === "skipped" || !step.output) continue;
      const failed = step.checks.filter((c) => c.status === "fail");
      if (part.take === "picked" && step.picked) {
        const item = step.candidates[step.picked.index] ?? null;
        const hay = (item?.text ?? "").toLowerCase();
        // Failed checks whose findings are in this item, besides brand fit, which is read per item.
        const own = failed.filter((c) => c.check !== "brand_fit" && (c.findings ?? []).some((f) => hay.includes(f.toLowerCase())));
        items.push({ step: step.id, label: part.label, take: "picked", item, output: null, brandFit: item?.brandFit ?? null, flags: [...(item?.flags ?? []), ...own.map(checkLine)] });
      } else {
        const gate = step.quality?.verdict === "needs_review" && !failed.length ? [`Quality ${step.quality.score}, under the bar of ${step.quality.threshold}`] : [];
        items.push({ step: step.id, label: part.label, take: "all", item: null, output: step.output, brandFit: step.brandFit, flags: [...failed.map(checkLine), ...gate] });
      }
    }
    pr.package = items;
    pr.needsReview = items.some((p) => p.flags.length > 0) || pr.steps.some((s) => s.status === "flagged" && pr.spec.package.some((p) => p.step === s.id && p.take === "all"));
    pr.status = "ready";
    // Every step ran: what was held and not used comes back.
    await this.closeCredits(pr, reason);
    await this.save(pr);
  }

  private async failRun(pr: PipelineRun, i: number | null, code: PipelineFailure, message: string): Promise<void> {
    // A "Try again" on a finished package never stops the run: the step goes back to what it had.
    if (i !== null && pr.steps[i].redo?.before) return this.undoRedo(pr, i, { code, message }, "failed");
    const at = this.now().toISOString();
    if (i !== null) {
      const step = pr.steps[i];
      step.status = "failed";
      step.error = { code, message };
      step.finishedAt = at;
    }
    pr.status = "failed";
    pr.error = { code, message, step: i === null ? null : pr.steps[i].id };
    pr.finishedAt = at;
    // Steps that finished keep their charge; the failed step and the steps after it cost nothing.
    await this.closeCredits(pr, "failed");
    await this.save(pr);
  }

  private async sumCosts(pr: PipelineRun) {
    for (const s of pr.steps) {
      let total = 0;
      for (const rid of s.runIds) total += (await this.o.runs.getRun(pr.workspaceId, rid))?.costMicroUsd ?? 0;
      s.costMicroUsd = total;
    }
    pr.costMicroUsd = pr.steps.reduce((t, s) => t + s.costMicroUsd, 0);
    pr.costUsd = toUsd(pr.costMicroUsd);
  }

  private async agentOf(step: StepRun): Promise<AgentSpec | null> {
    return this.o.registry.agents.get(step.agent.workspaceId, step.agent.id, step.agent.version);
  }

  private async require(workspaceId: string, id: string): Promise<PipelineRun> {
    const pr = await this.get(workspaceId, id);
    if (!pr) throw new PipelineError("not_found", `No pipeline run "${id}" in this workspace.`);
    return pr;
  }

  private async save(pr: PipelineRun) {
    pr.updatedAt = this.now().toISOString();
    await this.o.store.pipelineRuns.update(pr);
    if (!SETTLED.includes(pr.status)) return;
    for (const listener of this.listeners) {
      try {
        listener(structuredClone(pr));
      } catch (err) {
        console.error("A pipeline listener failed:", err);
      }
    }
    const list = this.waiters.get(pr.id);
    if (!list) return;
    this.waiters.delete(pr.id);
    list.forEach((resolve) => resolve(structuredClone(pr)));
  }
}
