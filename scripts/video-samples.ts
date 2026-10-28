/**
 * Makes the example picture of each video style (public/video-styles/) and a
 * two second sample of each voice (public/video-voices/), once, with the real
 * image and audio routes. Motion graphics has no pictures, so its example is
 * a frame of the motion engine itself (free). Every style draws the same
 * subject, so the cards compare the looks and nothing else.
 *
 * Costs about $0.40 (six pictures and three short clips). Run:
 *   OPENROUTER_API_KEY=... npx tsx scripts/video-samples.ts [--only=3d,pixel] [--voices]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegPath } from "@/lib/clips/media";
import { svgPng } from "@/lib/video/finish";
import { openRouterMedia } from "@/lib/video/media";
import { motionLook, sceneSvg } from "@/lib/video/motion";
import { picturePrompt } from "@/lib/video/planner";
import { SPOKEN_VOICES, STYLES } from "@/lib/video/styles";

const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error("Set OPENROUTER_API_KEY.");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const voicesToo = process.argv.includes("--voices");
const media = openRouterMedia({ apiKey: key });
const SUBJECT = { spoken: "", onScreen: "A cup of coffee and a croissant on a small round cafe table by a window, morning light, nobody in the picture." };
const tmp = mkdtempSync(join(tmpdir(), "wovi-samples-"));
mkdirSync("public/video-styles", { recursive: true });
mkdirSync("public/video-voices", { recursive: true });
let cost = 0;

/** A small square JPG for the card. */
function jpg(input: string, out: string) {
  execFileSync(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vf", "scale=360:360:force_original_aspect_ratio=increase,crop=360:360", "-q:v", "4", out]);
}

async function main() {
  for (const style of STYLES) {
    if (only && !only.includes(style.value)) continue;
    const src = join(tmp, `${style.value}.png`);
    if (style.value === "motion") {
      const look = motionLook("calm", "1:1");
      writeFileSync(src, svgPng(sceneSvg({ top: "slow mornings", bottom: "start with one cup", shape: "orbit", seconds: 4 }, 0.62, look, { fadeOut: false }), 1080));
    } else {
      const img = await media.image(picturePrompt(SUBJECT, `${style.picture} warm, friendly colours.`, ""), AbortSignal.timeout(120_000), "1:1");
      cost += img.costMicroUsd;
      writeFileSync(src, img.bytes);
    }
    jpg(src, `public/video-styles/${style.value}.jpg`);
    console.log("style", style.value);
  }
  if (voicesToo) {
    for (const v of SPOKEN_VOICES) {
      const clip = await media.speech("Hi there. This is how I sound.", v.value, AbortSignal.timeout(60_000));
      cost += clip.costMicroUsd;
      writeFileSync(join(tmp, `${v.value}.mp3`), clip.bytes);
      execFileSync(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", "-i", join(tmp, `${v.value}.mp3`), "-c:a", "libmp3lame", "-b:a", "64k", `public/video-voices/${v.value}.mp3`]);
      console.log("voice", v.value, `${(await media.duration(clip.bytes, AbortSignal.timeout(10_000))).toFixed(2)} s`);
    }
  }
  console.log(`cost about $${(cost / 1_000_000).toFixed(4)}`);
}

main().finally(() => rmSync(tmp, { recursive: true, force: true }));
