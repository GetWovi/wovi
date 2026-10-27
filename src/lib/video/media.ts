/**
 * The media calls behind Make a video (product doc, section 3: "video is never
 * made in one jump"): one storyboard image per scene, the voiceover, and the
 * cut that puts them together. Images and voice go through OpenRouter on the
 * catalog's image and audio routes; the cut is ffmpeg on the server (the
 * same bundled binary the clip library uses). Tests use the fake.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findModelRoute } from "@/lib/agents/catalog";
import { ffmpegPath } from "@/lib/clips/media";
import { OPENROUTER_BASE_URL } from "@/lib/runs/providers/openrouter";

export type Bytes = { bytes: Uint8Array; mimeType: string; costMicroUsd: number };
/** How the cut looks: the format, how much the pictures move, and which words go on screen. */
export type CutLook = { aspect: string; motion: "slow" | "lively" | "punchy"; headline: boolean; subtitles: boolean };
export const DEFAULT_LOOK: CutLook = { aspect: "9:16", motion: "slow", headline: false, subtitles: true };
/** Output size per format. */
export const SIZES: Record<string, [number, number]> = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };

export type CutScene = {
  image: Uint8Array;
  seconds: number;
  audio: Uint8Array | null;
  /** The spoken words, burned in as subtitles. */
  words?: string;
  /** A few big words for the screen (the headline), when the look shows them. */
  headline?: string;
  /** How long the voice speaks, so the subtitles follow it. */
  speechSeconds?: number;
  /** A moving clip for the scene, used instead of the still picture when there is one. */
  clip?: Uint8Array | null;
};

/** The voices on offer, as the doc's Voice and Cut agent names them, and the model voice behind each. */
export const VOICES = [
  { value: "warm", label: "Warm", model: "coral" },
  { value: "calm", label: "Calm", model: "sage" },
  { value: "bright", label: "Bright", model: "nova" },
] as const;
export type Voice = (typeof VOICES)[number]["value"];

export interface VideoMedia {
  readonly provider: string;
  /** One image for a scene, in the video's format (9:16 when none is given). */
  image(prompt: string, signal: AbortSignal, aspect?: string): Promise<Bytes>;
  /** The spoken lines as an MP3. */
  speech(text: string, voice: Voice, signal: AbortSignal): Promise<Bytes>;
  /** How long a voice clip plays, in seconds. */
  duration(audio: Uint8Array, signal: AbortSignal): Promise<number>;
  /** Each image shown for its seconds with its own voice clip (silence when none), as one MP4 in the format asked. */
  cut(scenes: CutScene[], signal: AbortSignal, look?: CutLook): Promise<Uint8Array>;
  /** The most one image and one second of voice may cost, in micro-dollars, for estimates. */
  estimate: { imageMicroUsd: number; speechMicroUsdPerChar: number };
}

export class MediaFailure extends Error {
  constructor(
    message: string,
    readonly costMicroUsd = 0,
  ) {
    super(message);
    this.name = "MediaFailure";
  }
}

/** Measured 27 Oct: one image about $0.067, the voice about $0.000005 a character. The estimates keep a margin. */
const IMAGE_ESTIMATE = 80_000;
const SPEECH_ESTIMATE_PER_CHAR = 20;

const usd = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 1_000_000) : 0);

function dataUrlBytes(url: string): { bytes: Uint8Array; mimeType: string } | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(url);
  return m ? { mimeType: m[1].toLowerCase(), bytes: new Uint8Array(Buffer.from(m[2], "base64")) } : null;
}

/** ffmpeg with a time limit; the error carries the last lines it printed. */
function ffmpeg(args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"], signal });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    child.on("error", (e) => reject(new MediaFailure(`The video could not be put together: ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new MediaFailure(`The video could not be put together (ffmpeg ${code}): ${err.split("\n").slice(-3).join(" ")}`))));
  });
}

