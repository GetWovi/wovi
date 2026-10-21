import type { HTMLAttributes } from "react";
import styles from "./Badge.module.css";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  /** 0 to 100. High scores glow Blaze, good ones Cobalt. */
  score: number;
  label?: string;
  size?: "sm" | "md";
};

export function scoreTone(score: number): "blaze" | "cobalt" | "neutral" {
  if (score >= 85) return "blaze";
  if (score >= 70) return "cobalt";
  return "neutral";
}

/** Score badge: a ring that fills with the score. */
export function Badge({ score, label = "Score", size = "md", className, ...rest }: BadgeProps) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const tone = scoreTone(s);
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className={[styles.badge, styles[tone], styles[size], className ?? ""].filter(Boolean).join(" ")} title={`${label} ${s}`} {...rest}>
      <svg className={styles.ring} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(c * s) / 100} ${c}`}
          transform="rotate(-90 12 12)"
        />
      </svg>
      <span className={styles.value}>{s}</span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
