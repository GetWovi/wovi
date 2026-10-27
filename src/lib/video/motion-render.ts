/**
 * SERVER ONLY. Renders minimal motion scenes into an MP4: every frame is the
 * scene's SVG at that moment (motion.ts), rasterised by resvg and piped into
 * ffmpeg, with each scene's voice clip padded to the scene's length. The
 * fonts are the brand's own files in assets/fonts; system fonts are never
 * read, so a frame looks the same on every server.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ffmpegPath } from "@/lib/clips/media";
import { MediaFailure } from "./media";
import { sceneSvg, type MotionLook, type MotionScene } from "./motion";

const FONTS = [join(process.cwd(), "assets", "fonts", "Outfit-Regular.ttf")];
const FPS = 30;

function run(args: string[], signal: AbortSignal, input?: (stdin: NodeJS.WritableStream) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"], signal });
    let err = "";
    child.stderr!.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    child.on("error", (e) => reject(new MediaFailure(`The video could not be made: ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new MediaFailure(`The video could not be made (ffmpeg ${code}): ${err.split("\n").slice(-3).join(" ")}`))));
    if (input) input(child.stdin!).then(() => child.stdin!.end(), (e) => (child.kill(), reject(e)));
  });
}

/** One frame as PNG bytes. */
export function renderFrame(svg: string, width: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Outfit" } }).render().asPng();
}

export async function renderMotion(scenes: (MotionScene & { audio: Uint8Array | null })[], look: MotionLook, signal: AbortSignal): Promise<Uint8Array> {
  if (!scenes.length) throw new MediaFailure("There are no scenes to animate.");
  const dir = mkdtempSync(join(tmpdir(), "wovi-motion-"));
  try {
    // The sound first: each scene's voice padded to the scene's length, joined end to end.
    const sounds: string[] = [];
    for (const [i, s] of scenes.entries()) {
      const sec = s.seconds.toFixed(2);
      const seg = join(dir, `a${i}.wav`);
      if (s.audio) {
        writeFileSync(join(dir, `v${i}.mp3`), s.audio);
        await run(["-hide_banner", "-loglevel", "error", "-y", "-i", join(dir, `v${i}.mp3`), "-af", "adelay=300|300,apad", "-t", sec, "-ar", "44100", "-ac", "1", seg], signal);
      } else {
        await run(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", sec, seg], signal);
      }
      sounds.push(`file 'a${i}.wav'`);
    }
    writeFileSync(join(dir, "sounds.txt"), sounds.join("\n") + "\n");
    await run(["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "sounds.txt"), "-c:a", "pcm_s16le", join(dir, "voice.wav")], signal);

    // Then every frame, straight into ffmpeg as PNGs, with the sound on top.
    await run(
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
        "-i", join(dir, "voice.wav"),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart",
        join(dir, "out.mp4"),
      ],
      signal,
      async (stdin) => {
        for (const s of scenes) {
          const frames = Math.max(1, Math.round(s.seconds * FPS));
          for (let f = 0; f < frames; f++) {
            if (signal.aborted) throw new MediaFailure("The video was stopped.");
            const png = renderFrame(sceneSvg(s, f / (frames - 1 || 1), look), look.width);
            if (!stdin.write(png)) await new Promise((r) => stdin.once("drain", r));
          }
        }
      },
    );
    return new Uint8Array(readFileSync(join(dir, "out.mp4")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
