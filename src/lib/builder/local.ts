/**
 * The builder on the local stores in .data/ (or WOVI_DATA_DIR): accounts,
 * the agent registry, the builder's own tables, files under .data/files/,
 * the drafter on the fake provider unless OPENROUTER_API_KEY is set, and the
 * run engine the bench uses (the app's one engine, so the bench and every
 * other run share one queue).
 */
import { join } from "node:path";
import type { Accounts } from "@/lib/accounts/accounts";
import { GuardedAgents } from "@/lib/accounts/guard";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { storeBrainSource } from "@/lib/brand/source";
import { jsonFileBrandStore } from "@/lib/brand/store";
import type { BrandBrainSource } from "@/lib/runs/brand-brain";
import { localEngine, type RunEngine } from "@/lib/runs/engine";
import { providersFromEnv } from "@/lib/runs/providers";
import { boardBrandBrains } from "./board-brain";
import { Builder } from "./builder";
import { SpecDrafter } from "./drafter";
import { localFileStorage } from "./storage";
import { jsonFileBuilderStore } from "./store";

export function localDrafter(): SpecDrafter {
  const providers = providersFromEnv();
  const fake = !providers.openrouter;
  return new SpecDrafter({ providers: fake ? { fake: providers.fake } : providers, providerOverride: fake ? "fake" : undefined });
}

export function localBuilder(accounts: Accounts, dataDir = dataDirFromEnv(), engine?: RunEngine): Builder {
  return new Builder({
    accounts,
    agents: new GuardedAgents(localRegistry(dataDir), accounts),
    store: jsonFileBuilderStore(join(dataDir, "builder.json")),
    files: localFileStorage(join(dataDir, "files")),
    drafter: localDrafter(),
    engine: engine ?? localEngine({ dataDir, brandBrains: localBrandBrains(dataDir) }),
  });
}

/** The Brand Brain source for the local engine: the workspace's Brand Brains (phase 7) plus each agent's mood board. */
export function localBrandBrains(dataDir = dataDirFromEnv()): BrandBrainSource {
  const store = jsonFileBuilderStore(join(dataDir, "builder.json"));
  return boardBrandBrains(storeBrainSource(jsonFileBrandStore(join(dataDir, "brand-brains.json"))), {
    async listForAgent(workspaceId, agentId) {
      return (await store.boardItems.find({ workspaceId, agentId })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  });
}
