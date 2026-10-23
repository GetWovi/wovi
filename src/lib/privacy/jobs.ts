/**
 * The retention sweep (phase 18), started from instrumentation when
 * WOVI_RETENTION_SWEEP=on: once soon after start, then once a day. It deletes
 * only logs past their retention (RETENTION in privacy.ts) and never the
 * ledger, top-ups, payments, runs or Brand Brains.
 */
import { dataDirFromEnv, localAccounts } from "@/lib/accounts/local";
import { localPrivacy } from "@/lib/safety/local";

const DAY = 86_400_000;
const g = globalThis as { __woviRetention?: NodeJS.Timeout };

export function startRetentionSweep(): void {
  if (g.__woviRetention) return;
  const run = async () => {
    try {
      const swept = await localPrivacy(localAccounts(), dataDirFromEnv()).sweep();
      console.log("Retention sweep:", JSON.stringify(swept));
    } catch (err) {
      console.error("The retention sweep failed:", err);
    }
  };
  setTimeout(run, 60_000).unref();
  g.__woviRetention = setInterval(run, DAY);
  g.__woviRetention.unref();
}
