/**
 * SERVER ONLY. The last pass over a made video (a picture cut or a motion
 * graphics render): the captions laid over it and the brand's end card added
 * after it, in one ffmpeg run.
 *
 * Each caption cue is drawn once as a transparent frame of the video's size
 * (captionSvg, rasterised by resvg with the Outfit fonts in assets/fonts) and
 * the frames are joined into one overlay track with the concat demuxer, each
 * held exactly as long as its cue, with an empty frame in the gaps. So the
 * captions look the same on every server and in every look, including the
 * word-by-word highlight.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ffmpegPath } from "@/lib/clips/media";
import { captionSvg } from "./captions";
import { MediaFailure, type FinishOptions } from "./media";

const FONTS = [join(process.cwd(), "assets", "fonts", "Outfit-Regular.ttf"), join(process.cwd(), "assets", "fonts", "Outfit-ExtraBold.ttf")];

/** An SVG as PNG bytes, with the brand fonts only (system fonts are never read). */
export function svgPng(svg: string, width: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Outfit" } }).render().asPng();
}

function run(args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"], signal });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    child.on("error", (e) => reject(new MediaFailure(`The captions could not be added: ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new MediaFailure(`The captions could not be added (ffmpeg ${code}): ${err.split("\n").slice(-3).join(" ")}`))));
  });
}

/** The overlay track as a concat list: an empty frame in every gap, each cue's frame for its time, and an empty frame to end on. */
export function overlayList(cues: { start: number; end: number }[], total: number, frame: (i: number) => string, blank: string): string {
  const lines: string[] = [];
  let t = 0;
  const hold = (file: string, seconds: number) => {
    if (seconds <= 0.001) return;
    lines.push(`file '${file}'`, `duration ${seconds.toFixed(3)}`);
  };
  cues.forEach((c, i) => {
    const start = Math.max(t, c.start);
    hold(blank, start - t);
    hold(frame(i), Math.min(total, c.end) - start);
    t = Math.max(start, Math.min(total, c.end));
  });
  hold(blank, Math.max(0.04, total - t));
  // The concat demuxer needs the last file once more for the last duration to count.
  lines.push(`file '${blank}'`);
  return lines.join("\n") + "\n";
}

export async function ffmpegFinish(video: Uint8Array, o: FinishOptions, signal: AbortSignal): Promise<Uint8Array> {
  const captions = o.captions && o.cues.length ? o.captions : null;
  if (!captions && !o.card) return video;
  const dir = mkdtempSync(join(tmpdir(), "wovi-finish-"));
  try {
    writeFileSync(join(dir, "in.mp4"), video);
    const total = await durationOf(join(dir, "in.mp4"), signal);
    const inputs = ["-i", join(dir, "in.mp4")];
    const graph: string[] = [];
    let v = "[0:v]";
    if (captions) {
      const blank = `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}"></svg>`;
      writeFileSync(join(dir, "blank.png"), svgPng(blank, o.width));
      o.cues.forEach((c, i) => writeFileSync(join(dir, `c${i}.png`), svgPng(captionSvg(c, captions.look, captions.position, o.width, o.height, captions.highlight), o.width)));
      writeFileSync(join(dir, "track.txt"), overlayList(o.cues, total, (i) => `c${i}.png`, "blank.png"));
      inputs.push("-f", "concat", "-safe", "0", "-i", join(dir, "track.txt"));
      graph.push(`[1:v]format=rgba,setpts=PTS-STARTPTS[cap]`, `[0:v][cap]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[main]`);
      v = "[main]";
    }
    let a = "[0:a]";
    if (o.card) {
      writeFileSync(join(dir, "card.png"), o.card.png);
      const n = inputs.filter((x) => x === "-i").length;
      inputs.push("-loop", "1", "-t", o.card.seconds.toFixed(2), "-framerate", "30", "-i", join(dir, "card.png"), "-f", "lavfi", "-t", o.card.seconds.toFixed(2), "-i", "anullsrc=r=44100:cl=mono");
      graph.push(
        `${v}fps=30,settb=AVTB,setsar=1[m]`,
        `[${n}:v]scale=${o.width}:${o.height},fps=30,settb=AVTB,setsar=1,format=yuv420p,fade=t=in:st=0:d=0.35[card]`,
        `[0:a]aresample=44100,aformat=channel_layouts=mono[ma]`,
        `[m][ma][card][${n + 1}:a]concat=n=2:v=1:a=1[vout][aout]`,
      );
      v = "[vout]";
      a = "[aout]";
    }
    await run(
      [
        "-hide_banner", "-loglevel", "error", "-y",
        ...inputs,
        "-filter_complex", graph.join(";"),
        "-map", v, "-map", a,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        join(dir, "out.mp4"),
      ],
      signal,
    );
    return new Uint8Array(readFileSync(join(dir, "out.mp4")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A video's length from ffmpeg's own reading of it. */
async function durationOf(file: string, signal: AbortSignal): Promise<number> {
  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"], signal });
    let text = "";
    child.stderr.on("data", (d: Buffer) => (text += d.toString()));
    child.on("error", reject);
    child.on("close", () => resolve(text));
  });
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
  if (!m) throw new MediaFailure("The video could not be read for its captions.");
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
