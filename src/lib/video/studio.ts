/**
 * Make a video, staged as the product doc says (section 3, "Output rule"):
 * video is never made in one jump, and the person approves each stage before
 * the next one costs more.
 *
 * 1. Script: the scenes come from a Script Writer result or a pasted script.
 * 2. Storyboard: one 9:16 image per scene, charged in credits as one job.
 * 3. Approve and edit: change any scene's words, length or picture idea, make
 *    one picture again (charged), and pick a voice. Free apart from redraws.
 * 4. Voice and cut: the voiceover reads the spoken lines, then ffmpeg holds
 *    each picture for its seconds over the voice. Charged as one job.
 *
 * Credits work like the Brand Brain's AI read: estimated and shown first,
 * held before the call, settled to what it really cost, refunded on a
 * failure. Without billing (a local app, or before credits are switched on)
 * it runs free. Who may see it at all is `videoAccess` (WOVI_VIDEO).
 */
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import { newId } from "@/lib/accounts/crypto";
import { AccountError } from "@/lib/accounts/errors";
import { jsonFileTables, memoryTables, type Collection } from "@/lib/accounts/store";
import type { FileStorage } from "@/lib/builder/storage";
import type { RunCredits } from "@/lib/credits/types";
import { BillingRefusal } from "@/lib/runs/billing";
import { MediaFailure, VOICES, type VideoMedia, type Voice } from "./media";

export const VIDEO_LIMITS = { scenes: { min: 1, max: 8 }, spoken: 400, onScreen: 300, title: 80, seconds: { min: 1, max: 20 }, pastedScript: 4000 } as const;
/** Media jobs per person per hour and per workspace per day, so nobody can run up a bill by clicking. */
export const VIDEO_RATE = { perUserHour: { max: 30, windowMs: 3_600_000 }, perWorkspaceDay: { max: 120, windowMs: 86_400_000 } } as const;

export type Scene = { spoken: string; onScreen: string; seconds: number; imageFileId: string | null };
export type StageCharge = { stage: "storyboard" | "redraw" | "video"; estimate: number; charged: number; costMicroUsd: number; at: string };
export type VideoProject = {
  id: string;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  /** The Script Writer run the scenes came from, when they did. */
  fromRunId: string | null;
  scenes: Scene[];
  /** script: scenes only. storyboard: every scene has a picture. done: the video is made. */
  stage: "script" | "storyboard" | "done";
  voice: Voice | null;
  video: { fileId: string; seconds: number; sizeBytes: number; voice: Voice; at: string } | null;
  charges: StageCharge[];
};

export type VideoStore = { videos: Collection<VideoProject> };
const TABLES = ["videos"] as const;
export const memoryVideoStore = (): VideoStore => memoryTables<VideoStore>(TABLES);
export const jsonFileVideoStore = (file: string): VideoStore => jsonFileTables<VideoStore>(file, TABLES);

/** How a video stage bills. The credits service implements it, as for the Brand Brain read. */
export interface VideoBilling {
  estimateJob(typicalMicroUsd: number, capMicroUsd: number): number;
  reserveJob(input: { workspaceId: string; jobId: string; estimate: number; userId: string | null; label: string }): Promise<RunCredits>;
  settleJob(workspaceId: string, c: RunCredits, result: { done: boolean; costMicroUsd: number }): Promise<RunCredits>;
}

export class VideoError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_request" | "limit" | "credits" | "media",
    message: string,
  ) {
    super(message);
    this.name = "VideoError";
  }
}

/** Who sees Make a video: WOVI_VIDEO=on for everyone, off for nobody, anything else (the default) for builders only. */
export function videoAccess(env: Record<string, string | undefined> = process.env): "on" | "builders" | "off" {
  const v = (env.WOVI_VIDEO ?? "").trim().toLowerCase();
  return v === "on" ? "on" : v === "off" ? "off" : "builders";
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** About 2.5 spoken words a second, never under 2 or over the limit. */
export const secondsFor = (spoken: string) => Math.max(2, Math.min(VIDEO_LIMITS.seconds.max, Math.round(wordsOf(spoken) / 2.5)));

/** A pasted script as scenes: one per paragraph (or per line when there is only one paragraph), at most 8. */
export function scenesFromText(text: string): Omit<Scene, "imageFileId">[] {
  const t = clean(text, VIDEO_LIMITS.pastedScript);
  let parts = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) parts = t.split("\n").map((p) => p.trim()).filter(Boolean);
  if (parts.length > VIDEO_LIMITS.scenes.max) {
    // Too many: join neighbours so the whole script still fits in 8 scenes.
    const per = Math.ceil(parts.length / VIDEO_LIMITS.scenes.max);
    parts = Array.from({ length: Math.ceil(parts.length / per) }, (_, i) => parts.slice(i * per, i * per + per).join(" "));
  }
  return parts.map((p) => {
    const spoken = p.slice(0, VIDEO_LIMITS.spoken);
    return { spoken, onScreen: "", seconds: secondsFor(spoken) };
  });
}

