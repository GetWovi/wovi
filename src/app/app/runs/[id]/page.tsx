import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { RunResult } from "@/components/app/RunResult";
import { Mascot } from "@/components/brand/Mascot";
import { currentTime } from "@/components/builder/labels";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { accounts, appAgents } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { appPage } from "@/lib/app/server";

export const metadata: Metadata = { title: "Run", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { info, me, workspaceId, csrf, api } = await appPage(`/app/runs/${id}`);
  const view = await api.run(me, workspaceId, id);
  if (!view) notFound();
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "run_agents") : false;
  const agentId = view.run.agent.id;
  const spec = (await appAgents().get(me, PLATFORM_WORKSPACE_ID, agentId, view.run.agent.version)) ?? (await appAgents().get(me, workspaceId, agentId, view.run.agent.version)) ?? (await appAgents().get(me, PLATFORM_WORKSPACE_ID, agentId));
  const reviewer = view.review ? ((await accounts().getUser(view.review.by))?.name ?? (await accounts().getUser(view.review.by))?.email ?? null) : null;
  const running = view.state === "queued" || view.state === "running";

  return (
    <AppShell info={info} active="history">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/history" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> History
          </Link>
          <h1 className={styles.h1}>{view.agent?.name ?? agentId}</h1>
          <p className={styles.lead}>{view.agent?.job ?? ""}</p>
        </div>
        {running && (
          <ButtonLink href={`/app/make/${agentId}?run=${view.run.id}`} variant="secondary" leading={<Icon name="play" size={18} />}>
            Watch it run
          </ButtonLink>
        )}
      </div>
      {running || !spec ? (
        <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
          <Mascot pose={running ? "move" : "wait"} size={120} />
          <b>{running ? "Still running" : "This agent is not available any more"}</b>
          <span>{running ? "Open it on the agent's page to watch it land." : "The result is kept, but the agent's form is gone."}</span>
        </div>
      ) : (
        <RunResult csrf={csrf} agent={spec} view={view} editor={editor} reviewer={reviewer} now={currentTime()} showAsked />
      )}
    </AppShell>
  );
}
