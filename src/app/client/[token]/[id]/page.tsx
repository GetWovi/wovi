import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "@/components/app/App.module.css";
import { ago, currentTime } from "@/components/builder/labels";
import { ActivityLog } from "@/components/team/ActivityLog";
import { ClientShell } from "@/components/team/ClientShell";
import { Comments } from "@/components/team/Comments";
import { DecisionPanel } from "@/components/team/DecisionPanel";
import { ItemResult } from "@/components/team/ItemResult";
import t from "@/components/team/Team.module.css";
import { Icon } from "@/components/ui/Icon";
import { appTeam } from "@/lib/team/server";
import { TeamError } from "@/lib/team/team";

export const metadata: Metadata = { title: "For review", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ClientItemPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const team = appTeam();
  const session = await team.openLink(token);
  if (!session) notFound();
  const d = await team.clientItem(token, id).catch((err) => {
    if (err instanceof TeamError) return null;
    throw err;
  });
  if (!d) notFound();
  const { item } = d;
  const now = currentTime();
  const base = `/client/${token}/`;

  return (
    <ClientShell session={session}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href={`/client/${token}`} className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> Everything for {session.client.name}
          </Link>
          <h1 className={styles.h1}>{item.what}</h1>
          <p className={styles.lead}>{item.title}</p>
        </div>
      </div>

      {item.reRunOf && (
        <Link href={`${base}${item.reRunOf}`} className={t.banner}>
          <Icon name="refresh" size={20} />
          <span>
            {d.activity.find((a) => a.kind === "rerun_of")?.note ? `A new draft with the changes asked for: "${d.activity.find((a) => a.kind === "rerun_of")?.note}"` : "A new draft with the changes asked for."} <b>See the first one</b>
          </span>
        </Link>
      )}

      <div className={t.itemGrid}>
        <div className={t.areaResult}>
          <ItemResult state={item.state} eyebrow={item.what} title={item.title} running={false} output={d.output} pkg={d.package} meta={[item.brand ? `For ${item.brand}` : "", ago(item.createdAt, now)].filter(Boolean)} plain />
        </div>
        <aside className={t.areaSide}>
          <DecisionPanel id={item.id} state={item.state} running={false} approvals={item.approvals} needed={item.approvalsNeeded} last={item.last} reRuns={item.reRuns} itemBase={base} as={{ kind: "client", token, canApprove: session.link.canApprove }} />
          <ActivityLog rows={d.activity} now={now} itemHref={(x) => `${base}${x}`} />
        </aside>
        <div className={t.areaTalk}>
          <Comments id={item.id} threads={d.threads} members={[]} now={now} as={{ kind: "client", token }} />
        </div>
      </div>
    </ClientShell>
  );
}
