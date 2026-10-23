/**
 * Clip samples on the local stores in a data dir: clips.json, the builder's
 * files folder, ffmpeg from npm, and OpenRouter when OPENROUTER_API_KEY is
 * set. One queue per process, started from instrumentation so clips left
 * unread by a restart are picked up again. No Next.js imports.
 */
import { join } from "node:path";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { isLocalApp } from "@/lib/runtime";
import type { Builder } from "@/lib/builder/builder";
import { localFileStorage } from "@/lib/builder/storage";
import { localSafetyStore } from "@/lib/safety/local";
import { clipConfigFromEnv, type ClipConfig } from "./config";
import { ClipLibrary } from "./library";
import { ffmpegMedia, type ClipMedia } from "./media";
import { fakeClipProvider, openRouterClipProvider, type ClipProvider } from "./provider";
import { ClipQueue } from "./queue";
import { jsonFileClipStore } from "./store";

/** OpenRouter with the key, the fake only when asked for by name, else none (clips wait). */
export function clipProviderFromEnv(env: NodeJS.ProcessEnv = process.env): ClipProvider | null {
  // The fake reads nothing; only a local app may ask for it.
  if ((env.WOVI_CLIP_PROVIDER ?? "").trim().toLowerCase() === "fake") return isLocalApp(env) ? fakeClipProvider() : null;
  const key = env.OPENROUTER_API_KEY?.trim();
  return key ? openRouterClipProvider({ apiKey: key }) : null;
}

export function localClipQueue(dataDir = dataDirFromEnv(), opts: { config?: ClipConfig; provider?: ClipProvider | null; media?: ClipMedia } = {}): ClipQueue {
  return new ClipQueue({
    store: jsonFileClipStore(join(dataDir, "clips.json")),
    files: localFileStorage(join(dataDir, "files")),
    media: opts.media ?? ffmpegMedia(),
    provider: opts.provider === undefined ? clipProviderFromEnv() : opts.provider,
    config: opts.config ?? clipConfigFromEnv(),
    workDir: join(dataDir, "tmp", "clips"),
    log: (m) => console.warn(m),
  });
}

const g = globalThis as { __woviClipQueue?: ClipQueue };

/** The one queue of this process. */
export function processClipQueue(): ClipQueue {
  return (g.__woviClipQueue ??= localClipQueue());
}

/** Starts the process queue (instrumentation). Off with WOVI_CLIP_SAMPLES=off. */
export async function startClipQueue(): Promise<void> {
  const q = processClipQueue();
  if (!q.config.enabled) return;
  await q.start();
}

export function localClipLibrary(builder: Builder, dataDir = dataDirFromEnv(), queue: ClipQueue = processClipQueue(), media: ClipMedia = ffmpegMedia()): ClipLibrary {
  return new ClipLibrary({
    builder,
    store: jsonFileClipStore(join(dataDir, "clips.json")),
    files: localFileStorage(join(dataDir, "files")),
    media,
    queue,
    safety: localSafetyStore(dataDir),
  });
}
