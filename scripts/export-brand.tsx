/**
 * Writes the standalone SVG brand files in public/brand from the same React
 * components the app uses, so the files and the components never drift.
 * Run: npm run brand:svg
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { COLORS, MASCOT_BOX, type Pose } from "@/brand/geometry";
import { Mascot } from "@/components/brand/Mascot";
import { AppIcon, Mark } from "@/components/brand/Mark";
import { Wordmark, WordmarkLetters, wordmarkViewBox, WORDMARK_VARIANTS, type WordmarkVariant } from "@/components/brand/Wordmark";

const OUT = join(process.cwd(), "public", "brand");
mkdirSync(OUT, { recursive: true });

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

function save(name: string, markup: string) {
  // React omits the namespace on the root <svg>; standalone files need it.
  const svg = markup.replace("<svg", `<svg ${XMLNS}`);
  writeFileSync(join(OUT, name), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
  console.log("wrote", name);
}

/* Wordmark: four versions with background and clearspace, plus transparent letters. */
const variants: WordmarkVariant[] = ["primary", "light", "night-on-blaze", "cream-on-cobalt"];
for (const v of variants) {
  save(`wordmark-${v}.svg`, renderToStaticMarkup(<Wordmark variant={v} height={400} withBackground />));
  save(`wordmark-${v}-transparent.svg`, renderToStaticMarkup(<Wordmark variant={v} height={400} />));
}

/* Mascot-only mark: Blaze w, face for a dark ground and for a light ground. */
save("mark.svg", renderToStaticMarkup(<Mark size={400} face={false} />));
save("mark-face-on-night.svg", renderToStaticMarkup(<Mark size={400} ink="cream" face />));
save("mark-face-on-light.svg", renderToStaticMarkup(<Mark size={400} ink="night" face />));

/* Poses, for each ground. Static (no CSS), so the pose is the drawing itself. */
const poses: Pose[] = ["walking", "waving", "sleeping", "celebrating", "standing"];
for (const p of poses) {
  save(`mascot-${p}-on-night.svg`, renderToStaticMarkup(<Mascot pose={p} size={MASCOT_BOX * 4} ink="cream" animate={false} />));
  save(`mascot-${p}-on-light.svg`, renderToStaticMarkup(<Mascot pose={p} size={MASCOT_BOX * 4} ink="night" animate={false} />));
}

/* App icon and favicon. */
save("app-icon.svg", renderToStaticMarkup(<AppIcon size={512} />));
save("favicon.svg", renderToStaticMarkup(<AppIcon size={64} rounded={false} />));

/* OG banner 1200 x 630: the primary wordmark with Wovi waving. */
{
  const vb = wordmarkViewBox(false);
  const wmH = 230;
  const wmW = (wmH * vb.w) / vb.h;
  const scale = wmH / vb.h;
  const mascotSize = 400;
  const gap = 40;
  const total = wmW + gap + mascotSize * 0.9;
  const x0 = (1200 - total) / 2;
  const wmY = (630 - wmH) / 2 + 10;
  const v = WORDMARK_VARIANTS.primary;
  const banner = (
    <svg width={1200} height={630} viewBox="0 0 1200 630" role="img" aria-label="WOVI">
      <rect width={1200} height={630} fill={COLORS.night} />
      <g transform={`translate(${x0} ${wmY}) scale(${scale}) translate(${-vb.x} ${-vb.y})`}>
        <WordmarkLetters letters={v.letters} />
      </g>
      <g transform={`translate(${x0 + wmW + gap - 20} ${(630 - mascotSize) / 2})`}>
        <Mascot pose="waving" size={mascotSize} ink="cream" animate={false} label="" />
      </g>
    </svg>
  );
  save("og-banner.svg", renderToStaticMarkup(banner));
}
