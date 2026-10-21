import { useId, type CSSProperties } from "react";
import {
  ANCHORS,
  COLORS,
  CONFETTI,
  FACE,
  LIMB,
  MASCOT_BOX,
  MASCOT_OFFSET,
  MASCOT_SCALE,
  POSES,
  S,
  SLEEP_Z,
  W_PATH,
  zPath,
  type Eyes,
  type Ink,
  type Mouth,
  type Pose,
} from "@/brand/geometry";

export type MascotProps = {
  /** Product state the pose stands for. */
  pose?: Pose;
  /** Rendered size in px (24 to 400 are the supported sizes). */
  size?: number;
  /**
   * Colour of the limbs, face lines and the sticker outline. "auto" follows
   * the theme through --mascot-ink (Cream on night, Night on light).
   */
  ink?: Ink | "auto";
  /** Gentle motion for the pose; always off under prefers-reduced-motion. */
  animate?: boolean;
  /** Sticker outline around the body. On by default; off inside the wordmark. */
  outline?: boolean;
  /** Override the pose's eyes. */
  eyes?: Eyes;
  /** Where the pupils look, each from -1 to 1. Driven from the hero. */
  look?: readonly [number, number];
  label?: string;
  className?: string;
  style?: CSSProperties;
};

export function inkColor(ink: Ink | "auto"): string {
  if (ink === "auto") return "var(--mascot-ink, #FFF4DC)";
  return ink === "cream" ? COLORS.cream : COLORS.night;
}

const BODY_TRANSFORM = `translate(${MASCOT_OFFSET.x} ${MASCOT_OFFSET.y}) scale(${MASCOT_SCALE})`;

/**
 * The w as a body: Blaze tube with a soft light along the top and a shade
 * underneath, both masked to the stroke, plus an optional sticker outline.
 */
export function WBody({ ink, outline = true, maskId }: { ink: string; outline?: boolean; maskId: string }) {
  const stroke = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g transform={BODY_TRANSFORM}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-40} y={-40} width={240} height={240}>
          <path d={W_PATH} stroke="#fff" strokeWidth={S} {...stroke} />
        </mask>
      </defs>
      {outline && <path d={W_PATH} stroke={ink} strokeWidth={S + 6} {...stroke} />}
      <path d={W_PATH} stroke={COLORS.blaze} strokeWidth={S} {...stroke} />
      <g mask={`url(#${maskId})`}>
        <path d={W_PATH} stroke={COLORS.blazeDeep} strokeWidth={S} {...stroke} transform="translate(1.4 2.4)" opacity={0.28} />
        <path d={W_PATH} stroke={COLORS.blazeLight} strokeWidth={S * 0.26} {...stroke} transform="translate(-2.4 -3.8)" opacity={0.32} />
      </g>
    </g>
  );
}

