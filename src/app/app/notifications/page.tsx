import type { Metadata } from "next";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { Mascot } from "@/components/brand/Mascot";
import { currentTime } from "@/components/builder/labels";
import { MarkAllRead, NotificationList } from "@/components/team/NotificationList";
import { ButtonLink } from "@/components/ui/Button";
import { appPage } from "@/lib/app/server";
import { appTeam } from "@/lib/team/server";

export const metadata: Metadata = { title: "Notifications", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { info, me, workspaceId, csrf } = await appPage("/app/notifications");
  const rows = await appTeam().notifications(me, workspaceId, { limit: 100 });
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <AppShell info={info} active="notifications">
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Notifications</span>
          <h1 className={styles.h1}>{unread ? `${unread} new for you` : "You are up to date"}</h1>
          <p className={styles.lead}>When someone assigns you work, mentions you, asks for changes on your work or approves it. Each one also goes out by email unless the workspace turned that off.</p>
        </div>
        {unread > 0 && <MarkAllRead csrf={csrf} unread={unread} />}
      </div>
      {rows.length === 0 ? (
        <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
          <Mascot pose="wait" size={120} />
          <b>Nothing yet</b>
          <span>Assignments, mentions and decisions on your work show up here.</span>
          <ButtonLink href="/app/review" variant="secondary">
            Open the review queue
          </ButtonLink>
        </div>
      ) : (
        <NotificationList csrf={csrf} rows={rows} now={currentTime()} />
      )}
    </AppShell>
  );
}
