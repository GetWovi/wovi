/**
 * The app's API: everything the app screens' server actions call, with the
 * caller named on every call so the phase 4 policy decides. The actions in
 * src/app/app are thin: origin, session and CSRF checks, then one call here.
 *
 * - Onboarding: saved progress per person and workspace; the pasted posts go
 *   through the phase 7 profile proposal; nothing is a Brand Brain until the
 *   person saves the reviewed voice.
 * - Runs: the lineup (public live agents of the platform workspace in the doc's
 *   order), starting a run through the guarded engine, reading it back with
 *   its human decision, and quick edits that run again with a note.
 * - Reviews: the human approve step. Editors and up approve or reject a
 *   finished run with a note; viewers read.
 */
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import { AccountError } from "@/lib/accounts/errors";
import { savedBy, type GuardedAgents, type GuardedRuns, type PublicAgent, type PublicRun } from "@/lib/accounts/guard";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { PipelineError } from "@/lib/pipelines/errors";
import type { GuardedPipelines } from "@/lib/pipelines/guard";
import type { PublicPipelineRun } from "@/lib/pipelines/run";
import type { PipelineSpec } from "@/lib/pipelines/spec";
import type { AgentSpec } from "@/lib/agents/spec";
import { BrandError, publicProposal, type BrainSummary, type BrandBrains, type ProposalEdits, type PublicProposal } from "@/lib/brand/brains";
import { RunError, type SubmitRequest } from "@/lib/runs/engine";
import type { Confirmations } from "@/lib/runs/guardrails";
import { orderLineup, type LineupAgent } from "./lineup";
import { pipelineSearchText, pipelineState, pipelineTitle, waitsForPerson, type PipelineState } from "./pipelines";
import { canReadPosts, cleanPatch, emptyOnboarding, filledPosts, reachableStep, type OnboardingPatch, type OnboardingState } from "./onboarding";
import { applyQuickEdit } from "./quick-edits";
import { runSearchText, runState, type RunState } from "./results";
import { REVIEW_DECISIONS, type AppStore, type OnboardingRow, type ReviewDecision, type ReviewRow } from "./store";

export type AppErrorCode = "invalid_request" | "not_found" | "forbidden" | "not_ready";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type StartRunInput = {
  agentId: string;
  inputs: Record<string, unknown>;
  /** Where the agent lives. The platform workspace by default. */
  agentWorkspaceId?: string;
  brandBrainId?: string | null;
  brandIdea?: string | null;
  confirmations?: Confirmations;
  idempotencyKey?: string;
};

/** A run with its agent, its human decision and one state. */
export type RunView = {
  run: PublicRun;
  agent: { id: string; name: string; job: string } | null;
  review: ReviewRow | null;
  state: RunState;
  /** The note a quick edit ran with, when this run came from one. */
  note: string | null;
};

export type RunsFilter = { q?: string; state?: RunState | "all" | "open"; agentId?: string; limit?: number };

export type AppApiOptions = {
  accounts: Accounts;
  agents: GuardedAgents;
  runs: GuardedRuns;
  brands: BrandBrains;
  store: AppStore;
  /** Pipelines (phase 10). Left out, the pipeline calls say not found. */
  pipelines?: GuardedPipelines;
  now?: () => Date;
};

/** A pipeline a workspace can start, with its steps' agents by name. */
export type PipelineInfo = {
  spec: PipelineSpec;
  /** Where the pipeline lives. */
  workspaceId: string;
  steps: { id: string; label: string; agentId: string; agentName: string; agentJob: string }[];
  /** The confirmations its agents ask for. */
  confirmations: { rights: boolean; voice: boolean };
};

export type StartPipelineInput = {
  pipelineId: string;
  pipelineWorkspaceId?: string;
  inputs: Record<string, unknown>;
  confirmations?: Confirmations;
  idempotencyKey?: string;
};

/** A pipeline run with one state and its title. */
export type PipelineView = { run: PublicPipelineRun; state: PipelineState; title: string };

export type PipelineRunsFilter = { q?: string; state?: PipelineState | RunState | "all" | "open"; pipelineId?: string; limit?: number };

const NOTE = /\n\nNote for this run: ([^]+)$/;

export class AppApi {
  private readonly now: () => Date;

