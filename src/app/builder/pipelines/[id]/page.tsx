import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { currentTime } from "@/components/builder/labels";
import { PipelineEditor } from "@/components/builder/PipelineEditor";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { requireBuilder } from "@/lib/builder/server";
import { builderAgentOptions } from "@/lib/pipelines/builder-view";
import { appPipelines } from "@/lib/pipelines/server";

export const metadata: Metadata = { title: "Pipeline", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BuilderPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, user, csrf } = await requireBuilder();
  const pipelines = appPipelines();
  const spec = await pipelines.get(me, PLATFORM_WORKSPACE_ID, id);
  if (!spec) notFound();
  const [versions, rows, agents] = await Promise.all([pipelines.versions(me, PLATFORM_WORKSPACE_ID, id), pipelines.rows(me, PLATFORM_WORKSPACE_ID), builderAgentOptions(me)]);
  const updatedAt = rows.find((r) => r.pipelineId === id)?.updatedAt ?? "";
  return (
    <BuilderShell active="pipelines" who={user.name ?? user.email ?? "Builder"}>
      <PipelineEditor key={spec.version} csrf={csrf} spec={spec} agents={agents} versions={versions} updatedAt={updatedAt} now={currentTime()} />
    </BuilderShell>
  );
}
