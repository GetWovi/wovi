/**
 * A pipeline run as the screens show it: one state, a title, each step in
 * plain words, the package as text to copy. Pure and client-safe.
 */
import type { PackageItem, PublicPipelineRun, PublicStepRun } from "@/lib/pipelines/run";
import type { PipelineSpec } from "@/lib/pipelines/spec";
import { outputText } from "@/lib/pipelines/values";
import { copyAll } from "./results";

export type PipelineState = "running" | "waiting" | "needs_review" | "ready" | "approved" | "rejected" | "failed" | "cancelled";

export const PIPELINE_STATE_LABELS: Record<PipelineState, string> = {
  running: "Running",
  waiting: "Your pick",
  needs_review: "Needs review",
  ready: "Ready",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Stopped",
  cancelled: "Cancelled",
};

export function pipelineState(run: Pick<PublicPipelineRun, "status" | "needsReview">): PipelineState {
  if (run.status === "ready") return run.needsReview ? "needs_review" : "ready";
  return run.status;
}

/** Waiting on the person: a pick, or the approve step. */
export function waitsForPerson(state: PipelineState): boolean {
  return state === "waiting" || state === "ready" || state === "needs_review";
}

export function pipelinePose(state: PipelineState): "move" | "wait" | "done" | "hello" {
  if (state === "running") return "move";
  if (state === "waiting") return "hello";
  if (state === "failed" || state === "cancelled") return "wait";
  return "done";
}

/** The run's title: the first text the person typed, shortened. */
export function pipelineTitle(run: Pick<PublicPipelineRun, "inputs" | "spec">, max = 90): string {
  for (const i of run.spec.inputs) {
    if (i.type !== "text" && i.type !== "long_text") continue;
    const v = run.inputs[i.key];
    if (typeof v === "string" && v.trim()) {
      const line = v.replace(/\s+/g, " ").trim();
      return line.length > max ? `${line.slice(0, max - 1).trimEnd()}...` : line;
    }
  }
  return "Untitled run";
}

export const STEP_LABELS: Record<PublicStepRun["status"], string> = {
  todo: "Up next",
  running: "Working",
  rewriting: "Rewriting",
  waiting: "Your pick",
  done: "Done",
  flagged: "Done, flagged",
  skipped: "Skipped",
  failed: "Stopped",
  cancelled: "Cancelled",
};

/** The step that is going or waiting, or the last one. */
export function currentStepIndex(run: Pick<PublicPipelineRun, "steps">): number {
  const i = run.steps.findIndex((s) => ["running", "rewriting", "waiting", "todo", "failed"].includes(s.status));
  return i === -1 ? run.steps.length - 1 : i;
}

/** How many steps are behind it, counting skipped ones. */
export function stepsDone(run: Pick<PublicPipelineRun, "steps">): number {
  return run.steps.filter((s) => s.status === "done" || s.status === "flagged" || s.status === "skipped").length;
}

/** One part of the package as text. */
export function partText(p: PackageItem): string {
  if (p.item) return p.item.text;
  if (!p.output) return "";
  return p.output.kind === "list" ? copyAll(p.output) : outputText(p.output);
}

/** The whole package as plain text, for one copy button. */
export function packageText(run: Pick<PublicPipelineRun, "package">): string {
  return (run.package ?? []).map((p) => `${p.label}\n${partText(p)}`).join("\n\n\n");
}

/** Every piece of text in a pipeline run, for search. */
export function pipelineSearchText(run: Pick<PublicPipelineRun, "inputs" | "package" | "pipeline">): string {
  const inputs = Object.values(run.inputs).flatMap((v) => (typeof v === "string" ? [v] : []));
  return [run.pipeline.name, ...inputs, packageText({ package: run.package })].join("\n").toLowerCase();
}

/** Short words for what a step does about choices and checks, for the chain view. */
export function stepTraits(step: PipelineSpec["steps"][number]): string[] {
  const out: string[] = [];
  if (step.runIf) out.push("Only when you ask for ideas");
  if (step.choose?.kind === "ask") out.push("You pick one");
  if (step.choose?.kind === "best_brand_fit") out.push("Takes the best brand fit");
  if (step.choose?.kind === "item") out.push(step.choose.index === 0 ? "Takes the first one" : `Takes number ${step.choose.index + 1}`);
  if (step.onFail?.rewrite) out.push(step.onFail.when === "brand" ? "Rewrites once if off brand" : "Rewrites once if a check fails");
  return out;
}
