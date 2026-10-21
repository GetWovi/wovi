/** Builds an engine for tests: memory stores, the sample Brand Brain, the fake provider, short timers. */
import { AgentRegistry, type CreateInput } from "@/lib/agents/registry";
import { seedPlatformAgents } from "@/lib/agents/seeds";
import { memoryStore } from "@/lib/agents/store";
import { goodSpec } from "@/lib/agents/test-helpers";
import { stubBrandBrains } from "./brand-brain";
import { RunEngine, type EngineOptions } from "./engine";
import { fakeProvider, type FakeOptions, type FakeProvider } from "./providers/fake";
import { memoryRunStore } from "./store";

export const WS = "ws_test";

export async function testEngine(
  opts: { fake?: FakeOptions; agents?: CreateInput[]; seeds?: boolean } & Partial<EngineOptions> = {},
): Promise<{ engine: RunEngine; fake: FakeProvider; registry: AgentRegistry }> {
  const { fake: fakeOpts, agents = [goodSpec()], seeds = false, ...rest } = opts;
  const registry = new AgentRegistry(memoryStore());
  for (const a of agents) await registry.create(WS, a);
  if (seeds) await seedPlatformAgents(registry);
  const fake = fakeProvider(fakeOpts);
  const engine = new RunEngine({
    registry,
    store: memoryRunStore(),
    brandBrains: stubBrandBrains(),
    providers: { fake },
    providerOverride: "fake",
    backoff: { baseMs: 5, maxMs: 20 },
    ...rest,
  });
  return { engine, fake, registry };
}

/** A valid request for goodSpec. */
export const goodRequest = (extra: Record<string, unknown> = {}) => ({
  workspaceId: WS,
  agentId: "test-agent",
  inputs: { topic: "Gerald the sourdough starter turns nine" },
  ...extra,
});

export async function rejectsWith(p: Promise<unknown>, code: string): Promise<Error & { code: string; issues: string[] }> {
  const err = await p.then(
    () => {
      throw new Error(`expected a ${code} error`);
    },
    (e: unknown) => e as Error & { code: string; issues: string[] },
  );
  if (err.code !== code) throw new Error(`expected ${code}, got ${err.code}: ${err.message}`);
  return err;
}
