"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/account/ActionForm";
import { AccountError } from "@/lib/accounts/errors";
import { RegistryError, type CreateInput, type UpdateInput } from "@/lib/agents/registry";
import type { Bump } from "@/lib/agents/semver";
import type { AgentSpec } from "@/lib/agents/spec";
import type { BatchPlan, BatchView, BenchEstimate, BenchRequest, BenchView } from "@/lib/builder/bench";
import type { DraftResult } from "@/lib/builder/drafter";
import type { Scorecard } from "@/lib/builder/scoring";
import { builderAction } from "@/lib/builder/server";
import type { FileKind, StoredFile } from "@/lib/builder/storage";
import type { BoardItem, BoardKind, RatingValue, Sample, SampleLabel } from "@/lib/builder/types";
import type { VersionCompare } from "@/lib/builder/versions";
import type { SaveRelease } from "@/lib/builder/builder";
import { ReleaseError } from "@/lib/stats/releases";
import type { CanaryThresholds } from "@/lib/stats/types";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: string; issues?: string[] };

/** Runs a builder change and turns known errors into a message for the screen. */
async function run<T>(csrf: string, agentId: string | null, fn: (ctx: Awaited<ReturnType<typeof builderAction>>) => Promise<T>, opts: { quiet?: boolean } = {}): Promise<Result<T>> {
  try {
    const ctx = await builderAction(csrf);
    const value = await fn(ctx);
    if (!opts.quiet) {
      revalidatePath("/builder");
      if (agentId) revalidatePath(`/builder/agents/${agentId}`, "layout");
    }
    return { ok: true, value };
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message, code: err.code };
    if (err instanceof RegistryError) return { ok: false, error: err.message.split("\n")[0], code: err.code, issues: err.issues };
    if (err instanceof ReleaseError) return { ok: false, error: err.message, code: err.code, issues: err.issues };
    throw err;
  }
}

/* ---------- Drafting ---------- */

export async function draftAgent(csrf: string, description: string): Promise<Result<DraftResult>> {
  return run(csrf, null, ({ builder, me }) => builder.draft(me, description));
}

export async function createAgent(csrf: string, spec: CreateInput): Promise<Result<{ id: string }>> {
  return run(csrf, null, async ({ builder, me }) => {
    const created = await builder.createAgent(me, spec);
    return { id: created.id };
  });
}

/* ---------- The editor ---------- */

export async function saveAgent(csrf: string, id: string, changes: UpdateInput, opts: { bump?: Bump; note?: string; canaryShare?: number | null }): Promise<Result<{ version: string; canary: number | null }>> {
  return run(csrf, id, async ({ builder, me }) => {
    const bump = opts.bump && ["patch", "minor", "major"].includes(opts.bump) ? opts.bump : "patch";
    const note = typeof opts.note === "string" && opts.note.trim() ? opts.note.trim().slice(0, 200) : undefined;
    const release = releaseOf(opts.canaryShare);
    const saved = await builder.saveAgent(me, id, changes, { bump, note, ...(release ? { release } : {}) });
    return { version: saved.version, canary: release?.share ?? null };
  });
}

/** A live agent's save goes out as a canary on this share of live runs (0 keeps it to the bench). */
function releaseOf(share: unknown): Extract<SaveRelease, { mode: "canary" }> | null {
  if (typeof share !== "number" || !Number.isInteger(share)) return null;
  return { mode: "canary", share };
}

export type StatusAction = "publish" | "unpublish" | "hide" | "unhide";

export async function setAgentStatus(csrf: string, id: string, action: StatusAction): Promise<Result<{ status: AgentSpec["status"] }>> {
  return run(csrf, id, async ({ builder, me }) => {
    const fn = { publish: builder.publish, unpublish: builder.unpublish, hide: builder.hide, unhide: builder.unhide }[action];
    if (!fn) throw new AccountError("invalid_request", "Unknown action.");
    const spec = await fn.call(builder, me, id);
    return { status: spec.status };
  });
}

/* ---------- Files ---------- */

