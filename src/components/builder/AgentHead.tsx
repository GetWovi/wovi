import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import type { AgentSpec } from "@/lib/agents/spec";
import styles from "./Builder.module.css";
import { StatusPill } from "./BuilderShell";
import { CATEGORY_LABELS, ago } from "./labels";

/** The head of the bench and versions pages: the agent, its state and score, and the way to the other two screens. */
export function AgentHead({ spec, versions, title, active, updatedAt, now }: { spec: AgentSpec; versions: number; title: string; active: "bench" | "versions"; updatedAt: string; now: number }) {
  const base = `/builder/agents/${spec.id}`;
  return (
    <div className={styles.head}>
      <div className={styles.headText}>
        <Link href={base} className={styles.crumb}>
          <Icon name="chevron-right" size={16} style={{ rotate: "180deg" }} /> {spec.name}
        </Link>
        <div className={styles.titleRow}>
          <h1>{title}</h1>
          <StatusPill status={spec.status} />
          {spec.quality.score !== null && <Badge score={spec.quality.score} label="Score" />}
        </div>
        <div className={styles.meta}>
          <span className={styles.mono}>{spec.id}</span>
          <span>v{spec.version}</span>
          <span>
            {versions} version{versions === 1 ? "" : "s"}
          </span>
          <Tag tone="cobalt">{CATEGORY_LABELS[spec.category]}</Tag>
          <span>{spec.quality.runs ? `${spec.quality.runs} scored run${spec.quality.runs === 1 ? "" : "s"}` : "Not scored yet"}</span>
          <span>Edited {ago(updatedAt, now)}</span>
        </div>
      </div>
      <div className={styles.actions}>
        <ButtonLink href={base} variant="ghost" leading={<Icon name="pen" size={18} />}>
          Editor
        </ButtonLink>
        {active !== "bench" && (
          <ButtonLink href={`${base}/bench`} variant="ghost" leading={<Icon name="play" size={18} />}>
            Test bench
          </ButtonLink>
        )}
        {active !== "versions" && (
          <ButtonLink href={`${base}/versions`} variant="ghost" leading={<Icon name="clock" size={18} />}>
            Versions
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
