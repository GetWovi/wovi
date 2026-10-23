/**
 * The test bench: an agent version run against its golden samples (or one
 * ad-hoc form) through the phase 3 engine, each result set beside the
 * sample's ideal output, rated by the builder, and rolled up into a scorecard
 * per version that is written into the spec's quality fields.
 *
 * Runs go through the engine like any other run, in ws_wovi, so the queue's
 * concurrency and the spec's spend cap apply. The bench keeps only the list
 * of runs and what each one was compared against. Builders see the model,
 * the tokens and the cost, which users never do.
 *
 * A batch is one bench per agent, started together, so a change to a shared
 * piece (a guardrail, a model slot) can be checked across every agent at once.
 */
import type { Principal } from "@/lib/accounts/accounts";
import { newId } from "@/lib/accounts/crypto";
import { AccountError } from "@/lib/accounts/errors";
import { findModelRoute } from "@/lib/agents/catalog";
import type { UpdateInput } from "@/lib/agents/registry";
import type { Bump } from "@/lib/agents/semver";
import type { AgentSpec } from "@/lib/agents/spec";
import { RunError } from "@/lib/runs/engine";
import type { CheckResult, Confirmations } from "@/lib/runs/guardrails";
import { validateRunInputs, type RunInputs } from "@/lib/runs/inputs";
import type { RunOutput } from "@/lib/runs/output";
import { DEFAULT_MAX_OUTPUT_TOKENS, estimateCallMicroUsd, toMicroUsd, toUsd } from "@/lib/runs/prices";
import { assemblePrompt, promptText } from "@/lib/runs/prompt";
import { toolEstimateMicroUsd } from "@/lib/runs/tools";
import { runSources, type Run, type RunStatus } from "@/lib/runs/run";
import type { Builder, SaveRelease } from "./builder";
import { autoScore, parsedHow, scorecard, type Scorecard } from "./scoring";
import { BENCH_LIMITS, RATINGS, type Batch, type Bench, type BenchItem, type Rating, type RatingValue, type Sample } from "./types";

/* ---------- Views ---------- */

/** One result of a bench, with the run's facts the builder may see. */
export type BenchResult = {
  index: number;
  sampleId: string | null;
  title: string;
  label: Sample["label"] | null;
  inputs: RunInputs;
  idealOutput: string | null;
  runId: string | null;
  status: RunStatus | "refused";
  /** The engine's reason when it refused or failed the run. */
  error: string | null;
  output: RunOutput | null;
  checks: CheckResult[];
  needsReview: boolean;
  parsed: "first" | "repaired" | null;
  model: { route: string; model: string } | null;
  ms: number | null;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  costUsd: number;
  autoScore: number | null;
  rating: { rating: RatingValue; note: string } | null;
  /** The samples the run was given as examples (titles), and whether its own sample was kept out. Null before the run starts. */
  examples: { gold: string[]; bad: string[]; ownKeptOut: boolean } | null;
  /** The web sources its declared tools found (trend_lookup). */
  sources: { url: string; title: string; published: string | null }[];
};

export type BenchView = {
  id: string;
  agentId: string;
  version: string;
  kind: Bench["kind"];
  batchId: string | null;
  status: Bench["status"];
  total: number;
  /** Results that have finished, were refused, or were cancelled. */
  done: number;
  estimateMicroUsd: number;
  capMicroUsd: number;
  costMicroUsd: number;
  results: BenchResult[];
  createdAt: string;
  finishedAt: string | null;
  /** The scorecard of this version across every bench, not only this one. */
  scorecard: Scorecard;
  /** The Brand Brain the runs used, as the first run recorded it. */
  brandBrain: { id: string; name: string } | null;
};

export type BenchEstimate = {
  agentId: string;
  version: string;
  runs: number;
  estimateMicroUsd: number;
  capMicroUsd: number;
  /** Samples whose inputs do not fit this version's form, with the reason. */
  unfit: { sampleId: string; title: string; reason: string }[];
};

export type BenchRequest = {
  version?: string;
  /** Sample ids to run; every sample of the agent when left out. */
  sampleIds?: string[];
  /** One run from a form instead of samples. */
  adhoc?: { inputs: Record<string, unknown>; title?: string };
  /** The Brand Brain of ws_wovi every run uses. The workspace default (or the sample's own pick) when left out. */
  brandBrainId?: string;
};

