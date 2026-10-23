/**
 * Live stats and releases on the local JSON stores in a data dir. No Next.js
 * imports, so scripts and tests use them too; server.ts holds one of each per
 * server process.
 */
import { join } from "node:path";
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import { localRegistry } from "@/lib/agents/registry";
import { jsonFileBuilderStore } from "@/lib/builder/store";
import type { PipelineEngine } from "@/lib/pipelines/engine";
import type { RunEngine, VersionRouter } from "@/lib/runs/engine";
import { localSafetyStore } from "@/lib/safety/local";
import { jsonFileTeamStore } from "@/lib/team/store";
import { Feedback } from "./feedback";
import { Releases, storeRouter } from "./releases";
import { StatsService } from "./service";
import { jsonFileStatsStore, type StatsStore } from "./store";

export function localStatsStore(dataDir: string): StatsStore {
  return jsonFileStatsStore(join(dataDir, "stats.json"));
}

/** The canary router on the data dir's releases, for the run engine. Reads only; writes nothing. */
export function localRouter(dataDir: string): VersionRouter {
  return storeRouter(localStatsStore(dataDir));
}

/** Test workspaces whose runs never count: WOVI_STATS_EXCLUDE_WORKSPACES, comma separated. */
export function excludedWorkspacesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.WOVI_STATS_EXCLUDE_WORKSPACES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type LocalStatsDeps = {
  accounts: Accounts;
  engine: RunEngine;
  pipelines?: PipelineEngine | null;
  requireBuilder: (caller: Principal) => Promise<unknown>;
  env?: NodeJS.ProcessEnv;
};

export function localStats(dataDir: string, deps: LocalStatsDeps) {
  const store = localStatsStore(dataDir);
  const safety = localSafetyStore(dataDir);
  const team = jsonFileTeamStore(join(dataDir, "team.json"));
  const builderStore = jsonFileBuilderStore(join(dataDir, "builder.json"));
  // Phase 18: edit text and rating notes reach builders only from people who turned on "Use my edits to improve agents".
  const mayLearnFrom = async (userId: string) => (await safety.consents.get(userId))?.improveAgents === true;
  const stats = new StatsService({
    store,
    runs: deps.engine,
    builders: async () => new Set((await deps.accounts.store.users.find({})).filter((u) => deps.accounts.isBuilder(u)).map((u) => u.id)),
    makers: async () => new Map((await team.items.find({})).map((i) => [i.id, i.makerId])),
    excludedWorkspaces: excludedWorkspacesFromEnv(deps.env),
    mayLearnFrom,
    requireBuilder: deps.requireBuilder,
  });
  const releases = new Releases({ store, registry: localRegistry(dataDir), stats, benches: builderStore.benches, samples: builderStore.samples });
  const feedback = new Feedback({
    store,
    runs: deps.engine,
    mayLearnFrom,
    pipelineRuns: async (workspaceId, id) => {
      const pr = deps.pipelines ? await deps.pipelines.get(workspaceId, id) : null;
      return (pr?.steps ?? []).filter((s) => s.runId && (s.status === "done" || s.status === "flagged")).map((s) => s.runId!);
    },
    // A result people act on during a canary may tip the comparison: look at once.
    onRecorded: async (_row, run) => {
      if (run.release) await releases.check(run.agent.workspaceId, run.agent.id);
    },
  });
  return { store, stats, releases, feedback };
}
