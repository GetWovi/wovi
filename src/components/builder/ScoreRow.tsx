import type { Scorecard } from "@/lib/builder/scoring";
import styles from "./Builder.module.css";
import { duration, money, percent } from "./labels";

/** A version's scorecard as a row of small tiles. Cost shows for builders only, which is everyone here. */
export function ScoreRow({ card, compact = false }: { card: Scorecard; compact?: boolean }) {
  const none = card.runs === 0;
  const tiles: { label: string; value: string; hint?: string; emphasis?: boolean }[] = [
    { label: "Score", value: none ? "Not run" : String(card.score), hint: none ? `v${card.version}` : `${card.runs} run${card.runs === 1 ? "" : "s"}`, emphasis: !none },
    { label: "Pass rate", value: none ? "" : percent(card.passRate), hint: none ? "" : `${card.passed} of ${card.runs}` },
    { label: "Rating", value: none || card.rated === 0 ? "" : String(card.avgRating), hint: none ? "" : card.rated ? `${card.rated} rated` : "none yet" },
    { label: "Avg cost", value: none ? "" : money(card.avgCostMicroUsd ?? 0), hint: none ? "" : "a run" },
    { label: "Avg time", value: none ? "" : duration(card.avgMs), hint: none ? "" : "a run" },
  ];
  return (
    <div className={[styles.scoreRow, compact ? styles.scoreRowCompact : ""].filter(Boolean).join(" ")}>
      {tiles.map((t) => (
        <div key={t.label} className={[styles.stat, t.emphasis ? styles.statEmphasis : ""].filter(Boolean).join(" ")}>
          <span className={styles.statLabel}>{t.label}</span>
          <span className={styles.statValue}>{t.value || "·"}</span>
          {t.hint && <span className={styles.statHint}>{t.hint}</span>}
        </div>
      ))}
    </div>
  );
}
