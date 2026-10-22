import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { ago, currentTime } from "@/components/builder/labels";
import { ActivityLog } from "@/components/team/ActivityLog";
import { AssignPicker } from "@/components/team/AssignPicker";
import { Comments } from "@/components/team/Comments";
import { DecisionPanel } from "@/components/team/DecisionPanel";
import { ItemResult } from "@/components/team/ItemResult";
import { ruleWords } from "@/components/team/rules-words";
import t from "@/components/team/Team.module.css";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { appAgents } from "@/lib/accounts/server";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { appPage } from "@/lib/app/server";
import { appTeam } from "@/lib/team/server";

export const metadata: Metadata = { title: "Review", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const href = (id: string) => `/app/review/${id}`;

export default async function ReviewItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { info, me, workspaceId, csrf } = await appPage(`/app/review/${id}`);
  const team = appTeam();
  const d = await team.item(me, workspaceId, id);
  if (!d) notFound();
  const { item } = d;
  const settings = await team.settings(me, workspaceId);
  const agentId = d.run?.agent.id;
  const agent = agentId ? ((await appAgents().get(me, PLATFORM_WORKSPACE_ID, agentId, d.run!.agent.version)) ?? (await appAgents().get(me, workspaceId, agentId, d.run!.agent.version)) ?? (await appAgents().get(me, PLATFORM_WORKSPACE_ID, agentId))) : null;
  const now = currentTime();
  const running = item.source === "running";
  const source = item.kind === "run" ? `/app/runs/${item.id}` : `/app/pipelines/runs/${item.id}`;
  const asked = item.reRunOf ? (d.activity.find((a) => a.kind === "rerun_of")?.note ?? "") : "";
  const meta = [item.brand?.name ? `For ${item.brand.name}` : null, item.maker ? `By ${item.maker.name}` : null, ago(item.createdAt, now)].filter((x): x is string => Boolean(x));

  return (
    <AppShell info={info} active="review">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/review" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> Review
          </Link>
          <h1 className={styles.h1}>{item.what.name}</h1>
          <p className={styles.lead}>{item.title}</p>
        </div>
        <div className={styles.actions}>
          {item.client && (
            <span className={t.client}>
              <Icon name="users" size={14} /> {item.client.name}
            </span>
          )}
          <ButtonLink href={source} variant="ghost" size="sm" leading={<Icon name={item.kind === "run" ? "play" : "layers"} size={16} />}>
            {item.kind === "run" ? "Open the run" : "Open the pipeline run"}
          </ButtonLink>
        </div>
      </div>

      {item.reRunOf && (
        <Link href={href(item.reRunOf)} className={t.banner}>
          <Icon name="refresh" size={20} />
          <span>
            {asked ? `A new draft, made from the changes asked: "${asked}"` : "A new draft, made from the changes asked on the first one."} <b>See the first draft</b>
          </span>
        </Link>
      )}

      <div className={t.itemGrid}>
        <div className={t.areaResult}>
          <ItemResult state={item.state} eyebrow={item.kind === "run" ? item.what.name : `Pipeline: ${item.what.name}`} title={item.title} running={running} output={d.run?.output ?? null} pkg={d.pipeline?.package ?? null} run={d.run} agent={agent} meta={meta.slice(0, 2)} />
        </div>

        <aside className={t.areaSide}>
          <DecisionPanel
            id={item.id}
            state={item.state}
            running={running}
            approvals={item.approvals}
            needed={item.approvalsNeeded}
            last={item.last}
            reRuns={item.reRuns}
            itemBase="/app/review/"
            as={{ kind: "member", csrf, canDecide: d.can.decide, why: d.can.why, canSend: d.can.send, rule: ruleWords(settings) }}
          />
          <section className={[styles.panel, styles.panelTight, styles.stack].join(" ")} aria-label="Who has it">
            <AssignPicker csrf={csrf} id={item.id} current={item.assignee?.id ?? null} members={d.members.map((m) => ({ userId: m.userId, name: m.name, role: m.role }))} disabled={!d.can.assign} />
            <span className={[styles.muted, styles.small].join(" ")}>
              {item.client ? `Work for ${item.client.name}. ` : "Kept in house: no client sees it. "}
              {item.maker ? `Made by ${item.maker.name}.` : ""}
            </span>
          </section>
          <ActivityLog rows={d.activity} now={now} itemHref={href} />
        </aside>

        <div className={t.areaTalk}>
          <Comments id={item.id} threads={d.threads} members={d.members} selfId={info.user.id} now={now} as={{ kind: "member", csrf, canComment: d.can.comment, hasClient: Boolean(item.client) }} />
        </div>
      </div>
    </AppShell>
  );
}