export type BatchPlanAgent = { agentId: string; name: string; version: string; status: AgentSpec["status"]; samples: number; runs: number; estimateMicroUsd: number; capMicroUsd: number };

export type BatchPlan = {
  agents: BatchPlanAgent[];
  runs: number;
  estimateMicroUsd: number;
  capMicroUsd: number;
  thresholdMicroUsd: number;
  needsConfirmation: boolean;
};

export type BatchAgentView = {
  agentId: string;
  name: string;
  version: string;
  benchId: string;
  total: number;
  done: number;
  passed: number;
  failedChecks: number;
  refused: number;
  avgAuto: number | null;
  costMicroUsd: number;
  avgMs: number | null;
};

export type BatchView = {
  id: string;
  status: Batch["status"];
  agents: BatchAgentView[];
  runs: number;
  done: number;
  estimateMicroUsd: number;
  capMicroUsd: number;
  costMicroUsd: number;
  createdAt: string;
  finishedAt: string | null;
};

const FINISHED: readonly string[] = ["succeeded", "failed", "cancelled"];
const NOT_FOUND = "Not found.";

/** The confirmations a bench gives for the builder's own samples: the guardrails that ask before a run. */
export function benchConfirmations(spec: Pick<AgentSpec, "guardrails">): Confirmations {
  const c: Confirmations = {};
  if (spec.guardrails.includes("rights_confirmed")) c.rights = true;
  if (spec.guardrails.includes("voice_consent")) c.voiceConsent = true;
  return c;
}

/** What one run may cost up front: the first call on the main route, never above the cap. */
export function estimateRunMicroUsd(spec: AgentSpec, inputs: RunInputs): { estimate: number; cap: number } {
  const cap = toMicroUsd(spec.routing.maxCostUsd);
  const model = findModelRoute(spec.routing.model)?.model;
  if (!model) return { estimate: cap, cap };
  const text = promptText(assemblePrompt(spec, inputs, null));
  const first = estimateCallMicroUsd(model, text, spec.routing.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS) + toolEstimateMicroUsd(spec, null);
  return { estimate: Math.min(first, cap), cap };
}

export class AgentBench {
  constructor(private readonly b: Builder) {}

  private get engine() {
    return this.b.deps.engine;
  }
  private get store() {
    return this.b.deps.store;
  }
  private get ws() {
    return this.b.workspaceId;
  }

  /* ---------- Estimates ---------- */

  async estimate(caller: Principal, agentId: string, req: Pick<BenchRequest, "version" | "sampleIds"> = {}): Promise<BenchEstimate> {
    await this.b.requireBuilder(caller);
    // While a canary runs, the bench works on it unless a version is named.
    const spec = await this.b.requireAgent(caller, agentId, req.version ?? (await this.b.headVersion(agentId)));
    const samples = await this.pickSamples(caller, agentId, req.sampleIds);
    return this.estimateFor(spec, samples);
  }

  private estimateFor(spec: AgentSpec, samples: Sample[]): BenchEstimate {
    const out: BenchEstimate = { agentId: spec.id, version: spec.version, runs: 0, estimateMicroUsd: 0, capMicroUsd: 0, unfit: [] };
    for (const s of samples) {
      const checked = validateRunInputs(spec, s.inputs);
      if (!checked.ok) {
        out.unfit.push({ sampleId: s.id, title: s.title, reason: checked.errors.join(" ") });
        continue;
      }
      const e = estimateRunMicroUsd(spec, checked.value);
      out.runs++;
      out.estimateMicroUsd += e.estimate;
      out.capMicroUsd += e.cap;
    }
    return out;
  }

  private async pickSamples(caller: Principal, agentId: string, sampleIds?: string[]): Promise<Sample[]> {
    const all = await this.b.listSamples(caller, agentId);
    if (!sampleIds) return all;
    const wanted = new Set(sampleIds);
    const picked = all.filter((s) => wanted.has(s.id));
    if (picked.length !== wanted.size) throw new AccountError("not_found", "One of those samples is gone. Reload the page.");
    return picked;
  }