  constructor(private readonly o: AppApiOptions) {
    this.now = o.now ?? (() => new Date());
  }

  private iso() {
    return this.now().toISOString();
  }

  /* ---------- The lineup ---------- */

  /** The agents a person can run: the platform's public live agents in the doc's order, plus the coming ones. */
  async lineup(caller: Principal, workspaceId: string): Promise<LineupAgent[]> {
    await this.o.accounts.authorize(caller, workspaceId, "view");
    const platform = await this.o.agents.list(caller, PLATFORM_WORKSPACE_ID);
    const own = workspaceId === PLATFORM_WORKSPACE_ID ? [] : await this.o.agents.list(caller, workspaceId);
    return orderLineup([...platform, ...own.filter((a) => !platform.some((p) => p.id === a.id))]);
  }

  /** One live agent the workspace may run, or null. */
  async agent(caller: Principal, workspaceId: string, id: string): Promise<{ spec: PublicAgent; agentWorkspaceId: string } | null> {
    const all = await this.lineup(caller, workspaceId);
    const found = all.find((a) => a.id === id && a.status === "live" && a.spec);
    if (!found?.spec) return null;
    const platform = await this.o.agents.get(caller, PLATFORM_WORKSPACE_ID, id);
    return { spec: found.spec, agentWorkspaceId: platform ? PLATFORM_WORKSPACE_ID : workspaceId };
  }

  /* ---------- Onboarding ---------- */

  private onboardingId(workspaceId: string, caller: Principal) {
    return `${workspaceId}:${caller.kind === "user" ? caller.userId : `key:${caller.keyId}`}`;
  }

  async onboarding(caller: Principal, workspaceId: string): Promise<OnboardingState> {
    await this.o.accounts.authorize(caller, workspaceId, "view");
    const row = await this.o.store.onboarding.get(this.onboardingId(workspaceId, caller));
    return row ? pick(row) : emptyOnboarding();
  }

  /** Whether to send a person into onboarding: nothing decided yet and no Brand Brain in the workspace. */
  async needsOnboarding(caller: Principal, workspaceId: string): Promise<boolean> {
    const state = await this.onboarding(caller, workspaceId);
    if (state.status !== "open") return false;
    return (await this.o.brands.list(caller, workspaceId)).length === 0;
  }

  /** Saves the person's answers and where they are, so they can come back later. */
  async saveOnboarding(caller: Principal, workspaceId: string, patch: OnboardingPatch): Promise<OnboardingState> {
    await this.o.accounts.authorize(caller, workspaceId, "view");
    const id = this.onboardingId(workspaceId, caller);
    const at = this.iso();
    const current = (await this.o.store.onboarding.get(id)) ?? { ...emptyOnboarding(), id, workspaceId, userId: caller.userId, createdAt: at, updatedAt: at };
    const clean = cleanPatch(patch);
    const next: OnboardingRow = { ...current, ...clean, status: "open", updatedAt: at };
    if (clean.step) next.step = reachableStep(next, clean.step);
    // New posts make the old proposal stale.
    if (clean.posts && JSON.stringify(filledPosts(clean.posts)) !== JSON.stringify(filledPosts(current.posts))) next.proposalId = null;
    await this.write(next, Boolean(await this.o.store.onboarding.get(id)));
    return pick(next);
  }

  /** Reads the pasted posts into a proposed voice (the phase 7 proposal) and moves to the review step. */
  async readOnboardingPosts(caller: Principal, workspaceId: string): Promise<{ state: OnboardingState; proposal: PublicProposal }> {
    await this.o.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const id = this.onboardingId(workspaceId, caller);
    const row = await this.o.store.onboarding.get(id);
    if (!row) throw new AppError("not_ready", "Add your posts first.");
    const can = canReadPosts(row.posts);
    if (!can.ok) throw new AppError("invalid_request", can.reason);
    const proposal = await this.o.brands.propose(caller, workspaceId, { name: row.name, niche: row.niche, platforms: row.platforms, posts: filledPosts(row.posts) });
    const next: OnboardingRow = { ...row, proposalId: proposal.id, step: "review", updatedAt: this.iso() };
    await this.write(next, true);
    return { state: pick(next), proposal: publicProposal(proposal) };
  }

