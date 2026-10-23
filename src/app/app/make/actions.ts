"use server";

import { join } from "node:path";
import { appCall, type Result } from "@/app/app/actions";
import type { PublicRun } from "@/lib/accounts/guard";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { accounts } from "@/lib/accounts/server";
import { AppError, type RunView, type StartRunInput } from "@/lib/app/api";
import type { ReviewDecision, ReviewRow } from "@/lib/app/types";
import { appBrands } from "@/lib/brand/server";
import { checkFile, localFileStorage } from "@/lib/builder/storage";
import type { FileRef } from "@/lib/runs/inputs";
import { RIGHTS_REFUSAL, recordRights, rightsGiven } from "@/lib/safety/rights";
import { appSafetyStore } from "@/lib/safety/server";

/**
 * A file for an agent's form, kept under the workspace like a mood board
 * image: images through the Brand Brain's image limits, text files through
 * the builder's. The run only carries the reference.
 */
export async function uploadRunFile(csrf: string, formData: FormData): Promise<Result<FileRef>> {
  return appCall(csrf, async ({ me, workspaceId }) => {
    const file = formData.get("file");
    const kind = formData.get("kind") === "image" ? "image" : "text";
    if (!(file instanceof File)) throw new AppError("invalid_request", "Pick a file first.");
    // Phase 18: no file is stored without the person's rights confirmation.
    if (!rightsGiven(formData)) throw new AppError("invalid_request", RIGHTS_REFUSAL);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const input = { name: file.name, mimeType: file.type || "application/octet-stream", bytes };
    let stored;
    if (kind === "image") stored = await appBrands().putImage(me, workspaceId, input);
    else {
      await accounts().authorize(me, workspaceId, "run_agents");
      const problem = checkFile("text", { name: input.name, mimeType: input.mimeType, sizeBytes: bytes.byteLength });
      if (problem) throw new AppError("invalid_request", problem);
      stored = await localFileStorage(join(dataDirFromEnv(), "files")).put(workspaceId, input);
    }
    await recordRights(appSafetyStore(), { workspaceId, userId: me.userId, subject: "run_file", fileId: stored.id, fileName: stored.name });
    return { assetId: stored.id, name: stored.name, mimeType: stored.mimeType, sizeMb: Number((stored.sizeBytes / 1024 / 1024).toFixed(3)) };
  });
}

/** Starts a run in the session's workspace. Field problems come back as issues, "key: message". */
export async function startRun(csrf: string, input: StartRunInput): Promise<Result<PublicRun>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.startRun(me, workspaceId, input));
}

/** The run with its decision and state, for polling while it runs. */
export async function runView(csrf: string, runId: string): Promise<Result<RunView | null>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.run(me, workspaceId, runId));
}

export async function cancelRun(csrf: string, runId: string): Promise<Result<PublicRun>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.cancelRun(me, workspaceId, runId));
}

/** Runs the same job again with a quick edit's note. */
export async function rerun(csrf: string, runId: string, editId: string): Promise<Result<PublicRun>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.rerun(me, workspaceId, runId, editId));
}

/** The human approve step. */
export async function reviewRun(csrf: string, runId: string, decision: ReviewDecision, note: string): Promise<Result<ReviewRow | null>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.review(me, workspaceId, runId, decision, note), { refresh: "/app" });
}

export async function clearReview(csrf: string, runId: string): Promise<Result<null>> {
  return appCall(
    csrf,
    async ({ api, me, workspaceId }) => {
      await api.clearReview(me, workspaceId, runId);
      return null;
    },
    { refresh: "/app" },
  );
}

/** Phase 18: notes (or clears) that the AI label will be applied where each platform requires it, stored with the output. */
export async function noteAiLabel(csrf: string, runId: string, on: boolean): Promise<Result<RunView | null>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.noteAiLabel(me, workspaceId, runId, on));
}
