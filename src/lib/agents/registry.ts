/**
 * The agent registry: create, update, read, list, roll back and hide agents.
 * Every call is scoped to one workspace. Every save of a body is a new
 * immutable version, and nothing invalid is ever stored.
 */
import { join } from "node:path";
import { bumpSemver, compareSemver, highestSemver, type Bump } from "./semver";
import {
  BODY_KEYS,
  formatIssues,
  qualitySchema,
  validateAgentBody,
  validateAgentSpec,
  type AgentBody,
  type AgentBodyInput,
  type AgentSpec,
  type AgentSpecInput,
  type AgentStatus,
  type AgentVisibility,
} from "./spec";
import { jsonFileStore, type AgentRow, type AgentStore, type VersionRow } from "./store";

export type RegistryErrorCode =
  | "invalid_spec"
  | "invalid_workspace"
  | "not_found"
  | "already_exists"
  | "version_conflict"
  | "no_change";

export class RegistryError extends Error {
  constructor(
    readonly code: RegistryErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(issues.length ? `${message}\n- ${issues.join("\n- ")}` : message);
    this.name = "RegistryError";
  }
}

/** A new agent. Quality is never set by the caller; the scorecard owns it. */
export type CreateInput = Omit<AgentSpecInput, "quality">;

/** Body fields to change. Anything left out is kept from the current version. */
export type UpdateInput = Partial<Omit<AgentBodyInput, "id">>;

export type ListFilter = {
  /** A creator id. */
  owner?: string;
  status?: AgentStatus | AgentStatus[];
  category?: AgentSpec["category"];
  visibility?: AgentVisibility;
};

export type VersionInfo = { version: string; note: string | null; by: string | null; createdAt: string; current: boolean };

/** Options on a save: the change note and who saved it. */
export type SaveOptions = { note?: string; by?: string | null };

const WORKSPACE_ID = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export function isWorkspaceId(id: unknown): id is string {
  return typeof id === "string" && WORKSPACE_ID.test(id);
}

function bodyOf(spec: AgentSpec | AgentBody): AgentBody {
  return Object.fromEntries(BODY_KEYS.map((k) => [k, spec[k]])) as AgentBody;
}

function sameBody(a: AgentBody, b: AgentBody): boolean {
  return JSON.stringify({ ...a, version: "" }) === JSON.stringify({ ...b, version: "" });
}

