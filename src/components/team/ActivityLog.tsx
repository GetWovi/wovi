import styles from "@/components/app/App.module.css";
import { ago } from "@/components/builder/labels";
import { Icon } from "@/components/ui/Icon";
import type { ActivityRow } from "@/lib/team/types";
import { ACTIVITY_ICONS, ACTIVITY_WORDS } from "./labels";
import t from "./Team.module.css";

const BLAZE = new Set(["approved", "approval_added"]);
const COBALT = new Set(["changes_requested", "rerun_started", "rerun_of", "sent"]);

/** Every step on an item, oldest first: who did what, and when. */
export function ActivityLog({ rows, now, itemHref }: { rows: ActivityRow[]; now: number; itemHref: (id: string) => string }) {
  return (
    <section className={[styles.panel, styles.panelTight, styles.stack].join(" ")} aria-label="Activity">
      <div className={t.sideHead}>
        <h3>Activity</h3>
        <span className={styles.count}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className={[styles.muted, styles.small].join(" ")}>Nothing yet.</p>
      ) : (
        <ol className={t.log}>
          {rows.map((a) => {
            const failed = a.kind === "rerun_started" && !a.ref;
            return (
              <li key={a.id} className={t.logItem}>
                <span className={[t.logDot, BLAZE.has(a.kind) ? t.logDotBlaze : COBALT.has(a.kind) ? t.logDotCobalt : ""].join(" ")}>
                  <Icon name={ACTIVITY_ICONS[a.kind]} size={14} />
                </span>
                <span className={t.logText}>
                  <span>
                    <b>{a.byName}</b> {failed ? "asked for changes, with no new draft" : ACTIVITY_WORDS[a.kind]}
                    {a.kind === "assigned" ? ` ${a.note}` : ""}
                    {a.ref && (a.kind === "rerun_started" || a.kind === "rerun_of") && (
                      <>
                        {" "}
                        <a href={itemHref(a.ref)}>{a.kind === "rerun_started" ? "See the new draft" : "See the first draft"}</a>
                      </>
                    )}
                  </span>
                  {a.note && a.kind !== "assigned" && <span className={t.logNote}>{a.kind === "commented" ? a.note : `"${a.note}"`}</span>}
                  <span className={t.logWhen}>{ago(a.at, now)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
