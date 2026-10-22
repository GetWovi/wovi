import { describe, expect, it } from "vitest";
import { AGENTS } from "@/components/home/demo-data";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { AgentRegistry } from "./registry";
import { PLATFORM_CREATOR_ID, PLATFORM_WORKSPACE_ID, SEED_AGENTS, seedPlatformAgents } from "./seeds";
import { validateAgentSpec } from "./spec";
import { memoryStore } from "./store";

/** What `npm run agents:launch` leaves in the platform workspace: the launch specs over the phase 2 seeds. */
const LINEUP = [...LAUNCH_AGENTS, ...SEED_AGENTS.filter((s) => !LAUNCH_AGENTS.some((l) => l.id === s.id))];

describe("seed agents", () => {
  it.each(SEED_AGENTS.map((s) => [s.id, s] as const))("%s validates", (_id, seed) => {
    const r = validateAgentSpec(seed);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("matches the agents on the homepage: live ones live, Trend Scout coming (a draft), the video agents next (hidden)", () => {
    expect([...LINEUP.map((s) => s.name)].sort()).toEqual([...AGENTS.map((a) => a.name)].sort());
    for (const card of AGENTS) {
      const spec = LINEUP.find((s) => s.name === card.name)!;
      expect([card.name, spec.job]).toEqual([card.name, card.job]);
      expect([card.name, spec.status]).toEqual([card.name, card.status === "live" ? "live" : card.status === "coming" ? "draft" : "hidden"]);
    }
    // Live cards first, then the coming one, then the next ones, so the grid reads in order.
    const order = AGENTS.map((a) => a.status);
    expect(order).toEqual([...order].sort((a, b) => ["live", "coming", "next"].indexOf(a) - ["live", "coming", "next"].indexOf(b)));
  });

  it("are owned by the platform creator account and public", () => {
    for (const seed of SEED_AGENTS) {
      expect(seed.owner).toEqual({ kind: "platform", creatorId: PLATFORM_CREATOR_ID });
      expect(seed.visibility).toBe("public");
    }
  });

  it("seed into the platform workspace, and seeding again changes nothing", async () => {
    const reg = new AgentRegistry(memoryStore());
    const first = await seedPlatformAgents(reg);
    expect(first.created).toHaveLength(8);

    const second = await seedPlatformAgents(reg);
    expect(second.created).toEqual([]);
    expect(second.unchanged).toHaveLength(8);

    expect((await reg.list(PLATFORM_WORKSPACE_ID, { status: "live" })).map((a) => a.id)).toEqual([
      "caption-writer",
      "hashtag-picker",
      "hook-writer",
      "repurposer",
      "script-writer",
      "trend-scout",
    ]);
    expect((await reg.list(PLATFORM_WORKSPACE_ID, { status: "hidden" })).map((a) => a.id)).toEqual(["storyboarder", "voice-and-cut"]);
  });
});
