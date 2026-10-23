/**
 * The clip library: the builder's side of clip samples. Every call is for
 * builders only (not_found for anyone else) and lives in ws_wovi, like the
 * rest of the builder.
 *
 * - upload: the rights box is required and kept on the clip (and in
 *   safety.json) with who and when; the file is streamed to disk with the
 *   size limit, its first bytes checked, its length read with ffmpeg, and a
 *   clip that is too long is removed again with the reason. Then it waits in
 *   the queue.
 * - list, get, totals: status per clip, cost per clip, today's spend against
 *   the cap and the total.
 * - update: the builder edits the text, the label (gold or bad), the title
 *   and the note. The flags are read again, and every sample made from the
 *   clip follows.
 * - assign and unassign: the clip becomes a sample of an agent (inputs that
 *   fit its form, the ideal output from the clip), or stops being one.
 * - retry and remove.
 */
import type { Principal } from "@/lib/accounts/accounts";
import { newId } from "@/lib/accounts/crypto";
import { AccountError } from "@/lib/accounts/errors";
import type { Builder } from "@/lib/builder/builder";
import { checkFile, cleanFileName, UploadRefused, type FileStorage } from "@/lib/builder/storage";
import { SAMPLE_LABELS, type SampleLabel } from "@/lib/builder/types";
import { UPLOAD_RIGHTS } from "@/lib/legal/operator";
import { recordRights } from "@/lib/safety/rights";
import type { SafetyStore } from "@/lib/safety/store";
import { clipSampleFor, flagClipText } from "./compose";
import { CLIP_LIMITS, type ClipConfig } from "./config";
import { MediaError, sniffVideo, type ClipMedia } from "./media";
import { utcDay, type ClipQueue } from "./queue";
import type { ClipStore } from "./store";
import { CLIP_PLATFORMS, CLIP_TEXT_LIMITS, type Clip, type ClipCall, type ClipPlatform, type ClipText } from "./types";

export type ClipLibraryOptions = {
  builder: Builder;
  store: ClipStore;
  files: FileStorage;
  media: ClipMedia;
  queue: ClipQueue;
  /** Where the rights confirmations are kept beside the clip (phase 18). Left out in some tests. */
  safety?: SafetyStore | null;
  now?: () => Date;
};

export type ClipTotals = {
  enabled: boolean;
  /** "openrouter", "fake", or null when no model is set up. */
  provider: "openrouter" | "fake" | null;
  transcribeModel: string;
  visionModel: string;
  capMicroUsd: number;
  spentTodayMicroUsd: number;
  totalMicroUsd: number;
  /** Seconds of clips read, and their cost, for the average per minute. */
  readSeconds: number;
  readCostMicroUsd: number;
  counts: Record<Clip["status"], number>;
};

export type ClipEdit = {
  title?: string;
  label?: SampleLabel;
  note?: string;
  hook?: string;
  transcript?: string;
  onScreenText?: string;
  description?: string;
  platform?: ClipPlatform | null;
};

const NOT_FOUND = "Not found.";

const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/\r\n/g, "\n").trim().slice(0, max);

export class ClipLibrary {
  private readonly now: () => Date;

  constructor(private readonly o: ClipLibraryOptions) {
    this.now = o.now ?? (() => new Date());
  }

  get workspaceId(): string {
    return this.o.builder.workspaceId;
  }

  get config(): ClipConfig {
    return this.o.queue.config;
  }

  private off(): void {
    if (!this.config.enabled) throw new AccountError("invalid_request", "Clip samples are switched off on this server (WOVI_CLIP_SAMPLES=off).");
  }

  /* ---------- Upload ---------- */

