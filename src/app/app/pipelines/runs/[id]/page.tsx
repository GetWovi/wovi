import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { PipelineFollow } from "@/components/app/PipelineFollow";
import { currentTime } from "@/components/builder/labels";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { ago } from "@/components/builder/labels";
import { pipelineTitle } from "@/lib/app/pipelines";
import { appPage } from "@/lib/app/server";

export const metadata: Metadata = { title: "Pipeline run", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PipelineRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { info, me, workspaceId, csrf, api } = await appPage(`/app/pipelines/runs/${id}`);
  const view = await api.pipelineRun(me, workspaceId, id);
  if (!view) notFound();
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "run_agents") : false;
  const by = view.run.decision ? await accounts().getUser(view.run.decision.by) : null;
  const now = currentTime();

  return (
    <AppShell info={info} active="pipelines">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/pipelines" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> Pipelines
          </Link>
          <h1 className={styles.h1}>{view.run.pipeline.name}</h1>
          <p className={styles.lead}>&ldquo;{pipelineTitle(view.run, 150)}&rdquo;</p>
          <p className={styles.fine}>
            Started {ago(view.run.createdAt, now)}
            {view.run.brandBrain ? ` for ${view.run.brandBrain.name}` : ""}. {view.run.steps.length} steps, then your yes or no.
          </p>
        </div>
      </div>
      <PipelineFollow csrf={csrf} initial={view} editor={editor} decidedBy={by?.name ?? by?.email ?? null} now={now} />
    </AppShell>
  );
}