/** A multipart form with `kind` and `file`. Returns the stored file's metadata. */
export async function uploadFile(csrf: string, formData: FormData): Promise<Result<StoredFile>> {
  return run(csrf, null, async ({ builder, me }) => {
    const kind = String(formData.get("kind") ?? "") as FileKind;
    if (kind !== "image" && kind !== "text") throw new AccountError("invalid_request", "Unknown file kind.");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AccountError("invalid_request", "Pick a file first.");
    return builder.putFile(me, kind, { name: file.name, mimeType: file.type || "application/octet-stream", bytes: new Uint8Array(await file.arrayBuffer()) });
  });
}

/* ---------- Samples ---------- */

export type SampleForm = {
  label: SampleLabel;
  title: string;
  inputs: Record<string, unknown>;
  idealOutput: string;
  note: string;
  links: string[];
  fileIds: string[];
};

export async function addSample(csrf: string, agentId: string, form: SampleForm): Promise<Result<Sample>> {
  // A clip link is only ever set by the clip library, never from a form.
  const { clip: _clip, ...rest } = form as SampleForm & { clip?: unknown };
  void _clip;
  return run(csrf, agentId, ({ builder, me }) => builder.addSample(me, agentId, rest));
}

export async function removeSample(csrf: string, agentId: string, sampleId: string): Promise<Result<null>> {
  return run(csrf, agentId, async ({ builder, me }) => {
    await builder.removeSample(me, agentId, sampleId);
    return null;
  });
}

/* ---------- Mood board ---------- */

export type BoardForm = { kind: BoardKind; note: string; url?: string; text?: string; color?: string; fileId?: string };

export async function addBoardItem(csrf: string, agentId: string, form: BoardForm): Promise<Result<BoardItem>> {
  return run(csrf, agentId, ({ builder, me }) => builder.addBoardItem(me, agentId, form));
}

export async function removeBoardItem(csrf: string, agentId: string, itemId: string): Promise<Result<null>> {
  return run(csrf, agentId, async ({ builder, me }) => {
    await builder.removeBoardItem(me, agentId, itemId);
    return null;
  });
}

/* ---------- Test bench ---------- */

export async function runBench(csrf: string, agentId: string, req: BenchRequest): Promise<Result<BenchView>> {
  return run(csrf, agentId, ({ builder, me }) => builder.bench.run(me, agentId, req), { quiet: true });
}

/** What the picked samples would cost on a version, before anything runs. */
export async function estimateBench(csrf: string, agentId: string, req: { version?: string; sampleIds?: string[] }): Promise<Result<BenchEstimate>> {
  return run(csrf, null, ({ builder, me }) => builder.bench.estimate(me, agentId, req), { quiet: true });
}

/** Polled while a bench runs. */
export async function getBench(csrf: string, benchId: string): Promise<Result<BenchView>> {
  return run(csrf, null, ({ builder, me }) => builder.bench.get(me, benchId), { quiet: true });
}

export async function cancelBench(csrf: string, benchId: string): Promise<Result<BenchView>> {
  return run(csrf, null, ({ builder, me }) => builder.bench.cancel(me, benchId), { quiet: true });
}

export async function rateRun(csrf: string, agentId: string, runId: string, input: { rating: RatingValue; note: string }): Promise<Result<{ scorecard: Scorecard }>> {
  return run(csrf, agentId, async ({ builder, me }) => ({ scorecard: (await builder.bench.rate(me, agentId, runId, input)).scorecard }), { quiet: true });
}

/** The tuning panel's save: a new version, and the same samples run against it when asked. */
export async function tuneAgent(csrf: string, agentId: string, changes: UpdateInput, opts: { bump?: Bump; note?: string; rerun: string[] | null; canaryShare?: number | null }): Promise<Result<{ version: string; bench: BenchView | null; canary: number | null }>> {
  return run(csrf, agentId, async ({ builder, me }) => {
    const bump = opts.bump && ["patch", "minor", "major"].includes(opts.bump) ? opts.bump : "patch";
    const note = typeof opts.note === "string" && opts.note.trim() ? opts.note.trim().slice(0, 200) : undefined;
    const release = releaseOf(opts.canaryShare);
    const r = await builder.bench.tune(me, agentId, changes, { bump, note, rerun: opts.rerun ? { sampleIds: opts.rerun } : null, ...(release ? { release } : {}) });
    return { version: r.spec.version, bench: r.bench, canary: release?.share ?? null };
  });
}

