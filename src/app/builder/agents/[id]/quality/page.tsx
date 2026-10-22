import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentHead } from "@/components/builder/AgentHead";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { QualityRollup } from "@/components/builder/QualityRollup";
import { currentTime } from "@/components/builder/labels";
import { requireBuilder } from "@/lib/builder/server";
import { appQuality } from "@/lib/quality/server";

export const metadata: Metadata = { title: "Quality", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** What the gate and people said about one agent, per version (phase 12). Builders only; anyone else gets a 404. */
export default async function QualityPage({ params }: { params: Promise<{ id: string }> }) {
  const { builder, me, user } = await requireBuilder();
  const { id } = await params;
  const agent = await builder.getAgent(me, id);
  if (!agent) notFound();
  const rollups = await appQuality().rollup(me, builder.workspaceId, id);
  const now = currentTime();
  return (
    <BuilderShell active="agents" who={user.name ?? user.email ?? "Builder"}>
      <AgentHead spec={agent.spec} versions={agent.versions.length} title="Quality" active="quality" updatedAt={agent.row.updatedAt} now={now} />
      <QualityRollup spec={agent.spec} rollups={rollups} now={now} />
    </BuilderShell>
  );
}
