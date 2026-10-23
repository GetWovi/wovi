/**
 * Live stats and canary releases: the record shapes and fixed lists. No
 * storage and no logic here, so client components can import them.
 *
 * From the product doc: "Measured, not claimed. Every agent shows live stats
 * (acceptance rate, edit rate, engagement lift)", the metrics table (section
 * 6), "Canary release: new versions serve 10% of live traffic first, compared
 * on acceptance and edit rate", and "Audit: log every run, version and
 * publish approval".
 */

/* ---------- Feedback events ---------- */

/**
 * - use: the output was used without another try: copied, picked, or approved.
 * - edit: the person changed the output and kept their version.
 * - regenerate: the person asked for another try (a quick edit, "Try again", changes asked).
 * - rating: thumbs up or down, with an optional note.
 */
export const FEEDBACK_ACTIONS = ["use", "edit", "regenerate", "rating"] as const;
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

/** Where the action happened. */
export const FEEDBACK_SOURCES = ["app", "review", "pipeline", "client", "api", "mcp"] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

/** How a use or a regenerate came about, for the builder's reading. */
export type FeedbackHow = "copy" | "copy_all" | "approve" | "pick" | "kept_edit" | "quick_edit" | "regenerate" | "changes_asked" | "api";

export const RATINGS = ["up", "down"] as const;
export type ThumbRating = (typeof RATINGS)[number];

/** The longest edited text kept, and the longest rating note. */
export const FEEDBACK_LIMITS = { keptChars: 20_000, noteChars: 300 } as const;

/**
 * One feedback event: one action on one run. The id is `${runId}:${action}`,
 * so there is at most one per action per run: a use or a regenerate is
 * recorded once, an edit or a rating given again replaces the first.
 */
export type FeedbackRow = {
  id: string;
  runId: string;
  /** The run's workspace: the customer's. */
  workspaceId: string;
  /** Where the agent lives, its id and the exact version that ran. */
  agentWorkspaceId: string;
  agentId: string;
  version: string;
  action: FeedbackAction;
  source: FeedbackSource;
  how: FeedbackHow | null;
  /** A user id, `key:<id>` for an API key, or `link:<id>` for a client link. */
  by: string;
  at: string;
  updatedAt: string;
  /** Edit: the normalized edit distance between the draft and what the person kept, 0 (same) to 1 (all new). */
  distance?: number | null;
  /** Edit: the draft's and the kept text's length in characters. */
  draftChars?: number | null;
  keptChars?: number | null;
  /**
   * Edit: what the person kept. Stored only when they had turned on "Use my
   * edits to improve agents" (phase 18), and shown to builders only while it
   * is still on. Null otherwise; the distance is kept either way.
   */
  kept?: string | null;
  /** Rating: up or down. */
  rating?: ThumbRating | null;
  /** Rating: the person's note. Shown to builders only with the same consent. */
  note?: string | null;
};

/* ---------- The numbers ---------- */

/** Below this many, a number shows as "New" instead of a figure. */
export const MIN_COUNT = 20;

/** A share with what it was counted from. `value` is null below the minimum count or with nothing to count. */
export type Rate = {
  /** 0 to 1, or null when `enough` is false. */
  value: number | null;
  /** How many matched. */
  count: number;
  /** Out of how many. */
  n: number;
  enough: boolean;
};

/** A mean with what it was counted from. */
export type Mean = { value: number | null; n: number; enough: boolean };

/**
 * Live stats for one agent or one version, from real runs only.
 *
 * - runs: finished runs that gave a result (the outputs people got).
 * - acceptance: outputs used or edited and kept, without a regenerate, out of the outputs.
 * - edited: accepted outputs the person changed, out of the accepted ones; editSize their mean edit distance.
 * - regenerate: outputs someone asked another try for, out of the outputs.
 * - rating: thumbs up out of the thumbs given.
 * - compliance: results that fit the format and the platform's hard limits, out of the runs that reached the format check.
 * - quality: the quality gate's mean score (phase 12).
 * - latency: the run's own time, median and 90th percentile.
 * - cost: mean cost per run (builders only).
 */
