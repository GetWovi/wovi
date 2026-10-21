import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** raised = surface with shadow, outlined = surface with a line, tint = soft Cobalt tint */
  variant?: "raised" | "outlined" | "tint";
  padding?: "none" | "sm" | "md" | "lg";
  /** Lifts on hover; use when the whole card is a link or button. */
  interactive?: boolean;
  title?: ReactNode;
  actions?: ReactNode;
};

export function Card({ variant = "raised", padding = "md", interactive = false, title, actions, className, children, ...rest }: CardProps) {
  const cls = [styles.card, styles[variant], styles[`p-${padding}`], interactive ? styles.interactive : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {(title || actions) && (
        <div className={styles.head}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