  /** The open proposal of the review step, for coming back to it. */
  async onboardingProposal(caller: Principal, workspaceId: string): Promise<PublicProposal | null> {
    const state = await this.onboarding(caller, workspaceId);
    if (!state.proposalId) return null;
    try {
      const p = await this.o.brands.getProposal(caller, workspaceId, state.proposalId);
      return p.status === "open" ? publicProposal(p) : null;
    } catch (err) {
      if (err instanceof BrandError && err.code === "not_found") return null;
      throw err;
    }
  }

  /**
   * Lands in the app: saves the reviewed voice as the first Brand Brain (the
   * person's edits win), or, without a proposal, a blank Brand Brain from the
   * name and niche when one was given. Done either way.
   */
  async finishOnboarding(caller: Principal, workspaceId: string, edits: ProposalEdits = {}): Promise<OnboardingState> {
    await this.o.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const id = this.onboardingId(workspaceId, caller);
    const at = this.iso();
    const row = (await this.o.store.onboarding.get(id)) ?? { ...emptyOnboarding(), id, workspaceId, userId: caller.userId, createdAt: at, updatedAt: at };
    let brainId: string | null = row.brainId;
    if (row.proposalId) {
      const saved = await this.o.brands.accept(caller, workspaceId, row.proposalId, edits);
      brainId = saved.brain.id;
    } else {
      const name = (edits.name ?? row.name).trim();
      if (name) {
        const made = await this.o.brands.create(caller, workspaceId, { name, niche: edits.niche ?? row.niche, platforms: edits.platforms ?? row.platforms, ...(edits.idea ? { idea: edits.idea } : {}) }, { note: "Made in onboarding" });
        brainId = made.brain.id;
      }
    }
    const next: OnboardingRow = { ...row, status: "done", step: "review", brainId, updatedAt: this.iso() };
    await this.write(next, Boolean(await this.o.store.onboarding.get(id)));
    return pick(next);
  }

  /** Skips the rest. The person can come back from Settings. */
  async skipOnboarding(caller: Principal, workspaceId: string): Promise<OnboardingState> {
    await this.o.accounts.authorize(caller, workspaceId, "view");
    const id = this.onboardingId(workspaceId, caller);
    const at = this.iso();
    const row = (await this.o.store.onboarding.get(id)) ?? { ...emptyOnboarding(), id, workspaceId, userId: caller.userId, createdAt: at, updatedAt: at };
    const next: OnboardingRow = { ...row, status: "skipped", updatedAt: at };
    await this.write(next, Boolean(await this.o.store.onboarding.get(id)));
    return pick(next);
  }

  /** Starts over, keeping nothing. */
  async restartOnboarding(caller: Principal, workspaceId: string): Promise<OnboardingState> {
    await this.o.accounts.authorize(caller, workspaceId, "view");
    await this.o.store.onboarding.delete(this.onboardingId(workspaceId, caller));
    return emptyOnboarding();
  }

  private async write(row: OnboardingRow, exists: boolean) {
    if (exists) await this.o.store.onboarding.update(row);
    else await this.o.store.onboarding.insert(row);
  }

  /* ---------- Brand Brains ---------- */

  async brains(caller: Principal, workspaceId: string): Promise<BrainSummary[]> {
    return this.o.brands.list(caller, workspaceId);
  }

  /* ---------- Runs ---------- */

