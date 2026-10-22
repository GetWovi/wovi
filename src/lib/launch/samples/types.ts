import type { SampleLabel } from "@/lib/builder/types";
import type { RunOutput } from "@/lib/runs/output";

/**
 * One golden (or bad) sample for a launch agent. Inputs leave out the Brand
 * Brain: the installer fills the profile input with the id of the Brand Brain
 * named in `brain`, so the bench runs each sample against its own business.
 * The ideal output is typed, so tests can parse it with the engine's parser
 * and run the guardrails on it; the builder stores it as readable text.
 */
export type LaunchSample = {
  title: string;
  label: SampleLabel;
  /** The name of a launch Brand Brain. */
  brain: string;
  inputs: Record<string, unknown>;
  ideal: RunOutput;
  /** Why it is good, or what it gets wrong. */
  note: string;
};

export const items = (...xs: Record<string, string>[]): RunOutput => ({ kind: "list", items: xs });
export const lines = (...xs: string[]): RunOutput => ({ kind: "list", items: xs });