export function Face({ ink, eyes, mouth, look = [0, 0] }: { ink: string; eyes: Eyes; mouth: Mouth; look?: readonly [number, number] }) {
  const cx = FACE.centerX;
  const lines = { fill: "none", stroke: ink, strokeWidth: FACE.stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g className="wovi-face">
      {eyes === "open" &&
        [-1, 1].map((s) => {
          const ex = cx + s * FACE.eyeDx;
          const lx = look[0] * 1.6;
          const ly = look[1] * 1.4;
          return (
            <g key={s} className="wovi-eye">
              <circle cx={ex} cy={FACE.eyeY} r={FACE.eyeR} fill={COLORS.cream} />
              <circle className="wovi-pupil" cx={ex + lx} cy={FACE.eyeY + 0.6 + ly} r={FACE.pupilR} fill={COLORS.night} />
              <circle cx={ex + lx + 1.3} cy={FACE.eyeY + ly - 1.1} r={1.1} fill={COLORS.cream} />
            </g>
          );
        })}
      {eyes === "happy" &&
        [-1, 1].map((s) => {
          const ex = cx + s * FACE.eyeDx;
          return <path key={s} d={`M${ex - FACE.arcHalf} ${FACE.eyeY + 1} q${FACE.arcHalf} ${-FACE.arcHalf * 1.4} ${FACE.arcHalf * 2} 0`} {...lines} />;
        })}
      {eyes === "sleep" &&
        [-1, 1].map((s) => {
          const ex = cx + s * FACE.eyeDx;
          return <path key={s} d={`M${ex - FACE.arcHalf} ${FACE.eyeY - 1} q${FACE.arcHalf} ${FACE.arcHalf * 1.1} ${FACE.arcHalf * 2} 0`} {...lines} />;
        })}
      {mouth === "smile" && <path d={`M${cx - FACE.mouthHalf} ${FACE.mouthY} q${FACE.mouthHalf} ${FACE.mouthHalf * 1.1} ${FACE.mouthHalf * 2} 0`} {...lines} />}
      {mouth === "small" && <path d={`M${cx - 3} ${FACE.mouthY + 1} q3 2.6 6 0`} {...lines} />}
      {mouth === "open" && (
        <>
          <path d={`M${cx - FACE.mouthHalf} ${FACE.mouthY - 1.5} q${FACE.mouthHalf} ${FACE.mouthHalf * 2} ${FACE.mouthHalf * 2} 0 z`} fill={ink} />
          <path d={`M${cx - 3} ${FACE.mouthY + 4.2} q3 2.4 6 0`} fill="none" stroke={COLORS.blazeLight} strokeWidth={2.2} strokeLinecap="round" />
        </>
      )}
      <circle cx={cx - FACE.cheekDx} cy={FACE.cheekY} r={FACE.cheekR} fill={COLORS.cream} opacity={0.6} />
      <circle cx={cx + FACE.cheekDx} cy={FACE.cheekY} r={FACE.cheekR} fill={COLORS.cream} opacity={0.6} />
    </g>
  );
}

export function Mascot({
  pose = "standing",
  size = 120,
  ink = "auto",
  animate = true,
  outline = true,
  eyes,
  look,
  label,
  className,
  style,
}: MascotProps) {
  const spec = POSES[pose];
  const inkC = inkColor(ink);
  const id = useId().replace(/:/g, "");
  const title = label ?? `Wovi ${pose}`;
  const classes = ["wovi-mascot", animate ? "is-animated" : "", className ?? ""].filter(Boolean).join(" ");
  const limbStroke = { fill: "none", stroke: inkC, strokeWidth: LIMB.stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  const limb = (l: (typeof spec.limbs)[number]) => (
    <g key={l.part} className={`wovi-limb ${l.part}`} style={{ transformOrigin: `${l.pivot[0]}px ${l.pivot[1]}px` }}>
      <path d={l.d} {...limbStroke} />
      {l.hand && <circle cx={l.hand[0]} cy={l.hand[1]} r={LIMB.hand} fill={inkC} />}
      {l.foot && <path d={`M${l.foot.x - 5 * l.foot.dir} ${l.foot.y} L${l.foot.x + 7 * l.foot.dir} ${l.foot.y}`} stroke={inkC} strokeWidth={LIMB.foot} strokeLinecap="round" />}
    </g>
  );

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
            <circle key={i} className={`confetti-${i}`} cx={c.x} cy={c.y} r={c.r} fill={c.c === "ink" ? inkC : COLORS[c.c]} />
          ))}
        </g>
      )}
      {pose === "sleeping" && (
        <g className="wovi-zzz" fill="none" stroke={inkC} strokeWidth={LIMB.stroke - 1.4} strokeLinecap="round" strokeLinejoin="round">
          {SLEEP_Z.map((z, i) => (
            <path key={i} className={`z-${i}`} d={zPath(z.x, z.y, z.s)} />
          ))}
        </g>
      )}
      <g className="wovi-figure" style={{ transformOrigin: `${MASCOT_BOX / 2}px ${ANCHORS.hipLeft[1]}px` }}>
        {spec.limbs.filter((l) => l.part.startsWith("leg")).map(limb)}
        <g className="wovi-body" style={{ transformOrigin: `${MASCOT_BOX / 2}px ${ANCHORS.hipLeft[1]}px` }}>
          <WBody ink={inkC} outline={outline} maskId={`wm-${id}`} />
          <Face ink={inkC} eyes={eyes ?? spec.eyes} mouth={spec.mouth} look={look ?? spec.look} />
        </g>
        {spec.limbs.filter((l) => l.part.startsWith("arm")).map(limb)}
      </g>
    </svg>
  );
}
