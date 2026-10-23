/**
 * The builder's learning loop (phase 12): everything people and the gate
 * said about an agent, rolled up per version, so Funkai can see what to tune.
 * Which checks fail most, examples of drafts that failed, the most common
 * change requests, approvals and rejections, and the bench ratings. It reads
 * and counts; it never changes an agent's instructions.
 */
import { compareSemver } from "@/lib/agents/semver";
import type { Rating } from "@/lib/builder/types";
import { outputTexts, type RunOutput } from "@/lib/runs/output";
import type { Run } from "@/lib/runs/run";
import { CHECKS } from "./data";
import type { RunDecision } from "./scorecard";
import { QUALITY_CHECK_IDS, type QualityCheckId } from "./types";

export type CheckTally = { id: QualityCheckId; label: string; fails: number; weak: number; /** Share of scored drafts where it failed or was weak, 0 to 1. */ share: number };

export type FailingExample = {
  runId: string;
  at: string;
  score: number;
  /** "First draft" when the gate rewrote it, "Result" when it went to review as it was. */
  kind: "first_draft" | "result";
  reasons: string[];
  text: string;
  /** For a first draft: what the rewrite scored. */
  rewrittenTo: number | null;
};

export type ChangeRequest = { note: string; count: number };

export type VersionRollup = {
  version: string;
  /** Runs that gave a result: people's runs and bench runs. */
  runs: number;
  benchRuns: number;
  scored: number;
  passRate: number | null;
  firstTryRate: number | null;
  avgScore: number | null;
  avgFirstScore: number | null;
  /** Runs the gate rewrote, and how many of those then passed. */
  rewritten: number;
  savedByRewrite: number;
  /** Drafts scored, first drafts and rewrites together, for the tallies. */
  drafts: number;
  checks: CheckTally[];
  examples: FailingExample[];
  decisions: { approved: number; changes: number; rejected: number };
  changeRequests: ChangeRequest[];
  /** Words that come up most in change requests. */
  changeWords: { word: string; count: number }[];
  ratings: { good: number; ok: number; bad: number; notes: string[] };
  lastRunAt: string | null;
};

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const STOP = new Set("a an the and or but it its this that to of in on for with is are was be not no more less make made it's i we you they please can just".split(" "));

