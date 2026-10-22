import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { PipelineCard, PipelineRow } from "@/components/app/PipelineParts";
import { Mascot } from "@/components/brand/Mascot";
import { currentTime } from "@/components/builder/labels";
import { Icon } from "@/components/ui/Icon";
import { appPage } from "@/lib/app/server";

export const metadata: Metadata = { title: "Pipelines", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PipelinesPage() {
  const { info, me, workspaceId, api } = await appPage("/app/pipelines");
  const [list, recent] = await Promise.all([api.pipelines(me, workspaceId), api.pipelineRuns(me, workspaceId, { limit: 6 })]);
  const now = currentTime();

  return (
    <AppShell info={info} active="pipelines">
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Pipelines</span>
          <h1 className={styles.h1}>A whole job, start to finish</h1>
          <p className={styles.lead}>Agents in a row. What one writes, the next one reads, your Brand Brain steers every step, and you approve the end result.</p>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Start from a template</h2>
            <p className={[styles.muted, styles.small].join(" ")}>One click, one short form. Follow each step as it lands.</p>
          </div>
        </div>
        <div className={styles.grid3}>
          {list.map((p, i) => (
            <PipelineCard key={p.spec.id} info={p} alt={i % 2 === 1} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <span className="eyebrow">Recent</span>
            <h2>Your pipeline runs</h2>
          </div>
          {recent.length > 0 && (
            <Link href="/app/history?agent=pipelines" className={styles.sectionLink}>
              All of them <Icon name="arrow-right" size={16} />
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
            <Mascot pose="hello" size={120} />
            <b>No pipeline runs yet</b>
            <span>Pick a template above. Each run lands here with its package, ready for your yes or no.</span>
          </div>
        ) : (
          <div className={styles.runList}>
            {recent.map((v) => (
              <PipelineRow key={v.run.id} view={v} now={now} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