export type StatsNumbers = {
  runs: number;
  /** Runs that failed, for the builder's reading. */
  failed: number;
  acceptance: Rate;
  edited: Rate;
  editSize: Mean;
  regenerate: Rate;
  rating: Rate;
  compliance: Rate;
  quality: Mean;
  latency: { p50Ms: number | null; p90Ms: number | null; n: number; enough: boolean };
  /** Micro-dollars. */
  cost: { avgMicroUsd: number | null; totalMicroUsd: number; n: number };
  /** Fewer outputs than the minimum: the agent shows "New". */
  isNew: boolean;
  lastRunAt: string | null;
};

/** What anyone may see: everything but cost. */
export type PublicStats = Omit<StatsNumbers, "cost" | "failed"> & { agentId: string; min: number };

/* ---------- Releases ---------- */

/**
 * - canary: the new version serves `share` percent of live runs.
 * - promoted: published to everyone; the canary version is now current.
 * - rolled_back: a builder rolled it back; the stable version serves everyone.
 * - stopped: stopped automatically because it was clearly worse.
 * - replaced: a newer save, a version rollback or a direct publish took its place.
 */
export const RELEASE_STATUSES = ["canary", "promoted", "rolled_back", "stopped", "replaced"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

/**
 * When a canary counts as clearly worse than the stable version. Each rule
 * applies only when both sides have at least `minRuns` behind that number.
 * Shares are 0 to 1, the quality drop is in points out of 100.
 */
export type CanaryThresholds = {
  minRuns: number;
  /** Acceptance lower by more than this. */
  acceptanceDrop: number;
  /** Share of accepted outputs that were edited higher by more than this. */
  editRise: number;
  /** Regenerate rate higher by more than this. */
  regenerateRise: number;
  /** Average quality score lower by more than this many points. */
  qualityDrop: number;
};

export const DEFAULT_THRESHOLDS: CanaryThresholds = { minRuns: 20, acceptanceDrop: 0.15, editRise: 0.15, regenerateRise: 0.15, qualityDrop: 10 };

export const THRESHOLD_LIMITS = {
  minRuns: { min: 5, max: 500 },
  rate: { min: 0.01, max: 0.9 },
  qualityDrop: { min: 1, max: 50 },
} as const;

/** The share of live runs a canary may take, in percent. 0 means only the bench and the builder's own runs. */
export const SHARE_LIMITS = { min: 0, max: 50, default: 10 } as const;

/** One release of a new version beside the stable one. At most one per agent is "canary" at a time. */
export type ReleaseRow = {
  id: string;
  /** Where the agent lives. */
  workspaceId: string;
  agentId: string;
  /** The version everyone else gets: the registry's current version. */
  stable: string;
  /** The version under test. */
  canary: string;
  /** Percent of live runs that follow "latest stable" and go to the canary. */
  share: number;
  status: ReleaseStatus;
  thresholds: CanaryThresholds;
  startedAt: string;
  startedBy: string;
  endedAt: string | null;
  /** A user id, or "system" for the automatic stop. */
  endedBy: string | null;
  /** Why it ended, in plain words. */
  reason: string | null;
  updatedAt: string;
};

/** Which side of a release a run went to. Kept on the run (`run.release`). */
export type ReleaseArm = "stable" | "canary";

/* ---------- The audit log ---------- */

export const AUDIT_KINDS = [
  "saved",
  "published",
  "unpublished",
  "hidden",
  "unhidden",
  "canary_started",
  "canary_share",
  "promoted",
  "rolled_back",
  "auto_stopped",
  "gate_refused",
  "version_rollback",
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

/** One line of the audit log: a version, a publish or a release decision, who made it and when. Never changed after it is written. */
export type AuditRow = {
  id: string;
  /** Where the agent lives. */
  workspaceId: string;
  agentId: string;
  kind: AuditKind;
  /** The version it is about. */
  version: string | null;
  /** The version it replaced, when there is one. */
  from: string | null;
  /** A user id, or "system". */
  by: string;
  at: string;
  /** What happened, in plain words. */
  detail: string;
  /** The numbers behind it (a gate's scores, a canary's rates). */
  data?: Record<string, number | string | null>;
};
