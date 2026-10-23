/**
 * The Next.js side of the quality system (phase 12): one QualityService per
 * server process on the local stores, sharing the app's run engine.
 */
import { join } from "node:path";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { appEngine } from "@/lib/accounts/server";
import { jsonFileAppStore } from "@/lib/app/store";
import { appBuilder } from "@/lib/builder/server";
import { jsonFileBuilderStore } from "@/lib/builder/store";
import { jsonFileTeamStore } from "@/lib/team/store";
import { localSafetyStore } from "@/lib/safety/local";
import { QualityService } from "./service";

const g = globalThis as { __woviQuality?: QualityService };

export function appQuality(): QualityService {
  if (!g.__woviQuality) {
    const dir = dataDirFromEnv();
    const team = jsonFileTeamStore(join(dir, "team.json"));
    g.__woviQuality = new QualityService({
      runs: appEngine(),
      reviews: jsonFileAppStore(join(dir, "app.json")).reviews,
      items: team.items,
      activity: team.activity,
      ratings: jsonFileBuilderStore(join(dir, "builder.json")).ratings,
      requireBuilder: (caller) => appBuilder().requireBuilder(caller),
      // Phase 18: drafts and change notes reach the builder only from people who turned on "Use my edits to improve agents".
      mayLearnFrom: async (userId) => (await localSafetyStore(dir).consents.get(userId))?.improveAgents === true,
    });
  }
  return g.__woviQuality;
}
