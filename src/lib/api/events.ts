/**
 * Engine events to webhooks (phase 14). The run engine tells us when a run
 * finishes; the pipeline engine when a pipeline run settles. Each becomes a
 * webhook event in the run's workspace, with the same run shape GET /runs/{id}
 * returns, so a receiver needs no second call.
 *
 * - run.finished: every run started from the app or the API. A pipeline's own
 *   step runs are part of their pipeline and send nothing on their own.
 * - pipeline.waiting: a step waits for a person to pick.
 * - pipeline.finished: ready for approval, failed or stopped.
 *
 * Endpoints are made by people who may see costs, so the charge is included.
 */
import type { AgentRegistry } from "@/lib/agents/registry";
import type { PipelineEngine } from "@/lib/pipelines/engine";
import { publicPipelineRun, type PipelineRun } from "@/lib/pipelines/run";
import type { RunEngine } from "@/lib/runs/engine";
import { publicRunView, type Run } from "@/lib/runs/run";
import type { Webhooks } from "@/lib/webhooks/webhooks";
import { apiPipelineRun, apiRun } from "./views";

export function runEventKey(run: Pick<Run, "id">): string {
  return `run.finished:${run.id}`;
}

/** The event key for a pipeline run's state, or null when the state sends nothing. */
export function pipelineEventKey(pr: PipelineRun): { type: "pipeline.waiting" | "pipeline.finished"; key: string } | null {
  const tries = pr.steps.reduce((n, s) => n + s.retries, 0);
  if (pr.status === "waiting") {
    const step = pr.steps.find((s) => s.status === "waiting");
    return step ? { type: "pipeline.waiting", key: `pipeline.waiting:${pr.id}:${step.id}:${step.runIds.length}:${tries}` } : null;
  }
  if (pr.status === "ready" || pr.status === "failed" || pr.status === "cancelled") return { type: "pipeline.finished", key: `pipeline.finished:${pr.id}:${pr.status}:${tries}` };
  return null;
}

/** Starts sending webhooks for the engines' events. Returns a function that stops it. */
export function wireWebhookEvents(o: { webhooks: Webhooks; engine: RunEngine; pipelines?: PipelineEngine; registry: AgentRegistry; log?: (line: string) => void }): () => void {
  const log = o.log ?? ((line: string) => console.error(line));
  const offRuns = o.engine.onFinished((run) => {
    if (run.parent) return;
    const work = (async () => {
      const spec = await o.registry.get(run.agent.workspaceId, run.agent.id, run.agent.version).catch(() => null);
      await o.webhooks.dispatch(run.workspaceId, "run.finished", runEventKey(run), { run: apiRun(publicRunView(run), spec?.name ?? null, null) });
    })().catch((err) => log(`Could not send run.finished for ${run.id}: ${err instanceof Error ? err.message : String(err)}`));
    o.webhooks.track(work);
  });
  const offPipelines = o.pipelines?.onSettled((pr) => {
    const ev = pipelineEventKey(pr);
    if (!ev) return;
    void o.webhooks.dispatch(pr.workspaceId, ev.type, ev.key, { pipelineRun: apiPipelineRun(publicPipelineRun(pr)) }).catch((err) => log(`Could not send ${ev.type} for ${pr.id}: ${err instanceof Error ? err.message : String(err)}`));
  });
  return () => {
    offRuns();
    offPipelines?.();
  };
}
