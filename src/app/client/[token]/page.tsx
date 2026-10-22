import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/app/App.module.css";
import { Mascot } from "@/components/brand/Mascot";
import { ago, currentTime } from "@/components/builder/labels";
import { ClientShell } from "@/components/team/ClientShell";
import { ItemStateTag, Votes } from "@/components/team/ItemState";
import { itemPose } from "@/components/team/labels";
import t from "@/components/team/Team.module.css";
import { Icon } from "@/components/ui/Icon";
import { appTeam } from "@/lib/team/server";
import type { ClientItemView } from "@/lib/team/team";

export const metadata: Metadata = { title: "For review", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

function Row({ token, item, now }: { token: string; item: ClientItemView; now: number }) {
  return (
    <div className={[t.row, item.state === "needs_review" ? t.rowNeeds : ""].join(" ")}>
      <Link href={`/client/${token}/${item.id}`} className={t.rowMain}>
        <span className={t.rowMascot}>
          <Mascot pose={itemPose(item.state, false)} size={56} />
        </span>
        <span className={t.rowText}>
          <span className={t.rowTop}>
            <span className={t.rowWhat}>{item.what}</span>
            <ItemStateTag state={item.state} />
          </span>
          <span className={t.rowTitle}>{item.title}</span>
          <span className={t.rowMeta}>
            <span>{ago(item.createdAt, now)}</span>
            {item.brand && <span>for {item.brand}</span>}
            {item.comments > 0 && (
              <span>
                <Icon name="chat" size={14} /> {item.comments}
              </span>
            )}
            {item.reRunOf && (
              <span>
                <Icon name="refresh" size={14} /> A new draft with the changes asked
              </span>
            )}
          </span>
        </span>
      </Link>
      <span className={t.rowSide}>
        {item.state === "needs_review" && item.approvalsNeeded > 1 && <Votes given={item.approvals.length} needed={item.approvalsNeeded} />}
        <Link href={`/client/${token}/${item.id}`} className={styles.sectionLink}>
          {item.state === "needs_review" ? "Have a look" : "Open"} <Icon name="arrow-right" size={16} />
        </Link>
      </span>
    </div>
  );
}

export default async function ClientHome({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const team = appTeam();
  const session = await team.openLink(token);
  if (!session) {
    return (
      <ClientShell session={null}>
        <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
          <Mascot pose="wait" size={140} />
          <b>This link has ended</b>
          <span>It expired or was withdrawn. Ask your contact for a new one.</span>
        </div>
      </ClientShell>
    );
  }
  const items = await team.clientItems(token);
  const waiting = items.filter((i) => i.state === "needs_review");
  const done = items.filter((i) => i.state !== "needs_review");
  const now = currentTime();
  const first = session.link.label.split(/\s+/)[0];

  return (
    <ClientShell session={session}>
      <section className={[styles.panel, t.clientHero].join(" ")}>
        <div className={styles.headText}>
          <span className="eyebrow">For {session.client.name}</span>
          <h1 className={styles.h1}>
            Hi {first}. {waiting.length ? (
              <>
                <em>{waiting.length}</em> {waiting.length === 1 ? "draft waits" : "drafts wait"} for your say.
              </>
            ) : (
              "You are all caught up."
            )}
          </h1>
          <p className={styles.lead}>
            {session.workspaceName} made these for you. Approve the ones you like, or ask for changes and a new draft comes back.{session.link.canApprove ? "" : " This link can look and comment; your contact decides."}
          </p>
        </div>
        <Mascot pose={waiting.length ? "hello" : "done"} size={140} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Waiting for you</h2>
          <span className={styles.count}>{waiting.length}</span>
        </div>
        {waiting.length ? (
          <div className={styles.runList}>
            {waiting.map((i) => (
              <Row key={i.id} token={token} item={i} now={now} />
            ))}
          </div>
        ) : (
          <p className={[styles.muted, styles.small].join(" ")}>Nothing right now. New drafts show up here.</p>
        )}
      </section>

      {done.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Already decided</h2>
            <span className={styles.count}>{done.length}</span>
          </div>
          <div className={styles.runList}>
            {done.map((i) => (
              <Row key={i.id} token={token} item={i} now={now} />
            ))}
          </div>
        </section>
      )}
    </ClientShell>
  );
}
