"use client";

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Chip.module.css";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> & {
  /** Selected chips fill with Cobalt. */
  selected?: boolean;
  /** Shows a remove button; the chip itself is then not a toggle. */
  onRemove?: () => void;
  leading?: ReactNode;
};

/** Chip: a selectable or removable filter such as a platform or a format. */
export function Chip({ selected = false, onRemove, leading, className, children, ...rest }: ChipProps) {
  const cls = [styles.chip, selected ? styles.selected : "", className ?? ""].filter(Boolean).join(" ");
  if (onRemove) {
    return (
      <span className={cls}>
        {leading && <span className={styles.icon}>{leading}</span>}
        <span>{children}</span>
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={`Remove ${typeof children === "string" ? children : "chip"}`}>
          <Icon name="close" size={14} />
        </button>
      </span>
    );
  }
  return (
    <button type="button" className={cls} aria-pressed={selected} {...rest}>
      {leading && <span className={styles.icon}>{leading}</span>}
      {selected && <Icon name="check" size={16} />}
      <span>{children}</span>
    </button>
  );
}

export type TagProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "blaze" | "cobalt";
};

/** Tag: a static label such as a category. */
export function Tag({ tone = "neutral", className, children, ...rest }: TagProps) {
  return (
    <span className={[styles.tag, styles[`tone-${tone}`], className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </span>
  );
}
