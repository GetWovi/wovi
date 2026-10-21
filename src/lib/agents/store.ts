/**
 * Storage behind the registry. The registry only talks to the AgentStore
 * interface, so the JSON file store can be swapped for Postgres later without
 * touching the registry or its callers. Every row carries a workspace id.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentBody, AgentListing, AgentStatus } from "./spec";

/** One agent's identity and listing. Changes here never make a new version. */
export type AgentRow = AgentListing & {
  workspaceId: string;
  id: string;
  /** The version get() returns by default. Moves on every save and on rollback. */
  currentVersion: string;
  /** While hidden: the status to return to on unhide. Otherwise null. */
  statusBeforeHide: Exclude<AgentStatus, "hidden"> | null;
  createdAt: string;
  updatedAt: string;
};

/** One immutable snapshot of an agent's body. Never changed after it is written. */
export type VersionRow = {
  workspaceId: string;
  agentId: string;
  version: string;
  body: AgentBody;
  note: string | null;
  /** Who saved it: a user id, or null for seeds and scripts. */
  by?: string | null;
  createdAt: string;
};

export interface AgentStore {
  getAgent(workspaceId: string, id: string): Promise<AgentRow | null>;
  listAgents(workspaceId: string): Promise<AgentRow[]>;
  getVersion(workspaceId: string, agentId: string, version: string): Promise<VersionRow | null>;
  listVersions(workspaceId: string, agentId: string): Promise<VersionRow[]>;
  /**
   * Writes the agent row, and the new version row when given, in one step.
   * Must refuse a version row that already exists.
   */
  save(agent: AgentRow, newVersion?: VersionRow): Promise<void>;
}

type Data = { agents: AgentRow[]; versions: VersionRow[] };

const clone = <T>(v: T): T => structuredClone(v);

function apply(data: Data, agent: AgentRow, newVersion?: VersionRow) {
  if (newVersion) {
    const exists = data.versions.some(
      (v) => v.workspaceId === newVersion.workspaceId && v.agentId === newVersion.agentId && v.version === newVersion.version,
    );
    if (exists) throw new Error(`Version ${newVersion.version} of ${newVersion.agentId} already exists.`);
    data.versions.push(clone(newVersion));
  }
  const i = data.agents.findIndex((a) => a.workspaceId === agent.workspaceId && a.id === agent.id);
  if (i === -1) data.agents.push(clone(agent));
  else data.agents[i] = clone(agent);
}

function reader(load: () => Data) {
  return {
    async getAgent(workspaceId: string, id: string) {
      const row = load().agents.find((a) => a.workspaceId === workspaceId && a.id === id);
      return row ? clone(row) : null;
    },
    async listAgents(workspaceId: string) {
      return clone(load().agents.filter((a) => a.workspaceId === workspaceId));
    },
    async getVersion(workspaceId: string, agentId: string, version: string) {
      const row = load().versions.find((v) => v.workspaceId === workspaceId && v.agentId === agentId && v.version === version);
      return row ? clone(row) : null;
    },
    async listVersions(workspaceId: string, agentId: string) {
      return clone(load().versions.filter((v) => v.workspaceId === workspaceId && v.agentId === agentId));
    },
  };
}

/** In memory. Used by tests. */
export function memoryStore(): AgentStore {
  const data: Data = { agents: [], versions: [] };
  return {
    ...reader(() => data),
    async save(agent, newVersion) {
      apply(data, agent, newVersion);
    },
  };
}

/**
 * One JSON file on disk, for local work. Reads the file on each call and
 * writes through a temp file and a rename, so a crash never leaves half a file.
 * Fine for one process; not meant for concurrent writers.
 */
export function jsonFileStore(file: string): AgentStore {
  const load = (): Data => {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as Data;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { agents: [], versions: [] };
      throw err;
    }
  };
  return {
    ...reader(load),
    async save(agent, newVersion) {
      const data = load();
      apply(data, agent, newVersion);
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
      renameSync(tmp, file);
    },
  };
}