const clampSec = (n: number) => Math.max(1, Math.min(60, n));
/** The brand font the subtitles are drawn in (assets/fonts, SIL Open Font License). */
const FONT = join(process.cwd(), "assets", "fonts", "Outfit-ExtraBold.ttf");
/** Subtitle lines: a few words each, short enough to fit the width at the size drawn. */
export function subtitleChunks(words: string, maxWords = 4, maxChars = 22): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of words.split(/\s+/).filter(Boolean)) {
    if (cur.length && (cur.length >= maxWords || [...cur, w].join(" ").length > maxChars)) {
      out.push(cur.join(" "));
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

/** Motion on a still picture, a different move per scene: in, out, a drift left, a drift right. Lively and punchy move more. */
function moveFor(i: number, frames: number, motion: CutLook["motion"]): string {
  const amount = motion === "punchy" ? 0.25 : motion === "lively" ? 0.18 : 0.12;
  const step = (amount / frames).toFixed(6);
  const top = (1 + amount).toFixed(2);
  const zoomIn = `min(1+${step}*on,${top})`;
  const zoomOut = `max(${top}-${step}*on,1)`;
  const centre = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
  const pan = (1 + amount * 0.8).toFixed(2);
  // A teaser punches in on every scene.
  if (motion === "punchy") return `zoompan=z='${zoomIn}':${centre}`;
  switch (i % 4) {
    case 0:
      return `zoompan=z='${zoomIn}':${centre}`;
    case 1:
      return `zoompan=z='${zoomOut}':${centre}`;
    case 2:
      return `zoompan=z='${pan}':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)'`;
    default:
      return `zoompan=z='${pan}':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'`;
  }
}

/**
 * The cut. Each scene becomes its own clip first: the picture with a slow move
 * (or a moving clip, when one was made), a short fade in and out, its words as
 * subtitles timed across its voice, and its voice padded to the same length.
 * Then the clips are joined end to end into one MP4 in the format asked.
 */
export async function ffmpegCut(scenes: CutScene[], signal: AbortSignal, look: CutLook = DEFAULT_LOOK): Promise<Uint8Array> {
  if (!scenes.length) throw new MediaFailure("There are no scenes to cut.");
  const [W, H] = SIZES[look.aspect] ?? SIZES["9:16"];
  const dir = mkdtempSync(join(tmpdir(), "wovi-cut-"));
  const fps = 30;
  try {
    const parts: string[] = [];
    for (const [i, s] of scenes.entries()) {
      const sec = clampSec(s.seconds);
      const frames = Math.round(sec * fps);
      const inputs: string[] = [];
      let picture: string;
      if (s.clip) {
        // A moving clip: looped if it is shorter than the scene, then trimmed.
        writeFileSync(join(dir, `c${i}.mp4`), s.clip);
        inputs.push("-stream_loop", "-1", "-i", join(dir, `c${i}.mp4`));
        picture = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}`;
      } else {
        writeFileSync(join(dir, `s${i}.img`), s.image);
        inputs.push("-i", join(dir, `s${i}.img`));
        // Drawn larger first, so the move stays smooth.
        picture = `scale=${W * 1.5}:${H * 1.5}:force_original_aspect_ratio=increase,crop=${W * 1.5}:${H * 1.5},setsar=1,${moveFor(i, frames, look.motion)}:d=${frames}:s=${W}x${H}:fps=${fps}`;
      }
      if (s.audio) {
        writeFileSync(join(dir, `v${i}.mp3`), s.audio);
        inputs.push("-i", join(dir, `v${i}.mp3`));
      } else {
        inputs.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono");
      }
      const fade = Math.min(look.motion === "punchy" ? 0.12 : 0.25, sec / 4);
      const filters = [picture, `fade=t=in:st=0:d=${fade.toFixed(2)}`, `fade=t=out:st=${(sec - fade).toFixed(2)}:d=${fade.toFixed(2)}`];
      const small = Math.round(Math.min(W, H) * 0.072);
      // The headline: a few big words that fade in, high on the screen (in the middle for a teaser).
      if (look.headline && s.headline?.trim()) {
        writeFileSync(join(dir, `h${i}.txt`), s.headline.trim());
        const big = Math.round(Math.min(W, H) * (look.motion === "punchy" ? 0.11 : 0.09));
        const y = look.motion === "punchy" ? "(h-text_h)/2" : "h*0.12";
        filters.push(`drawtext=fontfile='${FONT}':textfile='${join(dir, `h${i}.txt`)}':expansion=none:fontsize=${big}:fontcolor=white:borderw=${Math.round(big / 10)}:bordercolor=black@0.85:x=(w-text_w)/2:y=${y}:alpha='if(lt(t,0.35),t/0.35,1)'`);
      }
      // Subtitles: the words in short lines, spread across the time the voice speaks.
      const lines = look.subtitles && s.words ? subtitleChunks(s.words, 4, W > H ? 34 : 22) : [];
      if (lines.length) {
        const speak = Math.max(0.5, Math.min(sec, s.speechSeconds ?? sec));
        const total = lines.reduce((n, l) => n + l.split(" ").length, 0);
        let t = 0;
        lines.forEach((line, j) => {
          const len = (speak * line.split(" ").length) / total;
          writeFileSync(join(dir, `t${i}_${j}.txt`), line);
          filters.push(
            `drawtext=fontfile='${FONT}':textfile='${join(dir, `t${i}_${j}.txt`)}':expansion=none:fontsize=${small}:fontcolor=white:borderw=${Math.round(small / 11)}:bordercolor=black@0.9:x=(w-text_w)/2:y=h*0.74:enable='between(t,${t.toFixed(2)},${(t + len).toFixed(2)})'`,
          );
          t += len;
        });
      }
      filters.push("format=yuv420p");
      const part = join(dir, `p${i}.mp4`);
      await ffmpeg(
        [
          "-hide_banner", "-loglevel", "error", "-y",
          ...inputs,
          "-filter_complex", `[0:v]${filters.join(",")}[v];[1:a]apad,aresample=44100,aformat=channel_layouts=mono[a]`,
          "-map", "[v]", "-map", "[a]",
          "-t", sec.toFixed(2),
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", String(fps),
          "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "1",
          part,
        ],
        signal,
      );
      parts.push(`file 'p${i}.mp4'`);
    }
    writeFileSync(join(dir, "parts.txt"), parts.join("\n") + "\n");
    await ffmpeg(["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "parts.txt"), "-c", "copy", "-movflags", "+faststart", join(dir, "out.mp4")], signal);
    return new Uint8Array(readFileSync(join(dir, "out.mp4")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A clip's length from ffmpeg's own reading of it. */
export async function ffmpegDuration(audio: Uint8Array, signal: AbortSignal): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "wovi-dur-"));
  try {
    writeFileSync(join(dir, "a.mp3"), audio);
    const err = await new Promise<string>((resolve, reject) => {
      const child = spawn(ffmpegPath(), ["-hide_banner", "-i", join(dir, "a.mp3")], { stdio: ["ignore", "ignore", "pipe"], signal });
      let out = "";
      child.stderr.on("data", (d: Buffer) => (out += d.toString()));
      child.on("error", reject);
      child.on("close", () => resolve(out));
    });
    const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
    if (!m) throw new MediaFailure("The voice clip could not be read.");
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The real media on OpenRouter, with the catalog's image and audio routes. */
export function openRouterMedia(opts: { apiKey: string; fetch?: typeof fetch; appUrl?: string }): VideoMedia {
  const doFetch = opts.fetch ?? fetch;
  const imageModel = findModelRoute("image-standard")?.model ?? "google/gemini-3.1-flash-image";
  const audioModel = findModelRoute("audio-standard")?.model ?? "openai/gpt-audio-mini";
  const headers = { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json", "x-title": "WOVI", ...(opts.appUrl ? { "http-referer": opts.appUrl } : {}) };
  return {
    provider: "openrouter",
    estimate: { imageMicroUsd: IMAGE_ESTIMATE, speechMicroUsdPerChar: SPEECH_ESTIMATE_PER_CHAR },
    async image(prompt, signal, aspect = "9:16") {
      const res = await doFetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({ model: imageModel, modalities: ["image", "text"], image_config: { aspect_ratio: SIZES[aspect] ? aspect : "9:16" }, messages: [{ role: "user", content: prompt }], usage: { include: true } }),
      });
      const body = (await res.json().catch(() => null)) as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[]; usage?: { cost?: number }; error?: { message?: string } } | null;
      const cost = usd(body?.usage?.cost);
      if (!res.ok || body?.error) throw new MediaFailure(`The image could not be made: ${body?.error?.message ?? res.statusText}`, cost);
      const url = body?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const img = url ? dataUrlBytes(url) : null;
      if (!img || !img.mimeType.startsWith("image/")) throw new MediaFailure("The image model answered without an image.", cost);
      // A missing price never makes a picture free: it counts at the estimate, so the credits always cover it.
      return { ...img, costMicroUsd: cost || IMAGE_ESTIMATE };
    },
    async speech(text, voice, signal) {
      const v = VOICES.find((x) => x.value === voice)?.model ?? "coral";
      const res = await doFetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          model: audioModel,
          modalities: ["text", "audio"],
          audio: { voice: v, format: "pcm16" },
          stream: true,
          usage: { include: true },
          messages: [
            { role: "system", content: "You are a voiceover artist. Read the user's text aloud exactly as written, word for word, in a natural, friendly pace. Do not add, skip or change any words." },
            { role: "user", content: text },
          ],
        }),
      });
      if (!res.ok || !res.body) throw new MediaFailure(`The voice could not be made: ${res.status} ${await res.text().catch(() => "")}`.trim());
      // The audio arrives as base64 PCM chunks in the stream's deltas.
      const chunks: Buffer[] = [];
      let cost = 0;
      let rest = "";
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rest += dec.decode(value, { stream: true });
        const lines = rest.split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          const ev = JSON.parse(line.slice(6)) as { choices?: { delta?: { audio?: { data?: string } } }[]; usage?: { cost?: number } };
          const data = ev.choices?.[0]?.delta?.audio?.data;
          if (data) chunks.push(Buffer.from(data, "base64"));
          if (ev.usage?.cost !== undefined) cost = usd(ev.usage.cost);
        }
      }
      if (!chunks.length) throw new MediaFailure("The voice model answered without sound.", cost);
      return { bytes: await pcmToMp3(Buffer.concat(chunks), signal), mimeType: "audio/mpeg", costMicroUsd: cost || text.length * SPEECH_ESTIMATE_PER_CHAR };
    },
    duration: ffmpegDuration,
    cut: ffmpegCut,
  };
}

/** 24 kHz mono 16-bit PCM, as the audio model streams it, to an MP3. */
async function pcmToMp3(pcm: Buffer, signal: AbortSignal): Promise<Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), "wovi-voice-"));
  try {
    writeFileSync(join(dir, "in.pcm"), pcm);
    await ffmpeg(["-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", join(dir, "in.pcm"), "-c:a", "libmp3lame", "-b:a", "96k", join(dir, "out.mp3")], signal);
    return new Uint8Array(readFileSync(join(dir, "out.mp3")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A 1x1 PNG, the fake's every image. */
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

/** For tests and a local app without a key: fixed bytes, no network, no ffmpeg. */
export function fakeVideoMedia(opts: { failImage?: boolean } = {}): VideoMedia & { calls: string[] } {
  const calls: string[] = [];
  return {
    provider: "fake",
    calls,
    estimate: { imageMicroUsd: 45_000, speechMicroUsdPerChar: 60 },
    async image(prompt) {
      calls.push(`image:${prompt.slice(0, 40)}`);
      if (opts.failImage) throw new MediaFailure("The image could not be made: fake failure.");
      return { bytes: PNG, mimeType: "image/png", costMicroUsd: 40_000 };
    },
    async speech(text, voice) {
      calls.push(`speech:${voice}`);
      return { bytes: new Uint8Array([0xff, 0xfb, 0x90, 0x00]), mimeType: "audio/mpeg", costMicroUsd: text.length * 50 };
    },
    async duration() {
      return 3;
    },
    async cut(scenes, _signal, look) {
      calls.push(`cut:${scenes.length}:${scenes.filter((s) => s.audio).length} voiced${look ? `:${look.aspect}` : ""}`);
      return new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    },
  };
}
