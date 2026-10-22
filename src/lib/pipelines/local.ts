/**
 * Pipelines on the local JSON stores in .data/ (or WOVI_DATA_DIR): the
 * registry, the engine on a given run engine, and the guarded view.
 */
import { join } from "node:path";
import type { Accounts } from "@/lib/accounts/accounts";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { localBrandBrains } from "@/lib/builder/local";
import type { RunEngine } from "@/lib/runs/engine";
import { PipelineEngine } from "./engine";
import { GuardedPipelines } from "./guard";
import { PipelineRegistry } from "./registry";
import { jsonFilePipelineStore } from "./store";

export function localPipelines(accounts: Accounts, runs: RunEngine, dataDir = dataDirFromEnv()): GuardedPipelines {
  const store = jsonFilePipelineStore(join(dataDir, "pipelines.json"));
  const registry = new PipelineRegistry(store, localRegistry(dataDir));
  const engine = new PipelineEngine({ registry, runs, brandBrains: localBrandBrains(dataDir), store });
  return new GuardedPipelines(engine, accounts);
}