/** The picture's brief: the scene, the brand's look, and the rules every picture keeps. */
export function imagePrompt(scene: Pick<Scene, "spoken" | "onScreen">, look: string): string {
  return [
    "A vertical 9:16 photo for one scene of a short social video made by a small business.",
    scene.onScreen ? `What the scene shows: ${scene.onScreen}` : `What is said over this scene: ${scene.spoken}`,
    look ? `The brand's look: ${look}` : "",
    "Realistic phone-camera photo, natural light, nothing staged or glossy.",
    "No text, letters, captions, logos or watermarks anywhere in the picture. No real or famous person, and no face that looks like one.",
  ]
    .filter(Boolean)
    .join("\n");
}

export type VideoOptions = {
  accounts: Accounts;
  store: VideoStore;
  files: FileStorage;
  media: VideoMedia;
  billing?: VideoBilling | null;
  now?: () => Date;
  /** Pictures made at the same time. */
  concurrency?: number;
};

export type StagePrice = { credits: number; free: boolean };

export class VideoStudio {
  constructor(private readonly opts: VideoOptions) {}

  private now() {
    return (this.opts.now ?? (() => new Date()))();
  }

  private async row(caller: Principal, workspaceId: string, id: string, action: "view" | "run_agents" = "view"): Promise<VideoProject> {
    await this.opts.accounts.authorize(caller, workspaceId, action);
    const v = typeof id === "string" ? await this.opts.store.videos.get(id) : null;
    if (!v || v.workspaceId !== workspaceId) throw new VideoError("not_found", "No such video in this workspace.");
    return v;
  }

