import { Icon } from "@/components/ui/Icon";
import type { PublicStats } from "@/lib/stats/types";
import { changeOf, countOf, meanOf, NEW, pctOf, secondsOf, statsHeadline } from "@/lib/stats/words";
import styles from "./Stats.module.css";

/**
 * Live stats on an agent card in the gallery: how often its results are
 * used as they are, how often people change them, and the thumbs. "New"
 * until enough real runs are behind a number.
 */
export function CardStats({ stats }: { stats: PublicStats | null }) {
  if (!stats || stats.isNew) {
    return (
      <div className={styles.cardNew} title="Live numbers come from real runs only, never from tests.">
        <Icon name="chart" size={18} />
        <span>
          <b>Live stats: New</b>
          <br />
          {stats?.runs ? `${stats.runs} of the ${stats.min} real runs it needs` : `Numbers after ${stats?.min ?? 20} real runs`}
        </span>
      </div>
    );
  }
  const cells = [
    { label: "Used as is", value: pctOf(stats.acceptance), title: countOf(stats.acceptance, "results", stats.min) },
    { label: "Edited", value: pctOf(stats.edited), title: countOf(stats.edited, "used results", stats.min) },
    { label: "Thumbs up", value: pctOf(stats.rating), title: countOf(stats.rating, "ratings", stats.min) },
  ];
  return (
    <div className={styles.card} aria-label="Live stats from real runs">
      {cells.map((c) => (
        <div key={c.label} className={styles.cell} title={c.title}>
          <span className={styles.cellLabel}>{c.label}</span>
          <span className={[styles.cellValue, c.value === NEW ? styles.cellNew : ""].join(" ")}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

/** The agent page's live stats: every number with what it was counted from. */
export function AgentLiveStats({ stats }: { stats: PublicStats }) {
  const tiles = [
    { label: "Used as is", value: pctOf(stats.acceptance), hint: countOf(stats.acceptance, "results", stats.min), main: true },
    { label: "Edited", value: pctOf(stats.edited), hint: countOf(stats.edited, "used results", stats.min) },
    { label: "How much changed", value: changeOf(stats.editSize), hint: stats.editSize.n ? `Average over ${stats.editSize.n} edits` : "No edits yet" },
    { label: "Run again", value: pctOf(stats.regenerate), hint: countOf(stats.regenerate, "results", stats.min) },
    { label: "Thumbs up", value: pctOf(stats.rating), hint: countOf(stats.rating, "ratings", stats.min) },
    { label: "Fits the format", value: pctOf(stats.compliance), hint: countOf(stats.compliance, "results checked", stats.min) },
    { label: "Quality", value: meanOf(stats.quality), hint: stats.quality.enough ? "Average score out of 100" : `${stats.quality.n} of the ${stats.min} it needs` },
    { label: "Typical time", value: secondsOf(stats.latency.p50Ms), hint: stats.latency.enough ? `9 in 10 within ${secondsOf(stats.latency.p90Ms)}` : `${stats.latency.n} of the ${stats.min} it needs` },
  ];
  return (
    <div className={styles.live}>
      <div className={styles.liveLead}>
        <span className="eyebrow">Live stats</span>
        <h2>{statsHeadline(stats)}</h2>
        <p>What people did with this agent&apos;s results: used them as they were, changed them, asked for another try, or rated them. Counted from real runs only, never from the builder&apos;s tests.</p>
        <div className={styles.how}>
          <Icon name="info" size={18} />
          <span>A number shows once {stats.min} runs are behind it. Until then it says New, so nothing here is a guess.</span>
        </div>
      </div>
      <div className={styles.tiles}>
        {tiles.map((t) => (
          <div key={t.label} className={[styles.tile, t.main && t.value !== NEW ? styles.tileMain : "", t.value === NEW ? styles.tileNew : ""].join(" ")}>
            <span className={styles.tileLabel}>{t.label}</span>
            <span className={styles.tileValue}>{t.value}</span>
            <span className={styles.tileHint}>{t.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
