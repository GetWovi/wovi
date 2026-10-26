import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { PipelineStart } from "@/components/app/PipelineStart";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { pipelineExamples } from "@/lib/app/pipeline-examples";
import { prefillFrom } from "@/lib/app/pipelines";
import { appPage } from "@/lib/app/server";
import { brainChoices } from "@/lib/team/brand-pick";

export const metadata: Metadata = { title: "Pipeline", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PipelineStartPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const { info, me, workspaceId, csrf, api } = await appPage(`/app/pipelines/${id}`);
  const pipeline = await api.pipeline(me, workspaceId, id);
  if (!pipeline) notFound();
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "run_agents") : false;
  const brains = await api.brains(me, workspaceId);
  const price = await api.pipelinePrice(me, workspaceId, pipeline.spec.id, pipeline.workspaceId);

  return (
    <AppShell info={info} active="pipelines">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/pipelines" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> All pipelines
          </Link>
          <div className={styles.agentHead}>
            <span className={[styles.iconTile, styles.iconTileBlaze, styles.iconTileLg].join(" ")}>
              <Icon name="layers" size={28} />
            </span>
            <div className={styles.headText}>
              <h1 className={styles.h1}>{pipeline.spec.name}</h1>
              <p className={styles.lead}>{pipeline.spec.job}</p>
            </div>
          </div>
        </div>
        <div className={styles.chips}>
          <span className={styles.chip}>{pipeline.steps.length} steps</span>
          <span className={styles.chip}>v{pipeline.spec.version}</span>
        </div>
      </div>
      <PipelineStart
        csrf={csrf}
        info={pipeline}
        brains={await brainChoices(me, workspaceId, brains)}
        editor={editor}
        examples={pipelineExamples(pipeline.spec)}
        price={price}
        // Chaining: a link from a result fills the form (an idea from Idea Generator, its platform and Brand Brain).
        prefill={prefillFrom(pipeline.spec, query)}
        brainId={typeof query.brand === "string" ? query.brand : null}
      />
    </AppShell>
  );
}