/** A draft as one short line of text for an example. */
export function draftText(output: RunOutput | null, max = 220): string {
  if (!output) return "";
  const t = outputTexts(output).join(" / ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

/** "Make it shorter." and "make it shorter" are one request. */
function normalizeNote(note: string): string {
  return note.replace(/^Changes asked:\s*/i, "").trim().replace(/[.!\s]+$/, "").replace(/\s+/g, " ");
}

/**
 * Per version, newest first. `benchWorkspaceId` names the builder's own
 * workspace, whose runs are bench runs.
 */
export function builderRollup(runs: Run[], decisions: RunDecision[], ratings: Rating[], benchWorkspaceId: string, maxExamples = 6, learnable: (run: Run) => boolean = () => true): VersionRollup[] {
  const versions = [...new Set([...runs.map((r) => r.agent.version), ...ratings.map((r) => r.version)])].sort((a, b) => compareSemver(b, a));
  const byRun = new Map(decisions.map((d) => [d.runId, d]));
  return versions.map((version) => {
    const mine = runs.filter((r) => r.agent.version === version && r.status === "succeeded");
    const scored = mine.filter((r) => r.quality);
    const passed = scored.filter((r) => r.quality!.verdict === "ready");
    const rewritten = scored.filter((r) => r.quality!.rewrites > 0);

    const tally = new Map<QualityCheckId, { fails: number; weak: number }>();
    let drafts = 0;
    const examples: FailingExample[] = [];
    for (const r of [...scored].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const q = r.quality!;
      for (const a of q.attempts) if (!a.error) drafts++;
      // The used draft's checks are on the report; earlier drafts keep the ids of what failed.
      for (const c of q.checks) {
        const t = tally.get(c.id) ?? { fails: 0, weak: 0 };
        if (c.status === "fail") t.fails++;
        if (c.status === "weak") t.weak++;
        tally.set(c.id, t);
      }
      for (const a of q.attempts) {
        if (a.n === q.used || a.error) continue;
        for (const id of a.failing) {
          const t = tally.get(id) ?? { fails: 0, weak: 0 };
          if ((a.failed ?? []).includes(id)) t.fails++;
          else t.weak++;
          tally.set(id, t);
        }
      }
      // One example per run: the result that still went to review, or the first draft the gate sent back.
      // Phase 18: a draft's text is shown only from the bench or from people who said their edits may improve agents.
      if (examples.length >= maxExamples || !learnable(r)) continue;
      const first = q.attempts.find((a) => a.n === 0 && a.n !== q.used && !a.ready && a.output);
      if (q.verdict !== "ready") {
        examples.push({ runId: r.id, at: r.createdAt, score: q.score, kind: "result", reasons: q.reasons.slice(0, 3), text: draftText(r.output), rewrittenTo: null });
      } else if (first) {
        examples.push({ runId: r.id, at: r.createdAt, score: first.score, kind: "first_draft", reasons: first.reasons.slice(0, 3), text: draftText(first.output), rewrittenTo: q.score });
      }
    }
    const checks: CheckTally[] = QUALITY_CHECK_IDS.filter((id) => tally.has(id))
      .map((id) => ({ id, label: CHECKS[id].label, fails: tally.get(id)!.fails, weak: tally.get(id)!.weak, share: drafts ? (tally.get(id)!.fails + tally.get(id)!.weak) / drafts : 0 }))
      .filter((c) => c.fails + c.weak > 0)
      .sort((a, b) => b.fails + b.weak - (a.fails + a.weak) || b.fails - a.fails);

    const ds = mine.map((r) => byRun.get(r.id)).filter((d): d is RunDecision => Boolean(d));
    const notes = ds.flatMap((d) => d.changeNotes).map(normalizeNote).filter(Boolean);
    const counted = new Map<string, { note: string; count: number }>();
    for (const n of notes) {
      const k = n.toLowerCase();
      const c = counted.get(k) ?? { note: n, count: 0 };
      c.count++;
      counted.set(k, c);
    }
    const wordCount = new Map<string, number>();
    for (const n of notes) for (const w of new Set(n.toLowerCase().match(/[a-z][a-z']{2,}/g) ?? [])) if (!STOP.has(w)) wordCount.set(w, (wordCount.get(w) ?? 0) + 1);

    const rs = ratings.filter((r) => r.version === version);
    const last = mine.map((r) => r.timings.finishedAt).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
    return {
      version,
      runs: mine.length,
      benchRuns: mine.filter((r) => r.workspaceId === benchWorkspaceId).length,
      scored: scored.length,
      passRate: scored.length ? passed.length / scored.length : null,
      firstTryRate: scored.length ? passed.filter((r) => r.quality!.rewrites === 0).length / scored.length : null,
      avgScore: mean(scored.map((r) => r.quality!.score)),
      avgFirstScore: mean(scored.map((r) => r.quality!.firstScore)),
      rewritten: rewritten.length,
      savedByRewrite: rewritten.filter((r) => r.quality!.verdict === "ready").length,
      drafts,
      checks,
      examples,
      decisions: {
        approved: ds.filter((d) => d.outcome === "approved").length,
        changes: ds.filter((d) => d.outcome === "changes_requested").length,
        rejected: ds.filter((d) => d.outcome === "rejected").length,
      },
      changeRequests: [...counted.values()].sort((a, b) => b.count - a.count || a.note.localeCompare(b.note)).slice(0, 6),
      changeWords: [...wordCount.entries()].map(([word, count]) => ({ word, count })).filter((w) => w.count > 1).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).slice(0, 8),
      ratings: { good: rs.filter((r) => r.rating === "good").length, ok: rs.filter((r) => r.rating === "ok").length, bad: rs.filter((r) => r.rating === "bad").length, notes: rs.map((r) => r.note).filter(Boolean).slice(0, 6) },
      lastRunAt: last,
    };
  });
}
