import { describe, expect, it } from "vitest";
import { AgentRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID, seedPlatformAgents } from "@/lib/agents/seeds";
import { memoryStore } from "@/lib/agents/store";
import { goodSpec } from "@/lib/agents/test-helpers";
import { stubBrandBrains } from "@/lib/runs/brand-brain";
import { RunEngine } from "@/lib/runs/engine";
import { fakeProvider } from "@/lib/runs/providers/fake";
import { SAMPLE_RUNS } from "@/lib/runs/samples";
import { memoryRunStore } from "@/lib/runs/store";
import type { Principal } from "./accounts";
import { GuardedAgents, GuardedRuns } from "./guard";
import { rejectsCode, testAccounts } from "./test-helpers";

const as = (userId: string): Principal => ({ kind: "user", userId });

async function setup() {
  const t = testAccounts({ builderEmails: ["owner@example.com"] });
  const registry = new AgentRegistry(memoryStore());
  await seedPlatformAgents(registry);
  const engine = new RunEngine({ registry, store: memoryRunStore(), brandBrains: stubBrandBrains(), providers: { fake: fakeProvider() }, providerOverride: "fake" });
  const agents = new GuardedAgents(registry, t.accounts);
  const runs = new GuardedRuns(engine, t.accounts);

  const ada = (await t.signUp("ada@example.com")).user;
  const eve = (await t.signUp("eve@example.com")).user;
  const owner = (await t.signUp("owner@example.com")).user;
  const team = await t.accounts.workspaces.create(as(ada.id), "Team");
  await agents.create(as(ada.id), team.id, goodSpec());
  return { ...t, registry, engine, agents, runs, ada, eve, owner, team };
}

async function join(t: Awaited<ReturnType<typeof setup>>, email: string, role: "admin" | "editor" | "viewer") {
  const user = (await t.signUp(email)).user;
  await t.accounts.workspaces.invite(as(t.ada.id), t.team.id, email, role);
  await t.accounts.workspaces.acceptInvite(user.id, t.lastMail(email).token);
  return user;
}

describe("the registry behind the policy", () => {
  it("shows members their workspace's agents, as public views", async () => {
    const { agents, ada, team } = await setup();
    const list = await agents.list(as(ada.id), team.id);
    expect(list.map((a) => a.id)).toEqual(["test-agent"]);
    expect(list[0]).not.toHaveProperty("instructions");
    expect(list[0]).not.toHaveProperty("routing");
    expect((await agents.getForEdit(as(ada.id), team.id, "test-agent"))?.instructions).toContain("{{topic}}");
  });

  it("refuses another workspace's private agents, reads and writes alike", async () => {
    const { agents, eve, team } = await setup();
    expect(await agents.list(as(eve.id), team.id)).toEqual([]);
    expect(await agents.get(as(eve.id), team.id, "test-agent")).toBeNull();
    await rejectsCode(agents.getForEdit(as(eve.id), team.id, "test-agent"), "not_found");
    await rejectsCode(agents.update(as(eve.id), team.id, "test-agent", { name: "Mine now" }), "not_found");
    await rejectsCode(agents.create(as(eve.id), team.id, goodSpec({ id: "sneaky" })), "not_found");
    await rejectsCode(agents.hide(as(eve.id), team.id, "test-agent"), "not_found");
    await rejectsCode(agents.versions(as(eve.id), team.id, "test-agent"), "not_found");
  });

  it("shows anyone the platform's public live agents, and nothing hidden", async () => {
    const { agents, eve } = await setup();
    const list = await agents.list(as(eve.id), PLATFORM_WORKSPACE_ID);
    expect(list.map((a) => a.id)).toEqual(["caption-writer", "hashtag-picker", "hook-writer", "repurposer", "script-writer", "trend-scout"]);
    expect(await agents.get(as(eve.id), PLATFORM_WORKSPACE_ID, "storyboarder")).toBeNull();
    expect((await agents.get(as(eve.id), PLATFORM_WORKSPACE_ID, "hook-writer"))?.name).toBe("Hook Writer");
  });

  it("lets builders edit the platform's agents, and keeps platform ownership in its workspace", async () => {
    const { agents, owner, ada, team } = await setup();
    expect((await agents.list(as(owner.id), PLATFORM_WORKSPACE_ID)).length).toBe(8);
    await agents.update(as(owner.id), PLATFORM_WORKSPACE_ID, "hook-writer", { name: "Hook Writer Two" });
    await rejectsCode(agents.update(as(ada.id), PLATFORM_WORKSPACE_ID, "hook-writer", { name: "Mine" }), "not_found");
    await rejectsCode(
      agents.create(as(ada.id), team.id, goodSpec({ id: "fake-official", owner: { kind: "platform", creatorId: "creator_wovi" } })),
      "forbidden",
    );
    await rejectsCode(agents.create(as(ada.id), team.id, goodSpec({ id: "fake-two", owner: { kind: "creator", creatorId: "creator_wovi" } })), "forbidden");
  });

  it("lets viewers read but not edit", async () => {
    const t = await setup();
    const vi = await join(t, "vi@example.com", "viewer");
    expect((await t.agents.list(as(vi.id), t.team.id)).length).toBe(1);
    await rejectsCode(t.agents.update(as(vi.id), t.team.id, "test-agent", { name: "No" }), "forbidden");
    await rejectsCode(t.agents.getForEdit(as(vi.id), t.team.id, "test-agent"), "forbidden");
  });
});

