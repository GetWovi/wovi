import Link from "next/link";
import { Mascot } from "@/components/brand/Mascot";
import { CardScore } from "@/components/quality/QualityParts";
import { CardStats } from "@/components/stats/LiveStats";
import type { PublicStats } from "@/lib/stats/types";
import { Icon } from "@/components/ui/Icon";
import type { LineupAgent } from "@/lib/app/lineup";
import type { PublicScorecard } from "@/lib/quality/scorecard";
import styles from "./App.module.css";
import { agentIcon, agentTag } from "./agent-icons";

/**
 * One agent of the lineup: the icon, the name, the job, its public score
 * (phase 12), its live stats from real runs, and Wovi waiting for a job.
 * Coming ones are not links.
 */
export function AgentCard({ agent, alt = false, score, stats }: { agent: Pick<LineupAgent, "id" | "name" | "job" | "category" | "status">; alt?: boolean; score?: PublicScorecard | null; stats?: PublicStats | null }) {
  const live = agent.status === "live";
  // A new agent with no scores and no live stats yet says so once, not in two boxes.
  const fresh = score !== undefined && (!score || !score.scored);
  const card = (
    <article className={[styles.panel, styles.panelTight, alt ? styles.panelAlt : "", styles.agentCard, live ? "" : styles.agentCardComing].join(" ")}>
      <div className={styles.agentTop}>
        <span className={[styles.iconTile, live ? styles.iconTileBlaze : ""].join(" ")}>
          <Icon name={agentIcon(agent.id)} size={22} />
        </span>
        {live ? <Mascot pose="wait" size={40} label="" /> : <span className={[styles.chip, styles.chipCobalt].join(" ")}>Coming</span>}
      </div>
      <h3 className={styles.agentName}>{agent.name}</h3>
      <p className={styles.agentJob}>{agent.job}</p>
      {live && score !== undefined && <CardScore card={score} />}
      {live && stats !== undefined && !(fresh && (!stats || stats.isNew)) && <CardStats stats={stats} />}
      <div className={styles.agentFoot}>
        <span className={styles.chip}>{agentTag(agent.id, agent.category)}</span>
        {live ? (
          <span className={styles.agentRun}>
            Run <Icon name="arrow-right" size={16} />
          </span>
        ) : (
          <span className={styles.fine}>In the works</span>
        )}
      </div>
    </article>
  );
  if (!live) return card;
  return (
    <Link href={`/app/make/${agent.id}`} className={styles.cardLink} aria-label={`Run ${agent.name}`}>
      {card}
    </Link>
  );
}