  /** Starts a run through the guarded engine. Engine refusals come back as AppErrors with the engine's issues. */
  async startRun(caller: Principal, workspaceId: string, input: StartRunInput): Promise<PublicRun> {
    const req: SubmitRequest = {
      workspaceId,
      agentId: input.agentId,
      agentWorkspaceId: input.agentWorkspaceId ?? PLATFORM_WORKSPACE_ID,
      inputs: input.inputs,
      ...(input.brandBrainId ? { brandBrainId: input.brandBrainId } : {}),
      ...(input.brandIdea?.trim() ? { brandIdea: input.brandIdea.trim() } : {}),
      ...(input.confirmations ? { confirmations: input.confirmations } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    };
    try {
      return await this.o.runs.submitRun(caller, req);
    } catch (err) {
      if (err instanceof RunError) {
        if (err.code === "not_found") throw new AppError("not_found", "No such agent.");
        throw new AppError("invalid_request", err.issues.length ? "Some fields need a look." : err.message.split("\n")[0], err.issues);
      }
      throw err;
    }
  }

  /** Runs the same job again with a quick edit's note on the main input. */
  async rerun(caller: Principal, workspaceId: string, runId: string, editId: string): Promise<PublicRun> {
    const view = await this.run(caller, workspaceId, runId);
    if (!view) throw new AppError("not_found", "No such run.");
    // The agent lives in the platform workspace, or else in this one.
    const platform = await this.o.agents.get(caller, PLATFORM_WORKSPACE_ID, view.run.agent.id);
    const home = platform ? PLATFORM_WORKSPACE_ID : workspaceId;
    const full = platform ?? (await this.o.agents.get(caller, workspaceId, view.run.agent.id));
    if (!full) throw new AppError("not_found", "That agent is not available any more.");
    const edited = applyQuickEdit(full, view.run.inputs, editId);
    if (!edited) throw new AppError("invalid_request", "That quick edit does not fit this agent.");
    return this.startRun(caller, workspaceId, {
      agentId: view.run.agent.id,
      agentWorkspaceId: home,
      inputs: edited.inputs,
      brandBrainId: view.run.brandBrain?.id ?? null,
      confirmations: confirmationsOf(view.run, full),
    });
  }

  async run(caller: Principal, workspaceId: string, runId: string): Promise<RunView | null> {
    const run = await this.o.runs.getRun(caller, workspaceId, runId);
    if (!run) return null;
    const review = await this.reviewOf(workspaceId, runId);
    const names = await this.agentNames(caller, workspaceId);
    return this.view(run, review, names);
  }

  async cancelRun(caller: Principal, workspaceId: string, runId: string): Promise<PublicRun> {
    return this.o.runs.cancelRun(caller, workspaceId, runId);
  }

  /** Every run of the workspace, newest first, with search and a state filter. */
  async runs(caller: Principal, workspaceId: string, filter: RunsFilter = {}): Promise<RunView[]> {
    // Runs a pipeline made are shown inside their pipeline run, not on their own.
    const runs = (await this.o.runs.listRuns(caller, workspaceId, filter.agentId ? { agentId: filter.agentId } : {})).filter((r) => !r.parent);
    const names = await this.agentNames(caller, workspaceId);
    const reviews = new Map((await this.o.store.reviews.find({ workspaceId })).map((r) => [r.runId, r]));
    const q = filter.q?.trim().toLowerCase() ?? "";
    const out: RunView[] = [];
    for (const run of runs) {
      const v = this.view(run, reviews.get(run.id) ?? null, names);
      if (filter.state && filter.state !== "all") {
        if (filter.state === "open" ? !["needs_review", "ready"].includes(v.state) : v.state !== filter.state) continue;
      }
      if (q && !runSearchText(run).includes(q) && !(v.agent?.name.toLowerCase().includes(q) ?? false)) continue;
      out.push(v);
      if (filter.limit && out.length >= filter.limit) break;
    }
    return out;
  }

  /** How many runs wait for a decision. */
  async openCount(caller: Principal, workspaceId: string): Promise<number> {
    const runs = (await this.runs(caller, workspaceId, { state: "open" })).length;
    const pipelines = this.o.pipelines ? (await this.pipelineRuns(caller, workspaceId, { state: "open" })).length : 0;
    return runs + pipelines;
  }

  /* ---------- Pipelines (phase 10) ---------- */

  private get pl(): GuardedPipelines {
    if (!this.o.pipelines) throw new AppError("not_found", "Pipelines are not set up here.");
    return this.o.pipelines;
  }

  private async pipelineInfo(caller: Principal, workspaceId: string, spec: PipelineSpec, home: string): Promise<PipelineInfo> {
    const names = await this.agentNames(caller, workspaceId);
    const guardrails: string[] = [];
    for (const s of spec.steps) {
      const a = (await this.o.agents.get(caller, home, s.agent.id)) ?? (home !== PLATFORM_WORKSPACE_ID ? await this.o.agents.get(caller, PLATFORM_WORKSPACE_ID, s.agent.id) : null);
      guardrails.push(...(a?.guardrails ?? []));
    }
    return {
      spec,
      workspaceId: home,
      steps: spec.steps.map((s) => ({ id: s.id, label: s.label, agentId: s.agent.id, agentName: names.get(s.agent.id)?.name ?? s.agent.id, agentJob: names.get(s.agent.id)?.job ?? "" })),
      confirmations: { rights: guardrails.includes("rights_confirmed"), voice: guardrails.includes("voice_consent") },
    };
  }

  /** The pipelines this workspace can start: the platform's templates, then its own. */
  async pipelines(caller: Principal, workspaceId: string): Promise<PipelineInfo[]> {
    if (!this.o.pipelines) return [];
    const list = await this.pl.available(caller, workspaceId);
    return Promise.all(list.map((p) => this.pipelineInfo(caller, workspaceId, p.spec, p.workspaceId)));
  }

  async pipeline(caller: Principal, workspaceId: string, id: string): Promise<PipelineInfo | null> {
    return (await this.pipelines(caller, workspaceId)).find((p) => p.spec.id === id) ?? null;
  }

  /** Starts a pipeline run. Refusals come back as AppErrors with the engine's issues, "key: message". */
  async startPipeline(caller: Principal, workspaceId: string, input: StartPipelineInput): Promise<PublicPipelineRun> {
    const info = await this.pipeline(caller, workspaceId, input.pipelineId);
    if (!info) throw new AppError("not_found", "No such pipeline.");
    try {
      return await this.pl.submit(caller, {
        workspaceId,
        pipelineId: input.pipelineId,
        pipelineWorkspaceId: input.pipelineWorkspaceId ?? info.workspaceId,
        inputs: input.inputs,
        ...(input.confirmations ? { confirmations: input.confirmations } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      });
    } catch (err) {
      throw pipelineAppError(err);
    }
  }

  async pipelineRun(caller: Principal, workspaceId: string, id: string): Promise<PipelineView | null> {
    const run = await this.pl.getRun(caller, workspaceId, id);
    return run ? { run, state: pipelineState(run), title: pipelineTitle(run) } : null;
  }

  /** The engine runs of a pipeline run, step by step, so the run pages can show the chain. */
  async pipelineStepRuns(caller: Principal, workspaceId: string, id: string): Promise<PublicRun[]> {
    return this.pl.stepRuns(caller, workspaceId, id);
  }

  /** Every pipeline run of the workspace, newest first, with search and a state filter. */
  async pipelineRuns(caller: Principal, workspaceId: string, filter: PipelineRunsFilter = {}): Promise<PipelineView[]> {
    if (!this.o.pipelines) return [];
    const runs = await this.pl.listRuns(caller, workspaceId, filter.pipelineId ? { pipelineId: filter.pipelineId } : {});
    const q = filter.q?.trim().toLowerCase() ?? "";
    const out: PipelineView[] = [];
    for (const run of runs) {
      const v: PipelineView = { run, state: pipelineState(run), title: pipelineTitle(run) };
      if (filter.state && filter.state !== "all") {
        if (filter.state === "open" ? !waitsForPerson(v.state) : v.state !== filter.state) continue;
      }
      if (q && !pipelineSearchText(run).includes(q)) continue;
      out.push(v);
      if (filter.limit && out.length >= filter.limit) break;
    }
    return out;
  }

  async pickInPipeline(caller: Principal, workspaceId: string, id: string, stepId: string, index: number): Promise<PublicPipelineRun> {
    try {
      return await this.pl.pick(caller, workspaceId, id, stepId, index);
    } catch (err) {
      throw pipelineAppError(err);
    }
  }

  async cancelPipeline(caller: Principal, workspaceId: string, id: string): Promise<PublicPipelineRun> {
    try {
      return await this.pl.cancel(caller, workspaceId, id);
    } catch (err) {
      throw pipelineAppError(err);
    }
  }

  async retryPipeline(caller: Principal, workspaceId: string, id: string): Promise<PublicPipelineRun> {
    try {
      return await this.pl.retry(caller, workspaceId, id);
    } catch (err) {
      throw pipelineAppError(err);
    }
  }

  /** The approve step at the end of a pipeline run. */
  async decidePipeline(caller: Principal, workspaceId: string, id: string, decision: ReviewDecision, note = ""): Promise<PublicPipelineRun> {
    if (!REVIEW_DECISIONS.includes(decision)) throw new AppError("invalid_request", "Approve or reject.");
    try {
      return await this.pl.decide(caller, workspaceId, id, decision, note);
    } catch (err) {
      throw pipelineAppError(err);
    }
  }

  async clearPipelineDecision(caller: Principal, workspaceId: string, id: string): Promise<PublicPipelineRun> {
    try {
      return await this.pl.clearDecision(caller, workspaceId, id);
    } catch (err) {
      throw pipelineAppError(err);
    }
  }

  private view(run: PublicRun, review: ReviewRow | null, names: Map<string, { name: string; job: string }>): RunView {
    const agent = names.get(run.agent.id);
    const main = Object.values(run.inputs).find((v) => typeof v === "string" && NOTE.test(v)) as string | undefined;
    return { run, agent: agent ? { id: run.agent.id, ...agent } : null, review, state: runState(run, review), note: main ? (NOTE.exec(main)?.[1] ?? null) : null };
  }

  private async agentNames(caller: Principal, workspaceId: string): Promise<Map<string, { name: string; job: string }>> {
    const names = new Map<string, { name: string; job: string }>();
    for (const a of await this.o.agents.list(caller, PLATFORM_WORKSPACE_ID)) names.set(a.id, { name: a.name, job: a.job });
    if (workspaceId !== PLATFORM_WORKSPACE_ID) for (const a of await this.o.agents.list(caller, workspaceId)) if (!names.has(a.id)) names.set(a.id, { name: a.name, job: a.job });
    return names;
  }

  /* ---------- The human approve step ---------- */

  private async reviewOf(workspaceId: string, runId: string): Promise<ReviewRow | null> {
    const r = await this.o.store.reviews.get(runId);
    return r && r.workspaceId === workspaceId ? r : null;
  }

  /** Approves or rejects a finished run, with a note. Deciding again replaces the decision. */
  async review(caller: Principal, workspaceId: string, runId: string, decision: ReviewDecision, note = ""): Promise<ReviewRow> {
    await this.o.accounts.authorize(caller, workspaceId, "run_agents");
    if (!REVIEW_DECISIONS.includes(decision)) throw new AppError("invalid_request", "Approve or reject.");
    const run = await this.o.runs.getRun(caller, workspaceId, runId);
    if (!run) throw new AppError("not_found", "No such run.");
    if (run.status !== "succeeded") throw new AppError("not_ready", "Only a finished run can be approved or rejected.");
    const row: ReviewRow = { id: runId, workspaceId, runId, decision, note: String(note ?? "").trim().slice(0, 500), by: savedBy(caller), at: this.iso() };
    if (await this.reviewOf(workspaceId, runId)) await this.o.store.reviews.update(row);
    else await this.o.store.reviews.insert(row);
    return row;
  }

  /** Takes a decision back, so the run waits again. */
  async clearReview(caller: Principal, workspaceId: string, runId: string): Promise<void> {
    await this.o.accounts.authorize(caller, workspaceId, "run_agents");
    if (!(await this.reviewOf(workspaceId, runId))) throw new AccountError("not_found", "No decision on that run.");
    await this.o.store.reviews.delete(runId);
  }
}

/** A pipeline refusal in the app's words. Account errors pass through. */
function pipelineAppError(err: unknown): unknown {
  if (!(err instanceof PipelineError)) return err;
  if (err.code === "not_found") return new AppError("not_found", err.message);
  if (err.code === "not_ready") return new AppError("not_ready", err.message);
  return new AppError("invalid_request", err.code === "invalid_input" ? "Some fields need a look." : err.message.split("\n")[0], err.issues);
}

function pick(row: OnboardingRow): OnboardingState {
  return { step: row.step, name: row.name, niche: row.niche, platforms: row.platforms, posts: row.posts, proposalId: row.proposalId, status: row.status, brainId: row.brainId };
}

/** The confirmations the agent asks for, given again for a re-run of a run that had them. */
function confirmationsOf(run: PublicRun, spec: Pick<AgentSpec, "guardrails">): Confirmations | undefined {
  const rights = spec.guardrails.includes("rights_confirmed") && run.checks.some((c) => c.check === "rights_confirmation" && c.status === "pass");
  const voice = spec.guardrails.includes("voice_consent") && run.checks.some((c) => c.check === "voice_consent_confirmation" && c.status === "pass");
  return rights || voice ? { ...(rights ? { rights: true } : {}), ...(voice ? { voiceConsent: true } : {}) } : undefined;
}
