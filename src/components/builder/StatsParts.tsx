import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import s from "@/components/stats/Stats.module.css";
import type { AuditEntry } from "@/lib/builder/releases";
import type { VersionStats } from "@/lib/stats/service";
import type { AuditKind } from "@/lib/stats/types";
import { changeOf, meanOf, pctOf, secondsOf, usd } from "@/lib/stats/words";
import styles from "./Builder.module.css";
import { ago } from "./labels";

/**
 * Live stats per version for the builder: people's runs only, every number
 * "New" until enough runs are behind it, the cost per run, and what people
 * allowed builders to read of their edits and notes.
 */
export function VersionStatsTable({ versions, stable, canary, min, now }: { versions: VersionStats[]; stable: string; canary: string | null; min: number; now: number }) {
  const withRuns = versions.filter((v) => v.live.runs || v.benchRuns || v.version === stable || v.version === canary);
  if (!withRuns.length) return <EmptyState title="No runs yet" description="Live numbers per version show here once people run this agent." />;
  const edits = versions.flatMap((v) => v.edits.map((e) => ({ ...e, version: v.version })));
  const notes = versions.flatMap((v) => v.notes.map((n) => ({ ...n, version: v.version })));
  const hiddenEdits = versions.reduce((n, v) => n + v.editsHidden, 0);
  const hiddenNotes = versions.reduce((n, v) => n + v.notesHidden, 0);
  return (
    <>
      <Card title="Live stats per version" className={styles.section}>
        <p className={styles.sectionNote}>People&apos;s runs only. A number shows once {min} runs are behind it.</p>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Version</th>
                <th>Runs</th>
                <th>Used as is</th>
                <th>Edited</th>
                <th>Changed</th>
                <th>Run again</th>
                <th>Thumbs up</th>
                <th>Fits format</th>
                <th>Quality</th>
                <th>Time</th>
                <th>Cost/run</th>
                <th>Bench</th>
              </tr>
            </thead>
            <tbody>
              {withRuns.map((v) => (
                <tr key={v.version}>
                  <td>
                    <span className={styles.mono}>v{v.version}</span> {v.version === stable && <span className={[s.pill, s.pillStable].join(" ")}>Stable</span>} {v.version === canary && <span className={[s.pill, s.pillCanary].join(" ")}>Canary</span>}
                  </td>
                  <td>{v.live.runs}</td>
                  <td className={v.live.acceptance.enough ? "" : s.muted}>{pctOf(v.live.acceptance)}</td>
                  <td className={v.live.edited.enough ? "" : s.muted}>{pctOf(v.live.edited)}</td>
                  <td className={v.live.editSize.enough ? "" : s.muted}>{changeOf(v.live.editSize)}</td>
                  <td className={v.live.regenerate.enough ? "" : s.muted}>{pctOf(v.live.regenerate)}</td>
                  <td className={v.live.rating.enough ? "" : s.muted}>{pctOf(v.live.rating)}</td>
                  <td className={v.live.compliance.enough ? "" : s.muted}>{pctOf(v.live.compliance)}</td>
                  <td className={v.live.quality.enough ? "" : s.muted}>{meanOf(v.live.quality)}</td>
                  <td className={v.live.latency.enough ? "" : s.muted}>{secondsOf(v.live.latency.p50Ms)}</td>
                  <td>{usd(v.live.cost.avgMicroUsd)}</td>
                  <td>{v.benchRuns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.sectionNote}>
          Used as is: results copied, picked or approved without another try, out of all results. Edited: of those, the ones people changed and kept; Changed is how much, on average. Run again: results someone asked another try for. Fits format: results that parsed and kept the platform&apos;s hard limits. Bench runs and anything run from the builder&apos;s own workspace never count. The quality gate&apos;s view of the same runs is on <Link href="./quality">Quality</Link>.
        </p>
      </Card>

      <Card title="What people changed" className={styles.section}>
        <p className={styles.sectionNote}>The lines people changed, only from those who turned on &quot;Use my edits to improve agents&quot;.</p>
        {edits.length ? (
          <div className={s.edits}>
            {edits.map((e) => (
              <div key={e.runId} className={s.edit}>
                <div className={s.editHead}>
                  <span>
                    v{e.version} · {Math.round(e.distance * 100)}% changed
                  </span>
                  <span className={styles.hint}>{ago(e.at, now)}</span>
                </div>
                <div>
                  <span className={s.editLabel}>The draft</span>
                  {e.lines.map((l) => l.draft).filter(Boolean).join("\n") || "Nothing removed"}
                </div>
                <div>
                  <span className={s.editLabel}>What they kept</span>
                  {e.lines.map((l) => l.kept).filter(Boolean).join("\n") || "Nothing added"}
                </div>
                {e.same > 0 && (
                  <span className={s.editMore}>
                    {e.same} other line{e.same === 1 ? "" : "s"} kept as they were.
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.hint}>No edits anyone allowed builders to read yet.</p>
        )}
        {notes.length > 0 && (
          <ul className={s.history} style={{ marginTop: 12 }}>
            {notes.map((n) => (
              <li key={n.runId}>
                <span>
                  <Icon name={n.rating === "up" ? "thumb-up" : "thumb-down"} size={14} /> {n.note}
                </span>
                <span className={styles.hint}>
                  v{n.version}, {ago(n.at, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(hiddenEdits > 0 || hiddenNotes > 0) && (
          <p className={styles.sectionNote}>
            {hiddenEdits} edit{hiddenEdits === 1 ? "" : "s"} and {hiddenNotes} note{hiddenNotes === 1 ? "" : "s"} are counted above but not shown: those people have not turned on &quot;Use my edits to improve agents&quot;.
          </p>
        )}
      </Card>
    </>
  );
}

export const AUDIT_WORDS: Record<AuditKind, string> = {
  saved: "Saved",
  published: "Published",
  unpublished: "Back to draft",
  hidden: "Hidden",
  unhidden: "Unhidden",
  canary_started: "Canary started",
  canary_share: "Canary changed",
  promoted: "To everyone",
  rolled_back: "Rolled back",
  auto_stopped: "Stopped on its own",
  gate_refused: "Gate refused",
  version_rollback: "Version rollback",
};

const LOUD: AuditKind[] = ["auto_stopped", "gate_refused", "rolled_back", "version_rollback"];

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

/** The audit log: every version, publish and release decision, who made it and when. */
export function AuditLog({ entries, names }: { entries: AuditEntry[]; names?: Record<string, string> }) {
  if (!entries.length) return <p className={styles.hint}>Nothing yet. Saves, publishes, canaries, promotions and rollbacks land here.</p>;
  return (
    <ol className={s.audit}>
      {entries.map((e) => (
        <li key={e.id}>
          <span className={s.auditWhen}>{when(e.at)}</span>
          <span className={[s.pill, s.auditKind, LOUD.includes(e.kind) ? s.pillCanary : e.kind === "promoted" || e.kind === "published" ? s.pillStable : ""].join(" ")}>{AUDIT_WORDS[e.kind]}</span>
          <span className={s.auditText}>
            <b>
              {names ? <Link href={`/builder/agents/${e.agentId}/stats`}>{names[e.agentId] ?? e.agentId}</Link> : null}
              {names ? ": " : ""}
              {e.detail}
            </b>
            <span>{e.byName}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
