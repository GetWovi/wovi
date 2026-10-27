import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentRun } from "@/components/app/AgentRun";
import { agentIcon, agentTag } from "@/components/app/agent-icons";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { currentTime } from "@/components/builder/labels";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { agentExamples } from "@/lib/app/pipeline-examples";
import { appPage } from "@/lib/app/server";
import { AgentScorecard } from "@/components/quality/QualityParts";
import { gateFor } from "@/lib/quality/data";
import { appQuality } from "@/lib/quality/server";
import { AgentLiveStats } from "@/components/stats/LiveStats";
import { appStats } from "@/lib/stats/server";
import { pctOf } from "@/lib/stats/words";
import { brainChoices } from "@/lib/team/brand-pick";
import { videoAllowed } from "@/lib/video/server";

export const metadata: Metadata = { title: "Make", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AgentPage({ params, searchParams }: { params: Promise<{ agent: string }>; searchParams: Promise<{ run?: string }> }) {
  const { agent: id } = await params;
  const { run: runId } = await searchParams;
  const { info, me, workspaceId, csrf, api } = await appPage(`/app/make/${id}`);
  const found = await api.agent(me, workspaceId, id);
  if (!found) notFound();
  const { spec } = found;
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "run_agents") : false;
  const brains = await api.brains(me, workspaceId);
  const view = runId ? await api.run(me, workspaceId, runId) : null;
  const shown = view && view.run.agent.id === spec.id ? view : null;
  const reviewer = shown?.review ? ((await accounts().getUser(shown.review.by))?.name ?? (await accounts().getUser(shown.review.by))?.email ?? null) : null;
  const examples = agentExamples(spec.id);
  const card = await appQuality().scorecard(found.agentWorkspaceId, spec.id);
  const live = await appStats().agentStats(found.agentWorkspaceId, spec.id);
  const price = await api.agentPrice(me, workspaceId, spec.id, found.agentWorkspaceId);
  const gate = gateFor(spec);

  return (
    <AppShell info={info} active="make">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/make" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> All agents
          </Link>
          <div className={styles.agentHead}>
            <span className={[styles.iconTile, styles.iconTileBlaze, styles.iconTileLg].join(" ")}>
              <Icon name={agentIcon(spec.id)} size={28} />
            </span>
            <div className={styles.headText}>
              <h1 className={styles.h1}>{spec.name}</h1>
              <p className={styles.lead}>{spec.job}</p>
            </div>
          </div>
        </div>
        <div className={styles.chips}>
          <span className={styles.chip}>{agentTag(spec.id, spec.category)}</span>
          <span className={styles.chip}>v{spec.version}</span>
          <a href="#scorecard" className={[styles.chip, styles.chipCobalt].join(" ")}>
            {card.enough ? `${Math.round((card.passRate ?? 0) * 100)}% pass the quality bar` : "Quality bar: New"}
          </a>
          <a href="#live-stats" className={[styles.chip, styles.chipBlaze].join(" ")}>
            {live.isNew ? "Live stats: New" : `${pctOf(live.acceptance)} used as is`}
          </a>
        </div>
      </div>
      <AgentRun key={shown?.run.id ?? "form"} csrf={csrf} agent={spec} brains={await brainChoices(me, workspaceId, brains)} editor={editor} examples={examples} initialRun={shown} reviewer={reviewer} now={currentTime()} price={price} videoOn={videoAllowed(info.user)} />
      <section className={[styles.panel, styles.section].join(" ")} id="live-stats" aria-label="Live stats from real runs">
        <AgentLiveStats stats={live} />
      </section>
      <section className={[styles.panel, styles.section].join(" ")} id="scorecard" aria-label="How this agent scores">
        <AgentScorecard card={card} bar={gate.minScore} rewrites={gate.maxRewrites} />
      </section>
    </AppShell>
  );
}
