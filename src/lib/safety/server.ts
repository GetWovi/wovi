/**
 * The Next.js side of phase 18: one of each service per server process,
 * sharing the app's accounts, run engine and credits.
 */
import { dataDirFromEnv } from "@/lib/accounts/local";
import { accounts, appEngine } from "@/lib/accounts/server";
import { creditsEnabled, processCredits } from "@/lib/credits/local";
import type { Withdrawals } from "@/lib/legal/withdrawals";
import type { Privacy } from "@/lib/privacy/privacy";
import { localPrivacy, localReports, localSafetyStore, localWithdrawals } from "./local";
import type { Reports } from "./reports";
import type { SafetyStore } from "./store";

const g = globalThis as { __woviSafety?: { store?: SafetyStore; privacy?: Privacy; reports?: Reports; withdrawals?: Withdrawals } };
const cache = (g.__woviSafety ??= {});

export function appSafetyStore(): SafetyStore {
  return (cache.store ??= localSafetyStore(dataDirFromEnv()));
}

export function appPrivacy(): Privacy {
  return (cache.privacy ??= localPrivacy(accounts(), dataDirFromEnv(), { credits: creditsEnabled() ? processCredits() : null, safety: appSafetyStore() }));
}

export function appReports(): Reports {
  return (cache.reports ??= localReports(accounts(), dataDirFromEnv(), appEngine(), { safety: appSafetyStore() }));
}

export function appWithdrawals(): Withdrawals {
  return (cache.withdrawals ??= localWithdrawals(accounts(), processCredits(), dataDirFromEnv(), { safety: appSafetyStore() }));
}
