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
