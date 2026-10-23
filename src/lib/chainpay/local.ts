/**
 * SERVER ONLY. USDC and ETH top-ups for this process: the settings, the
 * reader, the store in .data/chainpay.json (or WOVI_DATA_DIR), sharing the
 * app's accounts, credits and the owed rows of safety.json. Null while
 * credits are off on this server.
 */
import { join } from "node:path";
import type { Accounts } from "@/lib/accounts/accounts";
import { dataDirFromEnv, localAccounts } from "@/lib/accounts/local";
import { creditsEnabled, processCredits } from "@/lib/credits/local";
import { localSafetyStore } from "@/lib/safety/local";
import { jsonFileX402Store } from "@/lib/x402/store";
import { viemChainPayReader } from "./chain";
import { chainPayConfigFromEnv } from "./config";
import { ChainPay } from "./pay";
import { jsonFileChainPayStore, type ChainPayStore } from "./store";

const g = globalThis as { __wovi?: { accounts?: Accounts }; __woviChainPay?: { pay: ChainPay | null; store: ChainPayStore } };

function services() {
  if (!g.__woviChainPay) {
    const dir = dataDirFromEnv();
    const config = chainPayConfigFromEnv();
    const store = jsonFileChainPayStore(join(dir, "chainpay.json"));
    const accounts = ((g.__wovi ??= {}).accounts ??= localAccounts());
    const x402 = jsonFileX402Store(join(dir, "x402.json"));
    g.__woviChainPay = {
      store,
      pay: creditsEnabled()
        ? new ChainPay({
            config,
            reader: viemChainPayReader(config.rpcUrl),
            store,
            accounts: accounts.store,
            credits: processCredits(),
            owed: localSafetyStore(dir).owed,
            // The receiving address can be x402's too: a transaction that paid for a call never tops up as well.
            usedElsewhere: async (id) => Boolean(await x402.payments.get(id)),
          })
        : null,
    };
  }
  return g.__woviChainPay;
}

/** The USDC and ETH top-ups of this process, or null while credits are off. */
export function chainPay(): ChainPay | null {
  return services().pay;
}

/** Whether a transaction was counted as a USDC or ETH top-up. x402 asks before it takes one. */
export async function usedForTopUp(paymentId: string): Promise<boolean> {
  return Boolean(await services().store.payments.get(paymentId.toLowerCase()));
}