  /* ---------- Running ---------- */

  /** Starts a bench: one engine run per sample, or one ad-hoc run. Returns at once; poll `get` for results. */
  async run(caller: Principal, agentId: string, req: BenchRequest = {}): Promise<BenchView> {
    const user = await this.b.requireBuilder(caller);
    const spec = await this.b.requireAgent(caller, agentId, req.version ?? (await this.b.headVersion(agentId)));
    let items: Omit<BenchItem, "runId" | "error">[];
    let kind: Bench["kind"];
    if (req.adhoc) {
      const checked = validateRunInputs(spec, req.adhoc.inputs ?? {});
      if (!checked.ok) throw new AccountError("invalid_request", `Some inputs are not valid: ${checked.errors.join(" ")}`);
      const title = typeof req.adhoc.title === "string" && req.adhoc.title.trim() ? req.adhoc.title.trim().slice(0, 80) : "Ad-hoc run";
      items = [{ sampleId: null, title, label: null, inputs: checked.value, idealOutput: null }];
      kind = "adhoc";
    } else {
      const samples = await this.pickSamples(caller, agentId, req.sampleIds);
      if (!samples.length) throw new AccountError("invalid_request", "Add a sample first, or run an ad-hoc form.");
      if (samples.length > BENCH_LIMITS.runsPerBench) throw new AccountError("invalid_request", `A bench runs at most ${BENCH_LIMITS.runsPerBench} samples at once.`);
      items = samples.map((s) => ({ sampleId: s.id, title: s.title, label: s.label, inputs: s.inputs, idealOutput: s.idealOutput }));
      kind = "samples";
    }
    const brandBrainId = typeof req.brandBrainId === "string" && req.brandBrainId ? req.brandBrainId : null;
    const bench = await this.start(user.id, spec, items, kind, null, brandBrainId);
    return this.view(bench);
  }

  /** Submits every item to the engine, saves the bench, and finishes it in the background when the last run ends. */
  private async start(userId: string, spec: AgentSpec, items: Omit<BenchItem, "runId" | "error">[], kind: Bench["kind"], batchId: string | null, brandBrainId: string | null = null): Promise<Bench> {
    const confirmations = benchConfirmations(spec);
    const bench: Bench = {
      id: newId("bch"),
      workspaceId: this.ws,
      agentId: spec.id,
      version: spec.version,
      kind,
      batchId,
      brandBrainId,
      items: [],
      status: "running",
      estimateMicroUsd: 0,
      capMicroUsd: 0,
      createdBy: userId,
      createdAt: this.b.iso(),
      finishedAt: null,
    };
    for (const item of items) {
      try {
        // Bench runs are the builders' own tests: they never cost credits.
        // A sample never sees itself: kept out of the examples and the reference lines, so the gold eval stays honest.
        const run = await this.engine.submitRun({ workspaceId: this.ws, agentId: spec.id, version: spec.version, inputs: item.inputs, confirmations, ...(brandBrainId ? { brandBrainId } : {}), ...(item.sampleId ? { excludeSampleIds: [item.sampleId] } : {}), billing: { userId, free: "bench" } });
        const e = estimateRunMicroUsd(spec, run.inputs);
        bench.estimateMicroUsd += e.estimate;
        bench.capMicroUsd += e.cap;
        bench.items.push({ ...item, runId: run.id, error: null });
      } catch (err) {
        if (!(err instanceof RunError)) throw err;
        bench.items.push({ ...item, runId: null, error: err.message.split("\n").join(" ") });
      }
    }
    if (bench.items.every((i) => !i.runId)) {
      bench.status = "done";
      bench.finishedAt = bench.createdAt;
      await this.store.benches.insert(bench);
      return bench;
    }
    await this.store.benches.insert(bench);
    const waits = bench.items.filter((i) => i.runId).map((i) => this.engine.waitForRun(this.ws, i.runId!));
    void Promise.all(waits).then(() => this.finish(bench.id)).catch((err) => console.error(`Bench ${bench.id} could not finish:`, err));
    return bench;
  }

  private readonly finishing = new Map<string, Promise<Bench | null>>();

