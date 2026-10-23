/**
 * Pipelines as callers reach them: every call names who is calling and the
 * phase 4 policy decides, like GuardedAgents and GuardedRuns.
 *
 * - Members of a workspace see all of its pipelines; anyone else only its
 *   public live ones (the platform's templates).
 * - Editors and up save pipelines (edit_agents) and run them (run_agents);
 *   viewers read runs; outsiders get not found.
 * - Only the platform workspace may hold pipelines owned by the platform.
 * - Run reads are public views: no cost. Costs go to people who may see them.
 */
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import { AccountError } from "@/lib/accounts/errors";
import { savedBy, seesCosts, spenderOf } from "@/lib/accounts/guard";
import type { Role } from "@/lib/accounts/policy";
import { PLATFORM_CREATOR_ID, PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { Bump } from "@/lib/agents/semver";
import type { AgentStatus } from "@/lib/agents/spec";
import { publicRunView } from "@/lib/runs/run";
import { toUsd } from "@/lib/runs/prices";
import type { PipelineEngine, PipelineSubmitRequest } from "./engine";
import type { PipelineCreateInput, PipelineUpdateInput } from "./registry";
import { publicPipelineRun, type PublicPipelineRun } from "./run";
import type { PipelineSpec } from "./spec";

const isPublicLive = (s: PipelineSpec) => s.visibility === "public" && s.status === "live";

export class GuardedPipelines {
  constructor(
    readonly engine: PipelineEngine,
    private readonly accounts: Accounts,
  ) {}

  private get registry() {
    return this.engine.registry;
  }

  /* ---------- Pipelines ---------- */

  async list(caller: Principal, workspaceId: string): Promise<PipelineSpec[]> {
    const member = await this.accounts.roleIn(caller, workspaceId);
    const specs = await this.registry.list(workspaceId);
    return member ? specs : specs.filter(isPublicLive);
  }

  /** The pipelines a workspace can start: the platform's public live templates, then its own live ones. */
  async available(caller: Principal, workspaceId: string): Promise<{ spec: PipelineSpec; workspaceId: string }[]> {
    await this.accounts.authorize(caller, workspaceId, "view");
    const platform = (await this.registry.list(PLATFORM_WORKSPACE_ID, { status: "live" })).filter(isPublicLive);
    const own = workspaceId === PLATFORM_WORKSPACE_ID ? [] : await this.registry.list(workspaceId, { status: "live" });
    return [...platform.map((spec) => ({ spec, workspaceId: PLATFORM_WORKSPACE_ID })), ...own.filter((o) => !platform.some((p) => p.id === o.id)).map((spec) => ({ spec, workspaceId }))];
  }

  async get(caller: Principal, workspaceId: string, id: string, version?: string): Promise<PipelineSpec | null> {
    const member = await this.accounts.roleIn(caller, workspaceId);
    const spec = await this.registry.get(workspaceId, id, version);
    return spec && (member || isPublicLive(spec)) ? spec : null;
  }

  async versions(caller: Principal, workspaceId: string, id: string) {
    await this.accounts.authorize(caller, workspaceId, "view");
    return this.registry.versions(workspaceId, id);
  }

  async rows(caller: Principal, workspaceId: string) {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.rows(workspaceId);
  }

  async create(caller: Principal, workspaceId: string, input: PipelineCreateInput, opts: { note?: string } = {}): Promise<PipelineSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    const platform = input?.owner?.kind === "platform" || input?.owner?.creatorId === PLATFORM_CREATOR_ID;
    if (platform && workspaceId !== PLATFORM_WORKSPACE_ID) throw new AccountError("forbidden", "Only the platform workspace can hold platform pipelines.");
    return this.registry.create(workspaceId, input, { ...opts, by: savedBy(caller) });
  }

  async update(caller: Principal, workspaceId: string, id: string, changes: PipelineUpdateInput, opts: { bump?: Bump; note?: string } = {}): Promise<PipelineSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.update(workspaceId, id, changes, { ...opts, by: savedBy(caller) });
  }

  async setStatus(caller: Principal, workspaceId: string, id: string, status: AgentStatus): Promise<PipelineSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.setStatus(workspaceId, id, status);
  }

  async rollback(caller: Principal, workspaceId: string, id: string, version: string): Promise<PipelineSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.rollback(workspaceId, id, version);
  }

  /* ---------- Runs ---------- */

  /** The public view, with the credits charged only for people who may see costs. */
  private view(caller: Principal, role: Role, run: Parameters<typeof publicPipelineRun>[0]): PublicPipelineRun {
    const v = publicPipelineRun(run);
    return seesCosts(caller, role) ? v : { ...v, charge: null };
  }

  /** Credits count toward the caller; only the estimate they were shown passes through. */
  async submit(caller: Principal, req: PipelineSubmitRequest): Promise<PublicPipelineRun> {
    const role = await this.accounts.authorize(caller, req?.workspaceId, "run_agents");
    const quoted = req.billing?.quotedCredits;
    const billing = { userId: spenderOf(caller), ...(quoted !== undefined ? { quotedCredits: quoted } : {}) };
    return this.view(caller, role, await this.engine.submit({ ...req, createdBy: savedBy(caller), billing }));
  }

  /** What a pipeline costs before it starts, in credits, for anyone who can see the workspace. Null when nothing is billed. */
  async estimate(caller: Principal, workspaceId: string, pipelineId: string, pipelineWorkspaceId?: string): Promise<number | null> {
    await this.accounts.authorize(caller, workspaceId, "view");
    return this.engine.estimate(workspaceId, pipelineId, pipelineWorkspaceId);
  }

  async retryEstimate(caller: Principal, workspaceId: string, id: string): Promise<number | null> {
    await this.accounts.authorize(caller, workspaceId, "view");
    return this.engine.retryEstimate(workspaceId, id);
  }

  async getRun(caller: Principal, workspaceId: string, id: string): Promise<PublicPipelineRun | null> {
    const role = await this.accounts.authorize(caller, workspaceId, "view");
    const run = await this.engine.get(workspaceId, id);
    return run ? this.view(caller, role, run) : null;
  }

  async listRuns(caller: Principal, workspaceId: string, filter: { limit?: number; pipelineId?: string } = {}): Promise<PublicPipelineRun[]> {
    const role = await this.accounts.authorize(caller, workspaceId, "view");
    return (await this.engine.list(workspaceId, filter)).map((r) => this.view(caller, role, r));
  }

  /** Every engine run of the chain, in order, as public views. */
  async stepRuns(caller: Principal, workspaceId: string, id: string) {
    const role = await this.accounts.authorize(caller, workspaceId, "view");
    const costs = seesCosts(caller, role);
    return (await this.engine.stepRuns(workspaceId, id)).map((r) => (costs ? publicRunView(r) : { ...publicRunView(r), charge: null }));
  }

  async pick(caller: Principal, workspaceId: string, id: string, stepId: string, index: number): Promise<PublicPipelineRun> {
    const role = await this.accounts.authorize(caller, workspaceId, "run_agents");
    return this.view(caller, role, await this.engine.pick(workspaceId, id, stepId, index, savedBy(caller)));
  }

  async cancel(caller: Principal, workspaceId: string, id: string): Promise<PublicPipelineRun> {
    const role = await this.accounts.authorize(caller, workspaceId, "run_agents");
    return this.view(caller, role, await this.engine.cancel(workspaceId, id));
  }

  async retry(caller: Principal, workspaceId: string, id: string): Promise<PublicPipelineRun> {
    const role = await this.accounts.authorize(caller, workspaceId, "run_agents");
    return this.view(caller, role, await this.engine.retry(workspaceId, id));
  }

  /** The human approve step. "decide", so an API key never approves (phase 18 closed this: it used to ask for run_agents only). */
  async decide(caller: Principal, workspaceId: string, id: string, decision: "approved" | "rejected", note = ""): Promise<PublicPipelineRun> {
    const role = await this.accounts.authorize(caller, workspaceId, "decide");
    return this.view(caller, role, await this.engine.decide(workspaceId, id, decision, note, savedBy(caller)));
  }

  async clearDecision(caller: Principal, workspaceId: string, id: string): Promise<PublicPipelineRun> {
    const role = await this.accounts.authorize(caller, workspaceId, "decide");
    return this.view(caller, role, await this.engine.clearDecision(workspaceId, id));
  }

  /** The cap and the summed cost, per step, for people who may see costs. */
  async costs(caller: Principal, workspaceId: string, id: string) {
    await this.accounts.authorize(caller, workspaceId, "see_costs");
    const run = await this.engine.get(workspaceId, id);
    if (!run) throw new AccountError("not_found", "No such pipeline run.");
    return { capUsd: toUsd(run.capMicroUsd), costUsd: run.costUsd, costMicroUsd: run.costMicroUsd, steps: run.steps.map((s) => ({ id: s.id, runs: s.runIds.length, costMicroUsd: s.costMicroUsd, costUsd: toUsd(s.costMicroUsd) })) };
  }
}