/* ---------- Releases (canary, publish to everyone, roll back) ---------- */

const cleanPatch = (patch: { share?: unknown; thresholds?: unknown }): { share?: number; thresholds?: Partial<CanaryThresholds> } => {
  const out: { share?: number; thresholds?: Partial<CanaryThresholds> } = {};
  if (typeof patch.share === "number") out.share = patch.share;
  if (patch.thresholds && typeof patch.thresholds === "object") {
    const t = patch.thresholds as Record<string, unknown>;
    out.thresholds = Object.fromEntries(["minRuns", "acceptanceDrop", "editRise", "regenerateRise", "qualityDrop"].filter((k) => typeof t[k] === "number").map((k) => [k, t[k] as number]));
  }
  return out;
};

/** Starts a canary of a saved version beside the current one. */
export async function startCanary(csrf: string, agentId: string, version: string, share: number): Promise<Result<{ id: string }>> {
  return run(csrf, agentId, async ({ builder, me }) => ({ id: (await builder.release.start(me, agentId, { version: String(version), share })).id }));
}

/** Changes the running canary's share or its stop rules. */
export async function updateCanary(csrf: string, agentId: string, patch: { share?: number; thresholds?: Partial<CanaryThresholds> }): Promise<Result<{ share: number }>> {
  return run(csrf, agentId, async ({ builder, me }) => ({ share: (await builder.release.update(me, agentId, cleanPatch(patch))).share }));
}

/** Publishes the canary to everyone, through the regression gate. */
export async function promoteCanary(csrf: string, agentId: string): Promise<Result<{ version: string }>> {
  return run(csrf, agentId, async ({ builder, me }) => ({ version: (await builder.release.promote(me, agentId)).spec.version }));
}

/** Rolls the canary back: the stable version serves everyone. */
export async function rollBackCanary(csrf: string, agentId: string): Promise<Result<{ version: string }>> {
  return run(csrf, agentId, async ({ builder, me }) => ({ version: (await builder.release.rollBack(me, agentId)).stable }));
}

/** Runs the gold samples on the bench for the canary and the stable version, where a gold score is missing. */
export async function runGoldSet(csrf: string, agentId: string, again = false): Promise<Result<{ benches: { id: string; version: string }[] }>> {
  return run(csrf, agentId, async ({ builder, me }) => ({ benches: (await builder.release.runGoldSet(me, agentId, { again })).map((b) => ({ id: b.id, version: b.version })) }));
}

/* ---------- Versions ---------- */

export async function compareVersions(csrf: string, agentId: string, a: string, b: string): Promise<Result<VersionCompare>> {
  return run(csrf, null, ({ builder, me }) => builder.versions.compare(me, agentId, a, b), { quiet: true });
}

export async function rollbackAgent(csrf: string, agentId: string, version: string): Promise<Result<{ version: string }>> {
  return run(csrf, agentId, async ({ builder, me }) => ({ version: (await builder.versions.rollback(me, agentId, version)).version }));
}

/* ---------- Batch runs ---------- */

export async function planBatch(csrf: string, agentIds: string[] | undefined): Promise<Result<BatchPlan>> {
  return run(csrf, null, ({ builder, me }) => builder.bench.planBatch(me, agentIds), { quiet: true });
}

/** Above the cost threshold the result is `confirmation_required` until `confirmed` is true. */
export async function runBatch(csrf: string, agentIds: string[] | undefined, confirmed: boolean): Promise<Result<BatchView>> {
  return run(csrf, null, ({ builder, me }) => builder.bench.runBatch(me, agentIds, { confirmed }), { quiet: true });
}

export async function getBatch(csrf: string, batchId: string): Promise<Result<BatchView>> {
  return run(csrf, null, ({ builder, me }) => builder.bench.getBatch(me, batchId), { quiet: true });
}

export async function cancelBatch(csrf: string, batchId: string): Promise<Result<BatchView>> {
  return run(csrf, null, ({ builder, me }) => builder.bench.cancelBatch(me, batchId), { quiet: true });
}

export type { ActionState };
