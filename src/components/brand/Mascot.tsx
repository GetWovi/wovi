import type { CSSProperties } from "react";
import { COLORS, DONE_MARKS, LIMB_STROKE, MASCOT_BOX, POSE_NAMES, POSES, SLEEP_Z, SPARKLE_PATH, W_PATH, zPath, type Ink, type Pose } from "@/brand/geometry";
import { Face } from "./Face";

export type MascotProps = {
  /** The pose, which stands for a product state: move (running), hello (welcome), wait (idle), done (finished). */
  pose?: Pose;
  /** Rendered width in px. The height follows the mascot box. */
  size?: number;
  /**
   * Colour of the limbs. "auto" follows the theme through --mascot-ink
   * (Cream on night, Night on light). Pass a value when the surface differs.
   */
  ink?: Ink | "auto";
  /** Gentle idle motion for the pose; always off under prefers-reduced-motion. */
  animate?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

export function inkColor(ink: Ink | "auto"): string {
  if (ink === "auto") return "var(--mascot-ink, #FFF4DC)";
  return ink === "cream" ? COLORS.cream : COLORS.night;
}

export const MASCOT_RATIO = MASCOT_BOX.h / MASCOT_BOX.w;

/** Wovi: the w with a face and thin limbs, in one of four poses. */
export function Mascot({ pose = "hello", size = 160, ink = "auto", animate = true, label, className, style }: MascotProps) {
  const spec = POSES[pose];
  const inkC = inkColor(ink);
  const title = label ?? `Wovi, ${POSE_NAMES[pose].toLowerCase()}`;
  const classes = ["wovi-mascot", animate ? "is-animated" : "", className ?? ""].filter(Boolean).join(" ");
  const limbStroke = { fill: "none", stroke: inkC, strokeWidth: LIMB_STROKE, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  const limb = (l: (typeof spec.limbs)[number]) => (
    <g key={l.part} className={`wovi-limb ${l.part}`} style={{ transformOrigin: `${l.pivot[0]}px ${l.pivot[1]}px` }}>
      <path d={l.d} {...limbStroke} />
    </g>
  );

  return (
    <svg
      className={classes}
      data-pose={pose}
      width={size}
      height={Math.round(size * MASCOT_RATIO)}
      viewBox={`${MASCOT_BOX.x} ${MASCOT_BOX.y} ${MASCOT_BOX.w} ${MASCOT_BOX.h}`}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      style={style}
    >
      {pose === "wait" && (
        <g className="wovi-zzz" fill="none" stroke={COLORS.cobaltGlow} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
          {SLEEP_Z.map((z, i) => (
            <path key={i} className={`z-${i}`} d={zPath(z.x, z.y, z.s)} style={{ transformOrigin: `${z.x + z.s / 2}px ${z.y + z.s / 2}px` }} />
          ))}
        </g>
      )}
      {pose === "done" && (
        <g className="wovi-marks">
          <path
            className="wovi-sparkle"
            d={SPARKLE_PATH}
            transform={`translate(${DONE_MARKS.sparkle.x} ${DONE_MARKS.sparkle.y}) scale(${DONE_MARKS.sparkle.r})`}
            fill={COLORS.cobaltGlow}
            style={{ transformOrigin: `${DONE_MARKS.sparkle.x}px ${DONE_MARKS.sparkle.y}px` }}
          />
          {DONE_MARKS.dots.map((d, i) => (
            <circle key={i} className={`wovi-dot dot-${i}`} cx={d.x} cy={d.y} r={d.r} fill={COLORS[d.c]} />
          ))}
        </g>
      )}
      <g className="wovi-figure" style={{ transformOrigin: "222px 340px" }}>
        {spec.limbs.filter((l) => l.part.startsWith("leg")).map(limb)}
        <g className="wovi-body" style={{ transformOrigin: "222px 340px" }}>
          <path d={W_PATH} fill={COLORS.blaze} />
          <Face eyes={spec.eyes} mouth={spec.mouth} line={COLORS.cream} cheek={COLORS.cobalt} />
        </g>
        {spec.limbs.filter((l) => l.part.startsWith("arm")).map(limb)}
      </g>
    </svg>
  );
}
