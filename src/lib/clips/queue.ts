/**
 * The clip queue: reads uploaded clips in the background, a few at a time.
 *
 * State lives in the clip rows and the call rows (clips.json), never only in
 * memory, so the queue picks up where it was after a restart:
 *
 * - A worker claims a clip with a conditional update (status and lease), so
 *   two workers never read the same clip at once.
 * - Each step that costs money (the transcript, the frames) is one call row
 *   with a fixed id per clip, step and attempt. A step whose call is done is
 *   never sent again: a retry or a restart reads its result from the row.
 * - Before a call, today's spend (done calls at their cost, calls still out
 *   at their estimate) plus this call's estimate must fit under the daily
 *   cap. When it does not, the clip waits (status "waiting") until the next
 *   UTC day, and nothing is sent.
 * - A failure the same call would hit again (a bad file, a refused request)
 *   fails the clip at once with the reason. Anything else is tried again
 *   after 30 s, 2 min and 8 min, then the clip fails; "Retry" starts over
 *   from the first step not done.
 * - A call that was out when the server stopped is counted at its estimate,
 *   since the provider may have charged for it, and is the one call that may
 *   be sent again.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { FileStorage } from "@/lib/builder/storage";
import { composeClipText, flagClipText } from "./compose";
import { CLIP_LIMITS, FRAME_COUNT, estimateCallMicroUsd, type ClipConfig } from "./config";
import { MediaError, readBytes, type ClipMedia } from "./media";
import { ClipProviderError, type CallUsage, type ClipProvider } from "./provider";
import type { ClipStore } from "./store";
import type { Clip, ClipCall, ClipStep, FrameReading, Transcript } from "./types";

export type ClipQueueOptions = {
  store: ClipStore;
  files: FileStorage;
  media: ClipMedia;
  /** Null when no model is set up: clips wait with that reason. */
  provider: ClipProvider | null;
  config: ClipConfig;
  /** Where frames and audio are cut, one folder per clip, removed after. */
  workDir: string;
  now?: () => Date;
  log?: (msg: string) => void;
};

/** A step held back by the daily cap. */
class CapReached extends Error {}

/** A failure the same call would hit again. */
class Permanent extends Error {}

export const NO_PROVIDER = "No OPENROUTER_API_KEY on this server, so clips wait here until one is set.";

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

export class ClipQueue {
  private readonly now: () => Date;
  private readonly active = new Map<string, Promise<void>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private started = false;

  constructor(private readonly o: ClipQueueOptions) {
    this.now = o.now ?? (() => new Date());
  }

  get config(): ClipConfig {
    return this.o.config;
  }

  get providerId(): ClipProvider["id"] | null {
    return this.o.provider?.id ?? null;
  }

  /**
   * Picks up after a restart: clips left "reading" go back in line (their
   * done steps stay done), calls left "started" are counted at their estimate
   * and closed, and waiting clips are looked at again at once, so a raised
   * cap or a new key takes effect. Then polls for work. Safe to call twice.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.recover();
    if (!this.o.config.enabled) return;
    this.timer = setInterval(() => void this.tick(), this.o.config.pollMs);
    this.timer.unref?.();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  /** Waits for the clips being read now. For tests and a clean stop. */
  async idle(): Promise<void> {
    while (this.active.size) await Promise.allSettled([...this.active.values()]);
  }

  async recover(): Promise<void> {
    const at = this.now().toISOString();
    for (const call of await this.o.store.calls.find({ status: "started" })) {
      if (this.active.has(call.clipId)) continue;
      await this.o.store.calls.updateIf(call.id, { status: "started" }, { status: "failed", costMicroUsd: call.estimateMicroUsd, costEstimated: true, error: "The server stopped while this call was out. Counted at its estimate.", finishedAt: at });
    }
    for (const clip of await this.o.store.clips.find()) {
      if (this.active.has(clip.id)) continue;
      if (clip.status === "reading") await this.o.store.clips.updateIf(clip.id, { status: "reading" }, { status: "uploaded", leaseUntil: null, nextAttemptAt: null, updatedAt: at });
      else if (clip.status === "waiting") await this.o.store.clips.updateIf(clip.id, { status: "waiting" }, { nextAttemptAt: null, updatedAt: at });
    }
  }

  /** Looks for work now (after an upload or a retry), once the queue is started. */
  kick(): void {
    if (this.started && this.o.config.enabled) void this.tick();
  }