  /** A clip from a stream. `sizeBytes` is what the client declared; the stream is held to the limit whatever it says. */
  async upload(caller: Principal, file: { name: string; mimeType: string; sizeBytes: number; stream: AsyncIterable<Uint8Array>; rights: boolean }): Promise<Clip> {
    const user = await this.o.builder.requireBuilder(caller);
    this.off();
    if (!file.rights) throw new AccountError("invalid_request", "Tick the box to confirm you own this clip or have the rights to use it.");
    const name = cleanFileName(file.name);
    const problem = checkFile("video", { name, mimeType: file.mimeType, sizeBytes: file.sizeBytes });
    if (problem) throw new AccountError("invalid_request", problem);
    if ((await this.o.store.clips.find({ workspaceId: this.workspaceId })).length >= CLIP_LIMITS.maxClips) {
      throw new AccountError("invalid_request", `The library keeps at most ${CLIP_LIMITS.maxClips} clips. Remove some first.`);
    }
    if (!this.o.files.putStream || !this.o.files.pathOf) throw new Error("Clip uploads need a file store on disk.");

    let stored;
    try {
      stored = await this.o.files.putStream(this.workspaceId, { name, mimeType: file.mimeType.split(";")[0].trim() || "video/mp4", stream: file.stream, maxBytes: CLIP_LIMITS.maxBytes, sniff: (head) => sniffVideo(head, name) });
    } catch (err) {
      if (err instanceof UploadRefused) throw new AccountError("invalid_request", err.message);
      throw err;
    }
    // Read the length now, so a clip that is too long or not a video is refused while the person waits.
    let probe;
    try {
      probe = await this.o.media.probe(this.o.files.pathOf(this.workspaceId, stored.id)!);
    } catch (err) {
      await this.o.files.delete(this.workspaceId, stored.id);
      if (err instanceof MediaError) throw new AccountError("invalid_request", `"${name}" could not be read as a video.`);
      throw err;
    }
    if (probe.durationSec > CLIP_LIMITS.maxSeconds) {
      await this.o.files.delete(this.workspaceId, stored.id);
      throw new AccountError("invalid_request", `"${name}" is ${Math.floor(probe.durationSec / 60)}:${String(Math.round(probe.durationSec % 60)).padStart(2, "0")} long; clips can be at most 3:00.`);
    }

    const at = this.now().toISOString();
    const clip: Clip = {
      id: newId("clp"),
      workspaceId: this.workspaceId,
      file: stored,
      poster: null,
      probe,
      rights: { statement: UPLOAD_RIGHTS, by: user.id, at },
      status: "uploaded",
      attempts: 0,
      nextAttemptAt: null,
      leaseUntil: null,
      error: null,
      provider: null,
      transcript: null,
      frames: null,
      text: null,
      edited: false,
      label: "gold",
      title: name.replace(/\.[^.]+$/, "").slice(0, CLIP_TEXT_LIMITS.title),
      note: "",
      costMicroUsd: 0,
      flags: { safety: [], injection: [] },
      assignments: [],
      createdBy: user.id,
      createdAt: at,
      updatedAt: at,
      readAt: null,
    };
    await this.o.store.clips.insert(clip);
    if (this.o.safety) await recordRights(this.o.safety, { workspaceId: this.workspaceId, userId: user.id, subject: "clip_sample", fileId: stored.id, fileName: stored.name, at });
    this.o.queue.kick();
    return clip;
  }

  /* ---------- Reading ---------- */

