/**
 * Storage for runs, behind a small interface like the agent store. In memory
 * for tests, one JSON file in .data/ for local work. A Postgres store
 * implements the same interface later; nothing else changes.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Run, RunStatus } from "./run";

export type RunFilter = { agentId?: string; status?: RunStatus | RunStatus[]; limit?: number };

export interface RunStore {
  /** Refuses a run id that exists, or an idempotency key the workspace already used. */
  insert(run: Run): Promise<void>;
  update(run: Run): Promise<void>;
  get(workspaceId: string, id: string): Promise<Run | null>;
  /** Newest first. */
  list(workspaceId: string, filter?: RunFilter): Promise<Run[]>;
  findByIdempotencyKey(workspaceId: string, key: string): Promise<Run | null>;
  /** Across all workspaces. Used to pick up queued runs after a restart. */
  listByStatus(statuses: RunStatus[]): Promise<Run[]>;
  /**
   * Every run of one agent, across all workspaces, newest first. For the
   * agent's public scorecard and the builder's roll-up (phase 12), which
   * show counts and averages, never another workspace's runs.
   */
  listForAgent(agentWorkspaceId: string, agentId: string): Promise<Run[]>;
}

const clone = <T>(v: T): T => structuredClone(v);

function ops(load: () => Run[], save: (runs: Run[]) => void): RunStore {
  return {
    async insert(run) {
      const runs = load();
      if (runs.some((r) => r.id === run.id)) throw new Error(`Run ${run.id} already exists.`);
      if (run.idempotencyKey && runs.some((r) => r.workspaceId === run.workspaceId && r.idempotencyKey === run.idempotencyKey)) {
        throw new Error(`Idempotency key ${run.idempotencyKey} is already used in this workspace.`);
      }
      runs.push(clone(run));
      save(runs);
    },
    async update(run) {
      const runs = load();
      const i = runs.findIndex((r) => r.id === run.id && r.workspaceId === run.workspaceId);
      if (i === -1) throw new Error(`Run ${run.id} does not exist.`);
      runs[i] = clone(run);
      save(runs);
    },
    async get(workspaceId, id) {
      const run = load().find((r) => r.workspaceId === workspaceId && r.id === id);
      return run ? clone(run) : null;
    },
    async list(workspaceId, filter = {}) {
      const statuses = filter.status === undefined ? undefined : [filter.status].flat();
      const runs = load()
        .filter((r) => r.workspaceId === workspaceId)
        .filter((r) => filter.agentId === undefined || r.agent.id === filter.agentId)
        .filter((r) => statuses === undefined || statuses.includes(r.status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return clone(filter.limit ? runs.slice(0, filter.limit) : runs);
    },
    async findByIdempotencyKey(workspaceId, key) {
      const run = load().find((r) => r.workspaceId === workspaceId && r.idempotencyKey === key);
      return run ? clone(run) : null;
    },
    async listByStatus(statuses) {
      return clone(load().filter((r) => statuses.includes(r.status)));
    },
    async listForAgent(agentWorkspaceId, agentId) {
      return clone(
        load()
          .filter((r) => r.agent.workspaceId === agentWorkspaceId && r.agent.id === agentId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)),
      );
    },
  };
}

export function memoryRunStore(): RunStore {
  let runs: Run[] = [];
  return ops(
    () => runs,
    (next) => {
      runs = next;
    },
  );
}

/**
 * One JSON file on disk, for local work. Writes go through a temp file and a
 * rename, so a crash never leaves half a file. One process only.
 */
export function jsonFileRunStore(file: string): RunStore {
  const load = (): Run[] => {
    try {
      return (JSON.parse(readFileSync(file, "utf8")) as { runs: Run[] }).runs;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  };
  const save = (runs: Run[]) => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ runs }, null, 2) + "\n");
    renameSync(tmp, file);
  };
  return ops(load, save);
}
