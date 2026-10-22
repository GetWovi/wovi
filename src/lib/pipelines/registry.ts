/**
 * The pipeline registry: create, update, read, list, roll back and publish
 * pipelines. Versioned like agents: every save of a body is a new immutable
 * version, nothing invalid is ever stored, and every call is scoped to one
 * workspace. A save is validated against the agents it names, in the
 * pipeline's own workspace or the platform's public live ones.
 */
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { AgentRegistry, isWorkspaceId } from "@/lib/agents/registry";
import { bumpSemver, compareSemver, highestSemver, type Bump } from "@/lib/agents/semver";
import type { AgentSpec, AgentStatus } from "@/lib/agents/spec";
import { PipelineError } from "./errors";
import { bodyOfPipeline, parsePipelineBody, parsePipelineSpec, type PipelineBody, type PipelineBodyInput, type PipelineSpec, type PipelineSpecInput } from "./spec";
import type { PipelineRow, PipelineStore, PipelineVersionRow } from "./store";
import { checkPipeline, type AgentLookup, type AgentShape } from "./validate";

export type PipelineCreateInput = PipelineSpecInput;
export type PipelineUpdateInput = Partial<Omit<PipelineBodyInput, "id">>;
export type PipelineVersionInfo = { version: string; note: string | null; by: string | null; createdAt: string; current: boolean };
export type PipelineSaveOptions = { note?: string; by?: string | null };

/** An agent a pipeline step resolved to: where it lives and the exact version. */
export type ResolvedAgent = { workspaceId: string; spec: AgentSpec };

const rowId = (ws: string, id: string) => `${ws}:${id}`;
const versionId = (ws: string, id: string, v: string) => `${ws}:${id}@${v}`;
const isPublicLive = (s: AgentSpec) => s.visibility === "public" && s.status === "live";

