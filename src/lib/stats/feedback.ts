/**
 * Feedback events from real use (product doc, section 6 and the Feedback
 * entity "run_id, action, diff, rating"): Use, Edit, Regenerate and the thumbs
 * rating, recorded where people act on a result: the run screen, the review
 * queue, the client view, pipeline picks and packages, the REST API and MCP.
 *
 * One event per action per run, by id `${runId}:${action}`: a second use or
 * regenerate changes nothing, a second edit or rating replaces the first.
 * Who may act is checked by the caller (AppApi, Team, the public API); this
 * service checks that the run exists in the workspace and has a result.
 *
 * Consent (phase 18, GDPR Art. 7): the text a person kept after editing is
 * stored only when they had turned on "Use my edits to improve agents"; the
 * edit distance is stored either way, because counts are fine.
 */
import { copyAll } from "@/lib/app/results";
import type { Run } from "@/lib/runs/run";
import { editDistance } from "./distance";
import type { StatsStore } from "./store";
import { FEEDBACK_ACTIONS, FEEDBACK_LIMITS, FEEDBACK_SOURCES, RATINGS, type FeedbackAction, type FeedbackHow, type FeedbackRow, type FeedbackSource, type ThumbRating } from "./types";

export class FeedbackError extends Error {
  constructor(
    readonly code: "not_found" | "not_ready" | "invalid_request",
    message: string,
  ) {
    super(message);
    this.name = "FeedbackError";
  }
}

export type FeedbackInput = {
  workspaceId: string;
  runId: string;
  action: FeedbackAction;
  /** A user id, `key:<id>` or `link:<id>`. */
  by: string;
  source: FeedbackSource;
  how?: FeedbackHow | null;
  /** Edit: the whole text the person kept. */
  kept?: string;
  /** Rating: up or down. */
  rating?: ThumbRating;
  /** Rating: an optional note. */
  note?: string | null;
};

export type FeedbackOptions = {
  store: Pick<StatsStore, "feedback">;
  runs: { getRun(workspaceId: string, runId: string): Promise<Run | null> };
  /** Whether a person allows their edits to improve agents. Left out, nobody's edit text is kept. */
  mayLearnFrom?: (userId: string) => Promise<boolean>;
  /** The runs a pipeline run used, step by step, for decisions on a whole package. */
  pipelineRuns?: (workspaceId: string, pipelineRunId: string) => Promise<string[]>;
  /** Called after an event is written, with the run (the canary check listens here). Never breaks a write. */
  onRecorded?: (row: FeedbackRow, run: Run) => void | Promise<void>;
  now?: () => Date;
};

/** What the screens show about one run: what this workspace already did with it. */
export type RunFeedback = {
  used: boolean;
  edited: { distance: number; at: string } | null;
  regenerated: boolean;
  rating: ThumbRating | null;
  note: string | null;
};

export function runFeedbackOf(rows: FeedbackRow[]): RunFeedback {
  const edit = rows.find((r) => r.action === "edit");
  const rating = rows.find((r) => r.action === "rating");
  return {
    used: rows.some((r) => r.action === "use"),
    edited: edit ? { distance: edit.distance ?? 0, at: edit.updatedAt } : null,
    regenerated: rows.some((r) => r.action === "regenerate"),
    rating: rating?.rating ?? null,
    note: rating?.note ?? null,
  };
}

export class Feedback {
  private readonly now: () => Date;

  constructor(private readonly o: FeedbackOptions) {
    this.now = o.now ?? (() => new Date());
  }

  /** Records one action on a run. Returns the stored event (the first one, for a repeated use or regenerate). */
  async record(input: FeedbackInput): Promise<FeedbackRow> {
    if (!FEEDBACK_ACTIONS.includes(input.action)) throw new FeedbackError("invalid_request", "Use, edit, regenerate or rating.");
    if (!FEEDBACK_SOURCES.includes(input.source)) throw new FeedbackError("invalid_request", "Unknown source.");
    if (typeof input.by !== "string" || !input.by) throw new FeedbackError("invalid_request", "Who acted is missing.");
    const run = await this.o.runs.getRun(input.workspaceId, input.runId);
    if (!run) throw new FeedbackError("not_found", "No such run.");
    if (run.status !== "succeeded" || !run.output || run.withheld) throw new FeedbackError("not_ready", "Only a finished result can be used, edited, run again or rated.");

    if (input.action === "edit") {
      if (typeof input.kept !== "string" || !input.kept.trim()) throw new FeedbackError("invalid_request", "Send the text you kept.");
      if (input.kept.length > FEEDBACK_LIMITS.keptChars) throw new FeedbackError("invalid_request", `The text can be at most ${FEEDBACK_LIMITS.keptChars.toLocaleString("en")} characters.`);
      const draft = copyAll(run.output);
      const distance = editDistance(draft, input.kept);
      // Kept exactly as it was: that is a use, not an edit.
      if (distance === 0) return this.record({ ...input, action: "use", how: "kept_edit", kept: undefined });
      const learn = input.by.startsWith("usr_") && this.o.mayLearnFrom ? await this.o.mayLearnFrom(input.by).catch(() => false) : false;
      return this.upsert(run, input, { distance, draftChars: draft.length, keptChars: input.kept.length, kept: learn ? input.kept : null });
    }
    if (input.action === "rating") {
      if (!RATINGS.includes(input.rating as ThumbRating)) throw new FeedbackError("invalid_request", "Thumbs up or down.");
      const note = typeof input.note === "string" ? input.note.replace(/\s+/g, " ").trim().slice(0, FEEDBACK_LIMITS.noteChars) : "";
      return this.upsert(run, input, { rating: input.rating!, note: note || null });
    }
    return this.once(run, input);
  }

