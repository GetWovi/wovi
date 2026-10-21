import type { CSSProperties } from "react";
import {
  COLORS,
  CONFETTI,
  FACE,
  HAND_RADIUS,
  LIMB_STROKE,
  MASCOT_BOX,
  POSES,
  SLEEP_Z,
  W_PATH,
  W_STROKE,
  zPath,
  type Ink,
  type Pose,
} from "@/brand/geometry";

export type MascotProps = {
  /** Product state the pose stands for. */
  pose?: Pose;
  /** Rendered size in px (24 to 320 are the supported sizes). */
  size?: number;
  /**
   * Colour of limbs, face and outlines. "auto" follows the theme through
   * the --mascot-ink variable (Cream on night, Night on light). Pass "night"
   * or "cream" when the mascot sits on a surface that differs from the theme.
   */
  ink?: Ink | "auto";
  /** Gentle motion for the pose; always off under prefers-reduced-motion. */
  animate?: boolean;
  /** Accessible label; empty string hides it from assistive tech. */
  label?: string;
  className?: string;
  style?: CSSProperties;
};

export function inkColor(ink: Ink | "auto"): string {
  if (ink === "auto") return "var(--mascot-ink, #FFF4DC)";
  return ink === "cream" ? COLORS.cream : COLORS.night;
}

/** The w with its face, no limbs. Shared by the mascot, the mark and the wordmark. */
export function WBody({
  ink,
  body = COLORS.blaze,
  eyes = "smile",
  mouth = "smile",
  face = true,
}: {
  ink: string;
  body?: string;
  eyes?: "smile" | "sleep";
  mouth?: "smile" | "open";
  /** Set false below about 28px, where the face turns into noise. */
  face?: boolean;
}) {
  const cheek = body === COLORS.blaze ? COLORS.cream : ink;
  const cheekOpacity = body === COLORS.blaze ? 0.55 : 0.3;
  if (!face) {
    return <path d={W_PATH} fill="none" stroke={body} strokeWidth={W_STROKE} strokeLinecap="round" strokeLinejoin="round" />;
  }
  return (
    <g>
      <path d={W_PATH} fill="none" stroke={body} strokeWidth={W_STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={FACE.cheekLeft.cx} cy={FACE.cheekLeft.cy} r={FACE.cheekLeft.r} fill={cheek} opacity={cheekOpacity} />
      <circle cx={FACE.cheekRight.cx} cy={FACE.cheekRight.cy} r={FACE.cheekRight.r} fill={cheek} opacity={cheekOpacity} />
      <g fill="none" stroke={ink} strokeWidth={FACE.stroke} strokeLinecap="round" strokeLinejoin="round">
        <path d={eyes === "sleep" ? FACE.eyeLeftSleep : FACE.eyeLeft} />
        <path d={eyes === "sleep" ? FACE.eyeRightSleep : FACE.eyeRight} />
        {mouth === "open" ? <path d={FACE.mouthOpen} fill={ink} stroke="none" /> : <path d={FACE.mouth} />}
      </g>
    </g>
  );
}

export function Mascot({
  pose = "standing",
  size = 120,
  ink = "auto",
  animate = true,
  label,
  className,
  style,
}: MascotProps) {
  const spec = POSES[pose];
  const inkC = inkColor(ink);
  const title = label ?? `Wovi ${pose}`;
  const classes = ["wovi-mascot", animate ? "is-animated" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <svg
      className={classes}
      data-pose={pose}
      width={size}
      height={size}
      viewBox={`0 0 ${MASCOT_BOX} ${MASCOT_BOX}`}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      style={style}
    >
      {pose === "celebrating" && (
        <g className="wovi-confetti">
          {CONFETTI.map((c, i) => (
            <circle
              key={i}
              className={`confetti-${i}`}
              cx={c.x}
              cy={c.y}
              r={c.r}
              fill={c.c === "ink" ? inkC : COLORS[c.c]}
            />
          ))}
        </g>
      )}
      {pose === "sleeping" && (
        <g className="wovi-zzz" fill="none" stroke={inkC} strokeWidth={LIMB_STROKE - 1.4} strokeLinecap="round" strokeLinejoin="round">
          {SLEEP_Z.map((z, i) => (
            <path key={i} className={`z-${i}`} d={zPath(z.x, z.y, z.s)} />
          ))}
        </g>
      )}
      <g className="wovi-figure">
        {/* legs sit behind the body */}
        {spec.limbs
          .filter((l) => l.part.startsWith("leg"))
          .map((l) => (
            <g key={l.part} className={`wovi-limb ${l.part}`} style={{ transformOrigin: `${l.pivot[0]}px ${l.pivot[1]}px` }}>
              <path d={l.d} fill="none" stroke={inkC} strokeWidth={LIMB_STROKE} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
        <g className="wovi-body">
          <WBody ink={inkC} eyes={spec.eyes} mouth={spec.mouth} />
        </g>
        {spec.limbs
          .filter((l) => l.part.startsWith("arm"))
          .map((l) => (
            <g key={l.part} className={`wovi-limb ${l.part}`} style={{ transformOrigin: `${l.pivot[0]}px ${l.pivot[1]}px` }}>
              <path d={l.d} fill="none" stroke={inkC} strokeWidth={LIMB_STROKE} strokeLinecap="round" strokeLinejoin="round" />
              {l.end && <circle cx={l.end[0]} cy={l.end[1]} r={HAND_RADIUS} fill={inkC} />}
            </g>
          ))}
      </g>
    </svg>
  );
}
