/**
 * Brand Brains on the local stores in .data/ (or WOVI_DATA_DIR): the tables in
 * .data/brand-brains.json, mood board images under .data/files/<workspace>/
 * (the same FileStorage as the builder), and the profile proposer on the
 * fake provider unless OPENROUTER_API_KEY is set. No link fetcher.
 */
import { join } from "node:path";
import type { Accounts } from "@/lib/accounts/accounts";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { localFileStorage } from "@/lib/builder/storage";
import { providersFromEnv } from "@/lib/runs/providers";
import { BrandBrains } from "./brains";
import { ProfileProposer } from "./profile";
import { jsonFileBrandStore } from "./store";

export function localProposer(): ProfileProposer {
  const providers = providersFromEnv();
  const fake = !providers.openrouter;
  return new ProfileProposer({ providers: fake ? { fake: providers.fake } : providers, providerOverride: fake ? "fake" : undefined });
}

export function localBrands(accounts: Accounts, dataDir = dataDirFromEnv()): BrandBrains {
  return new BrandBrains({
    accounts,
    store: jsonFileBrandStore(join(dataDir, "brand-brains.json")),
    files: localFileStorage(join(dataDir, "files")),
    proposer: localProposer(),
  });
}
