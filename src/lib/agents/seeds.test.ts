import { describe, expect, it } from "vitest";
import { AGENTS } from "@/components/home/demo-data";
import { AgentRegistry } from "./registry";
import { PLATFORM_CREATOR_ID, PLATFORM_WORKSPACE_ID, SEED_AGENTS, seedPlatformAgents } from "./seeds";
import { validateAgentSpec } from "./spec";
import { memoryStore } from "./store";

describe("seed agents", () => {
  it.each(SEED_AGENTS.map((s) => [s.id, s] as const))("%s validates", (_id, seed) => {
    const r = validateAgentSpec(seed);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("matches the agents on the homepage, with the next ones hidden", () => {
    expect(SEED_AGENTS.map((s) => s.name)).toEqual(AGENTS.map((a) => a.name));
    for (const card of AGENTS) {
      const seed = SEED_AGENTS.find((s) => s.name === card.name)!;
      expect(seed.job).toBe(card.job);
      expect(seed.status).toBe(card.status === "live" ? "live" : "hidden");
    }
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
