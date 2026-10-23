/**
 * The settings for clip samples, all from the environment, with defaults
 * that are safe to run with. Nothing here reads a key; the provider does.
 *
 *   WOVI_CLIP_SAMPLES=off            turns the whole feature off (no uploads, no reads)
 *   WOVI_CLIP_TRANSCRIBE_MODEL       the speech-to-text model (OpenRouter /audio/transcriptions)
 *   WOVI_CLIP_VISION_MODEL           the model that reads the frames (OpenRouter chat with images)
 *   WOVI_CLIP_DAILY_CAP_USD          the most clip reading may spend per UTC day (default 5)
 *   WOVI_CLIP_CONCURRENCY            clips read at once (default 2, at most 6)
 *   WOVI_CLIP_PROVIDER=fake          reads clips with the fake provider (local work only)
 *   WOVI_FFMPEG_PATH                 an ffmpeg binary to use instead of the bundled one
 */
import type { ClipStep } from "./types";

export const DEFAULT_TRANSCRIBE_MODEL = "openai/whisper-large-v3-turbo";
export const DEFAULT_VISION_MODEL = "google/gemini-2.5-flash-lite";
export const DEFAULT_DAILY_CAP_USD = 5;

export const CLIP_LIMITS = {
  /** Bytes per clip. */
  maxBytes: 200 * 1024 * 1024,
  /** Seconds per clip. Three minutes, with a second of slack for rounding. */
  maxSeconds: 181,
  /** Clips the library keeps. */
  maxClips: 500,
  types: ["video/mp4", "video/quicktime", "video/webm"] as readonly string[],
  extensions: [".mp4", ".mov", ".webm", ".m4v"] as readonly string[],
} as const;

export type ClipConfig = {
  enabled: boolean;
  transcribeModel: string;
  visionModel: string;
  dailyCapMicroUsd: number;
  concurrency: number;
  /** Failed tries before a clip is marked failed. */
  maxAttempts: number;
  /** Retry delay: baseMs, times four each try, at most maxMs. */
  backoff: { baseMs: number; maxMs: number };
  /** How long a worker may hold a clip before another may take it again. */
  leaseMs: number;
  /** How often the queue looks for work. */
  pollMs: number;
};

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function clipConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ClipConfig {
  return {
    enabled: (env.WOVI_CLIP_SAMPLES ?? "on").trim().toLowerCase() !== "off",
    transcribeModel: env.WOVI_CLIP_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL,
    visionModel: env.WOVI_CLIP_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL,
    dailyCapMicroUsd: Math.round(num(env.WOVI_CLIP_DAILY_CAP_USD, DEFAULT_DAILY_CAP_USD, 0, 1000) * 1_000_000),
    concurrency: Math.round(num(env.WOVI_CLIP_CONCURRENCY, 2, 1, 6)),
    maxAttempts: 4,
    backoff: { baseMs: 30_000, maxMs: 30 * 60_000 },
    leaseMs: 10 * 60_000,
    pollMs: 3_000,
  };
}

/**
 * Prices per model for the estimate held against the cap before a call. The
 * real cost comes from OpenRouter's usage afterwards. A model not listed is
 * estimated high on purpose, so a new model can never slip past the cap.
 * Read from openrouter.ai/api/v1/models on 2026-10-23.
 */
export const CLIP_MODEL_PRICES: Record<string, { perAudioSecondUsd?: number; inPerMTokUsd?: number; outPerMTokUsd?: number }> = {
  "openai/whisper-large-v3-turbo": { perAudioSecondUsd: 0.00000333 },
  "openai/whisper-large-v3": { perAudioSecondUsd: 0.0000075 },
  "qwen/qwen3-asr-1.7b": { perAudioSecondUsd: 0.0000075 },
  "mistralai/voxtral-mini-3b-2507": { perAudioSecondUsd: 0.0000166667 },
  "openai/whisper-1": { perAudioSecondUsd: 0.0001 },
  "google/gemini-2.5-flash-lite": { inPerMTokUsd: 0.1, outPerMTokUsd: 0.4 },
  "google/gemini-3.1-flash-lite": { inPerMTokUsd: 0.25, outPerMTokUsd: 1.5 },
  "google/gemini-2.5-flash": { inPerMTokUsd: 0.3, outPerMTokUsd: 2.5 },
};

/** Frames sent to the vision model per clip. */
export const FRAME_COUNT = 3;
/** Output tokens the vision model may write. */
export const FRAMES_MAX_TOKENS = 700;

/** The most a call may cost, in micro-dollars, held against the cap while it is out. Rounded up, never below 100 (one cent is 10,000). */
export function estimateCallMicroUsd(step: ClipStep, model: string, durationSec: number): number {
  const p = CLIP_MODEL_PRICES[model];
  let usd: number;
  if (step === "transcript") {
    // Token-priced audio models bill about 32 tokens a second; per-second models bill the seconds.
    usd = p?.perAudioSecondUsd !== undefined ? p.perAudioSecondUsd * Math.max(1, durationSec) : p?.inPerMTokUsd !== undefined ? ((Math.max(1, durationSec) * 32 + 2_000) * p.inPerMTokUsd + 4_000 * (p.outPerMTokUsd ?? 0)) / 1e6 : 0.0001 * Math.max(10, durationSec);
  } else {
    // Each frame is at most about 1,300 tokens, plus the instructions; the answer is capped.
    usd = p?.inPerMTokUsd !== undefined ? ((FRAME_COUNT * 1_300 + 1_200) * p.inPerMTokUsd + FRAMES_MAX_TOKENS * (p.outPerMTokUsd ?? 0)) / 1e6 : 0.01;
  }
  // Twice the list price: provider routing and rounding never push a call over what was held.
  return Math.max(100, Math.ceil(usd * 2 * 1e6));
}

export function microToUsd(micro: number): number {
  return micro / 1e6;
}

/** "$0.0012" for small amounts, "$1.23" for larger. */
export function formatMicroUsd(micro: number): string {
  const usd = micro / 1e6;
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
