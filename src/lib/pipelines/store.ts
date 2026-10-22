/**
 * Storage for pipelines and their runs, on the shared Collection interface:
 * memory for tests, one JSON file in .data/ for local work, a Postgres store
 * later. Every row carries its workspace id.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { AgentStatus, AgentVisibility } from "@/lib/agents/spec";
import type { PipelineRun } from "./run";
import type { PipelineBody, PipelineSpec } from "./spec";

/** The listing of one pipeline. Not versioned. */
export type PipelineRow = {
  /** `${workspaceId}:${pipelineId}` */
  id: string;
  workspaceId: string;
  pipelineId: string;
  owner: PipelineSpec["owner"];
  status: AgentStatus;
  visibility: AgentVisibility;
  currentVersion: string;
  statusBeforeHide: AgentStatus | null;
  createdAt: string;
  updatedAt: string;
};

/** One immutable version of a pipeline's body. */
export type PipelineVersionRow = {
  /** `${workspaceId}:${pipelineId}@${version}` */
  id: string;
  workspaceId: string;
  pipelineId: string;
  version: string;
  body: PipelineBody;
  note: string | null;
  /** Who saved it: a user id, `key:<id>`, or null for the templates. */
  by: string | null;
  createdAt: string;
};

export type PipelineStore = {
  pipelines: Collection<PipelineRow>;
  pipelineVersions: Collection<PipelineVersionRow>;
  pipelineRuns: Collection<PipelineRun>;
};

const TABLES = ["pipelines", "pipelineVersions", "pipelineRuns"] as const satisfies readonly (keyof PipelineStore)[];

export function memoryPipelineStore(): PipelineStore {
  return memoryTables<PipelineStore>(TABLES);
}

export function jsonFilePipelineStore(file: string): PipelineStore {
  return jsonFileTables<PipelineStore>(file, TABLES);
}
