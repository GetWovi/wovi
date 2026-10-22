/**
 * What the builder keeps beside an agent's spec: golden samples and the mood
 * board. Both carry the workspace id and the agent id, like every other row.
 */
import type { RunInputs } from "@/lib/runs/inputs";
import type { StoredFile } from "./storage";

export const SAMPLE_LABELS = ["gold", "bad"] as const;
export type SampleLabel = (typeof SAMPLE_LABELS)[number];

/**
 * One example of the agent's work: inputs that fit the spec's form, and the
 * ideal output (or, for a "bad" sample, what to avoid). Stored with the spec
 * version it was written against; the test bench (phase 6) runs these.
 */
export type Sample = {
  id: string;
  workspaceId: string;
  agentId: string;
  /** The spec version the sample was written against. */
  version: string;
  label: SampleLabel;
  title: string;
  /** Checked against the agent's inputs, so the sample can run. */
  inputs: RunInputs;
  idealOutput: string;
  note: string;
  links: string[];
  files: StoredFile[];
  createdBy: string;
  createdAt: string;
};

export const BOARD_KINDS = ["image", "link", "text", "swatch"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

/** One reference on an agent's mood board. */
export type BoardItem = {
  id: string;
  workspaceId: string;
  agentId: string;
  kind: BoardKind;
  /** A short note on why it is here. */
  note: string;
  url: string | null;
  text: string | null;
  /** #rrggbb for a swatch. */
  color: string | null;
  file: StoredFile | null;
  createdBy: string;
  createdAt: string;
};

/* ---------- The test bench (phase 6) ---------- */

export const BENCH_KINDS = ["samples", "adhoc", "batch"] as const;
export type BenchKind = (typeof BENCH_KINDS)[number];

/** One line of a bench: a sample (or an ad-hoc form) and the engine run it became. */
export type BenchItem = {
  sampleId: string | null;
  title: string;
  label: SampleLabel | null;
  inputs: RunInputs;
  idealOutput: string | null;
  /** The engine run, or null when the engine refused the request. */
  runId: string | null;
  /** Why the engine refused it, in one line. */
  error: string | null;
};

/**
 * One bench run: an agent version against a set of samples (or one ad-hoc
 * form) through the engine. The runs themselves live in the run store; the
 * bench keeps the list and what each run was compared against.
 */
export type Bench = {
  id: string;
  workspaceId: string;
  agentId: string;
  version: string;
  kind: BenchKind;
  /** Set when the bench is one agent of a batch. */
  batchId: string | null;
  /** The Brand Brain the builder picked for every run (phase 7). Null for the default. Missing on older benches. */
  brandBrainId?: string | null;
  items: BenchItem[];
  status: "running" | "done" | "cancelled";
  /** The sum of the first-call estimates, and the sum of the spend caps, in micro-dollars. */
  estimateMicroUsd: number;
  capMicroUsd: number;
  createdBy: string;
  createdAt: string;
  finishedAt: string | null;
};

export const RATINGS = ["good", "ok", "bad"] as const;
export type RatingValue = (typeof RATINGS)[number];

/** The builder's rating of one run. One per run; rating again replaces it. */
export type Rating = {
  id: string;
  workspaceId: string;
  agentId: string;
  version: string;
  runId: string;
  rating: RatingValue;
  note: string;
  createdBy: string;
  createdAt: string;
};

/** A batch: every sample of a set of agents, one bench per agent. */
export type Batch = {
  id: string;
  workspaceId: string;
  agentIds: string[];
  benchIds: string[];
  status: "running" | "done" | "cancelled";
  estimateMicroUsd: number;
  capMicroUsd: number;
  createdBy: string;
  createdAt: string;
  finishedAt: string | null;
};

export const BENCH_LIMITS = {
  /** Runs one bench may start. */
  runsPerBench: 50,
  /** Runs one batch may start, across its agents. */
  runsPerBatch: 400,
  /** Above this estimate a batch needs the builder's confirmation, in US dollars. */
  batchConfirmUsd: 0.5,
  ratingNote: 300,
} as const;

export const BUILDER_LIMITS = {
  samplesPerAgent: 50,
  sampleTitle: 80,
  sampleOutput: 20_000,
  sampleNote: 500,
  sampleLinks: 10,
  sampleFiles: 6,
  boardItemsPerAgent: 60,
  boardNote: 300,
  boardText: 2_000,
  descriptionMax: 2_000,
} as const;
