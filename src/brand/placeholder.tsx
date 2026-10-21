/**
 * Stand-in logo art, drawn from the geometry while the final files from
 * Funkai are pending. Only scripts/export-brand.tsx renders these; the site
 * itself shows the files in public/brand through <Logo />.
 */
import { COLORS, STROKE, W_BOX, W_PATH, WORDMARK } from "./geometry";
import { Face } from "@/components/brand/Face";

export type LogoColors = { letters: string; line: string; cheek: string; ground: string; name: string; use: string };

/** The four logo versions. The face colours follow Funkai's board. */
export const LOGO_VERSIONS = {
  night: { letters: COLORS.blaze, line: COLORS.cream, cheek: COLORS.cobalt, ground: COLORS.night, name: "Primary", use: "Blaze on Night: app header, splash, social banners" },
  light: { letters: COLORS.blaze, line: COLORS.night, cheek: COLORS.cobalt, ground: COLORS.cream, name: "Light mode", use: "Blaze on Cream: light theme, documents" },
  "on-blaze": { letters: COLORS.night, line: COLORS.blaze, cheek: COLORS.cream, ground: COLORS.blaze, name: "Night on Blaze", use: "Campaign graphics, merch" },
  "on-cobalt": { letters: COLORS.cream, line: COLORS.cobalt, cheek: COLORS.blaze, ground: COLORS.cobalt, name: "Cream on Cobalt", use: "Campaign graphics, merch" },
} as const satisfies Record<string, LogoColors>;

export type LogoVersion = keyof typeof LOGO_VERSIONS;

const { bounds, clearspace } = WORDMARK;

/** The letters W O V I with the face, in wordmark units. */
export function WordmarkLetters({ letters, line, cheek }: { letters: string; line: string; cheek: string }) {
  const st = { fill: "none", stroke: letters, strokeWidth: STROKE, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g>
      <circle cx={WORDMARK.o.cx} cy={WORDMARK.o.cy} r={WORDMARK.o.r} {...st} />
      <path d={WORDMARK.v} {...st} />
      <path d={WORDMARK.i} {...st} />
      <path d={W_PATH} fill={letters} />
      <Face line={line} cheek={cheek} />
    </g>
  );
}

export function WordmarkArt({ version, height = 350, withGround = false }: { version: LogoVersion; height?: number; withGround?: boolean }) {
  const v = LOGO_VERSIONS[version];
  const pad = withGround ? clearspace : 0;
  const vb = { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + pad * 2, h: bounds.h + pad * 2 };
  const width = Math.round((height * vb.w) / vb.h);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label="WOVI">
      {withGround && <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={v.ground} />}
      <WordmarkLetters letters={v.letters} line={v.line} cheek={v.cheek} />
    </svg>
  );
}

/** The w alone, with the face. */
export function MarkArt({ version, size = 400 }: { version: LogoVersion; size?: number }) {
  const v = LOGO_VERSIONS[version];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={Math.round((size * W_BOX.h) / W_BOX.w)} viewBox={`0 0 ${W_BOX.w} ${W_BOX.h}`} role="img" aria-label="WOVI">
      <path d={W_PATH} fill={v.letters} />
      <Face line={v.line} cheek={v.cheek} />
    </svg>
  );
}

/** App icon and favicon: the Blaze w on a Night tile, filling the tile so it reads at 16px. */
export function AppIconArt({ size = 512, rounded = true }: { size?: number; rounded?: boolean }) {
  const tile = 520;
  const scale = 0.92;
  const x = (tile - W_BOX.w * scale) / 2;
  const y = (tile - W_BOX.h * scale) / 2;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={`0 0 ${tile} ${tile}`} role="img" aria-label="WOVI">
      <rect width={tile} height={tile} rx={rounded ? tile * 0.22 : 0} fill={COLORS.night} />
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <path d={W_PATH} fill={COLORS.blaze} />
        <Face line={COLORS.cream} cheek={COLORS.cobalt} />
      </g>
    </svg>
  );
}
