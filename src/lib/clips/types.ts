/**
 * Clip samples: short videos the builder uploads so their words can become
 * samples for the text agents. A clip is stored as a file, read in a
 * background job (the spoken words by a transcription model, the on-screen
 * text and what happens by a vision model on a few frames), and kept as a
 * row in clips.json with the text it produced. Every call to a model is a
 * row of its own, with its cost, so a clip is never paid for twice.
 */
import type { InjectionSignal } from "@/lib/safety/injection";
import type { SafetyFinding } from "@/lib/safety/screen";
import type { StoredFile } from "@/lib/builder/storage";
import type { SampleLabel } from "@/lib/builder/types";

export const CLIP_PLATFORMS = ["tiktok", "reels", "shorts", "x"] as const;
export type ClipPlatform = (typeof CLIP_PLATFORMS)[number];

/**
 * uploaded: stored and waiting in line. reading: a worker has it.
 * waiting: held back (the daily cap is reached, or no model is set up).
 * ready: the text sample exists. failed: gave up, with the reason.
 */
export const CLIP_STATUSES = ["uploaded", "reading", "waiting", "ready", "failed"] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

export type ClipProbe = {
  durationSec: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
};

export type TranscriptSegment = { start: number; end: number; text: string };

/** What the transcription model heard. Segments are empty when the model gives no timestamps. */
export type Transcript = {
  text: string;
  segments: TranscriptSegment[];
  language: string | null;
};

/** What the vision model read from the frames. */
export type FrameReading = {
  /** Text shown on screen, one line each, as written. */
  onScreenText: string[];
  /** One line on what happens in the clip. */
  description: string;
  /** A platform the frames show (a watermark or the app's own layout), or null. */
  platformHint: ClipPlatform | null;
};

/** The text sample a clip becomes. The builder can edit every field. */
export type ClipText = {
  hook: string;
  /** The spoken words, with rough [m:ss] stamps when the model gave them. */
  transcript: string;
  /** On-screen text, caption style, one line each. */
  onScreenText: string;
  description: string;
  durationSec: number;
  platform: ClipPlatform | null;
  /** Why that platform was guessed, in a few words. */
  platformWhy: string;
};

export const CLIP_STEPS = ["transcript", "frames"] as const;
export type ClipStep = (typeof CLIP_STEPS)[number];

/**
 * One call to a model for one step of one clip. The id is the clip, the step
 * and the attempt, so the same call can never be written twice. A step with a
 * call that is done is never called again: its result is read from here.
 */
export type ClipCall = {
  id: string;
  workspaceId: string;
  clipId: string;
  step: ClipStep;
  attempt: number;
  provider: "openrouter" | "fake";
  model: string;
  /**
   * started: sent and not answered yet (or the server stopped while it was
   * out). done: answered and paid. failed: the provider refused or failed.
   */
  status: "started" | "done" | "failed";
  /** The UTC day the call counts against, YYYY-MM-DD. */
  day: string;
  /** What it was expected to cost at most, held against the daily cap while it is out. */
  estimateMicroUsd: number;
  /** What OpenRouter reported in usage.cost (or the estimate when it reported none). Null while started. */
  costMicroUsd: number | null;
  /** True when the provider gave no cost and the estimate was used. */
  costEstimated?: boolean;
  generationId: string | null;
  tokensIn: number;
  tokensOut: number;
  audioSeconds: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** The step's result, kept so a retry or a restart never pays for it again. */
  result?: { transcript?: Transcript; frames?: FrameReading };
};

/** The rights confirmation, kept on the clip (and in safety.json) with who and when. */
export type ClipRights = { statement: string; by: string; at: string };

/** A clip given to an agent as a sample. */
export type ClipAssignment = { agentId: string; sampleId: string; version: string; at: string };

export type Clip = {
  id: string;
  workspaceId: string;
  /** The video as uploaded. */
  file: StoredFile;
  /** The first frame, saved as a JPEG once the clip is read. */
  poster: StoredFile | null;
  probe: ClipProbe | null;
  rights: ClipRights;
  status: ClipStatus;
  /** Failed tries so far (a wait for the cap is not a try). */
  attempts: number;
  /** When the queue may pick it up next. Null means now. */
  nextAttemptAt: string | null;
  /** A worker's claim; past this time another worker may take it again. */
  leaseUntil: string | null;
  /** Why it failed or why it waits, in one line. */
  error: string | null;
  /** Which model service read it. Null until a step ran. */
  provider: "openrouter" | "fake" | null;
  transcript: Transcript | null;
  frames: FrameReading | null;
  /** The text sample. Null until it is ready. */
  text: ClipText | null;
  /** True once the builder saved their own edit: a later read never overwrites it. */
  edited: boolean;
  label: SampleLabel;
  title: string;
  note: string;
  /** Sum of the done calls, in micro-dollars. */
  costMicroUsd: number;
  /** The content rules and prompt injection signals found in the text. A flag never blocks storing it. */
  flags: { safety: SafetyFinding[]; injection: InjectionSignal[] };
  assignments: ClipAssignment[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
};

export const CLIP_TEXT_LIMITS = {
  title: 80,
  note: 500,
  hook: 300,
  transcript: 12_000,
  onScreenText: 2_000,
  description: 500,
  platformWhy: 120,
} as const;
