/**
 * The Next.js side of review and teams (phase 11): one Team per server
 * process on the local stores, sharing the app's run engine, pipelines and
 * Brand Brains.
 */
import { join } from "node:path";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { accounts, appEngine } from "@/lib/accounts/server";
import { localRegistry } from "@/lib/agents/registry";
import { jsonFileAppStore } from "@/lib/app/store";
import { appBrands } from "@/lib/brand/server";
import { appPipelines } from "@/lib/pipelines/server";
import { jsonFileTeamStore } from "./store";
import { Team } from "./team";

const g = globalThis as { __woviTeam?: Team };

export function appTeam(): Team {
  if (!g.__woviTeam) {
    const dir = dataDirFromEnv();
    g.__woviTeam = new Team({
      accounts: accounts(),
      runs: appEngine(),
      pipelines: appPipelines().engine,
      registry: localRegistry(dir),
      brands: appBrands(),
      app: jsonFileAppStore(join(dir, "app.json")),
      store: jsonFileTeamStore(join(dir, "team.json")),
    });
  }
  return g.__woviTeam;
}