describe("the engine behind the policy", () => {
  it("runs for members who may run agents, including the platform's public agents", async () => {
    const { runs, ada, team } = await setup();
    const own = await runs.submitRun(as(ada.id), { workspaceId: team.id, agentId: "test-agent", inputs: { topic: "A brand new bakery in town" } });
    expect((await runs.waitForRun(as(ada.id), team.id, own.id)).status).toBe("succeeded");
    expect(own).not.toHaveProperty("calls");

    const platform = await runs.submitRun(as(ada.id), {
      workspaceId: team.id,
      agentWorkspaceId: PLATFORM_WORKSPACE_ID,
      agentId: "hook-writer",
      inputs: SAMPLE_RUNS["hook-writer"].inputs,
    });
    expect((await runs.waitForRun(as(ada.id), team.id, platform.id)).status).toBe("succeeded");
    expect((await runs.listRuns(as(ada.id), team.id)).length).toBe(2);
  });

  it("refuses runs, reads and costs in a workspace the caller is not in", async () => {
    const { runs, ada, eve, team } = await setup();
    const run = await runs.submitRun(as(ada.id), { workspaceId: team.id, agentId: "test-agent", inputs: { topic: "A brand new bakery in town" } });
    await rejectsCode(runs.submitRun(as(eve.id), { workspaceId: team.id, agentId: "test-agent", inputs: { topic: "Not my workspace at all" } }), "not_found");
    await rejectsCode(runs.getRun(as(eve.id), team.id, run.id), "not_found");
    await rejectsCode(runs.listRuns(as(eve.id), team.id), "not_found");
    await rejectsCode(runs.cancelRun(as(eve.id), team.id, run.id), "not_found");
    await rejectsCode(runs.costTotals(as(eve.id), team.id), "not_found");
    // Her own workspace cannot reach the team's private agent either.
    await rejectsCode(
      runs.submitRun(as(eve.id), { workspaceId: eve.personalWorkspaceId, agentWorkspaceId: team.id, agentId: "test-agent", inputs: { topic: "Borrowing a private agent" } }),
      "not_found",
    );
    // Nor can anyone run in the platform workspace without the builder role.
    await rejectsCode(runs.submitRun(as(ada.id), { workspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", inputs: SAMPLE_RUNS["hook-writer"].inputs }), "not_found");
  });

  it("lets viewers read runs but not start them, and shows costs to admins only", async () => {
    const t = await setup();
    const vi = await join(t, "vi@example.com", "viewer");
    const ed = await join(t, "ed@example.com", "editor");
    const run = await t.runs.submitRun(as(ed.id), { workspaceId: t.team.id, agentId: "test-agent", inputs: { topic: "A brand new bakery in town" } });
    await t.runs.waitForRun(as(ed.id), t.team.id, run.id);
    expect((await t.runs.getRun(as(vi.id), t.team.id, run.id))?.status).toBe("succeeded");
    await rejectsCode(t.runs.submitRun(as(vi.id), { workspaceId: t.team.id, agentId: "test-agent", inputs: { topic: "Viewers only look around" } }), "forbidden");
    await rejectsCode(t.runs.costTotals(as(ed.id), t.team.id), "forbidden");
    expect((await t.runs.costTotals(as(t.ada.id), t.team.id)).workspace.runs).toBe(1);
  });

  it("scopes API keys to their own workspace", async () => {
    const { accounts, runs, ada, team } = await setup();
    const { key } = await accounts.apiKeys.create(as(ada.id), team.id, { name: "MCP", role: "editor" });
    const p = (await accounts.apiKeys.authenticate(key))!;
    const run = await runs.submitRun(p, { workspaceId: team.id, agentId: "test-agent", inputs: { topic: "Sent in through the API" } });
    expect((await runs.waitForRun(p, team.id, run.id)).status).toBe("succeeded");
    await rejectsCode(runs.listRuns(p, ada.personalWorkspaceId), "not_found");
    await rejectsCode(runs.costTotals(p, team.id), "forbidden");
  });
});
