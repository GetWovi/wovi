/**
 * Writes the stand-in brand files in public/brand from the drawn geometry.
 * The site reads these files through <Logo />; when Funkai's final art
 * arrives, replace the files and skip this script. Run: npm run brand:svg
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { COLORS, type Pose } from "@/brand/geometry";
import { AppIconArt, LOGO_VERSIONS, MarkArt, WordmarkArt, WordmarkLetters, type LogoVersion } from "@/brand/placeholder";
import { Mascot } from "@/components/brand/Mascot";

const OUT = join(process.cwd(), "public", "brand");
mkdirSync(OUT, { recursive: true });

function save(name: string, markup: string) {
  // React omits the namespace on a root <svg> without xmlns; standalone files need it.
  const svg = markup.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') ? markup : markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  writeFileSync(join(OUT, name), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);
  console.log("wrote", name);
}

/* Wordmark and mark: the four versions as transparent letters (what the site uses) and the wordmark with its ground. */
const suffix: Record<LogoVersion, string> = { night: "", light: "-on-light", "on-blaze": "-night", "on-cobalt": "-cream" };
for (const v of Object.keys(LOGO_VERSIONS) as LogoVersion[]) {
  save(`wovi-wordmark${suffix[v]}.svg`, renderToStaticMarkup(<WordmarkArt version={v} height={350} />));
  save(`wovi-wordmark${suffix[v]}-ground.svg`, renderToStaticMarkup(<WordmarkArt version={v} height={540} withGround />));
  save(`wovi-mark${suffix[v]}.svg`, renderToStaticMarkup(<MarkArt version={v} size={400} />));
}

/* Mascot poses, for each ground. Static (no CSS), so the pose is the drawing itself. */
const poses: Pose[] = ["move", "hello", "wait", "done"];
for (const p of poses) {
  save(`mascot-${p}-on-night.svg`, renderToStaticMarkup(<Mascot pose={p} size={600} ink="cream" animate={false} />));
  save(`mascot-${p}-on-light.svg`, renderToStaticMarkup(<Mascot pose={p} size={600} ink="night" animate={false} />));
}

/* App icon and favicon. */
save("app-icon.svg", renderToStaticMarkup(<AppIconArt size={512} />));
save("favicon.svg", renderToStaticMarkup(<AppIconArt size={64} rounded={false} />));

/* OG banner 1200 x 630: the primary wordmark with Wovi saying hello. */
{
  const v = LOGO_VERSIONS.night;
  const wmH = 190;
  const wmW = Math.round((wmH * 1161) / 350);
  const mascotW = 320;
  const gap = 56;
  const total = wmW + gap + mascotW;
  const x0 = (1200 - total) / 2;
  const wmY = (630 - wmH) / 2 - 24;
  const banner = (
    <svg xmlns="http://www.w3.org/2000/svg" width={1200} height={630} viewBox="0 0 1200 630" role="img" aria-label="WOVI">
      <rect width={1200} height={630} fill={COLORS.night} />
      <g transform={`translate(${x0} ${wmY}) scale(${wmH / 350})`}>
        <WordmarkLetters letters={v.letters} line={v.line} cheek={v.cheek} />
      </g>
      <text x={x0 + wmW / 2} y={wmY + wmH + 58} textAnchor="middle" fill={COLORS.cream} fontFamily="Outfit, system-ui, sans-serif" fontWeight="700" fontSize="26" letterSpacing="6">
        AI AGENTS FOR CONTENT
      </text>
      <g transform={`translate(${x0 + wmW + gap} ${(630 - mascotW * 1.045) / 2})`}>
        <Mascot pose="hello" size={mascotW} ink="cream" animate={false} label="" />
      </g>
    </svg>
  );
  save("og-banner.svg", renderToStaticMarkup(banner));
}