  async list(caller: Principal): Promise<Clip[]> {
    await this.o.builder.requireBuilder(caller);
    return (await this.o.store.clips.find({ workspaceId: this.workspaceId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(caller: Principal, id: string): Promise<{ clip: Clip; calls: ClipCall[] } | null> {
    await this.o.builder.requireBuilder(caller);
    const clip = await this.o.store.clips.get(id);
    if (!clip || clip.workspaceId !== this.workspaceId) return null;
    const calls = (await this.o.store.calls.find({ clipId: id })).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return { clip, calls };
  }

  /** The clip's video on disk, for the streaming route. */
  async videoPath(caller: Principal, id: string): Promise<{ path: string; mimeType: string; sizeBytes: number; name: string } | null> {
    const got = await this.get(caller, id);
    const path = got ? this.o.files.pathOf?.(this.workspaceId, got.clip.file.id) : null;
    if (!got || !path) return null;
    return { path, mimeType: got.clip.file.mimeType, sizeBytes: got.clip.file.sizeBytes, name: got.clip.file.name };
  }

  async totals(caller: Principal): Promise<ClipTotals> {
    await this.o.builder.requireBuilder(caller);
    const clips = await this.o.store.clips.find({ workspaceId: this.workspaceId });
    const calls = await this.o.store.calls.find({ workspaceId: this.workspaceId });
    const day = utcDay(this.now());
    const cost = (c: ClipCall) => (c.status === "started" ? 0 : (c.costMicroUsd ?? 0));
    const counts = { uploaded: 0, reading: 0, waiting: 0, ready: 0, failed: 0 };
    for (const c of clips) counts[c.status]++;
    const ready = clips.filter((c) => c.status === "ready" && c.probe);
    return {
      enabled: this.config.enabled,
      provider: this.o.queue.providerId,
      transcribeModel: this.config.transcribeModel,
      visionModel: this.config.visionModel,
      capMicroUsd: this.config.dailyCapMicroUsd,
      spentTodayMicroUsd: calls.filter((c) => c.day === day).reduce((n, c) => n + (c.status === "started" ? c.estimateMicroUsd : cost(c)), 0),
      totalMicroUsd: calls.reduce((n, c) => n + cost(c), 0),
      readSeconds: ready.reduce((n, c) => n + c.probe!.durationSec, 0),
      readCostMicroUsd: ready.reduce((n, c) => n + c.costMicroUsd, 0),
      counts,
    };
  }

  /* ---------- Changes ---------- */

  private async mine(id: string): Promise<Clip> {
    const clip = await this.o.store.clips.get(id);
    if (!clip || clip.workspaceId !== this.workspaceId) throw new AccountError("not_found", NOT_FOUND);
    return clip;
  }

  /** Saves the builder's edit. The text is theirs from now on: a later read never overwrites it. Samples made from the clip follow. */
  async update(caller: Principal, id: string, edit: ClipEdit): Promise<Clip> {
    await this.o.builder.requireBuilder(caller);
    const clip = await this.mine(id);
    if (edit.label !== undefined && !SAMPLE_LABELS.includes(edit.label)) throw new AccountError("invalid_request", "A sample is gold or bad.");
    if (edit.platform !== undefined && edit.platform !== null && !CLIP_PLATFORMS.includes(edit.platform)) throw new AccountError("invalid_request", "Unknown platform.");
    const textFields = ["hook", "transcript", "onScreenText", "description", "platform"] as const;
    const editsText = textFields.some((k) => edit[k] !== undefined);
    if (editsText && !clip.text) throw new AccountError("invalid_request", "The clip is not read yet. Edit it once it is ready.");
    for (const k of ["hook", "transcript", "onScreenText", "description"] as const) {
      if (typeof edit[k] === "string" && edit[k]!.length > CLIP_TEXT_LIMITS[k]) throw new AccountError("invalid_request", `${k} is longer than ${CLIP_TEXT_LIMITS[k]} characters.`);
    }
    let text: ClipText | null = clip.text;
    if (text && editsText) {
      text = {
        ...text,
        ...(edit.hook !== undefined ? { hook: cleanText(edit.hook, CLIP_TEXT_LIMITS.hook) } : {}),
        ...(edit.transcript !== undefined ? { transcript: cleanText(edit.transcript, CLIP_TEXT_LIMITS.transcript) } : {}),
        ...(edit.onScreenText !== undefined ? { onScreenText: cleanText(edit.onScreenText, CLIP_TEXT_LIMITS.onScreenText) } : {}),
        ...(edit.description !== undefined ? { description: cleanText(edit.description, CLIP_TEXT_LIMITS.description) } : {}),
        ...(edit.platform !== undefined && edit.platform !== text.platform ? { platform: edit.platform, platformWhy: "Set by the builder." } : {}),
      };
    }
    // Only the fields edited here are written, so a worker's progress on the same clip is never overwritten.
    const next = await this.o.store.clips.updateIf(id, {}, {
      title: edit.title !== undefined ? cleanText(edit.title, CLIP_TEXT_LIMITS.title) || clip.title : clip.title,
      label: edit.label ?? clip.label,
      note: edit.note !== undefined ? cleanText(edit.note, CLIP_TEXT_LIMITS.note) : clip.note,
      ...(editsText ? { text, edited: true, flags: flagClipText(text!) } : {}),
      updatedAt: this.now().toISOString(),
    });
    if (!next) throw new AccountError("not_found", NOT_FOUND);
    return this.syncSamples(caller, next);
  }

  /** Rewrites every sample made from the clip from its current text. An agent whose form no longer fits keeps its sample and the reason is thrown. */
  private async syncSamples(caller: Principal, clip: Clip): Promise<Clip> {
    if (!clip.text || clip.assignments.length === 0) return clip;
    const problems: string[] = [];
    const kept: Clip["assignments"] = [];
    for (const a of clip.assignments) {
      try {
        const spec = await this.o.builder.requireAgent(caller, a.agentId);
        const s = await this.o.builder.updateClipSample(caller, a.agentId, a.sampleId, clipSampleFor(spec, clip));
        kept.push({ ...a, version: s.version });
      } catch (err) {
        // A sample the builder removed by hand drops out of the list; any other problem keeps it and is reported.
        if (err instanceof AccountError && err.code === "not_found") continue;
        kept.push(a);
        problems.push(`${a.agentId}: ${(err as Error).message}`);
      }
    }
    const next = (await this.o.store.clips.updateIf(clip.id, {}, { assignments: kept })) ?? clip;
    if (problems.length) throw new AccountError("invalid_request", `Saved, but some samples could not follow: ${problems.join(" ")}`);
    return next;
  }

  /** Makes the clip a sample of each agent named (once per agent). */
  async assign(caller: Principal, id: string, agentIds: string[]): Promise<{ clip: Clip; added: string[]; problems: string[] }> {
    await this.o.builder.requireBuilder(caller);
    let clip = await this.mine(id);
    if (clip.status !== "ready" || !clip.text) throw new AccountError("invalid_request", "The clip is not read yet.");
    const added: string[] = [];
    const problems: string[] = [];
    for (const agentId of [...new Set(agentIds)].slice(0, 20)) {
      if (clip.assignments.some((a) => a.agentId === agentId)) continue;
      try {
        const spec = await this.o.builder.requireAgent(caller, agentId);
        const sample = await this.o.builder.addSample(caller, agentId, clipSampleFor(spec, clip));
        clip = { ...clip, assignments: [...clip.assignments, { agentId, sampleId: sample.id, version: sample.version, at: this.now().toISOString() }] };
        added.push(agentId);
      } catch (err) {
        if (!(err instanceof AccountError)) throw err;
        problems.push(`${agentId}: ${err.message}`);
      }
    }
    clip = (await this.o.store.clips.updateIf(id, {}, { assignments: clip.assignments, updatedAt: this.now().toISOString() })) ?? clip;
    return { clip, added, problems };
  }

  async unassign(caller: Principal, id: string, agentId: string): Promise<Clip> {
    await this.o.builder.requireBuilder(caller);
    const clip = await this.mine(id);
    const a = clip.assignments.find((x) => x.agentId === agentId);
    if (!a) return clip;
    try {
      await this.o.builder.removeSample(caller, agentId, a.sampleId);
    } catch (err) {
      if (!(err instanceof AccountError && err.code === "not_found")) throw err;
    }
    return (await this.o.store.clips.updateIf(id, {}, { assignments: clip.assignments.filter((x) => x.agentId !== agentId), updatedAt: this.now().toISOString() })) ?? clip;
  }

  /** A failed (or waiting) clip back in line now. Steps already done stay done and are not paid for again. */
  async retry(caller: Principal, id: string): Promise<Clip> {
    await this.o.builder.requireBuilder(caller);
    this.off();
    const clip = await this.mine(id);
    if (clip.status !== "failed" && clip.status !== "waiting") throw new AccountError("invalid_request", "Only a failed or waiting clip can be tried again.");
    const next = await this.o.store.clips.updateIf(id, { status: clip.status }, { status: "uploaded", attempts: 0, error: null, nextAttemptAt: null, leaseUntil: null, updatedAt: this.now().toISOString() });
    if (!next) throw new AccountError("invalid_request", "The clip changed meanwhile. Reload and try again.");
    this.o.queue.kick();
    return next;
  }

  /** Removes the clip, its video and first frame, and every sample made from it. Its cost rows stay for the books. */
  async remove(caller: Principal, id: string): Promise<void> {
    await this.o.builder.requireBuilder(caller);
    const clip = await this.mine(id);
    if (clip.status === "reading") throw new AccountError("invalid_request", "The clip is being read. Remove it once it is done.");
    for (const a of clip.assignments) {
      try {
        await this.o.builder.removeSample(caller, a.agentId, a.sampleId);
      } catch (err) {
        if (!(err instanceof AccountError && err.code === "not_found")) throw err;
      }
    }
    await this.o.store.clips.delete(id);
    await this.o.files.delete(this.workspaceId, clip.file.id);
    if (clip.poster) await this.o.files.delete(this.workspaceId, clip.poster.id);
  }
}
