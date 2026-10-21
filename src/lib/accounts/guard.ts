/**
 * The registry (phase 2) and the run engine (phase 3) as callers reach them:
 * every call names who is calling, and the policy decides. The raw registry
 * and engine stay for seeds, scripts and tests; the web app, MCP and the REST
 * API (phase 14) only get these.
 *
 * Rules:
 * - Inside a workspace, the caller's role decides (see policy.ts).
 * - Outside it, only public live agents are visible and runnable, as their
 *   public view, which is what phase 3 already allowed for runs.
 * - Reads return public views: no routing, no instructions, no model calls.
 *   Editors who need the full spec ask for it with getForEdit.
 * - Only the platform workspace may hold agents owned by the platform creator.
 */
import { PLATFORM_CREATOR_ID, PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { AgentRegistry, CreateInput, ListFilter, UpdateInput } from "@/lib/agents/registry";
import { publicView, type AgentSpec, type AgentStatus } from "@/lib/agents/spec";
import type { Bump } from "@/lib/agents/semver";
import type { RunEngine, SubmitRequest } from "@/lib/runs/engine";
import { publicRunView } from "@/lib/runs/run";
import type { RunFilter } from "@/lib/runs/store";
import type { Accounts, Principal } from "./accounts";
import { AccountError } from "./errors";

export type PublicAgent = ReturnType<typeof publicView>;
export type PublicRun = ReturnType<typeof publicRunView>;

const isPublicLive = (s: AgentSpec) => s.visibility === "public" && s.status === "live";

/** Who a version row names as its author. */
export function savedBy(caller: Principal): string {
  return caller.kind === "user" ? caller.userId : `key:${caller.keyId}`;
}

export class GuardedAgents {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly accounts: Accounts,
  ) {}

  /** Members see every agent of the workspace; anyone else only its public live ones. */
  async list(caller: Principal, workspaceId: string, filter: ListFilter = {}): Promise<PublicAgent[]> {
    const member = await this.accounts.roleIn(caller, workspaceId);
    const specs = await this.registry.list(workspaceId, filter);
    return (member ? specs : specs.filter(isPublicLive)).map(publicView);
  }

  async get(caller: Principal, workspaceId: string, id: string, version?: string): Promise<PublicAgent | null> {
    const member = await this.accounts.roleIn(caller, workspaceId);
    const spec = await this.registry.get(workspaceId, id, version);
    return spec && (member || isPublicLive(spec)) ? publicView(spec) : null;
  }

  /** The full spec, instructions and routing included, for people who edit the agent. */
  async getForEdit(caller: Principal, workspaceId: string, id: string, version?: string): Promise<AgentSpec | null> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.get(workspaceId, id, version);
  }

  async versions(caller: Principal, workspaceId: string, id: string) {
    await this.accounts.authorize(caller, workspaceId, "view");
    return this.registry.versions(workspaceId, id);
  }

  /** Listing rows with timestamps, for people who edit the workspace's agents. */
  async rows(caller: Principal, workspaceId: string) {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.rows(workspaceId);
  }

  /** Every version remembers who saved it: the user, or the key that was used. */
  async create(caller: Principal, workspaceId: string, input: CreateInput, opts: { note?: string } = {}): Promise<AgentSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    await this.checkOwner(workspaceId, input.owner);
    return this.registry.create(workspaceId, input, { ...opts, by: savedBy(caller) });
  }

  async update(caller: Principal, workspaceId: string, id: string, changes: UpdateInput, opts: { bump?: Bump; note?: string } = {}): Promise<AgentSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.update(workspaceId, id, changes, { ...opts, by: savedBy(caller) });
  }

  async rollback(caller: Principal, workspaceId: string, id: string, version: string): Promise<AgentSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.rollback(workspaceId, id, version);
  }

  /** The scorecard's write: quality fields only, never a new version. */
  async setQuality(caller: Principal, workspaceId: string, id: string, quality: AgentSpec["quality"]): Promise<AgentSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.setQuality(workspaceId, id, quality);
  }

  async setStatus(caller: Principal, workspaceId: string, id: string, status: Exclude<AgentStatus, "hidden">): Promise<AgentSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.setStatus(workspaceId, id, status);
  }

  async hide(caller: Principal, workspaceId: string, id: string): Promise<AgentSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.hide(workspaceId, id);
  }

  async unhide(caller: Principal, workspaceId: string, id: string): Promise<AgentSpec> {
    await this.accounts.authorize(caller, workspaceId, "edit_agents");
    return this.registry.unhide(workspaceId, id);
  }

  /**
   * Nobody publishes as the platform outside its workspace, and a creator
   * account on record only owns agents in its own workspace.
   */
  private async checkOwner(workspaceId: string, owner: CreateInput["owner"]) {
    const creatorId = owner?.creatorId;
    const platform = owner?.kind === "platform" || creatorId === PLATFORM_CREATOR_ID;
    if (platform && workspaceId !== PLATFORM_WORKSPACE_ID) {
      throw new AccountError("forbidden", "Only the platform workspace can hold platform agents.");
    }
    const creator = typeof creatorId === "string" ? await this.accounts.store.creators.get(creatorId) : null;
    if (creator && creator.workspaceId !== workspaceId) throw new AccountError("forbidden", "That creator account belongs to another workspace.");
  }
}

export class GuardedRuns {
  constructor(
    private readonly engine: RunEngine,
    private readonly accounts: Accounts,
  ) {}

  /**
   * Runs an agent for a workspace the caller may run agents in. The agent
   * itself may live elsewhere only when it is public and live (the engine
   * checks that).
   */
  async submitRun(caller: Principal, req: SubmitRequest): Promise<PublicRun> {
    await this.accounts.authorize(caller, req?.workspaceId, "run_agents");
    return publicRunView(await this.engine.submitRun(req));
  }

  async getRun(caller: Principal, workspaceId: string, runId: string): Promise<PublicRun | null> {
    await this.accounts.authorize(caller, workspaceId, "view");
    const run = await this.engine.getRun(workspaceId, runId);
    return run ? publicRunView(run) : null;
  }

  async listRuns(caller: Principal, workspaceId: string, filter: RunFilter = {}): Promise<PublicRun[]> {
    await this.accounts.authorize(caller, workspaceId, "view");
    return (await this.engine.listRuns(workspaceId, filter)).map(publicRunView);
  }

  async waitForRun(caller: Principal, workspaceId: string, runId: string): Promise<PublicRun> {
    await this.accounts.authorize(caller, workspaceId, "view");
    return publicRunView(await this.engine.waitForRun(workspaceId, runId));
  }

  async cancelRun(caller: Principal, workspaceId: string, runId: string): Promise<PublicRun> {
    await this.accounts.authorize(caller, workspaceId, "run_agents");
    return publicRunView(await this.engine.cancelRun(workspaceId, runId));
  }

  async costTotals(caller: Principal, workspaceId: string) {
    await this.accounts.authorize(caller, workspaceId, "see_costs");
    return this.engine.costTotals(workspaceId);
  }
}
