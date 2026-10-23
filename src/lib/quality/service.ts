/**
 * The quality system's reading side (phase 12): it gathers runs, review
 * decisions and bench ratings from their stores and hands them to the pure
 * math in scorecard.ts and rollup.ts. Also the reference source the engine
 * reads golden and bad samples from.
 *
 * The public scorecard counts runs across every workspace that used the
 * agent, but only ever returns counts and averages. Bench runs in the
 * builder's own workspace are left out of it. The builder roll-up is for
 * builders only.
 */
import type { Collection } from "@/lib/accounts/store";
import type { Principal } from "@/lib/accounts/accounts";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { ReviewRow } from "@/lib/app/types";
import type { Rating, Sample } from "@/lib/builder/types";
import type { ReferenceSource } from "@/lib/runs/engine";
import type { ExampleSample, ExampleSource } from "@/lib/runs/examples";
import type { Run } from "@/lib/runs/run";
import type { ActivityRow, ItemRow } from "@/lib/team/types";
import type { QualityReferences } from "./checks";
import { builderRollup, type VersionRollup } from "./rollup";
import { publicScorecard, type PublicScorecard, type RunDecision } from "./scorecard";

export type QualityServiceOptions = {
  /** Every run of an agent across workspaces (RunEngine.runsOfAgent). */
  runs: { runsOfAgent(agentWorkspaceId: string, agentId: string): Promise<Run[]> };
  /** Phase 9 decisions on runs. */
  reviews: Pick<Collection<ReviewRow>, "find">;
  /** Phase 11 review items and their activity. Left out, only phase 9 decisions count. */
  items?: Pick<Collection<ItemRow>, "find">;
  activity?: Pick<Collection<ActivityRow>, "find">;
  /** Bench ratings (phase 6). */
  ratings: Pick<Collection<Rating>, "find">;
  /** Throws for anyone who is not a builder (Builder.requireBuilder). */
  requireBuilder: (caller: Principal) => Promise<unknown>;
  /** The builder's own workspace, whose runs are bench runs. */
  benchWorkspaceId?: string;
  /**
   * Phase 18 (GDPR Art. 7): whether a person said their edits may be used to
   * improve agents. The builder roll-up shows a draft's text and a change
   * request's words only from people who did, and from the bench. Counts and
   * scores are not affected. Left out, everything shows (tests and tools).
   */
  mayLearnFrom?: (userId: string) => Promise<boolean>;
};

const CHANGES = /^Changes asked:\s*/i;

export class QualityService {
  constructor(private readonly o: QualityServiceOptions) {}

  private get bench() {
    return this.o.benchWorkspaceId ?? PLATFORM_WORKSPACE_ID;
  }

  /** The latest decision on each of these runs, with every change request on it. */
  async decisions(runIds: Set<string>, noteBy: (userId: string) => Promise<boolean> = async () => true): Promise<RunDecision[]> {
    if (!runIds.size) return [];
    const out = new Map<string, RunDecision>();
    const items = this.o.items ? (await this.o.items.find({ kind: "run" })).filter((i) => runIds.has(i.id)) : [];
    const asked: ActivityRow[] = [];
    for (const a of this.o.activity ? (await this.o.activity.find({ kind: "changes_requested" })).filter((a) => runIds.has(a.itemId)) : []) {
      // Without consent the request still counts; its words are left out.
      asked.push((await noteBy(a.by)) ? a : { ...a, note: "" });
    }
    for (const it of items) {
      const all = asked.filter((a) => a.itemId === it.id).sort((a, b) => a.at.localeCompare(b.at));
      const notes = all.map((a) => a.note).filter(Boolean);
      if (it.status === "approved" || it.status === "rejected" || it.status === "changes_requested") {
        out.set(it.id, { runId: it.id, outcome: it.status, changesAsked: all.length || (it.status === "changes_requested" ? 1 : 0), changeNotes: notes, at: it.last?.at ?? it.updatedAt });
      }
    }
    // Phase 9 decisions on runs the team never touched. A change request shows there as a rejection with its note.
    for (const r of await this.o.reviews.find({})) {
      if (!runIds.has(r.runId) || out.has(r.runId)) continue;
      const changes = r.decision === "rejected" && CHANGES.test(r.note);
      const words = changes && (await noteBy(r.by)) ? [r.note.replace(CHANGES, "")] : [];
      out.set(r.runId, { runId: r.runId, outcome: changes ? "changes_requested" : r.decision, changesAsked: changes ? 1 : 0, changeNotes: words, at: r.at });
    }
    return [...out.values()];
  }

