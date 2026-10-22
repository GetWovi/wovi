import Link from "next/link";
import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/ui/Icon";
import type { LineupAgent } from "@/lib/app/lineup";
import styles from "./App.module.css";
import { agentIcon, agentTag } from "./agent-icons";

/** One agent of the lineup: the icon, the name, the job, and Wovi waiting for a job. Coming ones are not links. */
export function AgentCard({ agent, alt = false }: { agent: Pick<LineupAgent, "id" | "name" | "job" | "category" | "status">; alt?: boolean }) {
  const live = agent.status === "live";
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
