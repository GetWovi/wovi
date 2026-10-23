/**
 * Phase 18 services on the local JSON stores in a data dir. No Next.js
 * imports, so scripts and tests use them too. server.ts holds one of each per
 * server process.
 */
import { join } from "node:path";
import type { Accounts } from "@/lib/accounts/accounts";
import type { EmailSender } from "@/lib/accounts/email";
import { jsonFileAppStore } from "@/lib/app/store";
import { jsonFileBrandStore } from "@/lib/brand/store";
import type { Credits } from "@/lib/credits/credits";
import { jsonFileCreditStore } from "@/lib/credits/store";
import { Withdrawals } from "@/lib/legal/withdrawals";
import { jsonFilePipelineStore } from "@/lib/pipelines/store";
import { Privacy } from "@/lib/privacy/privacy";
import type { RunEngine } from "@/lib/runs/engine";
import { jsonFileRunStore } from "@/lib/runs/store";
import { jsonFileTeamStore } from "@/lib/team/store";
import { jsonFileTokenStore } from "@/lib/token/store";
import { jsonFileWebhookStore } from "@/lib/webhooks/store";
import { jsonFileStatsStore } from "@/lib/stats/store";
import { Reports } from "./reports";
import { jsonFileSafetyStore, type SafetyStore } from "./store";

export function localSafetyStore(dataDir: string): SafetyStore {
  return jsonFileSafetyStore(join(dataDir, "safety.json"));
}

export function localPrivacy(accounts: Accounts, dataDir: string, opts: { credits?: Credits | null; email?: EmailSender; safety?: SafetyStore } = {}): Privacy {
  return new Privacy({
    accounts,
    runs: jsonFileRunStore(join(dataDir, "runs.json")),
    brand: jsonFileBrandStore(join(dataDir, "brand-brains.json")),
    app: jsonFileAppStore(join(dataDir, "app.json")),
    team: jsonFileTeamStore(join(dataDir, "team.json")),
    credits: jsonFileCreditStore(join(dataDir, "credits.json")),
    balance: opts.credits ? (ws) => opts.credits!.balance(ws) : undefined,
    pipelines: jsonFilePipelineStore(join(dataDir, "pipelines.json")),
    token: jsonFileTokenStore(join(dataDir, "token.json")),
    webhooks: jsonFileWebhookStore(join(dataDir, "webhooks.json")),
    safety: opts.safety ?? localSafetyStore(dataDir),
    stats: jsonFileStatsStore(join(dataDir, "stats.json")),
    filesDir: join(dataDir, "files"),
    mailDir: join(dataDir, "mail"),
    email: opts.email ?? accounts.email,
  });
}

export function localReports(accounts: Accounts, dataDir: string, engine: Pick<RunEngine, "findRun" | "withhold"> | null, opts: { email?: EmailSender; safety?: SafetyStore } = {}): Reports {
  const team = jsonFileTeamStore(join(dataDir, "team.json"));
  return new Reports({
    store: opts.safety ?? localSafetyStore(dataDir),
    accounts,
    email: opts.email ?? accounts.email,
    runs: engine ? { findRun: (id) => engine.findRun(id), withhold: (ws, id, info) => engine.withhold(ws, id, info) } : undefined,
    comments: team.comments,
  });
}

export function localWithdrawals(accounts: Accounts, credits: Credits, dataDir: string, opts: { email?: EmailSender; safety?: SafetyStore } = {}): Withdrawals {
  return new Withdrawals({ credits, accounts, safety: opts.safety ?? localSafetyStore(dataDir), email: opts.email ?? accounts.email });
}
