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
export type CutScene = { image: Uint8Array; seconds: number; audio: Uint8Array | null };

/** The voices on offer, as the doc's Voice and Cut agent names them, and the model voice behind each. */
export const VOICES = [
  { value: "warm", label: "Warm", model: "coral" },
  { value: "calm", label: "Calm", model: "sage" },
  { value: "bright", label: "Bright", model: "nova" },
] as const;
export type Voice = (typeof VOICES)[number]["value"];

export interface VideoMedia {
  readonly provider: string;
  /** One vertical 9:16 image for a scene. */
  image(prompt: string, signal: AbortSignal): Promise<Bytes>;
  /** The spoken lines as an MP3. */
  speech(text: string, voice: Voice, signal: AbortSignal): Promise<Bytes>;
  /** How long a voice clip plays, in seconds. */
  duration(audio: Uint8Array, signal: AbortSignal): Promise<number>;
  /** Each image shown for its seconds with its own voice clip (silence when none), as one 1080x1920 MP4. */
  cut(scenes: CutScene[], signal: AbortSignal): Promise<Uint8Array>;
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

/** The cut: each image held for its seconds with its voice clip padded to the same length, scaled into 1080x1920. */
export async function ffmpegCut(scenes: CutScene[], signal: AbortSignal): Promise<Uint8Array> {
  if (!scenes.length) throw new MediaFailure("There are no scenes to cut.");
  const dir = mkdtempSync(join(tmpdir(), "wovi-cut-"));
  try {
    const pics: string[] = [];
    const sounds: string[] = [];
    for (const [i, s] of scenes.entries()) {
      const sec = clampSec(s.seconds).toFixed(2);
      writeFileSync(join(dir, `s${i}.img`), s.image);
      pics.push(`file 's${i}.img'`, `duration ${sec}`);
      // Every scene's sound is exactly as long as its picture: its voice padded with silence, or silence alone.
      const seg = join(dir, `a${i}.wav`);
      if (s.audio) {
        writeFileSync(join(dir, `v${i}.mp3`), s.audio);
        await ffmpeg(["-hide_banner", "-loglevel", "error", "-y", "-i", join(dir, `v${i}.mp3`), "-af", "apad", "-t", sec, "-ar", "44100", "-ac", "1", seg], signal);
      } else {
        await ffmpeg(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", sec, seg], signal);
      }
      sounds.push(`file 'a${i}.wav'`);
    }
    // The concat format reads the last duration only when the last file is named again.
    pics.push(`file 's${scenes.length - 1}.img'`);
    writeFileSync(join(dir, "pics.txt"), pics.join("\n") + "\n");
    writeFileSync(join(dir, "sounds.txt"), sounds.join("\n") + "\n");
    const total = scenes.reduce((n, s) => n + clampSec(s.seconds), 0);
    await ffmpeg(
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", join(dir, "pics.txt"),
        "-f", "concat", "-safe", "0", "-i", join(dir, "sounds.txt"),
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        "-t", total.toFixed(2),
        join(dir, "out.mp4"),
      ],
      signal,
    );
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
    // Measured 27 Oct: one image about $0.067, the voice about $0.000005 a character; estimates keep a margin.
    estimate: { imageMicroUsd: 80_000, speechMicroUsdPerChar: 20 },
    async image(prompt, signal) {
      const res = await doFetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({ model: imageModel, modalities: ["image", "text"], image_config: { aspect_ratio: "9:16" }, messages: [{ role: "user", content: prompt }], usage: { include: true } }),
      });
      const body = (await res.json().catch(() => null)) as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[]; usage?: { cost?: number }; error?: { message?: string } } | null;
      const cost = usd(body?.usage?.cost);
      if (!res.ok || body?.error) throw new MediaFailure(`The image could not be made: ${body?.error?.message ?? res.statusText}`, cost);
      const url = body?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const img = url ? dataUrlBytes(url) : null;
      if (!img || !img.mimeType.startsWith("image/")) throw new MediaFailure("The image model answered without an image.", cost);
      return { ...img, costMicroUsd: cost };
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
      return { bytes: await pcmToMp3(Buffer.concat(chunks), signal), mimeType: "audio/mpeg", costMicroUsd: cost };
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
    async cut(scenes) {
      calls.push(`cut:${scenes.length}:${scenes.filter((s) => s.audio).length} voiced`);
      return new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    },
  };
}
