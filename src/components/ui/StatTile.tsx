import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./StatTile.module.css";

export type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  /** Short context under the value. */
  hint?: ReactNode;
  /** Change since the previous period, as text such as "+12%". */
  delta?: { text: string; direction: "up" | "down" | "flat" };
  /** Blaze highlights the one number that matters most on a screen. */
  emphasis?: boolean;
};

export function StatTile({ label, value, hint, delta, emphasis = false }: StatTileProps) {
  return (
    <div className={[styles.tile, emphasis ? styles.emphasis : ""].filter(Boolean).join(" ")}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      {(hint || delta) && (
        <span className={styles.foot}>
          {delta && (
            <span className={[styles.delta, styles[delta.direction]].join(" ")}>
              {delta.direction !== "flat" && <Icon name="arrow-right" size={14} className={styles.arrow} />}
              {delta.text}
            </span>
          )}
          {hint && <span className={styles.hint}>{hint}</span>}
        </span>
      )}
    </div>
  );
}