  /**
   * Marks a bench done once every run has ended, and writes the version's
   * scorecard into the spec. The background waiter and a poll can both call
   * it; one finish runs at a time per bench, and the quality is written before
   * the status flips, so whoever sees "done" sees the score too.
   */
  private finish(benchId: string): Promise<Bench | null> {
    const inFlight = this.finishing.get(benchId);
    if (inFlight) return inFlight;
    const p = this.finishNow(benchId).finally(() => this.finishing.delete(benchId));
    this.finishing.set(benchId, p);
    return p;
  }

  private async finishNow(benchId: string): Promise<Bench | null> {
    const bench = await this.store.benches.get(benchId);
    if (!bench || bench.status !== "running") return bench;
    const runs = await this.runsOf(bench);
    const pending = bench.items.some((i) => i.runId && !FINISHED.includes(runs.get(i.runId)?.status ?? "queued"));
    if (pending) return bench;
    const cancelled = bench.items.some((i) => i.runId && runs.get(i.runId)?.status === "cancelled");
    const done: Bench = { ...bench, status: cancelled ? "cancelled" : "done", finishedAt: this.b.iso() };
    try {
      await this.refreshQuality({ kind: "user", userId: bench.createdBy }, bench.agentId);
    } finally {
      await this.store.benches.update(done);
    }
    if (bench.batchId) await this.finishBatch(bench.batchId);
    return done;
  }

  private async runsOf(bench: Bench): Promise<Map<string, Run>> {
    const runs = await this.engine.listRuns(this.ws, { agentId: bench.agentId });
    const ids = new Set(bench.items.map((i) => i.runId).filter(Boolean));
    return new Map(runs.filter((r) => ids.has(r.id)).map((r) => [r.id, r]));
  }

  private async requireBench(caller: Principal, benchId: string): Promise<Bench> {
    await this.b.requireBuilder(caller);
    const bench = await this.store.benches.get(benchId);
    if (!bench || bench.workspaceId !== this.ws) throw new AccountError("not_found", NOT_FOUND);
    return bench;
  }

  async get(caller: Principal, benchId: string): Promise<BenchView> {
    let bench = await this.requireBench(caller, benchId);
    // A poll after a restart still closes the bench when every run has ended.
    if (bench.status === "running") bench = (await this.finish(bench.id)) ?? bench;
    return this.view(bench);
  }

