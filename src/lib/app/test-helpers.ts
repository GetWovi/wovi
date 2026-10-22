/** The app API for tests: test accounts, the seeded platform agents, Brand Brains, the engine on the fake provider, memory tables. */
import type { Principal } from "@/lib/accounts/accounts";
import { GuardedAgents, GuardedRuns } from "@/lib/accounts/guard";
import { testAccounts } from "@/lib/accounts/test-helpers";
import { AgentRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID, seedPlatformAgents } from "@/lib/agents/seeds";
import { memoryStore } from "@/lib/agents/store";
import { BrandBrains } from "@/lib/brand/brains";
import { ProfileProposer } from "@/lib/brand/profile";
import { seedBrains } from "@/lib/brand/seeds";
import { storeBrainSource } from "@/lib/brand/source";
import { memoryBrandStore } from "@/lib/brand/store";
import { memoryFileStorage } from "@/lib/builder/storage";
import { ensureLaunchAuthor, LAUNCH_AUTHOR_ID } from "@/lib/launch/install";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { PipelineEngine, type PipelineEngineOptions } from "@/lib/pipelines/engine";
import { GuardedPipelines } from "@/lib/pipelines/guard";
import { installPipelineTemplates } from "@/lib/pipelines/install";
import { PipelineRegistry } from "@/lib/pipelines/registry";
import { memoryPipelineStore } from "@/lib/pipelines/store";
import { RunEngine, type EngineOptions } from "@/lib/runs/engine";
import { fakeProvider, type FakeOptions } from "@/lib/runs/providers/fake";
import { memoryRunStore } from "@/lib/runs/store";
import { memoryTeamStore } from "@/lib/team/store";
import { Team } from "@/lib/team/team";
import { AppApi } from "./api";
import { memoryAppStore } from "./store";

export const as = (userId: string): Principal => ({ kind: "user", userId });

/**
 * A workspace owner (ada), an outsider (eve), the platform agents at their
 * launch versions (Trend Scout a draft), and a way to add members by role.
 * `seedBrains` puts the example Brand Brains into ada's team.
 */
export async function testApp(opts: { fake?: FakeOptions; engine?: Partial<EngineOptions>; launch?: boolean; pipelines?: Partial<PipelineEngineOptions>; templates?: boolean } = {}) {
  const t = testAccounts();
  let tick = 0;
  const now = () => new Date(t.clock.t + tick++ * 1000);
  const registry = new AgentRegistry(memoryStore(), () => now().toISOString());
  await seedPlatformAgents(registry);
  if (opts.launch ?? true) {
    for (const spec of LAUNCH_AGENTS) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, owner, status, visibility, ...body } = spec;
      if (await registry.get(PLATFORM_WORKSPACE_ID, spec.id)) {
        await registry.update(PLATFORM_WORKSPACE_ID, spec.id, body, { note: "Launch" });
        await registry.setStatus(PLATFORM_WORKSPACE_ID, spec.id, spec.status === "draft" ? "draft" : "live");
      } else await registry.create(PLATFORM_WORKSPACE_ID, spec, { note: "Launch" });
    }
  }
  const fake = fakeProvider(opts.fake);
  const brandStore = memoryBrandStore();
  const files = memoryFileStorage();
  const engine = new RunEngine({
    registry,
    store: memoryRunStore(),
    brandBrains: storeBrainSource(brandStore),
    providers: { fake },
    providerOverride: "fake",
    backoff: { baseMs: 5, maxMs: 20 },
    now,
    ...opts.engine,
  });
  const agents = new GuardedAgents(registry, t.accounts);
  const runs = new GuardedRuns(engine, t.accounts);
  const brands = new BrandBrains({ accounts: t.accounts, store: brandStore, files, proposer: new ProfileProposer({ providers: { fake }, providerOverride: "fake" }), now });
  const store = memoryAppStore();
  const pipelineStore = memoryPipelineStore();
  const pipelineRegistry = new PipelineRegistry(pipelineStore, registry, () => now().toISOString());
  const pipelineEngine = new PipelineEngine({ registry: pipelineRegistry, runs: engine, brandBrains: storeBrainSource(brandStore), store: pipelineStore, now, ...opts.pipelines });
  const pipelines = new GuardedPipelines(pipelineEngine, t.accounts);
  const launchAuthor = await ensureLaunchAuthor(t.accounts);
  if ((opts.launch ?? true) && (opts.templates ?? true)) await installPipelineTemplates(pipelines, launchAuthor, LAUNCH_AUTHOR_ID);
  const teamStore = memoryTeamStore();
  const teamReview = new Team({ accounts: t.accounts, runs: engine, pipelines: pipelineEngine, registry, brands, app: store, store: teamStore, now });
  const api = new AppApi({ accounts: t.accounts, agents, runs, brands, store, pipelines, team: teamReview, now });

  const ada = (await t.signUp("ada@example.com")).user;
  const eve = (await t.signUp("eve@example.com")).user;
  const team = await t.accounts.workspaces.create(as(ada.id), "Team");
  const join = async (email: string, role: "admin" | "editor" | "viewer") => {
    const user = (await t.signUp(email)).user;
    await t.accounts.workspaces.invite(as(ada.id), team.id, email, role);
    await t.accounts.workspaces.acceptInvite(user.id, t.lastMail(email).token);
    return user;
  };
  const seedTeamBrains = () => seedBrains(brandStore, files, team.id, { now: () => now().toISOString() });

  return { ...t, registry, engine, fake, agents, runs, brands, brandStore, store, api, ada, eve, team, join, seedTeamBrains, pipelineStore, pipelineRegistry, pipelineEngine, pipelines, launchAuthor, teamReview, teamStore };
}

export const POSTS = [
  "Your brakes squeak because they want attention. 10 minutes, no appointment. Our mechanic fixes it while you drink our terrible coffee.",
  "3 things that kill a chain:\n1. Rain\n2. Skipping oil\n3. Ignoring the noise\nWhich one is you?",
  "We trued 14 wheels today. One was older than our mechanic. It still rolls.",
  "Flat tyre at 8 a.m.? Bring it in. Our mechanic opens at 7:30 for exactly this reason. The coffee is still terrible.",
];
