/**
 * The quality gate's small parts (phase 12): the rewrite message, which
 * draft wins, and the report a run keeps. The loop itself runs inside the
 * engine's attempt (src/lib/runs/execute.ts), so a rewrite shares the run's
 * spend cap, its model routes and its cancel.
 */
import { dataBlock } from "@/lib/runs/prompt";
import type { RunOutput } from "@/lib/runs/output";
import type { QualityReading } from "./evaluate";
import type { GateSettings, GateStop, QualityAttempt, QualityReport } from "./types";

/**
 * The rewrite asked of the model: the reasons go in a data block, like every
 * other piece of material, so text quoted from a draft never reads as an
 * instruction.
 */
export function rewriteInstruction(reasons: string[]): string {
  return [
    "Rewrite your last answer. It did not pass WOVI's quality check. What to fix is in the data block below.",
    dataBlock("quality.notes", reasons.map((r) => `- ${r}`).join("\n")),
    "Fix every point, keep everything that already worked (the facts, the names, the numbers, the voice), and answer again in exactly the same JSON format.",
  ].join("\n\n");
}

/** A scored draft. */
export type GateDraft = { output: RunOutput | null; reading: QualityReading | null; error?: string };

/** Whether draft b beats draft a: ready beats not ready, then the higher score. A rewrite wins a tie. */
export function beats(b: QualityReading, a: QualityReading): boolean {
  if (b.ready !== a.ready) return b.ready;
  return b.score >= a.score;
}

/** The report a run keeps: the used draft's checks and score, and every draft in order. */
export function gateReport(drafts: GateDraft[], used: number, gate: GateSettings, stopped: GateStop | null, judge: boolean): QualityReport {
  const best = drafts[used].reading!;
  const first = drafts[0].reading!;
  const attempts: QualityAttempt[] = drafts.map((d, n) => ({
    n,
    score: d.reading?.score ?? 0,
    ready: d.reading?.ready ?? false,
    failing: d.reading?.failing ?? [],
    failed: d.reading?.failed ?? [],
    reasons: d.reading?.reasons ?? [],
    output: n === used ? null : d.output,
    ...(d.error ? { error: d.error } : {}),
  }));
  return {
    version: 1,
    score: best.score,
    threshold: gate.minScore,
    verdict: best.ready ? "ready" : "needs_review",
    checks: best.checks,
    reasons: best.ready ? [] : [...best.reasons, ...stopReason(stopped, gate)],
    rewrites: drafts.length - 1,
    maxRewrites: gate.maxRewrites,
    firstScore: first.score,
    attempts,
    used,
    stopped: best.ready ? null : stopped,
    judge,
  };
}

function stopReason(stopped: GateStop | null, gate: GateSettings): string[] {
  switch (stopped) {
    case "cap":
      return [`Still under the bar after ${gate.maxRewrites === 1 ? "one rewrite" : `${gate.maxRewrites} rewrites`}, so a person decides.`];
    case "budget":
      return ["Not rewritten again: the run's budget would not cover another try."];
    case "error":
      return ["The rewrite did not come back, so the best draft so far is kept."];
    case "off":
      return ["This agent does not rewrite on its own."];
    default:
      return [];
  }
}
