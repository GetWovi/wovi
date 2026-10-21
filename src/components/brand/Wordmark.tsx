import type { CSSProperties } from "react";
import { COLORS, WORDMARK } from "@/brand/geometry";
import { WBody } from "./Mascot";

export type WordmarkVariant = "primary" | "light" | "night-on-blaze" | "cream-on-cobalt" | "theme";

/** Letter colour, face ink and background for each logo version. */
export const WORDMARK_VARIANTS: Record<WordmarkVariant, { letters: string; ink: string; background: string; name: string; use: string }> = {
  primary: { letters: COLORS.blaze, ink: COLORS.cream, background: COLORS.night, name: "Primary", use: "Header, splash, social banners" },
  light: { letters: COLORS.blaze, ink: COLORS.night, background: COLORS.cream, name: "Light mode", use: "Light surfaces and print" },
  "night-on-blaze": { letters: COLORS.night, ink: COLORS.cream, background: COLORS.blaze, name: "Night on Blaze", use: "Colour moments, merch, stickers" },
  "cream-on-cobalt": { letters: COLORS.cream, ink: COLORS.night, background: COLORS.cobalt, name: "Cream on Cobalt", use: "Accent surfaces, partner tiles" },
  /** In the app chrome: Blaze letters, face ink follows the theme through CSS variables. */
  theme: { letters: COLORS.blaze, ink: "var(--mascot-ink, #FFF4DC)", background: "var(--bg, #0B1230)", name: "Theme", use: "App header and in-product use" },
};

export type WordmarkProps = {
  variant?: WordmarkVariant;
  /** Rendered height in px of the letters (without clearspace). */
  height?: number;
  /** Draw the version's background with the clearspace around the word. */
  withBackground?: boolean;
  /** Show the face on the w. Defaults to on from 28px letter height. */
  face?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

const { bounds, clearspace } = WORDMARK;

export function wordmarkViewBox(withBackground: boolean) {
  const pad = withBackground ? clearspace : 0;
  return { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + pad * 2, h: bounds.h + pad * 2 };
}

/** The letters alone, positioned in wordmark units. */
export function WordmarkLetters({ letters, ink, face = true }: { letters: string; ink: string; face?: boolean }) {
  return (
    <g>
      {/* o, v and I are drawn first so the w sits on top where it tucks into the o */}
      <circle cx={WORDMARK.o.cx} cy={WORDMARK.o.cy} r={WORDMARK.o.r} fill="none" stroke={letters} strokeWidth={WORDMARK.strokeO} />
      <path d={WORDMARK.v} fill="none" stroke={letters} strokeWidth={WORDMARK.strokeV} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={`M${WORDMARK.i.x} ${WORDMARK.i.y1} L${WORDMARK.i.x} ${WORDMARK.i.y2}`}
        fill="none"
        stroke={letters}
        strokeWidth={WORDMARK.strokeI}
        strokeLinecap="round"
      />
      <WBody ink={ink} body={letters} face={face} />
    </g>
  );
}

export function Wordmark({ variant = "primary", height = 40, withBackground = false, face, label = "WOVI", className, style }: WordmarkProps) {
  const v = WORDMARK_VARIANTS[variant];
  const showFace = face ?? height >= 28;
  const vb = wordmarkViewBox(withBackground);
  const width = (height * vb.w) / vb.h;
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      role="img"
      aria-label={label}
      style={style}
    >
      {withBackground && <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={v.background} />}
      <WordmarkLetters letters={v.letters} ink={v.ink} face={showFace} />
    </svg>
  );
}
