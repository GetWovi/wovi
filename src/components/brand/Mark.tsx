import type { CSSProperties } from "react";
import { COLORS, W_BOUNDS, type Ink } from "@/brand/geometry";
import { WBody, inkColor } from "./Mascot";

export type MarkProps = {
  /** Rendered size in px. Use the mark below 80px wide and for avatars and icons. */
  size?: number;
  ink?: Ink | "auto";
  /** Letter colour; Blaze unless the mark sits on a Blaze surface. */
  body?: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

/** Tight box around the w alone. */
export const MARK_VIEWBOX = { x: W_BOUNDS.x - 2, y: W_BOUNDS.y - 2, w: W_BOUNDS.w + 4, h: W_BOUNDS.h + 4 };

/** Mascot only: the w alone, no limbs. */
export function Mark({ size = 32, ink = "auto", body = COLORS.blaze, label = "WOVI", className, style }: MarkProps) {
  const vb = MARK_VIEWBOX;
  return (
    <svg
      className={className}
      width={size}
      height={(size * vb.h) / vb.w}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      role="img"
      aria-label={label}
      style={style}
    >
      <WBody ink={inkColor(ink)} body={body} />
    </svg>
  );
}

/**
 * App icon: the w on a Night tile with a soft corner. Also used for the
 * favicon, where the corner is left to the platform.
 */
export function AppIcon({ size = 512, rounded = true, className }: { size?: number; rounded?: boolean; className?: string }) {
  // The w is placed on a 140 box; the icon shows the central 112 units.
  const vbSize = 112;
  const vbX = (140 - vbSize) / 2;
  const vbY = (140 - vbSize) / 2 - 2; // the w sits slightly above centre for optical balance
  const radius = rounded ? vbSize * 0.22 : 0;
  return (
    <svg className={className} width={size} height={size} viewBox={`${vbX} ${vbY} ${vbSize} ${vbSize}`} role="img" aria-label="WOVI">
      <rect x={vbX} y={vbY} width={vbSize} height={vbSize} rx={radius} fill={COLORS.night} />
      <WBody ink={COLORS.cream} />
    </svg>
  );
}