  /** The public scorecard of one agent. People's runs only, never the builder's bench. */
  async scorecard(agentWorkspaceId: string, agentId: string): Promise<PublicScorecard> {
    const runs = (await this.o.runs.runsOfAgent(agentWorkspaceId, agentId)).filter((r) => r.workspaceId !== this.bench);
    return publicScorecard(agentId, runs, await this.decisions(new Set(runs.map((r) => r.id))));
  }

  async scorecards(agentWorkspaceId: string, agentIds: string[]): Promise<Record<string, PublicScorecard>> {
    const out: Record<string, PublicScorecard> = {};
    for (const id of agentIds) out[id] = await this.scorecard(agentWorkspaceId, id);
    return out;
  }

  /** The builder's roll-up per version: bench runs and people's runs together. Builders only. */
  async rollup(caller: Principal, agentWorkspaceId: string, agentId: string): Promise<VersionRollup[]> {
    await this.o.requireBuilder(caller);
    const runs = await this.o.runs.runsOfAgent(agentWorkspaceId, agentId);
    const ratings = await this.o.ratings.find({ agentId });
    const may = this.o.mayLearnFrom;
    if (!may) return builderRollup(runs, await this.decisions(new Set(runs.map((r) => r.id))), ratings, this.bench);
    const asked = new Map<string, boolean>();
    const allowed = async (userId: string | null | undefined) => {
      if (!userId || !userId.startsWith("usr_")) return false;
      if (!asked.has(userId)) asked.set(userId, await may(userId).catch(() => false));
      return asked.get(userId)!;
    };
    const makers = new Map((this.o.items ? await this.o.items.find({ kind: "run" }) : []).map((i) => [i.id, i.makerId]));
    const ok = new Set<string>();
    for (const r of runs) if (r.workspaceId === this.bench || (await allowed(r.credits?.userId ?? makers.get(r.id) ?? null))) ok.add(r.id);
    const decisions = await this.decisions(new Set(runs.map((r) => r.id)), allowed);
    return builderRollup(runs, decisions, ratings, this.bench, 6, (r) => ok.has(r.id));
  }
}

/** An ideal output as stored (readable text) turned back into lines to compare with. Labels like "Say:" and headings are dropped. */
export function sampleLines(idealOutput: string): string[] {
  return idealOutput
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+\.\s+|[A-Z][\w ]{0,20}(\(\d+ s\))?:\s*)/, "").trim())
    .filter((l) => l.length >= 12);
}

/** The engine's example source on the builder's samples (tuning level 2): an agent's gold and bad samples as they are stored. */
export function sampleExamples(samples: Pick<Collection<Sample>, "find">): ExampleSource {
  return {
    async get(agent): Promise<ExampleSample[]> {
      const rows = await samples.find({ workspaceId: agent.workspaceId, agentId: agent.id });
      return rows.map((s) => ({ id: s.id, title: s.title, label: s.label, inputs: s.inputs, idealOutput: s.idealOutput, note: s.note, createdAt: s.updatedAt ?? s.createdAt }));
    },
  };
}

/** The engine's reference source on the builder's samples: an agent's golden and bad samples, as lines. `exclude` leaves samples out (a bench run's own). */
export function sampleReferences(samples: Pick<Collection<Sample>, "find">): ReferenceSource {
  return {
    async get(agent, opts = {}): Promise<QualityReferences> {
      const skip = new Set(opts.exclude ?? []);
      const rows = (await samples.find({ workspaceId: agent.workspaceId, agentId: agent.id })).filter((s) => !skip.has(s.id));
      return {
        gold: rows.filter((s) => s.label === "gold").flatMap((s) => sampleLines(s.idealOutput)).slice(0, 80),
        bad: rows.filter((s) => s.label === "bad").flatMap((s) => sampleLines(s.idealOutput)).slice(0, 40),
      };
    },
  };
}