  async list(caller: Principal, workspaceId: string): Promise<VideoProject[]> {
    await this.opts.accounts.authorize(caller, workspaceId, "view");
    return (await this.opts.store.videos.find({ workspaceId })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(caller: Principal, workspaceId: string, id: string): Promise<VideoProject> {
    return this.row(caller, workspaceId, id);
  }

  /** Stage 1: a new video from scenes (a Script Writer result) or a pasted script. Free. */
  async create(caller: Principal, workspaceId: string, input: { title?: string; scenes?: Omit<Scene, "imageFileId">[]; script?: string; fromRunId?: string | null }): Promise<VideoProject> {
    await this.opts.accounts.authorize(caller, workspaceId, "run_agents");
    const raw = input.scenes?.length ? input.scenes : scenesFromText(input.script ?? "");
    const scenes = raw
      .map((s) => ({ spoken: clean(s.spoken, VIDEO_LIMITS.spoken), onScreen: clean(s.onScreen, VIDEO_LIMITS.onScreen), seconds: Math.round(Math.max(VIDEO_LIMITS.seconds.min, Math.min(VIDEO_LIMITS.seconds.max, Number(s.seconds) || secondsFor(clean(s.spoken, VIDEO_LIMITS.spoken))))), imageFileId: null }))
      .filter((s) => s.spoken || s.onScreen)
      .slice(0, VIDEO_LIMITS.scenes.max);
    if (scenes.length < VIDEO_LIMITS.scenes.min) throw new VideoError("invalid_request", "Paste a script first, or start from a Script Writer result.");
    const at = this.now().toISOString();
    const v: VideoProject = {
      id: newId("vid"),
      workspaceId,
      createdBy: caller.kind === "user" ? caller.userId : "api",
      createdAt: at,
      updatedAt: at,
      title: clean(input.title, VIDEO_LIMITS.title) || clean(scenes[0].spoken || scenes[0].onScreen, 60) || "My video",
      fromRunId: input.fromRunId ?? null,
      scenes,
      stage: "script",
      voice: null,
      video: null,
      charges: [],
    };
    await this.opts.store.videos.insert(v);
    return v;
  }

  /** What a stage will cost, in credits, before anything runs. */
  price(v: VideoProject, stage: "storyboard" | "redraw" | "video"): StagePrice {
    const b = this.opts.billing;
    const micro = this.stageMicroUsd(v, stage);
    if (!b) return { credits: 0, free: true };
    return { credits: b.estimateJob(micro, micro * 2), free: false };
  }

  private stageMicroUsd(v: VideoProject, stage: "storyboard" | "redraw" | "video"): number {
    const e = this.opts.media.estimate;
    if (stage === "redraw") return e.imageMicroUsd;
    if (stage === "storyboard") return e.imageMicroUsd * Math.max(1, v.scenes.filter((s) => !s.imageFileId).length);
    return e.speechMicroUsdPerChar * Math.max(1, spokenText(v).length) + 1_000;
  }

  /** Stage 3: change a scene's words, length or what it shows. A changed scene keeps its picture until it is drawn again. */
  async editScene(caller: Principal, workspaceId: string, id: string, index: number, edit: Partial<Pick<Scene, "spoken" | "onScreen" | "seconds">>): Promise<VideoProject> {
    const v = await this.row(caller, workspaceId, id, "run_agents");
    const s = v.scenes[index];
    if (!s) throw new VideoError("invalid_request", "No such scene.");
    if (edit.spoken !== undefined) s.spoken = clean(edit.spoken, VIDEO_LIMITS.spoken);
    if (edit.onScreen !== undefined) s.onScreen = clean(edit.onScreen, VIDEO_LIMITS.onScreen);
    if (edit.seconds !== undefined) s.seconds = Math.round(Math.max(VIDEO_LIMITS.seconds.min, Math.min(VIDEO_LIMITS.seconds.max, Number(edit.seconds) || s.seconds)));
    if (!s.spoken && !s.onScreen) throw new VideoError("invalid_request", "A scene needs words to say or something to show.");
    v.updatedAt = this.now().toISOString();
    await this.opts.store.videos.update(v);
    return v;
  }

  /** Stage 2: a picture for every scene that has none. One credit job for the lot. */
  async storyboard(caller: Principal, workspaceId: string, id: string, look = ""): Promise<VideoProject> {
    const v = await this.row(caller, workspaceId, id, "run_agents");
    const todo = v.scenes.map((s, i) => (s.imageFileId ? -1 : i)).filter((i) => i >= 0);
    if (!todo.length) return v;
    return this.draw(caller, v, todo, "storyboard", look);
  }

  /** Stage 3: one scene's picture made again, after its words or idea changed. */
  async redraw(caller: Principal, workspaceId: string, id: string, index: number, look = ""): Promise<VideoProject> {
    const v = await this.row(caller, workspaceId, id, "run_agents");
    if (!v.scenes[index]) throw new VideoError("invalid_request", "No such scene.");
    return this.draw(caller, v, [index], "redraw", look);
  }

  private async draw(caller: Principal, v: VideoProject, indexes: number[], stage: "storyboard" | "redraw", look: string): Promise<VideoProject> {
    const userId = caller.kind === "user" ? caller.userId : null;
    await this.limit(userId, v.workspaceId);
    const label = stage === "storyboard" ? `Storyboard: ${indexes.length} picture${indexes.length === 1 ? "" : "s"}` : "Storyboard: one picture again";
    const { hold, estimate } = await this.hold(v, stage, userId, label);
    let cost = 0;
    let made = 0;
    const failures: string[] = [];
    const queue = [...indexes];
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        try {
          const img = await this.opts.media.image(imagePrompt(v.scenes[i], look), AbortSignal.timeout(120_000));
          cost += img.costMicroUsd;
          const stored = await this.opts.files.put(v.workspaceId, { name: `scene-${i + 1}.${img.mimeType.split("/")[1] ?? "png"}`, mimeType: img.mimeType, bytes: img.bytes });
          v.scenes[i].imageFileId = stored.id;
          made += 1;
        } catch (err) {
          cost += err instanceof MediaFailure ? err.costMicroUsd : 0;
          failures.push(`Scene ${i + 1}: ${err instanceof Error ? err.message : "the picture could not be made"}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.opts.concurrency ?? 3, indexes.length) }, worker));
    await this.settle(v, stage, hold, estimate, made > 0, cost);
    if (v.scenes.every((s) => s.imageFileId) && v.stage === "script") v.stage = "storyboard";
    v.updatedAt = this.now().toISOString();
    await this.opts.store.videos.update(v);
    if (failures.length) throw new VideoError("media", `${failures.join(" ")} ${made ? "The others are made; press Draw again for the rest." : "Nothing was charged."}`);
    return v;
  }

  /** Stage 4: the voiceover and the cut, once every scene has a picture. One credit job. */
  async render(caller: Principal, workspaceId: string, id: string, voice: Voice): Promise<VideoProject> {
    const v = await this.row(caller, workspaceId, id, "run_agents");
    if (!VOICES.some((x) => x.value === voice)) throw new VideoError("invalid_request", "Pick a voice.");
    if (!v.scenes.every((s) => s.imageFileId)) throw new VideoError("invalid_request", "Every scene needs its picture first.");
    const userId = caller.kind === "user" ? caller.userId : null;
    await this.limit(userId, workspaceId);
    const { hold, estimate } = await this.hold(v, "video", userId, "Video: voiceover and cut");
    let cost = 0;
    try {
      const images = await Promise.all(v.scenes.map(async (s) => (await this.opts.files.get(workspaceId, s.imageFileId!))?.bytes ?? null));
      if (images.some((b) => !b)) throw new MediaFailure("A scene's picture is missing; draw it again.");
      // One voice clip per scene, so each picture stays exactly as long as its lines take to say.
      const voiced = await Promise.all(
        v.scenes.map(async (s) => {
          if (!s.spoken.trim()) return null;
          const clip = await this.opts.media.speech(s.spoken.trim(), voice, AbortSignal.timeout(120_000));
          cost += clip.costMicroUsd;
          return { bytes: clip.bytes, seconds: await this.opts.media.duration(clip.bytes, AbortSignal.timeout(30_000)) };
        }),
      );
      const seconds = v.scenes.map((s, i) => Math.min(VIDEO_LIMITS.seconds.max + 10, Math.max(s.seconds, voiced[i] ? Math.ceil((voiced[i]!.seconds + 0.4) * 10) / 10 : 0)));
      const mp4 = await this.opts.media.cut(
        v.scenes.map((s, i) => ({ image: images[i]!, seconds: seconds[i], audio: voiced[i]?.bytes ?? null, words: s.spoken.trim(), speechSeconds: voiced[i]?.seconds })),
        AbortSignal.timeout(180_000),
      );
      const stored = await this.opts.files.put(workspaceId, { name: `${slug(v.title)}.mp4`, mimeType: "video/mp4", bytes: mp4 });
      v.video = { fileId: stored.id, seconds: Math.round(seconds.reduce((a, b) => a + b, 0)), sizeBytes: mp4.byteLength, voice, at: this.now().toISOString() };
      v.voice = voice;
      v.stage = "done";
    } catch (err) {
      await this.settle(v, "video", hold, estimate, false, cost + (err instanceof MediaFailure ? err.costMicroUsd : 0));
      v.updatedAt = this.now().toISOString();
      await this.opts.store.videos.update(v);
      throw new VideoError("media", `${err instanceof Error ? err.message : "The video could not be made."} Nothing was charged.`);
    }
    await this.settle(v, "video", hold, estimate, true, cost);
    v.updatedAt = this.now().toISOString();
    await this.opts.store.videos.update(v);
    return v;
  }

  /** A picture or the video, for members of the video's workspace only. */
  async file(caller: Principal, workspaceId: string, id: string, fileId: string) {
    const v = await this.row(caller, workspaceId, id);
    const own = v.scenes.some((s) => s.imageFileId === fileId) || v.video?.fileId === fileId;
    if (!own) throw new VideoError("not_found", "No such file.");
    return this.opts.files.get(workspaceId, fileId);
  }

  private async limit(userId: string | null, workspaceId: string) {
    try {
      if (userId) await this.opts.accounts.limiter.hit(`video:user:${userId}`, VIDEO_RATE.perUserHour, "You made a lot of pictures and videos this hour. Wait a little and try again.");
      await this.opts.accounts.limiter.hit(`video:ws:${workspaceId}`, VIDEO_RATE.perWorkspaceDay, "This workspace made a lot of pictures and videos today. Try again tomorrow.");
    } catch (err) {
      if ((err as { code?: string })?.code === "rate_limited") throw new VideoError("limit", (err as Error).message);
      throw err;
    }
  }

  private async hold(v: VideoProject, stage: StageCharge["stage"], userId: string | null, label: string) {
    const b = this.opts.billing;
    if (!b) return { hold: null, estimate: 0 };
    const micro = this.stageMicroUsd(v, stage);
    const estimate = b.estimateJob(micro, micro * 2);
    try {
      return { hold: await b.reserveJob({ workspaceId: v.workspaceId, jobId: newId("vjb"), estimate, userId, label }), estimate };
    } catch (err) {
      if (err instanceof BillingRefusal) throw new VideoError("credits", `This step needs up to ${estimate} credit${estimate === 1 ? "" : "s"}: ${err.message}`);
      if (err instanceof AccountError) throw new VideoError("credits", err.message);
      throw err;
    }
  }

  private async settle(v: VideoProject, stage: StageCharge["stage"], hold: RunCredits | null, estimate: number, done: boolean, costMicroUsd: number) {
    let charged = 0;
    if (hold && this.opts.billing) charged = (await this.opts.billing.settleJob(v.workspaceId, hold, { done, costMicroUsd })).charged ?? 0;
    v.charges.push({ stage, estimate, charged, costMicroUsd, at: this.now().toISOString() });
  }
}

/** Every scene's spoken lines, in order, as the voiceover reads them. */
export function spokenText(v: Pick<VideoProject, "scenes">): string {
  return v.scenes
    .map((s) => s.spoken.trim())
    .filter(Boolean)
    .join("\n\n");
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";
}