  /** Recent benches of an agent, newest first. */
  async list(caller: Principal, agentId: string, limit = 10): Promise<BenchView[]> {
    await this.b.requireBuilder(caller);
    const rows = (await this.store.benches.find({ workspaceId: this.ws, agentId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    const out: BenchView[] = [];
    for (const r of rows) out.push(await this.view(r));
    return out;
  }

  /** Stops every run of a bench that has not ended. */
  async cancel(caller: Principal, benchId: string): Promise<BenchView> {
    const bench = await this.requireBench(caller, benchId);
    for (const item of bench.items) {
      if (item.runId) await this.engine.cancelRun(this.ws, item.runId);
    }
    const done = (await this.finish(bench.id)) ?? bench;
    return this.view(done);
  }

  private async view(bench: Bench): Promise<BenchView> {
    const runs = await this.runsOf(bench);
    const ratings = await this.store.ratings.find({ workspaceId: this.ws, agentId: bench.agentId });
    const byRun = new Map(ratings.map((r) => [r.runId, r]));
    const results = bench.items.map((item, index) => resultOf(index, item, item.runId ? (runs.get(item.runId) ?? null) : null, item.runId ? (byRun.get(item.runId) ?? null) : null));
    const allRuns = await this.engine.listRuns(this.ws, { agentId: bench.agentId });
    const ref = [...runs.values()].find((r) => r.brandBrain)?.brandBrain;
    const brandBrain = ref ? { id: ref.id, name: ref.name ?? ref.id } : bench.brandBrainId ? { id: bench.brandBrainId, name: bench.brandBrainId } : null;
    return {
      id: bench.id,
      agentId: bench.agentId,
      version: bench.version,
      kind: bench.kind,
      batchId: bench.batchId,
      status: bench.status,
      total: results.length,
      done: results.filter((r) => r.status === "refused" || FINISHED.includes(r.status)).length,
      estimateMicroUsd: bench.estimateMicroUsd,
      capMicroUsd: bench.capMicroUsd,
      costMicroUsd: results.reduce((t, r) => t + r.costMicroUsd, 0),
      results,
      createdAt: bench.createdAt,
      finishedAt: bench.finishedAt,
      scorecard: scorecard(bench.version, allRuns, ratings),
      brandBrain,
    };
  }

  /* ---------- Ratings and scorecards ---------- */

  async rate(caller: Principal, agentId: string, runId: string, input: { rating: RatingValue; note?: string }): Promise<{ rating: Rating; scorecard: Scorecard }> {
    const user = await this.b.requireBuilder(caller);
    if (!RATINGS.includes(input.rating)) throw new AccountError("invalid_request", "A rating is good, ok or bad.");
    const run = await this.engine.getRun(this.ws, runId);
    if (!run || run.agent.id !== agentId) throw new AccountError("not_found", NOT_FOUND);
    if (run.status !== "succeeded" && run.status !== "failed") throw new AccountError("invalid_request", "Rate a run once it has finished.");
    const note = (typeof input.note === "string" ? input.note : "").trim().slice(0, BENCH_LIMITS.ratingNote);
    const existing = (await this.store.ratings.find({ workspaceId: this.ws, runId }))[0];
    const rating: Rating = {
      id: existing?.id ?? newId("rtg"),
      workspaceId: this.ws,
      agentId,
      version: run.agent.version,
      runId,
      rating: input.rating,
      note,
      createdBy: user.id,
      createdAt: this.b.iso(),
    };
    if (existing) await this.store.ratings.update(rating);
    else await this.store.ratings.insert(rating);
    await this.refreshQuality(caller, agentId);
    return { rating, scorecard: await this.scorecard(caller, agentId, run.agent.version) };
  }

  async scorecard(caller: Principal, agentId: string, version: string): Promise<Scorecard> {
    await this.b.requireBuilder(caller);
    const runs = await this.engine.listRuns(this.ws, { agentId });
    const ratings = await this.store.ratings.find({ workspaceId: this.ws, agentId });
    return scorecard(version, runs, ratings);
  }

  /** A scorecard per version, for the version history. */
  async scorecards(caller: Principal, agentId: string, versions: string[]): Promise<Record<string, Scorecard>> {
    await this.b.requireBuilder(caller);
    const runs = await this.engine.listRuns(this.ws, { agentId });
    const ratings = await this.store.ratings.find({ workspaceId: this.ws, agentId });
    return Object.fromEntries(versions.map((v) => [v, scorecard(v, runs, ratings)]));
  }

  /**
   * Writes the current version's scorecard into the spec's quality fields.
   * The listing changes; no version is made. Called when a bench ends, after
   * a rating, and after a rollback.
   */
  async refreshQuality(caller: Principal, agentId: string): Promise<AgentSpec> {
    const spec = await this.b.requireAgent(caller, agentId);
    const card = await this.scorecard(caller, agentId, spec.version);
    const quality = card.runs ? { score: card.score, runs: card.runs, lastScoredAt: this.b.iso() } : { score: null, runs: 0, lastScoredAt: null };
    return this.b.deps.agents.setQuality(caller, this.ws, agentId, quality);
  }

  /* ---------- Tuning ---------- */

  /** Saves the changes as a new version, then runs the given samples against it in one go. */
  async tune(caller: Principal, agentId: string, changes: UpdateInput, opts: { bump?: Bump; note?: string; rerun?: { sampleIds?: string[] } | null; release?: SaveRelease } = {}): Promise<{ spec: AgentSpec; bench: BenchView | null }> {
    await this.b.requireBuilder(caller);
    const spec = await this.b.saveAgent(caller, agentId, changes, { bump: opts.bump, note: opts.note, ...(opts.release ? { release: opts.release } : {}) });
    const bench = opts.rerun ? await this.run(caller, agentId, { version: spec.version, sampleIds: opts.rerun.sampleIds }) : null;
    return { spec, bench };
  }

  /* ---------- Batches ---------- */

  /** What a batch would run and cost. Every live agent when no ids are given. */
  async planBatch(caller: Principal, agentIds?: string[]): Promise<BatchPlan> {
    await this.b.requireBuilder(caller);
    const rows = await this.b.deps.agents.rows(caller, this.ws);
    const ids = agentIds ?? rows.filter((r) => r.status === "live").map((r) => r.id);
    const plan: BatchPlan = { agents: [], runs: 0, estimateMicroUsd: 0, capMicroUsd: 0, thresholdMicroUsd: toMicroUsd(BENCH_LIMITS.batchConfirmUsd), needsConfirmation: false };
    for (const id of ids) {
      const spec = await this.b.requireAgent(caller, id);
      const samples = await this.b.listSamples(caller, id);
      const e = this.estimateFor(spec, samples);
      plan.agents.push({ agentId: id, name: spec.name, version: spec.version, status: spec.status, samples: samples.length, runs: e.runs, estimateMicroUsd: e.estimateMicroUsd, capMicroUsd: e.capMicroUsd });
      plan.runs += e.runs;
      plan.estimateMicroUsd += e.estimateMicroUsd;
      plan.capMicroUsd += e.capMicroUsd;
    }
    plan.needsConfirmation = plan.estimateMicroUsd > plan.thresholdMicroUsd;
    return plan;
  }

  /** Starts one bench per agent. Above the threshold the caller must have confirmed the estimate. */
  async runBatch(caller: Principal, agentIds?: string[], opts: { confirmed?: boolean } = {}): Promise<BatchView> {
    const user = await this.b.requireBuilder(caller);
    const plan = await this.planBatch(caller, agentIds);
    if (plan.runs === 0) throw new AccountError("invalid_request", "Nothing to run: none of these agents has a sample that fits its form.");
    if (plan.runs > BENCH_LIMITS.runsPerBatch) throw new AccountError("invalid_request", `A batch runs at most ${BENCH_LIMITS.runsPerBatch} samples. Pick fewer agents.`);
    if (plan.needsConfirmation && !opts.confirmed) {
      throw new AccountError("confirmation_required", `This batch would cost about $${toUsd(plan.estimateMicroUsd).toFixed(2)}, up to $${toUsd(plan.capMicroUsd).toFixed(2)}. Confirm to start it.`);
    }
    const batch: Batch = {
      id: newId("bat"),
      workspaceId: this.ws,
      agentIds: plan.agents.filter((a) => a.runs > 0).map((a) => a.agentId),
      benchIds: [],
      status: "running",
      estimateMicroUsd: plan.estimateMicroUsd,
      capMicroUsd: plan.capMicroUsd,
      createdBy: user.id,
      createdAt: this.b.iso(),
      finishedAt: null,
    };
    // The record exists before any bench can finish and look for it.
    await this.store.batches.insert(batch);
    for (const agentId of batch.agentIds) {
      const spec = await this.b.requireAgent(caller, agentId);
      const samples = await this.b.listSamples(caller, agentId);
      const items = samples.map((s) => ({ sampleId: s.id, title: s.title, label: s.label, inputs: s.inputs, idealOutput: s.idealOutput }));
      const bench = await this.start(user.id, spec, items, "batch", batch.id);
      batch.benchIds.push(bench.id);
    }
    await this.store.batches.update(batch);
    await this.finishBatch(batch.id);
    return this.batchView(batch.id);
  }

  private async finishBatch(batchId: string): Promise<void> {
    const batch = await this.store.batches.get(batchId);
    if (!batch || batch.status !== "running" || batch.benchIds.length < batch.agentIds.length) return;
    const benches = await Promise.all(batch.benchIds.map((id) => this.store.benches.get(id)));
    if (benches.some((b) => !b || b.status === "running")) return;
    const cancelled = benches.some((b) => b?.status === "cancelled");
    await this.store.batches.update({ ...batch, status: cancelled ? "cancelled" : "done", finishedAt: this.b.iso() });
  }

  async getBatch(caller: Principal, batchId: string): Promise<BatchView> {
    await this.b.requireBuilder(caller);
    const batch = await this.store.batches.get(batchId);
    if (!batch || batch.workspaceId !== this.ws) throw new AccountError("not_found", NOT_FOUND);
    if (batch.status === "running") {
      for (const id of batch.benchIds) await this.finish(id);
      await this.finishBatch(batch.id);
    }
    return this.batchView(batch.id);
  }

  async listBatches(caller: Principal, limit = 5): Promise<BatchView[]> {
    await this.b.requireBuilder(caller);
    const rows = (await this.store.batches.find({ workspaceId: this.ws })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    const out: BatchView[] = [];
    for (const r of rows) out.push(await this.batchView(r.id));
    return out;
  }

  async cancelBatch(caller: Principal, batchId: string): Promise<BatchView> {
    await this.b.requireBuilder(caller);
    const batch = await this.store.batches.get(batchId);
    if (!batch || batch.workspaceId !== this.ws) throw new AccountError("not_found", NOT_FOUND);
    for (const id of batch.benchIds) await this.cancel(caller, id);
    await this.finishBatch(batch.id);
    return this.batchView(batch.id);
  }

  private async batchView(batchId: string): Promise<BatchView> {
    const batch = (await this.store.batches.get(batchId))!;
    const agents: BatchAgentView[] = [];
    for (const benchId of batch.benchIds) {
      const bench = await this.store.benches.get(benchId);
      if (!bench) continue;
      const v = await this.view(bench);
      const spec = await this.b.deps.agents.getForEdit({ kind: "user", userId: batch.createdBy }, this.ws, bench.agentId);
      const finished = v.results.filter((r) => r.status === "succeeded" || r.status === "failed");
      const autos = finished.map((r) => r.autoScore).filter((s): s is number => s !== null);
      const times = finished.map((r) => r.ms).filter((m): m is number => m !== null);
      agents.push({
        agentId: bench.agentId,
        name: spec?.name ?? bench.agentId,
        version: bench.version,
        benchId,
        total: v.total,
        done: v.done,
        passed: finished.filter((r) => r.status === "succeeded" && !r.needsReview).length,
        failedChecks: finished.reduce((n, r) => n + r.checks.filter((c) => c.status === "fail").length, 0),
        refused: v.results.filter((r) => r.status === "refused").length,
        avgAuto: autos.length ? Math.round(autos.reduce((a, b) => a + b, 0) / autos.length) : null,
        costMicroUsd: v.costMicroUsd,
        avgMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      });
    }
    return {
      id: batch.id,
      status: batch.status,
      agents,
      runs: agents.reduce((n, a) => n + a.total, 0),
      done: agents.reduce((n, a) => n + a.done, 0),
      estimateMicroUsd: batch.estimateMicroUsd,
      capMicroUsd: batch.capMicroUsd,
      costMicroUsd: agents.reduce((n, a) => n + a.costMicroUsd, 0),
      createdAt: batch.createdAt,
      finishedAt: batch.finishedAt,
    };
  }
}

/** One bench item joined with its run and rating. */
export function resultOf(index: number, item: BenchItem, run: Run | null, rating: Rating | null): BenchResult {
  const base = {
    index,
    sampleId: item.sampleId,
    title: item.title,
    label: item.label,
    inputs: item.inputs,
    idealOutput: item.idealOutput,
    runId: item.runId,
  };
  if (!run) {
    return { ...base, status: "refused", error: item.error ?? "The run is missing.", output: null, checks: [], needsReview: false, parsed: null, model: null, ms: null, tokensIn: 0, tokensOut: 0, costMicroUsd: 0, costUsd: 0, autoScore: null, rating: null, examples: null, sources: [] };
  }
  return {
    ...base,
    status: run.status,
    error: run.error?.message ?? null,
    output: run.output,
    checks: run.checks,
    needsReview: run.needsReview,
    parsed: parsedHow(run),
    model: run.model ? { route: run.model.route, model: run.model.model } : null,
    ms: run.timings.runMs,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
    costMicroUsd: run.costMicroUsd,
    costUsd: run.costUsd,
    autoScore: autoScore(run),
    rating: rating ? { rating: rating.rating, note: rating.note } : null,
    examples: run.examples ? { gold: run.examples.gold.map((e) => e.title), bad: run.examples.bad.map((e) => e.title), ownKeptOut: Boolean(item.sampleId && run.examples.excluded.includes(item.sampleId)) } : null,
    sources: runSources(run).map(({ url, title, published }) => ({ url, title, published })),
  };
}
