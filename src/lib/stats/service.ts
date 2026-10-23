/**
 * The reading side of live stats: which runs count, the public numbers per
 * agent, and the builder's numbers per version with the edits and notes
 * people allowed builders to read.
 *
 * Only real use counts for the numbers: runs in the agent's own workspace
 * (the builder's bench and tests) never do, nor runs a builder made anywhere,
 * nor bench runs (free), nor workspaces listed as test workspaces
 * (WOVI_STATS_EXCLUDE_WORKSPACES). Pipeline steps count like any run.
 */
import type { Principal } from "@/lib/accounts/accounts";
import { compareSemver } from "@/lib/agents/semver";
import { copyAll } from "@/lib/app/results";
import type { Run } from "@/lib/runs/run";
import { computeStats, publicStats } from "./metrics";
import type { StatsStore } from "./store";
import { FEEDBACK_SOURCES, MIN_COUNT, type FeedbackRow, type FeedbackSource, type PublicStats, type StatsNumbers, type ThumbRating } from "./types";

export type StatsServiceOptions = {
  store: Pick<StatsStore, "feedback">;
  /** Every run of an agent across workspaces (RunEngine.runsOfAgent). */
  runs: { runsOfAgent(agentWorkspaceId: string, agentId: string): Promise<Run[]> };
  /** User ids of builders. Their runs never count. */
  builders?: () => Promise<Set<string>>;
  /** Who made each run or pipeline run (the review items' maker), for runs that carry no user. */
  makers?: () => Promise<Map<string, string | null>>;
  /** Test workspaces whose runs never count. */
  excludedWorkspaces?: readonly string[];
  /** Phase 18: whether a person allows builders to read their edits and notes. Left out, nobody's text shows. */
  mayLearnFrom?: (userId: string) => Promise<boolean>;
  /** Throws for anyone who is not a builder. */
  requireBuilder: (caller: Principal) => Promise<unknown>;
  /** The minimum count before a number shows. */
  min?: number;
};

/** One edit as the builder reads it: the lines that changed (up to four), and how many stayed as they were. */
export type EditExample = { runId: string; at: string; distance: number; lines: { draft: string | null; kept: string | null }[]; same: number };

/** The changed lines of an edit, paired by position after dropping the lines both kept. */
export function changedLines(draft: string, kept: string, max = 4): { lines: { draft: string | null; kept: string | null }[]; same: number } {
  const a = draft.split("\n").map((l) => l.trim()).filter(Boolean);
  const b = kept.split("\n").map((l) => l.trim()).filter(Boolean);
  const inB = new Set(b);
  const inA = new Set(a);
  const gone = a.filter((l) => !inB.has(l));
  const added = b.filter((l) => !inA.has(l));
  const same = a.length - gone.length;
  const lines = Array.from({ length: Math.max(gone.length, added.length) }, (_, i) => ({ draft: gone[i] ? clip(gone[i], 160) : null, kept: added[i] ? clip(added[i], 160) : null })).slice(0, max);
  return { lines, same };
}
export type RatingNote = { runId: string; at: string; rating: ThumbRating; note: string };

export type VersionStats = {
  version: string;
  /** People's runs only. */
  live: StatsNumbers;
  /** Runs in the agent's own workspace: the bench and the builder's tries. */
  benchRuns: number;
  /** Where the feedback came from. */
  sources: Record<FeedbackSource, number>;
  /** Edits whose text the person allowed builders to read, newest first. */
  edits: EditExample[];
  /** Edits counted but not shown, because the person did not allow it. */
  editsHidden: number;
  notes: RatingNote[];
  notesHidden: number;
};

