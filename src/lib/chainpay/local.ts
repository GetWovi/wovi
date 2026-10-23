/**
 * SERVER ONLY. Stablecoin and ETH top-ups for this process: the settings, the
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

/**
 * Called once when the server starts (instrumentation.ts) with a receiving
 * address set: reads the stablecoin's symbol and decimals on chain and checks
 * them against the settings, so the first screen already knows them. A
 * failure is logged with the reason by ChainPay and read again later.
 */
export async function checkStablecoinAtStart(): Promise<void> {
  const pay = services().pay;
  if (!pay || !pay.status().on) return;
  const s = await pay.stablecoin();
  if (s?.ok) console.log(`Stablecoin top-ups: ${s.symbol} at ${s.token}, ${s.decimals} decimals as read on chain.`);
}

/** The stablecoin and ETH top-ups of this process, or null while credits are off. */
export function chainPay(): ChainPay | null {
  return services().pay;
}

/** Whether a transaction was counted as a stablecoin or ETH top-up. x402 asks before it takes one. */
export async function usedForTopUp(paymentId: string): Promise<boolean> {
  return Boolean(await services().store.payments.get(paymentId.toLowerCase()));
}
