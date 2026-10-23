/**
 * ffmpeg for clips: how long a clip is and whether it has sound, its audio as
 * a small MP3 for the transcription model, and a few frames as JPEGs for the
 * vision model and the poster. No system ffmpeg is needed: the binary comes
 * from @ffmpeg-installer/ffmpeg (an npm dependency with builds for linux x64
 * and macOS), unless WOVI_FFMPEG_PATH names another one.
 *
 * Everything sits behind ClipMedia, so tests use a fake and never run ffmpeg.
 */
import { spawn } from "node:child_process";
import { accessSync, chmodSync, constants, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { ClipProbe } from "./types";

export interface ClipMedia {
  /** Duration, size and whether there is a sound track. Throws MediaError when it is not a video ffmpeg can read. */
  probe(path: string): Promise<ClipProbe>;
  /** The sound as a mono 16 kHz MP3, which is all speech needs and keeps three minutes near 1 MB. */
  audio(path: string, out: string): Promise<void>;
  /** One JPEG at `atSec`, at most `maxSide` pixels on its longer side. */
  frame(path: string, atSec: number, out: string, maxSide: number): Promise<void>;
}

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

let cached: string | null | undefined;

/** The ffmpeg binary: WOVI_FFMPEG_PATH, then the bundled one, then `ffmpeg` on the PATH. */
export function ffmpegPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WOVI_FFMPEG_PATH) return env.WOVI_FFMPEG_PATH;
  if (cached === undefined) {
    cached = null;
    try {
      // Loaded at run time, so the bundler leaves the package (and its binary) in node_modules.
      const req = createRequire(import.meta.url);
      const p = (req("@ffmpeg-installer/ffmpeg") as { path?: string }).path;
      if (p && existsSync(p)) {
        // The package marks the binary runnable in an install script; a build that skips scripts leaves it as a plain file.
        try {
          accessSync(p, constants.X_OK);
        } catch {
          chmodSync(p, 0o755);
        }
        cached = p;
      }
    } catch {
      cached = null;
    }
  }
  return cached ?? "ffmpeg";
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      // Only the start matters (the stream list); keep memory small on a chatty run.
      if (stderr.length < 64_000) stderr += d.toString("utf8");
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new MediaError(`ffmpeg could not start (${(err as NodeJS.ErrnoException).code ?? err.message}). Set WOVI_FFMPEG_PATH or reinstall @ffmpeg-installer/ffmpeg.`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

/** Reads ffmpeg's own description of the input (what `ffmpeg -i` prints). Exported for tests. */
export function parseProbe(stderr: string): ClipProbe | null {
  const d = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const video = /Stream #\S+.*?: Video: [^\n]*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  if (!d || !video) return null;
  const durationSec = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  let width = Number(video[1]);
  let height = Number(video[2]);
  // Phones store portrait video as landscape plus a rotation; report what people see.
  const rot = /rotate\s*:\s*(-?\d+)/.exec(stderr) ?? /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(stderr);
  if (rot && Math.abs(Math.round(Number(rot[1]))) % 180 === 90) [width, height] = [height, width];
  return { durationSec: Math.round(durationSec * 100) / 100, width, height, hasAudio: /Stream #\S+.*?: Audio: /.test(stderr) };
}

export function ffmpegMedia(bin = ffmpegPath()): ClipMedia {
  return {
    async probe(path) {
      const r = await run(bin, ["-hide_banner", "-nostdin", "-i", path], 30_000);
      const p = parseProbe(r.stderr);
      if (!p) throw new MediaError("ffmpeg could not read this as a video.");
      return p;
    },
    async audio(path, out) {
      const r = await run(bin, ["-hide_banner", "-nostdin", "-v", "error", "-y", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-f", "mp3", out], 120_000);
      if (r.code !== 0 || !existsSync(out)) throw new MediaError(`ffmpeg could not take the sound out: ${r.stderr.trim().split("\n").pop() ?? "unknown error"}`);
    },
    async frame(path, atSec, out, maxSide) {
      const scale = `scale='if(gt(iw,ih),min(${maxSide},iw),-2)':'if(gt(iw,ih),-2,min(${maxSide},ih))'`;
      const args = (at: number) => ["-hide_banner", "-nostdin", "-v", "error", "-y", "-ss", at.toFixed(2), "-i", path, "-frames:v", "1", "-vf", scale, "-q:v", "4", out];
      // A seek past the last frame writes nothing: step back a second, then take the first frame.
      for (const at of [...new Set([atSec, Math.max(0, atSec - 1), 0])]) {
        const r = await run(bin, args(at), 60_000);
        if (r.code === 0 && existsSync(out)) return;
      }
      throw new MediaError(`ffmpeg could not take a frame at ${atSec.toFixed(1)} s.`);
    },
  };
}

/** The first bytes of an MP4, MOV or WebM: null when they look right, else why not. */
export function sniffVideo(head: Uint8Array, name: string): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  // MP4 and MOV: a box size, then "ftyp" (or an older "moov", "mdat", "wide", "free" box first).
  if (head.byteLength >= 8 && ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(ascii(4, 8))) return null;
  // WebM and Matroska: the EBML magic.
  if (head.byteLength >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return null;
  return `"${name}" does not look like an MP4, MOV or WebM video.`;
}

export function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}
