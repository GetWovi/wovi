import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentHead } from "@/components/builder/AgentHead";
import { Bench } from "@/components/builder/Bench";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { currentTime } from "@/components/builder/labels";
import { appBrands } from "@/lib/brand/server";
import { requireBuilder } from "@/lib/builder/server";

export const metadata: Metadata = { title: "Test bench", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { builder, me, user, csrf } = await requireBuilder();
  const { id } = await params;
  const agent = await builder.getAgent(me, id);
  if (!agent) notFound();
  const [samples, history, recent, brains] = await Promise.all([builder.listSamples(me, id), builder.versions.history(me, id), builder.bench.list(me, id, 1), appBrands().list(me, builder.workspaceId)]);
  const now = currentTime();
  return (
    <BuilderShell active="agents" who={user.name ?? user.email ?? "Builder"}>
      <AgentHead spec={agent.spec} versions={agent.versions.length} title="Test bench" active="bench" updatedAt={agent.row.updatedAt} now={now} />
      <Bench csrf={csrf} spec={agent.spec} history={history} samples={samples} latest={recent[0] ?? null} now={now} brains={brains.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault }))} />
    </BuilderShell>
  );
}