  /** Claims clips up to the concurrency and reads them. Returns the ids it started. */
  async tick(): Promise<string[]> {
    if (!this.o.config.enabled || this.ticking) return [];
    this.ticking = true;
    const startedIds: string[] = [];
    try {
      const free = this.o.config.concurrency - this.active.size;
      if (free <= 0) return [];
      const now = this.now();
      const due = (c: Clip) => (c.status === "uploaded" || c.status === "waiting") && (!c.nextAttemptAt || c.nextAttemptAt <= now.toISOString());
      const expired = (c: Clip) => c.status === "reading" && !this.active.has(c.id) && !!c.leaseUntil && c.leaseUntil <= now.toISOString();
      const candidates = (await this.o.store.clips.find()).filter((c) => !this.active.has(c.id) && (due(c) || expired(c))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const c of candidates.slice(0, free)) {
        const claimed = await this.o.store.clips.updateIf(c.id, { status: c.status, leaseUntil: c.leaseUntil }, { status: "reading", leaseUntil: new Date(now.getTime() + this.o.config.leaseMs).toISOString(), updatedAt: now.toISOString() });
        if (!claimed) continue;
        startedIds.push(c.id);
        const p = this.read(claimed).finally(() => this.active.delete(c.id));
        this.active.set(c.id, p);
      }
      return startedIds;
    } finally {
      this.ticking = false;
    }
  }

  /** Spent today in micro-dollars: done and failed calls at their cost, calls still out at their estimate. */
  async spentToday(): Promise<number> {
    const day = utcDay(this.now());
    return (await this.o.store.calls.find({ day })).reduce((n, c) => n + (c.status === "started" ? c.estimateMicroUsd : (c.costMicroUsd ?? 0)), 0);
  }

  /* ---------- One clip ---------- */

  private async patch(id: string, patch: Partial<Clip>): Promise<Clip | null> {
    return this.o.store.clips.updateIf(id, { status: "reading" }, { ...patch, updatedAt: this.now().toISOString() });
  }

