"use server";

import { appCall, type Result } from "@/app/app/actions";
import type { PipelineView, StartPipelineInput } from "@/lib/app/api";
import type { ReviewDecision } from "@/lib/app/types";
import type { PublicPipelineRun } from "@/lib/pipelines/run";
import type { RunFeedback } from "@/lib/stats/feedback";

/** Starts a pipeline run in the session's workspace. Field problems come back as issues, "key: message". */
export async function startPipeline(csrf: string, input: StartPipelineInput): Promise<Result<PublicPipelineRun>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.startPipeline(me, workspaceId, input));
}

/** The run with its state, for polling while it goes. */
export async function pipelineView(csrf: string, id: string): Promise<Result<PipelineView | null>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.pipelineRun(me, workspaceId, id));
}

export async function pickInPipeline(csrf: string, id: string, stepId: string, index: number): Promise<Result<PublicPipelineRun>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.pickInPipeline(me, workspaceId, id, stepId, index));
}

export async function cancelPipeline(csrf: string, id: string): Promise<Result<PublicPipelineRun>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.cancelPipeline(me, workspaceId, id), { refresh: "/app" });
}

export async function retryPipeline(csrf: string, id: string): Promise<Result<PublicPipelineRun>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.retryPipeline(me, workspaceId, id));
}

/** The approve step at the end of a pipeline run. */
export async function decidePipeline(csrf: string, id: string, decision: ReviewDecision, note: string): Promise<Result<PublicPipelineRun>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.decidePipeline(me, workspaceId, id, decision, note), { refresh: "/app" });
}

export async function clearPipelineDecision(csrf: string, id: string): Promise<Result<PublicPipelineRun>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.clearPipelineDecision(me, workspaceId, id), { refresh: "/app" });
}

/** Live stats: copying one part of a package uses the step run it came from. */
export async function pipelinePartUsed(csrf: string, id: string, stepId: string): Promise<Result<RunFeedback | null>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.pipelinePartUsed(me, workspaceId, id, stepId));
}