export class PipelineRegistry {
  constructor(
    private readonly store: PipelineStore,
    readonly agents: AgentRegistry,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /**
   * The agent a step names, as a pipeline in `workspaceId` may use it: the
   * workspace's own agent, else the platform's when it is public and live.
   * "current" is the current version at this moment.
   */
  async resolveAgent(workspaceId: string, id: string, version: string): Promise<ResolvedAgent | null> {
    const exact = version === "current" ? undefined : version;
    const own = await this.agents.get(workspaceId, id, exact);
    if (own) return { workspaceId, spec: own };
    if (workspaceId === PLATFORM_WORKSPACE_ID) return null;
    const platform = await this.agents.get(PLATFORM_WORKSPACE_ID, id, exact);
    // The listing (status, visibility) is the current one, so a pinned old version of a live agent still runs.
    return platform && isPublicLive(platform) ? { workspaceId: PLATFORM_WORKSPACE_ID, spec: platform } : null;
  }

  /** Every agent the body names, resolved, and a lookup for the validator. */
  async lookupFor(workspaceId: string, body: Pick<PipelineBody, "steps">): Promise<{ lookup: AgentLookup; resolved: Map<string, ResolvedAgent> }> {
    const resolved = new Map<string, ResolvedAgent>();
    for (const s of body.steps ?? []) {
      const k = `${s.agent?.id}@${s.agent?.version}`;
      if (resolved.has(k) || typeof s.agent?.id !== "string" || typeof s.agent?.version !== "string") continue;
      const r = await this.resolveAgent(workspaceId, s.agent.id, s.agent.version).catch(() => null);
      if (r) resolved.set(k, r);
    }
    return { resolved, lookup: (id, v) => (resolved.get(`${id}@${v}`)?.spec as AgentShape | undefined) ?? null };
  }

  async create(workspaceId: string, input: PipelineCreateInput, opts: PipelineSaveOptions = {}): Promise<PipelineSpec> {
    this.checkWorkspace(workspaceId);
    const parsed = parsePipelineSpec(input);
    if (!parsed.ok) throw new PipelineError("invalid_pipeline", "The pipeline is not valid.", parsed.errors);
    const spec = parsed.value;
    await this.checkReferences(workspaceId, spec);
    if (await this.store.pipelines.get(rowId(workspaceId, spec.id))) {
      throw new PipelineError("already_exists", `A pipeline with id "${spec.id}" already exists in this workspace.`);
    }
    const at = this.now();
    const row: PipelineRow = {
      id: rowId(workspaceId, spec.id),
      workspaceId,
      pipelineId: spec.id,
      owner: spec.owner,
      status: spec.status,
      visibility: spec.visibility,
      currentVersion: spec.version,
      statusBeforeHide: null,
      createdAt: at,
      updatedAt: at,
    };
    await this.store.pipelineVersions.insert(this.versionRow(workspaceId, bodyOfPipeline(spec), opts, at));
    await this.store.pipelines.insert(row);
    return spec;
  }

  /** A new immutable version that becomes current: the one in `changes`, or the highest bumped (patch by default). */
  async update(workspaceId: string, id: string, changes: PipelineUpdateInput, opts: PipelineSaveOptions & { bump?: Bump } = {}): Promise<PipelineSpec> {
    const row = await this.requireRow(workspaceId, id);
    if ("id" in changes && (changes as { id?: unknown }).id !== id) throw new PipelineError("invalid_pipeline", "A pipeline's id cannot change. Create a new one instead.");
    const current = await this.requireVersion(workspaceId, id, row.currentVersion);
    const highest = highestSemver((await this.store.pipelineVersions.find({ workspaceId, pipelineId: id })).map((v) => v.version))!;
    const version = changes.version ?? bumpSemver(highest, opts.bump ?? "patch");
    const parsed = parsePipelineBody({ ...current.body, ...changes, id, version });
    if (!parsed.ok) throw new PipelineError("invalid_pipeline", "The pipeline is not valid.", parsed.errors);
    await this.checkReferences(workspaceId, parsed.value);
    if (compareSemver(version, highest) <= 0) {
      throw new PipelineError("version_conflict", `Version ${version} is not higher than the newest version ${highest}. Versions never repeat or go back.`);
    }
    if (JSON.stringify({ ...parsed.value, version: "" }) === JSON.stringify({ ...current.body, version: "" })) {
      throw new PipelineError("no_change", `Nothing changed from version ${current.version}.`);
    }
    const at = this.now();
    await this.store.pipelineVersions.insert(this.versionRow(workspaceId, parsed.value, opts, at));
    const next: PipelineRow = { ...row, currentVersion: version, updatedAt: at };
    await this.store.pipelines.update(next);
    return this.compose(next, parsed.value);
  }

  async get(workspaceId: string, id: string, version?: string): Promise<PipelineSpec | null> {
    if (!isWorkspaceId(workspaceId)) return null;
    const row = await this.store.pipelines.get(rowId(workspaceId, id));
    if (!row) return null;
    const v = await this.store.pipelineVersions.get(versionId(workspaceId, id, version ?? row.currentVersion));
    return v ? this.compose(row, v.body) : null;
  }

  /** Current versions, sorted by name. */
  async list(workspaceId: string, filter: { status?: AgentStatus | AgentStatus[] } = {}): Promise<PipelineSpec[]> {
    this.checkWorkspace(workspaceId);
    const statuses = filter.status === undefined ? undefined : [filter.status].flat();
    const out: PipelineSpec[] = [];
    for (const row of await this.store.pipelines.find({ workspaceId })) {
      if (statuses && !statuses.includes(row.status)) continue;
      const v = await this.requireVersion(workspaceId, row.pipelineId, row.currentVersion);
      out.push(this.compose(row, v.body));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async rows(workspaceId: string): Promise<PipelineRow[]> {
    this.checkWorkspace(workspaceId);
    return (await this.store.pipelines.find({ workspaceId })).sort((a, b) => a.pipelineId.localeCompare(b.pipelineId));
  }

  async versions(workspaceId: string, id: string): Promise<PipelineVersionInfo[]> {
    const row = await this.requireRow(workspaceId, id);
    return (await this.store.pipelineVersions.find({ workspaceId, pipelineId: id }))
      .sort((a, b) => compareSemver(a.version, b.version))
      .map((v) => ({ version: v.version, note: v.note, by: v.by, createdAt: v.createdAt, current: v.version === row.currentVersion }));
  }

  async rollback(workspaceId: string, id: string, version: string): Promise<PipelineSpec> {
    const row = await this.requireRow(workspaceId, id);
    const v = await this.requireVersion(workspaceId, id, version);
    const next: PipelineRow = { ...row, currentVersion: v.version, updatedAt: this.now() };
    if (row.currentVersion !== v.version) await this.store.pipelines.update(next);
    return this.compose(next, v.body);
  }

  async setStatus(workspaceId: string, id: string, status: AgentStatus): Promise<PipelineSpec> {
    const row = await this.requireRow(workspaceId, id);
    const next: PipelineRow = { ...row, status, statusBeforeHide: status === "hidden" ? row.status : null, updatedAt: this.now() };
    await this.store.pipelines.update(next);
    const v = await this.requireVersion(workspaceId, id, row.currentVersion);
    return this.compose(next, v.body);
  }

  /* ---------- helpers ---------- */

  private async checkReferences(workspaceId: string, body: PipelineBody) {
    const { lookup } = await this.lookupFor(workspaceId, body);
    const errors = checkPipeline(body, lookup);
    if (errors.length) throw new PipelineError("invalid_pipeline", "The pipeline is not valid.", errors);
  }

  private versionRow(workspaceId: string, body: PipelineBody, opts: PipelineSaveOptions, at: string): PipelineVersionRow {
    return { id: versionId(workspaceId, body.id, body.version), workspaceId, pipelineId: body.id, version: body.version, body, note: opts.note ?? null, by: opts.by ?? null, createdAt: at };
  }

  private compose(row: PipelineRow, body: PipelineBody): PipelineSpec {
    return { ...structuredClone(body), owner: row.owner, status: row.status, visibility: row.visibility };
  }

  private checkWorkspace(workspaceId: string) {
    if (!isWorkspaceId(workspaceId)) throw new PipelineError("invalid_workspace", `Workspace id ${JSON.stringify(workspaceId)} is not valid.`);
  }

  private async requireRow(workspaceId: string, id: string): Promise<PipelineRow> {
    this.checkWorkspace(workspaceId);
    const row = await this.store.pipelines.get(rowId(workspaceId, id));
    if (!row) throw new PipelineError("not_found", `No pipeline "${id}" in this workspace.`);
    return row;
  }

  private async requireVersion(workspaceId: string, id: string, version: string): Promise<PipelineVersionRow> {
    const v = await this.store.pipelineVersions.get(versionId(workspaceId, id, version));
    if (!v) throw new PipelineError("not_found", `Pipeline "${id}" has no version ${version}.`);
    return v;
  }
}
