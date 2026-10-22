/**
 * The public scorecard per agent (phase 12): plain arithmetic on runs and
 * the people's decisions on them, with the numbers in plain words. No cost,
 * no model, nothing only builders may see.
 *
 * - runs: finished runs that gave a result.
 * - pass rate: runs that reached "ready" at the quality gate (after its own
 *   rewrites), out of the runs the gate read.
 * - average quality: the mean gate score of those runs.
 * - approval rate: results people approved, out of the results they decided.
 * - changes asked: results where someone asked for changes, out of the decided ones.
 */
import type { Run } from "@/lib/runs/run";

/** What happened to one run in review: its latest decision, and how many times changes were asked on it. */
export type RunDecision = {
  runId: string;
  outcome: "approved" | "changes_requested" | "rejected";
  /** Change requests on this result over all its rounds. */
  changesAsked: number;
  /** The notes of those change requests, newest last. */
  changeNotes: string[];
  at: string;
};

export type PublicScorecard = {
  agentId: string;
  runs: number;
  /** Runs the gate read. Runs from before phase 12 have no reading. */
  scored: number;
  passed: number;
  /** 0 to 1, or null with nothing scored. */
  passRate: number | null;
  /** Passed on the first draft, without a rewrite. */
  firstTry: number;
  avgScore: number | null;
  decided: number;
  approved: number;
  approvalRate: number | null;
  /** Decided results where changes were asked at least once. */
  changesAsked: number;
  changesRate: number | null;
  /** Enough runs for the numbers to mean something. */
  enough: boolean;
  /** The scorecard in words: a headline and one line per number. */
  words: { headline: string; lines: string[] };
};

/** Below this many runs the card says it is new. */
export const MIN_RUNS = 5;

const pct = (n: number | null) => (n === null ? "" : `${Math.round(n * 100)}%`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function publicScorecard(agentId: string, runs: Pick<Run, "id" | "status" | "quality">[], decisions: RunDecision[]): PublicScorecard {
  const done = runs.filter((r) => r.status === "succeeded");
  const scored = done.filter((r) => r.quality);
  const passed = scored.filter((r) => r.quality!.verdict === "ready");
  const firstTry = passed.filter((r) => r.quality!.rewrites === 0).length;
  const avg = mean(scored.map((r) => r.quality!.score));
  const ids = new Set(done.map((r) => r.id));
  const mine = decisions.filter((d) => ids.has(d.runId));
  const approved = mine.filter((d) => d.outcome === "approved").length;
  const changes = mine.filter((d) => d.changesAsked > 0 || d.outcome === "changes_requested").length;
  const card: Omit<PublicScorecard, "words"> = {
    agentId,
    runs: done.length,
    scored: scored.length,
    passed: passed.length,
    passRate: scored.length ? passed.length / scored.length : null,
    firstTry,
    avgScore: avg === null ? null : Math.round(avg),
    decided: mine.length,
    approved,
    approvalRate: mine.length ? approved / mine.length : null,
    changesAsked: changes,
    changesRate: mine.length ? changes / mine.length : null,
    enough: done.length >= MIN_RUNS,
  };
  return { ...card, words: scorecardWords(card) };
}

/** The numbers as a person reads them. */
export function scorecardWords(c: Omit<PublicScorecard, "words">): { headline: string; lines: string[] } {
  const headline = !c.scored
    ? "New agent: no scored runs yet"
    : !c.enough
      ? `New agent: ${c.passed} of ${c.scored} runs passed the quality bar so far`
      : `Passes the quality bar on ${pct(c.passRate)} of runs`;
  const lines: string[] = [];
  if (c.scored) lines.push(`${c.passed} of ${c.scored} runs passed the quality bar${c.firstTry < c.passed ? `, ${c.passed - c.firstTry} after a rewrite` : ""}.`);
  if (c.avgScore !== null) lines.push(`Average quality ${c.avgScore} out of 100.`);
  lines.push(c.decided ? `People approved ${c.approved} of ${c.decided} results they decided on.` : "No approvals or rejections yet.");
  if (c.decided) lines.push(c.changesAsked ? `Changes were asked on ${c.changesAsked} of ${c.decided}.` : "Nobody has asked for changes yet.");
  lines.push(`${c.runs} ${c.runs === 1 ? "run" : "runs"} in all.`);
  return { headline, lines };
}
