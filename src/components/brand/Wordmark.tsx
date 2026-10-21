import { useId, type CSSProperties } from "react";
import { COLORS, S, WORDMARK } from "@/brand/geometry";

export type WordmarkVariant = "primary" | "light" | "night-on-blaze" | "cream-on-cobalt" | "theme";

/** Letter colour and ground for each logo version. */
export const WORDMARK_VARIANTS: Record<WordmarkVariant, { letters: string; background: string; name: string; use: string }> = {
  primary: { letters: COLORS.blaze, background: COLORS.night, name: "Primary", use: "Header, splash, social banners" },
  light: { letters: COLORS.blaze, background: COLORS.cream, name: "Light mode", use: "Light surfaces and print" },
  "night-on-blaze": { letters: COLORS.night, background: COLORS.blaze, name: "Night on Blaze", use: "Colour moments, merch, stickers" },
  "cream-on-cobalt": { letters: COLORS.cream, background: COLORS.cobalt, name: "Cream on Cobalt", use: "Accent surfaces, partner tiles" },
  /** In the app chrome: Blaze letters on the current ground. */
  theme: { letters: COLORS.blaze, background: "var(--bg, #0B1230)", name: "Theme", use: "App header and in-product use" },
};

export type WordmarkProps = {
  variant?: WordmarkVariant;
  /** Rendered height in px of the letters (without clearspace). */
  height?: number;
  /** Draw the version's ground with the clearspace around the word. */
  withBackground?: boolean;
  /** Draw the letters with a gradient of light across the stroke, for hero use. */
  lit?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

const { bounds, clearspace } = WORDMARK;

export function wordmarkViewBox(withBackground: boolean) {
  const pad = withBackground ? clearspace : 0;
  return { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + pad * 2, h: bounds.h + pad * 2 };
}

/** The letters alone, positioned in wordmark units. Drawn w last so it sits on top where it tucks into the o. */
export function WordmarkLetters({ letters, className }: { letters: string; className?: string }) {
  const st = { fill: "none", stroke: letters, strokeWidth: S, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g className={className}>
      <circle cx={WORDMARK.o.cx} cy={WORDMARK.o.cy} r={WORDMARK.o.r} {...st} className="wm-o" />
      <path d={WORDMARK.v} {...st} className="wm-v" />
      <path d={WORDMARK.i} {...st} className="wm-i" />
      <path d={WORDMARK.serifs} {...st} className="wm-i" />
      <path d={WORDMARK.w} {...st} className="wm-w" />
    </g>
  );
}

export function Wordmark({ variant = "primary", height = 40, withBackground = false, lit = false, label = "WOVI", className, style }: WordmarkProps) {
  const v = WORDMARK_VARIANTS[variant];
  const vb = wordmarkViewBox(withBackground);
  const width = (height * vb.w) / vb.h;
  const id = useId().replace(/:/g, "");
  const letters = lit ? `url(#wl-${id})` : v.letters;
  return (
    <svg className={className} width={width} height={height} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label={label} style={style}>
      {lit && (
        <defs>
          <linearGradient id={`wl-${id}`} gradientUnits="userSpaceOnUse" x1={bounds.x} y1={bounds.y} x2={bounds.x + bounds.w} y2={bounds.y + bounds.h}>
            <stop offset="0" stopColor={COLORS.blazeLight} />
            <stop offset="0.45" stopColor={COLORS.blaze} />
            <stop offset="1" stopColor={COLORS.blazeDeep} />
          </linearGradient>
        </defs>
      )}
      {withBackground && <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={v.background} />}
      <WordmarkLetters letters={letters} />
    </svg>
  );
}
