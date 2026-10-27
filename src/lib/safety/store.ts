/**
 * Storage for phase 18, in its own file (.data/safety.json) so nothing that
 * was stored before phase 18 changes: reports (notice and action), consent
 * to use edits, upload rights confirmations, money owed back to a buyer, and
 * an anonymous log of deleted accounts. Every table starts empty on an
 * existing data dir.
 */
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";

import { REPORT_OUTCOMES, REPORT_OUTCOME_WORDS, REPORT_REASONS, REPORT_REASON_WORDS, type ReportOutcome, type ReportReason } from "./words";

export { REPORT_OUTCOMES, REPORT_OUTCOME_WORDS, REPORT_REASONS, REPORT_REASON_WORDS, type ReportOutcome, type ReportReason };

export type ReportTarget = {
  /** run, pipeline_run or comment when WOVI could tell; other for anything else (a link it could not read). */
  kind: "run" | "pipeline_run" | "comment" | "other";
  id: string | null;
  workspaceId: string | null;
  /** What the reporter gave: a link or an id. */
  given: string;
};

/** One notice (Digital Services Act Art. 16) and what was done about it (Art. 17). */
export type ReportRow = {
  id: string;
  /** The number the reporter gets, like R-4F2K9. */
  ref: string;
  target: ReportTarget;
  reason: ReportReason;
  details: string;
  /** Contact details: optional for anyone, kept until the retention period after the decision. */
  reporterName: string | null;
  reporterEmail: string | null;
  /** Set when the reporter was signed in. */
  reporterUserId: string | null;
  goodFaith: true;
  status: "new" | "reviewing" | "decided";
  decision: {
    outcome: ReportOutcome;
    /** The term or law the decision rests on, in words. */
    ground: string;
    note: string;
    by: string;
    at: string;
    /** WOVI decides reports by hand; kept so the statement of reasons can say so. */
    automated: false;
  } | null;
  /** When the reporter got the receipt and the decision, and when the affected workspace got its statement of reasons. */
  notified: { receiptAt: string | null; decisionAt: string | null; affectedAt: string | null };
  createdAt: string;
  updatedAt: string;
};

/** Consent to use a person's edits to improve agents. One row per person; no row means off. */
export type ConsentRow = {
  /** The user id. */
  id: string;
  userId: string;
  improveAgents: boolean;
  /** The wording version the person saw. */
  version: string;
  at: string;
  history: { on: boolean; at: string; version: string }[];
};

/** A confirmation, at upload, that the person owns a file or may use it. */
export type RightsRow = {
  id: string;
  workspaceId: string;
  userId: string;
  subject: "run_file" | "mood_board" | "clip_sample" | "video_scene";
  fileId: string;
  fileName: string;
  /** The words ticked. */
  statement: string;
  at: string;
};

/** Money WOVI owes back to a buyer, for the owner to send through the payment provider. Never sent by the app. */
export type OwedRow = {
  id: string;
  /** chain_payment: a stablecoin or ETH that reached WOVI too late or as less than one credit (chainpay), owed back as sent. */
  kind: "withdrawal" | "account_deleted" | "chain_payment";
  workspaceId: string;
  topUpId: string | null;
  credits: number;
  amountCents: number;
  currency: "usd";
  /** True when the top-up behind it was a test top-up: nothing to send. */
  test: boolean;
  /** Where to reach the buyer about it. Removed once it is paid. */
  contact: string | null;
  status: "owed" | "paid";
  createdAt: string;
  paidAt: string | null;
  paidBy: string | null;
  /**
   * Owed in a stablecoin or ETH rather than by card: what to send back, exactly, and
   * to which wallet (the one it came from). Missing on rows from before.
   */
  chain?: OwedChain | null;
  /** Why a chain payment is owed back. */
  reason?: "late" | "too_little" | null;
  /** Paid back through the provider from here: Stripe's refund id. Missing when marked paid by hand. */
  refund?: { provider: "stripe"; ref: string } | null;
};

export type OwedChain = { symbol: string; token: string; decimals: number; amount: string; to: string; tx: string; chainId: number };

/** That an account was deleted, and what it left. No personal data. */
export type DeletionRow = {
  id: string;
  at: string;
  workspacesDeleted: number;
  workspacesLeft: number;
  ledgerEntriesKept: number;
};

export type SafetyStore = {
  reports: Collection<ReportRow>;
  consents: Collection<ConsentRow>;
  rights: Collection<RightsRow>;
  owed: Collection<OwedRow>;
  deletions: Collection<DeletionRow>;
};

const TABLES = ["reports", "consents", "rights", "owed", "deletions"] as const satisfies readonly (keyof SafetyStore)[];

export function memorySafetyStore(): SafetyStore {
  return memoryTables<SafetyStore>(TABLES);
}

export function jsonFileSafetyStore(file: string): SafetyStore {
  return jsonFileTables<SafetyStore>(file, TABLES);
}
