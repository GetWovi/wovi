/**
 * Brand Brains on the local stores in .data/ (or WOVI_DATA_DIR): the tables in
 * .data/brand-brains.json, mood board images under .data/files/<workspace>/
 * (the same FileStorage as the builder), and the profile proposer on the
 * fake provider unless OPENROUTER_API_KEY is set. No link fetcher.
 *
 * The AI read of past posts costs credits like a run, from paid credits,
 * shown before it runs (product doc: "no general free trial"). Without
 * credits it reads with plain counts, for free. Only a local app with
 * billing off lets the model read for nothing.
 */
import { join } from "node:path";
import type { Accounts } from "@/lib/accounts/accounts";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { localFileStorage } from "@/lib/builder/storage";
import { creditsEnabled, processCredits } from "@/lib/credits/local";
import { providersFromEnv } from "@/lib/runs/providers";
import { isLocalApp } from "@/lib/runtime";
import { BrandBrains } from "./brains";
import { ProfileProposer } from "./profile";
import { jsonFileBrandStore } from "./store";

export function localProposer(): ProfileProposer {
  const providers = providersFromEnv();
  // The fake only where providersFromEnv offers it (a local app); a server without a key reads with plain counts.
  const fake = !providers.openrouter && Boolean(providers.fake);
  return new ProfileProposer({ providers: fake ? { fake: providers.fake } : providers, providerOverride: fake ? "fake" : undefined });
}

export function localBrands(accounts: Accounts, dataDir = dataDirFromEnv()): BrandBrains {
  return new BrandBrains({
    accounts,
    store: jsonFileBrandStore(join(dataDir, "brand-brains.json")),
    files: localFileStorage(join(dataDir, "files")),
    proposer: localProposer(),
    billing: creditsEnabled() ? processCredits() : null,
    freeModelReads: isLocalApp(),
  });
}
