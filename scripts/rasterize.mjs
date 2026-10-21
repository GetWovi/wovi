/**
 * Renders the PNG and ICO brand files from the SVG sources with headless
 * Chrome. No extra dependencies. Run: npm run brand:png
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BRAND = join(process.cwd(), "public", "brand");
const work = join(tmpdir(), `wovi-raster-${process.pid}`);
mkdirSync(work, { recursive: true });

function render(svgName, pngName, size) {
  const html = join(work, `${pngName}.html`);
  const svg = readFileSync(join(BRAND, svgName), "utf8").replace(/^<\?xml[^>]*>\n?/, "");
  const sized = svg.replace(/<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 width="${size.w}" height="${size.h}"`);
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body>${sized}</body></html>`);
  const out = join(BRAND, pngName);
  rmSync(out, { force: true });
  try {
    execFileSync(
      CHROME,
      [
        "--headless=new",
        "--no-sandbox",
        "--hide-scrollbars",
        "--disable-gpu",
        `--user-data-dir=${join(work, "profile")}`,
        "--default-background-color=00000000",
        `--window-size=${size.w},${size.h}`,
        `--screenshot=${out}`,
        `file://${html}`,
      ],
      { stdio: "ignore" },
    );
  } catch {
    /* Chrome often exits non-zero after a screenshot; the file is what counts. */
  }
  if (!existsSync(out)) throw new Error(`Chrome did not write ${pngName}`);
  console.log("wrote", pngName);
}

render("app-icon.svg", "app-icon-512.png", { w: 512, h: 512 });
render("app-icon.svg", "app-icon-192.png", { w: 192, h: 192 });
render("favicon.svg", "favicon-32.png", { w: 32, h: 32 });
render("favicon.svg", "favicon-16.png", { w: 16, h: 16 });
render("og-banner.svg", "og-banner.png", { w: 1200, h: 630 });

/* favicon.ico: an ICO container holding the 32 and 16 PNGs (PNG-in-ICO is supported everywhere that matters). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = [];
  const blobs = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0);
    e.writeUInt8(size === 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    dir.push(e);
    blobs.push(data);
  }
  return Buffer.concat([header, ...dir, ...blobs]);
}
const icoBuf = ico([
  { size: 32, data: readFileSync(join(BRAND, "favicon-32.png")) },
  { size: 16, data: readFileSync(join(BRAND, "favicon-16.png")) },
]);
writeFileSync(join(process.cwd(), "public", "favicon.ico"), icoBuf);
copyFileSync(join(process.cwd(), "public", "favicon.ico"), join(BRAND, "favicon.ico"));
console.log("wrote favicon.ico");

rmSync(work, { recursive: true, force: true });
