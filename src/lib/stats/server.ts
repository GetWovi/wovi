/**
 * The Next.js side of live stats and releases: one of each per server process
 * on the local stores, sharing the app's run engine and pipelines. The canary
 * check listens to the engine from first use, so a canary that turns clearly
 * worse is stopped as runs finish.
 */
import { accounts, appEngine } from "@/lib/accounts/server";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { appPipelines } from "@/lib/pipelines/server";
import type { TeamDecisionEvent } from "@/lib/team/team";
import { feedbackForDecision } from "./feedback";
import { localStats } from "./local";

type Stats = ReturnType<typeof localStats>;
const g = globalThis as { __woviStats?: Stats };

function stats(): Stats {
  if (!g.__woviStats) {
    const engine = appEngine();
    g.__woviStats = localStats(dataDirFromEnv(), {
      accounts: accounts(),
      engine,
      pipelines: appPipelines().engine,
      // Loaded when first asked, so the builder and stats never import each other at start.
      requireBuilder: async (caller) => (await import("@/lib/builder/server")).appBuilder().requireBuilder(caller),
    });
    const releases = g.__woviStats.releases;
    engine.onFinished((run) => {
      if (run.release) void releases.check(run.agent.workspaceId, run.agent.id).catch((err) => console.error("The canary check failed:", err));
    });
  }
  return g.__woviStats;
}

export const appStats = () => stats().stats;
export const appFeedback = () => stats().feedback;
export const appReleases = () => stats().releases;

/** Team.onDecided: an approval is a use, a change request a regenerate. */
export async function recordDecision(e: TeamDecisionEvent): Promise<void> {
  await feedbackForDecision(appFeedback(), e);
}
