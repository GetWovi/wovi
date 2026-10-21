/** A builder for tests: test accounts, a memory registry with the seeds, memory files, the drafter and the engine on the fake provider. */
import type { Principal } from "@/lib/accounts/accounts";
import { GuardedAgents } from "@/lib/accounts/guard";
import { SoftPasskey, testAccounts } from "@/lib/accounts/test-helpers";
import { AgentRegistry } from "@/lib/agents/registry";
import { seedPlatformAgents } from "@/lib/agents/seeds";
import { memoryStore } from "@/lib/agents/store";
import { stubBrandBrains } from "@/lib/runs/brand-brain";
import { RunEngine, type EngineOptions } from "@/lib/runs/engine";
import { fakeProvider, type FakeOptions } from "@/lib/runs/providers/fake";
import { memoryRunStore } from "@/lib/runs/store";
import { boardBrandBrains } from "./board-brain";
import { Builder } from "./builder";
import { SpecDrafter } from "./drafter";
import { memoryFileStorage } from "./storage";
import { memoryBuilderStore } from "./store";

export const as = (userId: string): Principal => ({ kind: "user", userId });

export async function testBuilder(opts: { seeds?: boolean; fake?: FakeOptions; engine?: Partial<EngineOptions> } = {}) {
  const t = testAccounts();
  let tick = 0;
  const now = () => new Date(t.clock.t + tick++);
  const registry = new AgentRegistry(memoryStore(), () => now().toISOString());
  if (opts.seeds ?? true) await seedPlatformAgents(registry);
  const fake = fakeProvider(opts.fake);
  const store = memoryBuilderStore();
  const files = memoryFileStorage();
  // The engine reads each agent's mood board through the builder, which needs the engine: the board source looks the builder up lazily.
  const late: { builder?: Builder } = {};
  const engine = new RunEngine({
    registry,
    store: memoryRunStore(),
    brandBrains: boardBrandBrains(stubBrandBrains(), { listForAgent: (ws, id) => late.builder!.listForAgent(ws, id) }),
    providers: { fake },
    providerOverride: "fake",
    backoff: { baseMs: 5, maxMs: 20 },
    now,
    ...opts.engine,
  });
  const builder = (late.builder = new Builder({
    accounts: t.accounts,
    agents: new GuardedAgents(registry, t.accounts),
    store,
    files,
    drafter: new SpecDrafter({ providers: { fake }, providerOverride: "fake" }),
    engine,
    now,
  }));

  /** A builder account made with a code and a passkey. */
  const joinBuilder = async (name = "Funkai") => {
    const { code } = await t.accounts.builderCodes.issue();
    const key = new SoftPasskey("localhost", "http://localhost:3900");
    const start = await t.accounts.builderCodes.startJoin({ code, name, ip: "ip" });
    const result = await t.accounts.builderCodes.finishJoin({ challengeId: start.challengeId, response: key.register(start.options.challenge) as never, ip: "ip" });
    return { user: result.user, me: as(result.user.id) };
  };

  return { ...t, registry, fake, store, files, builder, engine, joinBuilder };
}

/** Waits until a bench has ended, polling the builder the way the screen does. */
export async function untilBenchEnds(t: Awaited<ReturnType<typeof testBuilder>>, me: Principal, benchId: string, ms = 5000) {
  const start = Date.now();
  for (;;) {
    const v = await t.builder.bench.get(me, benchId);
    if (v.status !== "running") return v;
    if (Date.now() - start > ms) throw new Error(`bench ${benchId} did not end in ${ms} ms`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
