import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentEditor } from "@/components/builder/AgentEditor";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { currentTime } from "@/components/builder/labels";
import { requireBuilder } from "@/lib/builder/server";

export const metadata: Metadata = { title: "Edit agent", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AgentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { builder, me, user, csrf } = await requireBuilder();
  const { id } = await params;
  const { tab } = await searchParams;
  const agent = await builder.getAgent(me, id);
  if (!agent) notFound();
  const [samples, board] = await Promise.all([builder.listSamples(me, id), builder.listBoard(me, id)]);
  const now = currentTime();
  return (
    <BuilderShell active="agents" who={user.name ?? user.email ?? "Builder"}>
      {/* A new version or status from the server remounts the editor with the fresh spec. */}
      <AgentEditor key={`${agent.spec.version}:${agent.row.updatedAt}`} csrf={csrf} spec={agent.spec} versions={agent.versions} updatedAt={agent.row.updatedAt} samples={samples} board={board} now={now} initialTab={typeof tab === "string" ? tab : undefined} />
    </BuilderShell>
  );
}