  private async read(clip: Clip): Promise<void> {
    const dir = join(this.o.workDir, clip.id);
    try {
      mkdirSync(dir, { recursive: true });
      const path = this.o.files.pathOf?.(clip.workspaceId, clip.file.id) ?? null;
      if (!path) throw new Permanent("The clip's file is not on disk any more. Upload it again.");

      let probe = clip.probe;
      if (!probe) {
        probe = await this.o.media.probe(path);
        if (probe.durationSec > CLIP_LIMITS.maxSeconds) throw new Permanent(`The clip is ${Math.round(probe.durationSec)} s; clips can be at most 3 minutes.`);
        await this.patch(clip.id, { probe });
      }

      let poster = clip.poster;
      if (!poster) {
        const out = join(dir, "poster.jpg");
        await this.o.media.frame(path, 0, out, 720);
        poster = await this.o.files.put(clip.workspaceId, { name: `${clip.file.name.replace(/\.[^.]+$/, "")}-first-frame.jpg`, mimeType: "image/jpeg", bytes: readBytes(out) });
        await this.patch(clip.id, { poster });
      }

      if (!this.o.provider) throw new CapReached(NO_PROVIDER);
      const provider = this.o.provider;

      let transcript = clip.transcript;
      if (!transcript) {
        if (!probe.hasAudio) transcript = { text: "", segments: [], language: null };
        else {
          const done = await this.doneResult(clip.id, "transcript");
          if (done?.transcript) transcript = done.transcript;
          else {
            // Cut the sound first: a file ffmpeg cannot read never becomes a call.
            const out = join(dir, "audio.mp3");
            await this.o.media.audio(path, out);
            const audio = readBytes(out);
            const model = this.o.config.transcribeModel;
            const r = await this.paid(clip, "transcript", model, probe.durationSec, async () => {
              const t = await provider.transcribe({ audio, format: "mp3", model });
              return { usage: t.usage, result: { transcript: t.transcript } };
            });
            transcript = r.transcript!;
          }
        }
        await this.patch(clip.id, { transcript, provider: provider.id });
      }

      let frames = clip.frames;
      if (!frames) {
        const done = await this.doneResult(clip.id, "frames");
        if (done?.frames) frames = done.frames;
        else {
          const d = probe.durationSec;
          const times = [Math.min(0.5, d / 4), d / 2, Math.max(0, d - 0.5)].slice(0, FRAME_COUNT);
          const shots: { atSec: number; jpeg: Uint8Array }[] = [];
          for (const [i, t] of times.entries()) {
            const out = join(dir, `frame-${i}.jpg`);
            await this.o.media.frame(path, t, out, 768);
            shots.push({ atSec: t, jpeg: readBytes(out) });
          }
          const model = this.o.config.visionModel;
          const r = await this.paid(clip, "frames", model, d, async () => {
            const f = await provider.readFrames({ frames: shots, durationSec: d, model });
            return { usage: f.usage, result: { frames: f.reading } };
          });
          frames = r.frames!;
        }
        await this.patch(clip.id, { frames, provider: provider.id });
      }

      const fresh = (await this.o.store.clips.get(clip.id)) ?? clip;
      const text = fresh.edited && fresh.text ? fresh.text : composeClipText(probe, transcript, frames);
      await this.patch(clip.id, {
        text,
        flags: flagClipText(text),
        costMicroUsd: await this.clipCost(clip.id),
        status: "ready",
        error: null,
        leaseUntil: null,
        nextAttemptAt: null,
        readAt: this.now().toISOString(),
      });
    } catch (err) {
      await this.failed(clip, err);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  private async failed(clip: Clip, err: unknown): Promise<void> {
    const now = this.now();
    const cost = await this.clipCost(clip.id);
    if (err instanceof CapReached) {
      // Not a try: the clip waits, with nothing sent.
      const until = err.message === NO_PROVIDER ? new Date(now.getTime() + 60 * 60_000) : nextUtcMidnight(now);
      await this.patch(clip.id, { status: "waiting", error: err.message, leaseUntil: null, nextAttemptAt: until.toISOString(), costMicroUsd: cost });
      return;
    }
    const permanent = err instanceof Permanent || err instanceof MediaError || (err instanceof ClipProviderError && err.permanent);
    const message = err instanceof Error ? err.message : String(err);
    const attempts = (clip.attempts ?? 0) + 1;
    if (permanent || attempts >= this.o.config.maxAttempts) {
      await this.patch(clip.id, { status: "failed", attempts, error: message.slice(0, 300), leaseUntil: null, nextAttemptAt: null, costMicroUsd: cost });
      this.o.log?.(`Clip ${clip.id} failed: ${message}`);
      return;
    }
    const delay = Math.min(this.o.config.backoff.maxMs, this.o.config.backoff.baseMs * 4 ** (attempts - 1));
    await this.patch(clip.id, { status: "uploaded", attempts, error: `Try ${attempts} failed, trying again: ${message}`.slice(0, 300), leaseUntil: null, nextAttemptAt: new Date(now.getTime() + delay).toISOString(), costMicroUsd: cost });
  }

  async clipCost(clipId: string): Promise<number> {
    return (await this.o.store.calls.find({ clipId })).reduce((n, c) => n + (c.status === "started" ? 0 : (c.costMicroUsd ?? 0)), 0);
  }

  /**
   * One paid step. A done call for this clip and step is the answer, without
   * a new call. Otherwise the cap is checked, the call is written down as
   * started, sent, and written down as done with its cost and result.
   */
  /** The result of a done call for this clip and step, if there is one. */
  private async doneResult(clipId: string, step: ClipStep): Promise<ClipCall["result"] | null> {
    const done = (await this.o.store.calls.find({ clipId, step })).find((c) => c.status === "done" && c.result);
    return done?.result ?? null;
  }

  private async paid(clip: Clip, step: ClipStep, model: string, durationSec: number, send: () => Promise<{ usage: CallUsage; result: NonNullable<ClipCall["result"]> }>): Promise<NonNullable<ClipCall["result"]>> {
    const earlier = await this.o.store.calls.find({ clipId: clip.id, step });
    const done = earlier.find((c) => c.status === "done" && c.result);
    if (done) return done.result!;

    const estimate = estimateCallMicroUsd(step, model, durationSec);
    const spent = await this.spentToday();
    if (spent + estimate > this.o.config.dailyCapMicroUsd) {
      throw new CapReached(`Today's cap for reading clips is reached (${(spent / 1e6).toFixed(4)} of ${(this.o.config.dailyCapMicroUsd / 1e6).toFixed(2)} dollars). Waits for tomorrow, UTC.`);
    }

    const now = this.now();
    const call: ClipCall = {
      id: `${clip.id}:${step}:${earlier.length + 1}`,
      workspaceId: clip.workspaceId,
      clipId: clip.id,
      step,
      attempt: earlier.length + 1,
      provider: this.o.provider!.id,
      model,
      status: "started",
      day: utcDay(now),
      estimateMicroUsd: estimate,
      costMicroUsd: null,
      generationId: null,
      tokensIn: 0,
      tokensOut: 0,
      audioSeconds: null,
      error: null,
      startedAt: now.toISOString(),
      finishedAt: null,
    };
    // Insert refuses an id that exists, so the same call is never written (or counted) twice.
    await this.o.store.calls.insert(call);
    try {
      const r = await send();
      const estimated = r.usage.costMicroUsd === null;
      await this.o.store.calls.update({
        ...call,
        status: "done",
        costMicroUsd: estimated ? estimate : r.usage.costMicroUsd,
        ...(estimated ? { costEstimated: true } : {}),
        generationId: r.usage.generationId,
        tokensIn: r.usage.tokensIn,
        tokensOut: r.usage.tokensOut,
        audioSeconds: r.usage.audioSeconds,
        finishedAt: this.now().toISOString(),
        result: r.result,
      });
      return r.result;
    } catch (err) {
      // An answered error is not charged. A lost connection or a timeout may have been: count the estimate.
      const charged = err instanceof ClipProviderError ? !err.answered : true;
      await this.o.store.calls.update({ ...call, status: "failed", costMicroUsd: charged ? estimate : 0, ...(charged ? { costEstimated: true } : {}), error: (err as Error).message.slice(0, 300), finishedAt: this.now().toISOString() });
      throw err;
    }
  }
}

export type { Transcript, FrameReading };