  /** Every event on one run. */
  async forRun(workspaceId: string, runId: string): Promise<FeedbackRow[]> {
    return (await this.o.store.feedback.find({ runId })).filter((r) => r.workspaceId === workspaceId);
  }

  async stateOf(workspaceId: string, runId: string): Promise<RunFeedback> {
    return runFeedbackOf(await this.forRun(workspaceId, runId));
  }

  /**
   * A decision on a whole pipeline package counts for each step run it used:
   * approving it is a use of every one, asking for changes a regenerate.
   * Steps that never gave a result are skipped.
   */
  async forPipeline(input: Omit<FeedbackInput, "runId"> & { pipelineRunId: string }): Promise<FeedbackRow[]> {
    const ids = this.o.pipelineRuns ? await this.o.pipelineRuns(input.workspaceId, input.pipelineRunId) : [];
    const out: FeedbackRow[] = [];
    for (const runId of ids) {
      try {
        out.push(await this.record({ ...input, runId }));
      } catch (err) {
        if (!(err instanceof FeedbackError)) throw err;
      }
    }
    return out;
  }

  /* ---------- writes ---------- */

  private base(run: Run, input: FeedbackInput, at: string): FeedbackRow {
    return {
      id: `${run.id}:${input.action}`,
      runId: run.id,
      workspaceId: run.workspaceId,
      agentWorkspaceId: run.agent.workspaceId,
      agentId: run.agent.id,
      version: run.agent.version,
      action: input.action,
      source: input.source,
      how: input.how ?? null,
      by: input.by,
      at,
      updatedAt: at,
    };
  }

  /** Use and regenerate: the first one stays. */
  private async once(run: Run, input: FeedbackInput): Promise<FeedbackRow> {
    const id = `${run.id}:${input.action}`;
    const have = await this.o.store.feedback.get(id);
    if (have) return have;
    const row = this.base(run, input, this.now().toISOString());
    try {
      await this.o.store.feedback.insert(row);
    } catch (err) {
      // Two clicks at once: the other one won.
      const now = await this.o.store.feedback.get(id);
      if (now) return now;
      throw err;
    }
    await this.after(row, run);
    return row;
  }

  /** Edit and rating: given again, the latest replaces the first; when it first happened stays. */
  private async upsert(run: Run, input: FeedbackInput, fields: Partial<FeedbackRow>): Promise<FeedbackRow> {
    const id = `${run.id}:${input.action}`;
    const at = this.now().toISOString();
    const have = await this.o.store.feedback.get(id);
    const row: FeedbackRow = { ...this.base(run, input, have?.at ?? at), ...fields, updatedAt: at };
    if (have) await this.o.store.feedback.update(row);
    else {
      try {
        await this.o.store.feedback.insert(row);
      } catch {
        await this.o.store.feedback.update(row);
      }
    }
    await this.after(row, run);
    return row;
  }

  private async after(row: FeedbackRow, run: Run) {
    if (!this.o.onRecorded) return;
    try {
      await this.o.onRecorded(row, run);
    } catch (err) {
      console.error("A feedback listener failed:", err);
    }
  }
}

/**
 * A review decision as feedback (wired to Team.onDecided): the final approval
 * is a use of the result, asking for changes is a regenerate. For a pipeline
 * run it counts for every step run its package used. A first yes that still
 * waits for a second, and a rejection, are not feedback actions.
 */
export async function feedbackForDecision(fb: Feedback, e: { workspaceId: string; kind: "run" | "pipeline"; id: string; outcome: string; by: string; via: "member" | "client" }): Promise<FeedbackRow[]> {
  const action: FeedbackAction | null = e.outcome === "approved" ? "use" : e.outcome === "changes_requested" ? "regenerate" : null;
  if (!action) return [];
  const how: FeedbackHow = action === "use" ? "approve" : "changes_asked";
  const source: FeedbackSource = e.via === "client" ? "client" : e.kind === "pipeline" ? "pipeline" : "review";
  if (e.kind === "pipeline") return fb.forPipeline({ workspaceId: e.workspaceId, pipelineRunId: e.id, action, by: e.by, source, how });
  try {
    return [await fb.record({ workspaceId: e.workspaceId, runId: e.id, action, by: e.by, source, how })];
  } catch (err) {
    if (err instanceof FeedbackError) return [];
    throw err;
  }
}
