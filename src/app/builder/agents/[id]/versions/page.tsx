import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentHead } from "@/components/builder/AgentHead";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { currentTime } from "@/components/builder/labels";
import { Versions } from "@/components/builder/Versions";
import { requireBuilder } from "@/lib/builder/server";

export const metadata: Metadata = { title: "Versions", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VersionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { builder, me, user, csrf } = await requireBuilder();
  const { id } = await params;
  const { tab } = await searchParams;
  const agent = await builder.getAgent(me, id);
  if (!agent) notFound();
  const history = await builder.versions.history(me, id);
  const now = currentTime();
  return (
    <BuilderShell active="agents" who={user.name ?? user.email ?? "Builder"}>
      <AgentHead spec={agent.spec} versions={history.length} title="Versions" active="versions" updatedAt={agent.row.updatedAt} now={now} />
      {/* A rollback or a save from elsewhere remounts the list with the fresh history. */}
      <Versions key={`${agent.spec.version}:${history.length}`} csrf={csrf} spec={agent.spec} history={history} now={now} initialTab={tab === "compare" ? "compare" : "history"} />
    </BuilderShell>
  );
}