export class AgentRegistry {
  constructor(
    private readonly store: AgentStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async create(workspaceId: string, input: CreateInput, opts: SaveOptions = {}): Promise<AgentSpec> {
    this.checkWorkspace(workspaceId);
    const result = validateAgentSpec({ ...input, quality: undefined });
    if (!result.ok) throw new RegistryError("invalid_spec", "The agent spec is not valid.", result.errors);
    const spec = result.value;

    if (await this.store.getAgent(workspaceId, spec.id)) {
      throw new RegistryError("already_exists", `An agent with id "${spec.id}" already exists in this workspace.`);
    }

    const at = this.now();
    const row: AgentRow = {
      workspaceId,
      id: spec.id,
      owner: spec.owner,
      status: spec.status,
      visibility: spec.visibility,
      quality: spec.quality,
      currentVersion: spec.version,
      statusBeforeHide: null,
      createdAt: at,
      updatedAt: at,
    };
    await this.store.save(row, this.versionRow(workspaceId, bodyOf(spec), opts, at));
    return spec;
  }

  /**
   * Saves a new immutable version and makes it current. The version is the one
   * given in `changes`, which must be higher than every existing version, or
   * else the highest existing version bumped by `bump` (patch by default).
   */
  async update(
    workspaceId: string,
    id: string,
    changes: UpdateInput,
    opts: SaveOptions & { bump?: Bump } = {},
  ): Promise<AgentSpec> {
    const row = await this.requireAgent(workspaceId, id);
    if ("id" in changes && (changes as { id?: unknown }).id !== id) {
      throw new RegistryError("invalid_spec", "An agent's id cannot change. Create a new agent instead.");
    }
    const current = await this.requireVersion(workspaceId, id, row.currentVersion);
    const highest = highestSemver((await this.store.listVersions(workspaceId, id)).map((v) => v.version))!;

    const version = changes.version ?? bumpSemver(highest, opts.bump ?? "patch");
    const checked = validateAgentBody({ ...current.body, ...changes, id, version });
    if (!checked.ok) throw new RegistryError("invalid_spec", "The agent spec is not valid.", checked.errors);
    if (compareSemver(version, highest) <= 0) {
      throw new RegistryError(
        "version_conflict",
        `Version ${version} is not higher than the newest version ${highest}. Versions never repeat or go back; use rollback to serve an earlier one.`,
      );
    }
    if (sameBody(checked.value, current.body)) {
      throw new RegistryError("no_change", `Nothing changed from version ${current.version}.`);
    }

    const at = this.now();
    const next: AgentRow = { ...row, currentVersion: version, updatedAt: at };
    await this.store.save(next, this.versionRow(workspaceId, checked.value, opts, at));
    return this.compose(next, checked.value);
  }

  /** The current version, or a given one. Null when either does not exist. */
  async get(workspaceId: string, id: string, version?: string): Promise<AgentSpec | null> {
    this.checkWorkspace(workspaceId);
    const row = await this.store.getAgent(workspaceId, id);
    if (!row) return null;
    const v = await this.store.getVersion(workspaceId, id, version ?? row.currentVersion);
    return v ? this.compose(row, v.body) : null;
  }

  /** Current versions of the workspace's agents, sorted by id. */
  async list(workspaceId: string, filter: ListFilter = {}): Promise<AgentSpec[]> {
    this.checkWorkspace(workspaceId);
    const statuses = filter.status === undefined ? undefined : [filter.status].flat();
    const rows = (await this.store.listAgents(workspaceId))
      .filter((r) => filter.owner === undefined || r.owner.creatorId === filter.owner)
      .filter((r) => statuses === undefined || statuses.includes(r.status))
      .filter((r) => filter.visibility === undefined || r.visibility === filter.visibility)
      .sort((a, b) => a.id.localeCompare(b.id));

    const specs: AgentSpec[] = [];
    for (const row of rows) {
      const v = await this.requireVersion(workspaceId, row.id, row.currentVersion);
      if (filter.category === undefined || v.body.category === filter.category) specs.push(this.compose(row, v.body));
    }
    return specs;
  }

  /** The listing rows of a workspace's agents, with timestamps: for builder and admin screens. */
  async rows(workspaceId: string): Promise<AgentRow[]> {
    this.checkWorkspace(workspaceId);
    return (await this.store.listAgents(workspaceId)).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Every version, oldest first. */
  async versions(workspaceId: string, id: string): Promise<VersionInfo[]> {
    const row = await this.requireAgent(workspaceId, id);
    return (await this.store.listVersions(workspaceId, id))
      .sort((a, b) => compareSemver(a.version, b.version))
      .map((v) => ({ version: v.version, note: v.note, by: v.by ?? null, createdAt: v.createdAt, current: v.version === row.currentVersion }));
  }

  /**
   * Writes the quality fields (score, runs, last scored) on the listing. No
   * version is made, and "last edited" does not move: a score is not an edit.
   */
  async setQuality(workspaceId: string, id: string, quality: AgentSpec["quality"]): Promise<AgentSpec> {
    const row = await this.requireAgent(workspaceId, id);
    const checked = qualitySchema.safeParse(quality);
    if (!checked.success) throw new RegistryError("invalid_spec", "The quality fields are not valid.", formatIssues(checked.error));
    const next: AgentRow = { ...row, quality: checked.data };
    await this.store.save(next);
    const v = await this.requireVersion(workspaceId, id, row.currentVersion);
    return this.compose(next, v.body);
  }

  /**
   * Serves an earlier (or later) existing version again. No version is
   * created or deleted; the next update still has to go above the highest one.
   */
  async rollback(workspaceId: string, id: string, version: string): Promise<AgentSpec> {
    const row = await this.requireAgent(workspaceId, id);
    const v = await this.requireVersion(workspaceId, id, version);
    const next: AgentRow = { ...row, currentVersion: v.version, updatedAt: this.now() };
    if (row.currentVersion !== v.version) await this.store.save(next);
    return this.compose(next, v.body);
  }

  /** Moves a draft to live, or live back to draft. Use hide and unhide for hidden. */
  async setStatus(workspaceId: string, id: string, status: Exclude<AgentStatus, "hidden">): Promise<AgentSpec> {
    const row = await this.requireAgent(workspaceId, id);
    return this.saveListing({ ...row, status, statusBeforeHide: null });
  }

  /** Built and kept, but out of every list a user sees, until unhidden. */
  async hide(workspaceId: string, id: string): Promise<AgentSpec> {
    const row = await this.requireAgent(workspaceId, id);
    if (row.status === "hidden") return this.saveListing(row, false);
    return this.saveListing({ ...row, status: "hidden", statusBeforeHide: row.status });
  }

  /** Back to the status it had before hide, or live if it was created hidden. */
  async unhide(workspaceId: string, id: string): Promise<AgentSpec> {
    const row = await this.requireAgent(workspaceId, id);
    if (row.status !== "hidden") return this.saveListing(row, false);
    return this.saveListing({ ...row, status: row.statusBeforeHide ?? "live", statusBeforeHide: null });
  }

  /* ---------- helpers ---------- */

  private checkWorkspace(workspaceId: string) {
    if (!isWorkspaceId(workspaceId)) {
      throw new RegistryError(
        "invalid_workspace",
        `Workspace id ${JSON.stringify(workspaceId)} is not valid. Use 2 to 64 lowercase letters, digits, _ or -.`,
      );
    }
  }

  private async requireAgent(workspaceId: string, id: string): Promise<AgentRow> {
    this.checkWorkspace(workspaceId);
    const row = await this.store.getAgent(workspaceId, id);
    if (!row) throw new RegistryError("not_found", `No agent "${id}" in this workspace.`);
    return row;
  }

  private async requireVersion(workspaceId: string, id: string, version: string): Promise<VersionRow> {
    const v = await this.store.getVersion(workspaceId, id, version);
    if (!v) throw new RegistryError("not_found", `Agent "${id}" has no version ${version}.`);
    return v;
  }

  private async saveListing(row: AgentRow, changed = true): Promise<AgentSpec> {
    const next = changed ? { ...row, updatedAt: this.now() } : row;
    if (changed) await this.store.save(next);
    const v = await this.requireVersion(row.workspaceId, row.id, row.currentVersion);
    return this.compose(next, v.body);
  }

  private versionRow(workspaceId: string, body: AgentBody, opts: SaveOptions, at: string): VersionRow {
    return { workspaceId, agentId: body.id, version: body.version, body, note: opts.note ?? null, by: opts.by ?? null, createdAt: at };
  }

  private compose(row: AgentRow, body: AgentBody): AgentSpec {
    return { ...body, owner: row.owner, status: row.status, visibility: row.visibility, quality: row.quality };
  }
}

/** The registry on the local JSON store in .data/ (or WOVI_DATA_DIR). */
export function localRegistry(dataDir = process.env.WOVI_DATA_DIR ?? join(process.cwd(), ".data")): AgentRegistry {
  return new AgentRegistry(jsonFileStore(join(dataDir, "agents.json")));
}
