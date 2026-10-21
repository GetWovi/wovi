import { useId, type CSSProperties } from "react";
import { COLORS, S, W_BOUNDS, W_PATH, type Ink } from "@/brand/geometry";
import { Face, WBody, inkColor } from "./Mascot";

export type MarkProps = {
  /** Rendered size in px. Use the mark below 80px wide and for avatars and icons. */
  size?: number;
  /** Letter colour; Blaze unless the mark sits on a Blaze surface. */
  body?: string;
  /** Show Wovi's face on the w. Off below about 32px. */
  face?: boolean;
  ink?: Ink | "auto";
  label?: string;
  className?: string;
  style?: CSSProperties;
};

/** Tight box around the w alone. */
export const MARK_VIEWBOX = { x: W_BOUNDS.x - 2, y: W_BOUNDS.y - 2, w: W_BOUNDS.w + 4, h: W_BOUNDS.h + 4 };

/** Mascot only: the w alone, as a clean letter or with the face. */
export function Mark({ size = 32, body = COLORS.blaze, face, ink = "auto", label = "WOVI", className, style }: MarkProps) {
  const vb = MARK_VIEWBOX;
  const showFace = face ?? size >= 32;
  const id = useId().replace(/:/g, "");
  if (!showFace) {
    return (
      <svg className={className} width={size} height={(size * vb.h) / vb.w} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label={label} style={style}>
        <path d={W_PATH} fill="none" stroke={body} strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // With the face, draw through the mascot box so the face lands on the same spot.
  const box = { x: 20, y: 26, w: 120, h: 76 };
  return (
    <svg className={className} width={size} height={(size * box.h) / box.w} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={label} style={style}>
      <WBody ink={inkColor(ink)} outline={false} maskId={`mk-${id}`} />
      <Face ink={inkColor(ink)} eyes="open" mouth="smile" />
    </svg>
  );
}

/**
 * App icon: Wovi's face on a Night tile. The w fills the tile edge to edge
 * so it reads at 16px, and the face gives it character at 512px.
 */
export function AppIcon({ size = 512, rounded = true, className }: { size?: number; rounded?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const vb = { x: 14, y: 8, w: 132, h: 132 };
  const radius = rounded ? vb.w * 0.22 : 0;
  return (
    <svg className={className} width={size} height={size} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label="WOVI">
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} rx={radius} fill={COLORS.night} />
      <g transform="translate(80 74) scale(1.18) translate(-80 -74)">
        <WBody ink={COLORS.cream} outline={false} maskId={`ai-${id}`} />
        <Face ink={COLORS.cream} eyes="open" mouth="smile" />
      </g>
    </svg>
  );
}
