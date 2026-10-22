/**
 * SERVER ONLY. $WOVI's services for this process (phase 17): the settings,
 * the chain reader, the store in .data/token.json (or WOVI_DATA_DIR), the
 * /token panel with its cache, holders and paying with $WOVI. No Next.js
 * imports, so the in-process jobs (jobs.ts) and the pages share one set.
 */
import { join } from "node:path";
import type { Accounts } from "@/lib/accounts/accounts";
import { dataDirFromEnv, localAccounts } from "@/lib/accounts/local";
import { creditsEnabled, processCredits } from "@/lib/credits/local";
import { viemReader, scrub, type TokenReader } from "./chain";
import { tokenConfigFromEnv, type TokenConfig } from "./config";
import { Holders } from "./holders";
import { keeperChainFromEnv } from "./keeper-chain";
import { keeperRecord, runKeeper, type KeeperResult } from "./keeper";
import { TokenPanels } from "./panel";
import { WoviPay } from "./pay";
import { jsonFileTokenStore, put, type TokenStore } from "./store";

export type TokenServices = {
  config: TokenConfig;
  reader: TokenReader;
  store: TokenStore;
  panels: TokenPanels;
  holders: Holders;
  /** Null while credits are off on this server. */
  pay: WoviPay | null;
  accounts: Accounts;
};

const g = globalThis as { __wovi?: { accounts?: Accounts }; __woviToken?: TokenServices; __woviStopping?: boolean };

/** The one set of $WOVI services of this process, sharing the app's accounts and credits. */
export function tokenServices(): TokenServices {
  if (!g.__woviToken) {
    const config = tokenConfigFromEnv();
    const reader = viemReader(config.rpcUrl);
    const store = jsonFileTokenStore(join(dataDirFromEnv(), "token.json"));
    const accounts = ((g.__wovi ??= {}).accounts ??= localAccounts());
    const credits = creditsEnabled() ? processCredits() : null;
    const panels = new TokenPanels({ config, reader, store });
    const tokenAddress = () => panels.tokenAddress();
    g.__woviToken = {
      config,
      reader,
      store,
      panels,
      accounts,
      holders: new Holders({ config, reader, store, accounts, credits, tokenAddress }),
      pay: credits ? new WoviPay({ config, reader, store, accounts: accounts.store, credits, tokenAddress }) : null,
    };
  }
  return g.__woviToken;
}

/** True once the server is stopping: the keeper sends nothing new. */
export const stopping = () => g.__woviStopping === true;
export const markStopping = () => {
  g.__woviStopping = true;
};

/** One keeper run as the server does it. Never throws; an error comes back scrubbed of anything like a key or a node. */
export async function keeperOnce(s: TokenServices = tokenServices()): Promise<KeeperResult | { done: "off" } | { done: "error"; reason: string }> {
  const c = s.config;
  if (c.keeper.switchedOff) return { done: "off" };
  const chain = keeperChainFromEnv(c);
  if (!chain) return { done: "off" };
  try {
    return await runKeeper({ chain, store: s.store, dailyGas: c.keeper.dailyGas, maxGwei: c.keeper.maxGwei, minGasWei: c.keeper.minGasWei, minSweepWei: c.keeper.minSweepWei, stopping });
  } catch (err) {
    const reason = scrub(String((err as Error)?.message ?? err));
    const k = await keeperRecord(s.store);
    await put(s.store.keeper, { ...k, failures: k.failures + 1, lastError: reason, lastRunAt: Date.now() }).catch(() => undefined);
    return { done: "error", reason };
  }
}

/** Whether to show the holder badge for a person: their stored status. False while holders are off. Never throws. */
export async function holderBadgeFor(userId: string): Promise<boolean> {
  try {
    const s = tokenServices();
    return s.config.holder.on ? await s.holders.isHolder(userId) : false;
  } catch {
    return false;
  }
}