export type Eligibility = { excluded: Set<string>; builders: Set<string>; makers: Map<string, string | null> };

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 3).trimEnd()}...` : s);

/** Whether a run counts for the live numbers. */
export function countsForStats(run: Pick<Run, "id" | "workspaceId" | "agent" | "credits" | "parent">, ctx: Eligibility): boolean {
  if (run.workspaceId === run.agent.workspaceId) return false;
  if (ctx.excluded.has(run.workspaceId)) return false;
  if (run.credits?.mode === "free") return false;
  const maker = run.credits?.userId ?? ctx.makers.get(run.parent?.pipelineRunId ?? run.id) ?? null;
  return !(maker && ctx.builders.has(maker));
}

export class StatsService {
  constructor(private readonly o: StatsServiceOptions) {}

  get min(): number {
    return this.o.min ?? MIN_COUNT;
  }

  async eligibility(): Promise<Eligibility> {
    return {
      excluded: new Set(this.o.excludedWorkspaces ?? []),
      builders: this.o.builders ? await this.o.builders() : new Set(),
      makers: this.o.makers ? await this.o.makers() : new Map(),
    };
  }

  /** The runs of an agent that count, and every feedback event on it. */
  async realRuns(agentWorkspaceId: string, agentId: string, ctx?: Eligibility): Promise<{ runs: Run[]; all: Run[]; feedback: FeedbackRow[] }> {
    const all = await this.o.runs.runsOfAgent(agentWorkspaceId, agentId);
    const e = ctx ?? (await this.eligibility());
    const runs = all.filter((r) => countsForStats(r, e));
    const feedback = (await this.o.store.feedback.find({ agentId })).filter((f) => f.agentWorkspaceId === agentWorkspaceId);
    return { runs, all, feedback };
  }

  /** The public numbers of one agent, every version together. */
  async agentStats(agentWorkspaceId: string, agentId: string, ctx?: Eligibility): Promise<PublicStats> {
    const { runs, feedback } = await this.realRuns(agentWorkspaceId, agentId, ctx);
    return publicStats(agentId, computeStats(runs, feedback, this.min), this.min);
  }

  async agentsStats(agentWorkspaceId: string, agentIds: string[]): Promise<Record<string, PublicStats>> {
    const ctx = await this.eligibility();
    const out: Record<string, PublicStats> = {};
    for (const id of agentIds) out[id] = await this.agentStats(agentWorkspaceId, id, ctx);
    return out;
  }

  /** The builder's numbers per version, newest first, with what people allowed builders to read. Builders only. */
  async versions(caller: Principal, agentWorkspaceId: string, agentId: string, known: string[] = []): Promise<VersionStats[]> {
    await this.o.requireBuilder(caller);
    const { runs, all, feedback } = await this.realRuns(agentWorkspaceId, agentId);
    const versions = [...new Set([...known, ...all.map((r) => r.agent.version)])].sort((a, b) => compareSemver(b, a));
    const byId = new Map(all.map((r) => [r.id, r]));
    const asked = new Map<string, boolean>();
    const allowed = async (by: string) => {
      if (!by.startsWith("usr_") || !this.o.mayLearnFrom) return false;
      if (!asked.has(by)) asked.set(by, await this.o.mayLearnFrom(by).catch(() => false));
      return asked.get(by)!;
    };
    const real = new Set(runs.map((r) => r.id));
    const out: VersionStats[] = [];
    for (const version of versions) {
      const mine = runs.filter((r) => r.agent.version === version);
      const fb = feedback.filter((f) => f.version === version && real.has(f.runId));
      const sources = Object.fromEntries(FEEDBACK_SOURCES.map((s) => [s, fb.filter((f) => f.source === s).length])) as Record<FeedbackSource, number>;
      const edits: EditExample[] = [];
      let editsHidden = 0;
      for (const f of fb.filter((f) => f.action === "edit").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
        const run = byId.get(f.runId);
        if (f.kept && run?.output && (await allowed(f.by))) {
          if (edits.length < 6) edits.push({ runId: f.runId, at: f.updatedAt, distance: f.distance ?? 0, ...changedLines(copyAll(run.output), f.kept) });
        } else editsHidden++;
      }
      const notes: RatingNote[] = [];
      let notesHidden = 0;
      for (const f of fb.filter((f) => f.action === "rating" && f.note).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
        if (await allowed(f.by)) {
          if (notes.length < 6) notes.push({ runId: f.runId, at: f.updatedAt, rating: f.rating ?? "up", note: f.note! });
        } else notesHidden++;
      }
      out.push({
        version,
        live: computeStats(mine, fb, this.min),
        benchRuns: all.filter((r) => r.agent.version === version && r.workspaceId === agentWorkspaceId).length,
        sources,
        edits,
        editsHidden,
        notes,
        notesHidden,
      });
    }
    return out;
  }
}
