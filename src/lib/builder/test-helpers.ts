/** A builder for tests: test accounts, a memory registry with the seeds, memory files, the drafter on the fake provider. */
import type { Principal } from "@/lib/accounts/accounts";
import { GuardedAgents } from "@/lib/accounts/guard";
import { SoftPasskey, testAccounts } from "@/lib/accounts/test-helpers";
import { AgentRegistry } from "@/lib/agents/registry";
import { seedPlatformAgents } from "@/lib/agents/seeds";
import { memoryStore } from "@/lib/agents/store";
import { fakeProvider, type FakeOptions } from "@/lib/runs/providers/fake";
import { Builder } from "./builder";
import { SpecDrafter } from "./drafter";
import { memoryFileStorage } from "./storage";
import { memoryBuilderStore } from "./store";

export const as = (userId: string): Principal => ({ kind: "user", userId });

export async function testBuilder(opts: { seeds?: boolean; fake?: FakeOptions } = {}) {
  const t = testAccounts();
  let tick = 0;
  const now = () => new Date(t.clock.t + tick++);
  const registry = new AgentRegistry(memoryStore(), () => now().toISOString());
  if (opts.seeds ?? true) await seedPlatformAgents(registry);
  const fake = fakeProvider(opts.fake);
  const store = memoryBuilderStore();
  const files = memoryFileStorage();
  const builder = new Builder({
    accounts: t.accounts,
    agents: new GuardedAgents(registry, t.accounts),
    store,
    files,
    drafter: new SpecDrafter({ providers: { fake }, providerOverride: "fake" }),
    now,
  });

  /** A builder account made with a code and a passkey. */
  const joinBuilder = async (name = "Funkai") => {
    const { code } = await t.accounts.builderCodes.issue();
    const key = new SoftPasskey("localhost", "http://localhost:3900");
    const start = await t.accounts.builderCodes.startJoin({ code, name, ip: "ip" });
    const result = await t.accounts.builderCodes.finishJoin({ challengeId: start.challengeId, response: key.register(start.options.challenge) as never, ip: "ip" });
    return { user: result.user, me: as(result.user.id) };
  };

  return { ...t, registry, fake, store, files, builder, joinBuilder };
}
