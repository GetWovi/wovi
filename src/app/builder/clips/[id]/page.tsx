import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { ClipDetail } from "@/components/builder/ClipDetail";
import { requireBuilder } from "@/lib/builder/server";
import { appClips } from "@/lib/clips/server";

export const metadata: Metadata = { title: "Clip", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ClipPage({ params }: { params: Promise<{ id: string }> }) {
  const { builder, me, user, csrf } = await requireBuilder();
  const { id } = await params;
  const lib = appClips();
  const got = await lib.get(me, id);
  if (!got) notFound();
  const agents = (await builder.listAgents(me)).filter((a) => a.status !== "hidden").map((a) => ({ id: a.id, name: a.name, job: a.job, status: a.status }));
  return (
    <BuilderShell active="clips" who={user.name ?? user.email ?? "Builder"}>
      <ClipDetail key={`${got.clip.id}:${got.clip.updatedAt}`} csrf={csrf} clip={got.clip} calls={got.calls} agents={agents} />
    </BuilderShell>
  );
}
