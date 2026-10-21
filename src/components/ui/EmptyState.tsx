import type { ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import type { Pose } from "@/brand/geometry";
import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Waving by default: a welcome. */
  pose?: Pose;
  size?: "sm" | "md";
};

export function EmptyState({ title, description, action, pose = "waving", size = "md" }: EmptyStateProps) {
  return (
    <div className={[styles.empty, styles[size]].join(" ")}>
      <Mascot pose={pose} size={size === "sm" ? 96 : 160} />
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
