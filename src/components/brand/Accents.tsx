import type { CSSProperties, ReactNode } from "react";
import { SPARKLE_PATH } from "@/brand/geometry";
import styles from "./Accents.module.css";

/** A four-point sparkle in Cobalt Glow (or any colour). */
export function Sparkle({ size = 24, color = "var(--cobalt-glow)", className, style }: { size?: number; color?: string; className?: string; style?: CSSProperties }) {
  return (
    <svg className={[styles.sparkle, className ?? ""].join(" ")} width={size} height={size} viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true" style={style}>
      <path d={SPARKLE_PATH} fill={color} />
    </svg>
  );
}

/**
 * A hand-drawn-feeling sticker: an outlined pill with a short label, tilted a
 * little. Used for "one agent", "one job" and other asides.
 */
export function Sticker({
  children,
  tilt = -6,
  tone = "glow",
  className,
  style,
}: {
  children: ReactNode;
  /** Degrees; negative leans left. */
  tilt?: number;
  tone?: "glow" | "blaze" | "cream";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={[styles.sticker, styles[tone], className ?? ""].join(" ")} style={{ ...style, rotate: `${tilt}deg` }}>
      <svg className={styles.stickerLine} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="50" cy="20" rx="48.5" ry="18.5" />
      </svg>
      <span className={styles.stickerText}>{children}</span>
    </span>
  );
}
