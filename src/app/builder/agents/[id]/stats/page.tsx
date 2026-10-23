import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentHead } from "@/components/builder/AgentHead";
import { BuilderShell } from "@/components/builder/BuilderShell";
import { ReleasePanel } from "@/components/builder/ReleasePanel";
import { AuditLog, VersionStatsTable } from "@/components/builder/StatsParts";
import { currentTime } from "@/components/builder/labels";
import { Card } from "@/components/ui/Card";
import s from "@/components/stats/Stats.module.css";
import styles from "@/components/builder/Builder.module.css";
import { requireBuilder } from "@/lib/builder/server";
import { appStats } from "@/lib/stats/server";

export const metadata: Metadata = { title: "Stats", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Live stats per version, the canary beside the stable version, and the audit log. Builders only; anyone else gets a 404. */
export default async function StatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { builder, me, user, csrf } = await requireBuilder();
  const { id } = await params;
  const agent = await builder.getAgent(me, id);
  if (!agent) notFound();
  // The release panel only with WOVI_CANARY=on; stats and the audit log always.
  const view = builder.canary ? await builder.release.view(me, id) : null;
  const stats = appStats();
  const versions = await builder.release.stats(me, id, stats);
  const audit = await builder.release.audit(me, id, 60);
  const now = currentTime();
  return (
    <BuilderShell active="agents" who={user.name ?? user.email ?? "Builder"}>
      <AgentHead spec={agent.spec} versions={agent.versions.length} title="Stats" active="stats" updatedAt={agent.row.updatedAt} now={now} />
      <div className={s.page}>
        {view && <ReleasePanel key={`${view.active?.id ?? "none"}:${view.active?.share ?? ""}:${view.active?.updatedAt ?? ""}`} csrf={csrf} view={view} agentName={agent.spec.name} now={now} />}
        <VersionStatsTable versions={versions} stable={view?.stable ?? agent.row.currentVersion} canary={view?.active?.canary ?? null} min={stats.min} now={now} />
        <Card title="Audit log" className={styles.section}>
          <p className={styles.sectionNote}>Every save, publish, canary, promotion and rollback of this agent, with who and when.</p>
          <AuditLog entries={audit} />
        </Card>
      </div>
    </BuilderShell>
  );
}
