/** Clip samples for tests: the test builder, files in a temp folder, ffmpeg and the model faked, a clock the test moves. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testBuilder } from "@/lib/builder/test-helpers";
import { localFileStorage } from "@/lib/builder/storage";
import { memorySafetyStore } from "@/lib/safety/store";
import { clipConfigFromEnv, type ClipConfig } from "./config";
import { ClipLibrary } from "./library";
import { MediaError, type ClipMedia } from "./media";
import { fakeClipProvider, type ClipProvider } from "./provider";
import { ClipQueue } from "./queue";
import { memoryClipStore } from "./store";
import type { ClipProbe } from "./types";

/** ffmpeg, faked: the probe comes from a table by the file's first bytes ("LEN=12.5;AUDIO=1"), audio and frames are small files. */
export function fakeMedia(): ClipMedia & { calls: { probe: number; audio: number; frame: number } } {
  const calls = { probe: 0, audio: 0, frame: 0 };
  return {
    calls,
    async probe(path) {
      calls.probe++;
      const head = (await import("node:fs")).readFileSync(path).subarray(0, 200).toString("latin1");
      const m = /LEN=([\d.]+);AUDIO=(\d);W=(\d+);H=(\d+)/.exec(head);
      if (!m) throw new MediaError("ffmpeg could not read this as a video.");
      const p: ClipProbe = { durationSec: Number(m[1]), hasAudio: m[2] === "1", width: Number(m[3]), height: Number(m[4]) };
      return p;
    },
    async audio(_path, out) {
      calls.audio++;
      writeFileSync(out, Buffer.from("ID3fake-mp3"));
    },
    async frame(_path, at, out) {
      calls.frame++;
      writeFileSync(out, Buffer.from([0xff, 0xd8, 0xff, 0xe0, Math.round(at) & 0xff, 0xff, 0xd9]));
    },
  };
}

/** The bytes of a pretend MP4: a real "ftyp" box head, then the fake probe's table. */
export function fakeMp4(opts: { len?: number; audio?: boolean; w?: number; h?: number; pad?: number } = {}): Uint8Array {
  const head = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.from(`LEN=${opts.len ?? 12};AUDIO=${opts.audio === false ? 0 : 1};W=${opts.w ?? 1080};H=${opts.h ?? 1920}`)]);
  return new Uint8Array(Buffer.concat([head, Buffer.alloc(opts.pad ?? 1000)]));
}

export async function* chunks(bytes: Uint8Array, size = 64 * 1024): AsyncIterable<Uint8Array> {
  for (let i = 0; i < bytes.byteLength; i += size) yield bytes.subarray(i, i + size);
}

export async function testClips(opts: { provider?: ClipProvider | null; config?: Partial<ClipConfig> } = {}) {
  const t = await testBuilder({ seeds: true });
  const dir = mkdtempSync(join(tmpdir(), "wovi-clips-"));
  const files = localFileStorage(join(dir, "files"));
  const store = memoryClipStore();
  const media = fakeMedia();
  const provider = opts.provider === undefined ? fakeClipProvider({ costMicroUsd: 120 }) : opts.provider;
  let clock = Date.parse("2026-10-23T10:00:00Z");
  const now = () => new Date(clock);
  const config: ClipConfig = { ...clipConfigFromEnv({} as NodeJS.ProcessEnv), pollMs: 10, backoff: { baseMs: 1000, maxMs: 60_000 }, ...opts.config };
  const queue = new ClipQueue({ store, files, media, provider, config, workDir: join(dir, "work"), now });
  const safety = memorySafetyStore();
  const library = new ClipLibrary({ builder: t.builder, store, files, media, queue, safety, now });
  const { me, user } = await t.joinBuilder();
  const upload = (bytes: Uint8Array, name = "bakery-hook.mp4", extra: { rights?: boolean; mimeType?: string; sizeBytes?: number } = {}) =>
    library.upload(me, { name, mimeType: extra.mimeType ?? "video/mp4", sizeBytes: extra.sizeBytes ?? bytes.byteLength, stream: chunks(bytes), rights: extra.rights ?? true });
  /** Runs the queue until nothing it can start is left, without real timers. */
  const drain = async () => {
    for (let i = 0; i < 20; i++) {
      const started = await queue.tick();
      await queue.idle();
      if (!started.length) return;
    }
  };
  return {
    ...t,
    me,
    user,
    dir,
    files,
    store,
    media,
    provider,
    queue,
    library,
    safety,
    config,
    upload,
    drain,
    advance: (ms: number) => void (clock += ms),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
