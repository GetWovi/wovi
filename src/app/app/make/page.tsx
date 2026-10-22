import type { Metadata } from "next";
import { AgentCard } from "@/components/app/AgentCard";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { PipelineCard } from "@/components/app/PipelineParts";
import { groupLineup } from "@/lib/app/lineup";
import { appPage } from "@/lib/app/server";
import { appQuality } from "@/lib/quality/server";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";

export const metadata: Metadata = { title: "Make something", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MakePage() {
  const { info, me, workspaceId, api } = await appPage("/app/make");
  const [lineup, pipelines] = await Promise.all([api.lineup(me, workspaceId), api.pipelines(me, workspaceId)]);
  const groups = groupLineup(lineup);
  const scores = await appQuality().scorecards(PLATFORM_WORKSPACE_ID, lineup.filter((a) => a.status === "live").map((a) => a.id));

  return (
    <AppShell info={info} active="make">
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Make something</span>
          <h1 className={styles.h1}>Pick the agent for the job</h1>
          <p className={styles.lead}>Each one does one thing well. Fill in a short form, no prompt to write, and the result comes back in your voice. Every result is scored before it is marked ready, and each agent shows its record.</p>
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.id} className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2>{g.title}</h2>
              <p className={[styles.muted, styles.small].join(" ")}>{g.lead}</p>
            </div>
          </div>
          <div className={styles.grid3}>
            {g.agents.map((a, i) => (
              <AgentCard key={a.id} agent={a} alt={i % 2 === 1} score={scores[a.id] ?? null} />
            ))}
          </div>
        </section>
      ))}
      {pipelines.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2>Or chain them</h2>
              <p className={[styles.muted, styles.small].join(" ")}>Pipelines run several agents in a row, from the idea to a post you approve.</p>
            </div>
          </div>
          <div className={styles.grid3}>
            {pipelines.map((p, i) => (
              <PipelineCard key={p.spec.id} info={p} alt={i % 2 === 1} />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
