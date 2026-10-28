/**
 * Make a video, staged as the product doc says (section 3, "Output rule"):
 * video is never made in one jump, and the person approves each stage before
 * the next one costs more. Version 2 (docs/video-v2-plan.md):
 *
 * 1. Idea and proposal: the AI suggests the settings (proposal.ts), the
 *    person confirms or changes them. Free; its tiny cost is in the plan's.
 * 2. Plan: the scenes from the idea and the settings (planner.ts), a Script
 *    Writer result or a pasted script. One small job.
 * 3. Storyboard: one picture per scene in the video's style, then the person
 *    arranges it: move, duplicate, split, merge, lock, delete, add, undo the
 *    last 10 changes, restyle the whole video or one scene (locked scenes are
 *    never touched), and "Draw again" with two options to pick from. Free
 *    apart from the pictures.
 * 4. Video: the voiceover per scene (kept per scene's words and voice, so
 *    making it again only records what changed), the cut or the motion
 *    graphics render, then the captions and the brand's end card. The
 *    progress is written to the video as it goes, so the screen shows the
 *    real steps. One credit job.
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
import { readingSeconds, videoCues } from "./captions";
import { MediaFailure, SIZES, VOICES, type FinishOptions, type VideoMedia, type Voice } from "./media";
import { motionLook, SHAPES, type MotionLook, type MotionScene, type Shape } from "./motion";
import { PLAN_ESTIMATE_MICRO_USD, normalizeBrief, picturePrompt, styleFor, type Brief, type Planner } from "./planner";
import { PROPOSAL_MICRO_USD, defaultProposal, type Proposer, type ProposalInput } from "./proposal";
import { PICTURE_STYLES, brandPalette, styleOf, type BrandLook, type Captions, type VideoStyle } from "./styles";

export const VIDEO_LIMITS = { scenes: { min: 1, max: 8 }, spoken: 400, onScreen: 300, title: 80, seconds: { min: 1, max: 20 }, pastedScript: 4000, history: 10 } as const;
/** Media jobs per person per hour and per workspace per day, so nobody can run up a bill by clicking. */
export const VIDEO_RATE = { perUserHour: { max: 30, windowMs: 3_600_000 }, perWorkspaceDay: { max: 120, windowMs: 86_400_000 }, proposalsPerUserHour: { max: 40, windowMs: 3_600_000 } } as const;
/** A render that has not moved for this long is taken as stopped (a server restart), so the video can be made again. */
const RENDER_STALE_MS = 15 * 60_000;
/** How long the brand's end card shows. */
export const END_CARD_SECONDS = 2.5;

/**
 * One scene. `text` is the few big words on screen (the headline). `imageFileId` is the scene's picture: drawn by
 * the image model, or the person's own photo (or the first frame of their own clip, as its poster). `clipFileId` is
 * their own clip, used instead of the still when there is one.
 */
export type Scene = {
  /** Stable across moves, so the screen keeps each card's own state. */
  id?: string;
  spoken: string;
  onScreen: string;
  text?: string;
  seconds: number;
  imageFileId: string | null;
  bottom?: string;
  shape?: Shape;
  clipFileId?: string | null;
  own?: boolean;
  /** A restyle never touches a locked scene, and its picture is never drawn again until it is unlocked. */
  locked?: boolean;
  /** This scene's own look, instead of the video's style. */
  style?: VideoStyle;
  /** "Draw again" made two pictures; the person picks one. */
  options?: string[] | null;
  /** The voice clip last recorded for these exact words in this voice, reused when the video is made again. */
  voiceClip?: { key: string; fileId: string; seconds: number } | null;
};
export type StageCharge = { stage: "plan" | "storyboard" | "redraw" | "options" | "restyle" | "video"; estimate: number; charged: number; costMicroUsd: number; at: string };
export type RenderStep = "voice" | "scenes" | "captions" | "done" | "failed";
export type Progress = { step: RenderStep; startedAt: string; at: string; error?: string };
/** The ready-to-post pack: a Caption Writer run and a Hashtag Optimizer run from the script. */
export type PostPack = { captionRunId: string | null; hashtagRunId: string | null; platform: string; at: string };
export type Snapshot = { label: string; at: string; scenes: Scene[]; style?: VideoStyle };

export type VideoProject = {
  id: string;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  /** The Script Writer run the scenes came from, when they did. */
  fromRunId: string | null;
  /** The idea and the confirmed settings. Old videos may have a version 1 brief or none; `normalizeBrief` reads both. */
  brief?: Brief | null;
  scenes: Scene[];
  /** script: scenes only. storyboard: every scene has a picture. done: the video is made. */
  stage: "script" | "storyboard" | "done";
  voice: Voice | null;
  video: { fileId: string; seconds: number; sizeBytes: number; voice: Voice; at: string } | null;
  charges: StageCharge[];
  /** The last changes to the storyboard, newest last, for undo. */
  history?: Snapshot[];
  /** Where making the video is, while it is made. */
  progress?: Progress | null;
  pack?: PostPack | null;
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
const clampSeconds = (n: number) => Math.round(Math.max(VIDEO_LIMITS.seconds.min, Math.min(VIDEO_LIMITS.seconds.max, n)));
/** About 2.5 spoken words a second, never under 2 or over the limit. */
export const secondsFor = (spoken: string) => Math.max(2, Math.min(VIDEO_LIMITS.seconds.max, Math.round(wordsOf(spoken) / 2.5)));
const sceneId = () => newId("scn");

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

/**
 * A scene's words in two at a sentence break, as even as the sentences allow
 * (at a comma when it is one sentence). Null when there is nowhere to split.
 */
export function splitText(spoken: string): [string, string] | null {
  const at = (parts: string[], join: string): [string, string] | null => {
    if (parts.length < 2) return null;
    const total = wordsOf(parts.join(" "));
    let best = 1;
    let gap = Infinity;
    for (let i = 1; i < parts.length; i++) {
      const d = Math.abs(wordsOf(parts.slice(0, i).join(" ")) * 2 - total);
      if (d < gap) [best, gap] = [i, d];
    }
    return [parts.slice(0, best).join(join).trim(), parts.slice(best).join(join).trim()];
  };
  const text = spoken.trim();
  return at(text.split(/(?<=[.!?]["')\]]?)\s+/).filter(Boolean), " ") ?? at(text.split(/(?<=,)\s+/).filter(Boolean), " ");
}

/** The key a voice clip is kept under: the voice and the exact words. */
export const voiceKey = (voice: Voice, words: string) => `${voice}|${words.trim()}`;

/** Every file a video holds: pictures, clips, picture options, the video, the voice clips, and the pictures undo can bring back. */
function ownedFiles(v: VideoProject): Set<string> {
  const ids = new Set<string>();
  const add = (s: Scene) => [s.imageFileId, s.clipFileId, ...(s.options ?? [])].forEach((x) => x && ids.add(x));
  v.scenes.forEach(add);
  (v.history ?? []).forEach((h) => h.scenes.forEach(add));
  if (v.video) ids.add(v.video.fileId);
  return ids;
}

/** What a pasted script or a Script Writer result starts with: a realistic story, the default voice and captions. */
export function defaultBrief(idea: string): Brief {
  return normalizeBrief({ idea, type: "story", style: "realistic", vibe: "fun", seconds: 30, aspect: "9:16", voiceover: true, voice: "warm", captions: { on: true, look: "clean", position: "bottom" }, brand: true })!;
}

export type VideoOptions = {
  accounts: Accounts;
  store: VideoStore;
  files: FileStorage;
  media: VideoMedia;
  billing?: VideoBilling | null;
  /** Turns the idea and the settings into scenes. Without one, only a pasted script or a Script Writer result can start a video. */
  planner?: Planner | null;
  /** Suggests the settings from the idea. Without one, the default proposal. */
  proposer?: Proposer | null;
  /** Draws motion graphics videos frame by frame (motion-render.ts on the server, a fake in tests). */
  animate?: ((scenes: (MotionScene & { audio: Uint8Array | null })[], look: MotionLook, signal: AbortSignal, opts?: { captions?: boolean }) => Promise<Uint8Array>) | null;
  /** Draws the brand's end card as a PNG of the video's size (resvg on the server, a fake in tests). */
  card?: ((brand: BrandLook, width: number, height: number) => Promise<Uint8Array>) | null;
  now?: () => Date;
  /** Pictures made at the same time. */
  concurrency?: number;
};

export type StagePrice = { credits: number; free: boolean };
export type PriceStage = StageCharge["stage"];
export type VideoPrices = Record<"storyboard" | "redraw" | "options" | "restyle" | "video", StagePrice>;

export class VideoStudio {
  constructor(private readonly opts: VideoOptions) {}

  /** One write at a time per video, so pictures landing together never undo each other. */
  private locks = new Map<string, Promise<unknown>>();
  private async locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const before = this.locks.get(id) ?? Promise.resolve();
    const run = before.then(fn, fn);
    const done = run.catch(() => undefined);
    this.locks.set(id, done);
    try {
      return await run;
    } finally {
      if (this.locks.get(id) === done) this.locks.delete(id);
    }
  }

  private now() {
    return (this.opts.now ?? (() => new Date()))();
  }

  /** A stored video as version 2: the brief read either way, every scene with an id (written back once, so ids stay put). */
  private async normalized(v: VideoProject): Promise<VideoProject> {
    const missing = v.scenes.some((s) => !s.id);
    v.brief = v.brief ? normalizeBrief(v.brief) : null;
    v.history ??= [];
    if (missing) {
      v.scenes.forEach((s) => (s.id ??= sceneId()));
      await this.opts.store.videos.update(v);
    }
    return v;
  }

  private async row(caller: Principal, workspaceId: string, id: string, action: "view" | "run_agents" = "view"): Promise<VideoProject> {
    await this.opts.accounts.authorize(caller, workspaceId, action);
    const v = typeof id === "string" ? await this.opts.store.videos.get(id) : null;
    if (!v || v.workspaceId !== workspaceId) throw new VideoError("not_found", "No such video in this workspace.");
    return this.normalized(v);
  }

  /** The newest copy of a video inside the lock, for a read-modify-write. */
  private async latest(id: string, fallback: VideoProject): Promise<VideoProject> {
    const v = await this.opts.store.videos.get(id);
    return v ? this.normalized(v) : fallback;
  }

  async list(caller: Principal, workspaceId: string): Promise<VideoProject[]> {
    await this.opts.accounts.authorize(caller, workspaceId, "view");
    const all = await this.opts.store.videos.find({ workspaceId });
    for (const v of all) await this.normalized(v);
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(caller: Principal, workspaceId: string, id: string): Promise<VideoProject> {
    return this.row(caller, workspaceId, id);
  }

  /** A new video from scenes (a Script Writer result) or a pasted script. Free. */
  async create(caller: Principal, workspaceId: string, input: { title?: string; scenes?: Omit<Scene, "imageFileId">[]; script?: string; fromRunId?: string | null; brief?: Brief | null }): Promise<VideoProject> {
    await this.opts.accounts.authorize(caller, workspaceId, "run_agents");
    const raw = input.scenes?.length ? input.scenes : scenesFromText(input.script ?? "");
    const scenes: Scene[] = raw
      .map((s) => ({ id: sceneId(), spoken: clean(s.spoken, VIDEO_LIMITS.spoken), onScreen: clean(s.onScreen, VIDEO_LIMITS.onScreen), text: clean(s.text, 60), bottom: clean(s.bottom, 60), shape: SHAPES.includes(s.shape as Shape) ? s.shape : undefined, seconds: clampSeconds(Number(s.seconds) || secondsFor(clean(s.spoken, VIDEO_LIMITS.spoken))), imageFileId: null }))
      .filter((s) => s.spoken || s.onScreen || s.text)
      .slice(0, VIDEO_LIMITS.scenes.max);
    if (scenes.length < VIDEO_LIMITS.scenes.min) throw new VideoError("invalid_request", "Paste a script first, or start from a Script Writer result.");
    const at = this.now().toISOString();
    const title = clean(input.title, VIDEO_LIMITS.title) || clean(scenes[0].spoken || scenes[0].onScreen, 60) || "My video";
    const brief = input.brief ?? defaultBrief(title);
    const v: VideoProject = {
      id: newId("vid"),
      workspaceId,
      createdBy: caller.kind === "user" ? caller.userId : "api",
      createdAt: at,
      updatedAt: at,
      title,
      fromRunId: input.fromRunId ?? null,
      brief,
      scenes,
      stage: "script",
      voice: brief.voiceover ? brief.voice : "none",
      video: null,
      charges: [],
      history: [],
    };
    await this.opts.store.videos.insert(v);
    return v;
  }

  /**
   * The proposal: the AI reads the idea and suggests the settings. Free to the
   * person (its tiny cost is counted into the plan's price), but it counts
   * against its own hourly limit, so it cannot be called without end.
   */
  async propose(caller: Principal, workspaceId: string, input: ProposalInput) {
    await this.opts.accounts.authorize(caller, workspaceId, "run_agents");
    const idea = clean(input.idea, 1000);
    if (idea.length < 3) throw new VideoError("invalid_request", "Write your idea in a few words first.");
    if (caller.kind === "user") {
      try {
        await this.opts.accounts.limiter.hit(`video:propose:${caller.userId}`, VIDEO_RATE.proposalsPerUserHour, "That is a lot of ideas this hour. Wait a little and try again.");
      } catch (err) {
        if ((err as { code?: string })?.code === "rate_limited") throw new VideoError("limit", (err as Error).message);
        throw err;
      }
    }
    if (!this.opts.proposer) return { proposal: defaultProposal(input.reference), fallback: true };
    const r = await this.opts.proposer({ ...input, idea }, AbortSignal.timeout(30_000));
    return { proposal: r.proposal, fallback: r.fallback };
  }

  /**
   * The plan from the idea and the confirmed settings: what is said, what
   * each picture shows, the words on screen. One small credit job. The person
   * checks and edits it before any picture.
   */
  async plan(caller: Principal, workspaceId: string, brief: Brief, brand = ""): Promise<VideoProject> {
    await this.opts.accounts.authorize(caller, workspaceId, "run_agents");
    if (!this.opts.planner) throw new VideoError("media", "Planning from an idea is not set up here. Paste a script instead.");
    const idea = clean(brief.idea, 1000);
    if (idea.length < 3) throw new VideoError("invalid_request", "Write your idea in a few words first.");
    const userId = caller.kind === "user" ? caller.userId : null;
    await this.limit(userId, workspaceId);
    const at = this.now().toISOString();
    const draft: VideoProject = { id: newId("vid"), workspaceId, createdBy: userId ?? "api", createdAt: at, updatedAt: at, title: idea.slice(0, 80), fromRunId: null, brief, scenes: [], stage: "script", voice: null, video: null, charges: [] };
    const { hold, estimate } = await this.hold(draft, "plan", userId, "Video: the plan from your idea");
    let made;
    try {
      made = await this.opts.planner({ ...brief, idea }, brief.brand ? brand : "", AbortSignal.timeout(120_000));
    } catch (err) {
      await this.settle(draft, "plan", hold, estimate, false, (err as { costMicroUsd?: number })?.costMicroUsd ?? 0);
      throw new VideoError("media", `${err instanceof Error ? err.message : "The plan could not be made."} Nothing was charged.`);
    }
    // The proposal before it is part of the plan's price.
    await this.settle(draft, "plan", hold, estimate, true, made.costMicroUsd + (brief.summary ? PROPOSAL_MICRO_USD : 0));
    const v = await this.create(caller, workspaceId, { title: idea, scenes: made.scenes, brief: { ...brief, idea } });
    v.charges = draft.charges;
    // Motion graphics draws no pictures: the plan is the storyboard.
    if (isMotion(v)) v.stage = "storyboard";
    await this.opts.store.videos.update(v);
    return v;
  }

  /** The picture prompt for one scene: its own look or the video's style, with the brand's look when it is on. */
  private prompt(v: VideoProject, scene: Scene, look: string, style?: VideoStyle): string {
    const picture = v.brief ? styleFor(v.brief, style ?? scene.style).picture : styleOf("realistic").picture;
    return picturePrompt(scene, picture, v.brief?.brand === false ? "" : look);
  }

  private async drawOne(v: VideoProject, i: number, look: string, signal: AbortSignal, style?: VideoStyle): Promise<{ fileId: string; cost: number }> {
    const img = await this.opts.media.image(this.prompt(v, v.scenes[i], look, style), signal, v.brief?.aspect);
    const stored = await this.opts.files.put(v.workspaceId, { name: `scene-${i + 1}.${img.mimeType.split("/")[1] ?? "png"}`, mimeType: img.mimeType, bytes: img.bytes });
    return { fileId: stored.id, cost: img.costMicroUsd };
  }

  /**
   * One scene's picture, for the storyboard drawn scene by scene (the screen
   * asks for a few at a time and shows each as it lands). The row is read
   * again right before it is written, so pictures landing together never undo
   * each other.
   */
  async drawScene(caller: Principal, workspaceId: string, id: string, index: number, look = ""): Promise<VideoProject> {
    const v = await this.row(caller, workspaceId, id, "run_agents");
    const scene = v.scenes[index];
    if (!scene) throw new VideoError("invalid_request", "No such scene.");
    if (scene.locked && scene.imageFileId) throw new VideoError("invalid_request", "This scene is locked. Unlock it to draw it again.");
    const userId = caller.kind === "user" ? caller.userId : null;
    await this.limit(userId, workspaceId);
    const stage = scene.imageFileId ? "redraw" : "storyboard";
    const { hold, estimate } = await this.hold(v, "redraw", userId, `Storyboard: scene ${index + 1}`);
    let made: { fileId: string; cost: number };
    try {
      made = await this.drawOne(v, index, look, AbortSignal.timeout(120_000));
    } catch (err) {
      await this.locked(id, async () => {
        const latest = await this.latest(id, v);
        await this.settle(latest, stage, hold, estimate, false, err instanceof MediaFailure ? err.costMicroUsd : 0);
        await this.opts.store.videos.update(latest);
      });
      throw new VideoError("media", `Scene ${index + 1}: ${err instanceof Error ? err.message : "the picture could not be made"} Nothing was charged.`);
    }
    return this.locked(id, async () => {
      const latest = await this.latest(id, v);
      const s = latest.scenes.find((x) => x.id === scene.id);
      if (s) Object.assign(s, { imageFileId: made.fileId, clipFileId: null, own: false, options: null });
      await this.settle(latest, stage, hold, estimate, true, made.cost);
      restage(latest);
      latest.updatedAt = this.now().toISOString();
      await this.opts.store.videos.update(latest);
      return latest;
    });
  }

  /**
   * "Draw again": two new pictures side by side, charged as one small job.
   * The current picture stays until the person picks one.
   */
  async drawOptions(caller: Principal, workspaceId: string, id: string, index: number, look = ""): Promise<VideoProject> {
    const v = await this.row(caller, workspaceId, id, "run_agents");
    const scene = v.scenes[index];
    if (!scene) throw new VideoError("invalid_request", "No such scene.");
    if (scene.locked) throw new VideoError("invalid_request", "This scene is locked. Unlock it to draw it again.");
    if (isMotion(v)) throw new VideoError("invalid_request", "Motion graphics has no pictures to draw.");
    const userId = caller.kind === "user" ? caller.userId : null;
    await this.limit(userId, workspaceId);
    const { hold, estimate } = await this.hold(v, "options", userId, `Storyboard: two new pictures for scene ${index + 1}`);
    const tries = await Promise.allSettled([0, 1].map(() => this.drawOne(v, index, look, AbortSignal.timeout(120_000))));
    const made = tries.flatMap((t) => (t.status === "fulfilled" ? [t.value] : []));
    const cost = made.reduce((n, m) => n + m.cost, 0) + tries.reduce((n, t) => n + (t.status === "rejected" && t.reason instanceof MediaFailure ? t.reason.costMicroUsd : 0), 0);
    return this.locked(id, async () => {
      const latest = await this.latest(id, v);
      await this.settle(latest, "options", hold, estimate, made.length > 0, cost);
      const s = latest.scenes.find((x) => x.id === scene.id);
      if (s && made.length) s.options = made.map((m) => m.fileId);
      latest.updatedAt = this.now().toISOString();
      await this.opts.store.videos.update(latest);
      if (!made.length) throw new VideoError("media", `Scene ${index + 1}: the pictures could not be made. Nothing was charged.`);
      return latest;
    });
  }

  /** Picks one of the two options (or -1 to keep the picture it had). Free, and undo brings the old one back. */
  async pickOption(caller: Principal, workspaceId: string, id: string, index: number, which: number): Promise<VideoProject> {
    return this.change(caller, workspaceId, id, "Picked a picture", (v) => {
      const s = v.scenes[index];
      if (!s?.options?.length) throw new VideoError("invalid_request", "There are no pictures to pick from.");
      if (which >= 0) {
        const pick = s.options[which];
        if (!pick) throw new VideoError("invalid_request", "No such picture.");
        Object.assign(s, { imageFileId: pick, clipFileId: null, own: false });
      }
      s.options = null;
    });
  }

  /**
   * The person's own photo or clip for a scene, instead of a drawn picture:
   * the strongest way to make a video theirs. Free. A clip comes with its
   * first frame as the poster the panel shows.
   */
  async useOwnMedia(caller: Principal, workspaceId: string, id: string, index: number, media: { image: { name: string; mimeType: string; bytes: Uint8Array }; clip?: { name: string; mimeType: string; bytes: Uint8Array } | null }): Promise<VideoProject> {
    await this.row(caller, workspaceId, id, "run_agents");
    const image = await this.opts.files.put(workspaceId, media.image);
    const clip = media.clip ? await this.opts.files.put(workspaceId, media.clip) : null;
    return this.change(caller, workspaceId, id, "Your own photo or clip", (v) => {
      const s = v.scenes[index];
      if (!s) throw new VideoError("invalid_request", "No such scene.");
      Object.assign(s, { imageFileId: image.id, clipFileId: clip?.id ?? null, own: true, options: null });
    });
  }

  /**
   * Every storyboard change goes through here: inside the per-video lock, the
   * scenes as they were go on the undo list (the last 10), then the change,
   * then the stage is worked out again and the video saved.
   */
  private async change(caller: Principal, workspaceId: string, id: string, label: string, fn: (v: VideoProject) => void | false): Promise<VideoProject> {
    return this.locked(id, async () => {
      const v = await this.row(caller, workspaceId, id, "run_agents");
      const before: Snapshot = { label, at: this.now().toISOString(), scenes: structuredClone(v.scenes), ...(v.brief ? { style: v.brief.style } : {}) };
      if (fn(v) === false) return v;
      v.history = [...(v.history ?? []), before].slice(-VIDEO_LIMITS.history);
      restage(v);
      v.updatedAt = this.now().toISOString();
      await this.opts.store.videos.update(v);
      return v;
    });
  }

  /** Adds an empty scene after `index` (or at the end). Free. A video keeps 1 to 8 scenes. */
  async addScene(caller: Principal, workspaceId: string, id: string, after: number): Promise<VideoProject> {
    return this.change(caller, workspaceId, id, "Added a scene", (v) => {
      roomFor(v, 1);
      const motion = isMotion(v);
      const at = Math.max(0, Math.min(v.scenes.length, after + 1));
      v.scenes.splice(at, 0, motion ? { id: sceneId(), spoken: "", onScreen: "", text: "a new thought", bottom: "its answer", shape: "circle", seconds: 4, imageFileId: null } : { id: sceneId(), spoken: "", onScreen: "New scene: describe what it shows", text: "", seconds: 3, imageFileId: null });
    });
  }

  async removeScene(caller: Principal, workspaceId: string, id: string, index: number): Promise<VideoProject> {
    return this.change(caller, workspaceId, id, "Deleted a scene", (v) => {
      if (!v.scenes[index]) throw new VideoError("invalid_request", "No such scene.");
      if (v.scenes.length <= VIDEO_LIMITS.scenes.min) throw new VideoError("invalid_request", "A video needs at least one scene.");
      v.scenes.splice(index, 1);
    });
  }

  /** Moves a scene to another place (drag and drop, or up and down on a phone). */
  async moveScene(caller: Principal, workspaceId: string, id: string, from: number, to: number): Promise<VideoProject> {
    return this.change(caller, workspaceId, id, "Moved a scene", (v) => {
      if (!v.scenes[from] || to < 0 || to >= v.scenes.length) throw new VideoError("invalid_request", "No such scene.");
      if (from === to) return false;
      const [s] = v.scenes.splice(from, 1);
      v.scenes.splice(to, 0, s);
    });
  }

  /** A copy of a scene right after it, with the same picture (not locked). */
  async duplicateScene(caller: Principal, workspaceId: string, id: string, index: number): Promise<VideoProject> {
    return this.change(caller, workspaceId, id, "Duplicated a scene", (v) => {
      const s = v.scenes[index];
      if (!s) throw new VideoError("invalid_request", "No such scene.");
      roomFor(v, 1);
      v.scenes.splice(index + 1, 0, { ...structuredClone(s), id: sceneId(), locked: false, options: null });
    });
  }

  /** A long scene in two at a sentence break; both keep the picture, the seconds split by the words. */
  async splitScene(caller: Principal, workspaceId: string, id: string, index: number): Promise<VideoProject> {
    return this.change(caller, workspaceId, id, "Split a scene", (v) => {
      const s = v.scenes[index];
      if (!s) throw new VideoError("invalid_request", "No such scene.");
      roomFor(v, 1);
      const parts = splitText(s.spoken);
      if (!parts) throw new VideoError("invalid_request", "This scene has one short sentence, so there is nowhere to split it. Add a scene instead.");
      const share = wordsOf(parts[0]) / Math.max(1, wordsOf(s.spoken));
      const first = Math.max(1, Math.round(s.seconds * share));
      const second: Scene = { ...structuredClone(s), id: sceneId(), spoken: parts[1], text: isMotion(v) ? s.text : "", seconds: Math.max(1, s.seconds - first), options: null, voiceClip: null };
      Object.assign(s, { spoken: parts[0], seconds: first, options: null, voiceClip: null });
      v.scenes.splice(index + 1, 0, second);
    });
  }

  /** A scene and the one after it as one: the words joined, the seconds added, the first picture kept. */
  async mergeScenes(caller: Principal, workspaceId: string, id: string, index: number): Promise<VideoProject> {
    return this.change(caller, workspaceId, id, "Merged two scenes", (v) => {
      const a = v.scenes[index];
      const b = v.scenes[index + 1];
      if (!a || !b) throw new VideoError("invalid_request", "There is no scene after this one to merge with.");
      const join = (x: string, y: string, sep: string) => [x.trim(), y.trim()].filter(Boolean).join(sep);
      Object.assign(a, {
        spoken: join(a.spoken, b.spoken, " ").slice(0, VIDEO_LIMITS.spoken),
        onScreen: join(a.onScreen, b.onScreen, "; ").slice(0, VIDEO_LIMITS.onScreen),
        text: a.text || b.text || "",
        seconds: clampSeconds(a.seconds + b.seconds),
        imageFileId: a.imageFileId ?? b.imageFileId,
        clipFileId: a.imageFileId ? (a.clipFileId ?? null) : (b.clipFileId ?? null),
        own: a.imageFileId ? a.own : b.own,
        locked: Boolean(a.locked || b.locked),
        options: null,
        voiceClip: null,
      });
      v.scenes.splice(index + 1, 1);
    });
  }

  /** Locks or unlocks a scene: a restyle never touches a locked scene. */
  async lockScene(caller: Principal, workspaceId: string, id: string, index: number, on: boolean): Promise<VideoProject> {
    return this.change(caller, workspaceId, id, on ? "Locked a scene" : "Unlocked a scene", (v) => {
      const s = v.scenes[index];
      if (!s) throw new VideoError("invalid_request", "No such scene.");
      if (Boolean(s.locked) === on) return false;
      s.locked = on;
    });
  }

  /** Undoes the last storyboard change: the scenes (and the style) as they were before it. */
  async undo(caller: Principal, workspaceId: string, id: string): Promise<VideoProject> {
    return this.locked(id, async () => {
      const v = await this.row(caller, workspaceId, id, "run_agents");
      const last = v.history?.pop();
      if (!last) throw new VideoError("invalid_request", "There is nothing to undo.");
      v.scenes = last.scenes;
      if (v.brief && last.style) v.brief.style = last.style;
      restage(v);
      v.updatedAt = this.now().toISOString();
      await this.opts.store.videos.update(v);
      return v;
    });
  }

  /**
   * A small paid job outside a video, like reading a reference clip before
   * the plan: held at its estimate, settled to what it cost, refunded when it
   * fails. Free without billing.
   */
  async paidJob<T>(caller: Principal, workspaceId: string, label: string, estimateMicroUsd: number, fn: () => Promise<{ value: T; costMicroUsd: number }>): Promise<T> {
    await this.opts.accounts.authorize(caller, workspaceId, "run_agents");
    const userId = caller.kind === "user" ? caller.userId : null;
    await this.limit(userId, workspaceId);
    const b = this.opts.billing;
    let hold: RunCredits | null = null;
    if (b) {
      const estimate = b.estimateJob(estimateMicroUsd, estimateMicroUsd * 2);
      try {
        hold = await b.reserveJob({ workspaceId, jobId: newId("vjb"), estimate, userId, label });
      } catch (err) {
        if (err instanceof BillingRefusal) throw new VideoError("credits", `This step needs up to ${estimate} credit${estimate === 1 ? "" : "s"}: ${err.message}`);
        throw err;
      }
    }
    try {
      const r = await fn();
      if (hold && b) await b.settleJob(workspaceId, hold, { done: true, costMicroUsd: r.costMicroUsd });
      return r.value;
    } catch (err) {
      if (hold && b) await b.settleJob(workspaceId, hold, { done: false, costMicroUsd: 0 });
      throw err;
    }
  }

  /** Every price the storyboard shows, for this video as it is now. */
  prices(v: VideoProject): VideoPrices {
    return { storyboard: this.price(v, "storyboard"), redraw: this.price(v, "redraw"), options: this.price(v, "options"), restyle: this.price(v, "restyle"), video: this.price(v, "video") };
  }

  /** What a stage will cost, in credits, before anything runs. */
  price(v: VideoProject | null, stage: PriceStage): StagePrice {
    const b = this.opts.billing;
    const micro = this.stageMicroUsd(v, stage);
    if (!b) return { credits: 0, free: true };
    return { credits: b.estimateJob(micro, micro * 2), free: false };
  }

  private stageMicroUsd(v: VideoProject | null, stage: PriceStage): number {
    const e = this.opts.media.estimate;
    if (stage === "plan" || !v) return PLAN_ESTIMATE_MICRO_USD;
    if (stage === "redraw") return e.imageMicroUsd;
    if (stage === "options") return e.imageMicroUsd * 2;
    if (stage === "restyle") return e.imageMicroUsd * Math.max(1, restyleTargets(v).length);
    if (stage === "storyboard") return e.imageMicroUsd * Math.max(1, v.scenes.filter((s) => !s.imageFileId).length);
    // Only the words without a kept voice clip are recorded again.
    const voice = v.voice ?? "warm";
    const fresh = voice === "none" ? 0 : v.scenes.filter((s) => s.spoken.trim() && s.voiceClip?.key !== voiceKey(voice, s.spoken)).reduce((n, s) => n + s.spoken.trim().length, 0);
    return e.speechMicroUsdPerChar * Math.max(1, fresh) + 1_000;
  }

  /** Change a scene's words, length or what it shows. A changed scene keeps its picture until it is drawn again. */
  async editScene(caller: Principal, workspaceId: string, id: string, index: number, edit: Partial<Pick<Scene, "spoken" | "onScreen" | "text" | "bottom" | "shape" | "seconds">>): Promise<VideoProject> {
    return this.change(caller, workspaceId, id, `Edited scene ${index + 1}`, (v) => {
      const s = v.scenes[index];
      if (!s) throw new VideoError("invalid_request", "No such scene.");
      const before = JSON.stringify(s);
      if (edit.spoken !== undefined) s.spoken = clean(edit.spoken, VIDEO_LIMITS.spoken);
      if (edit.onScreen !== undefined) s.onScreen = clean(edit.onScreen, VIDEO_LIMITS.onScreen);
      if (edit.text !== undefined) s.text = clean(edit.text, 60);
      if (edit.bottom !== undefined) s.bottom = clean(edit.bottom, 60);
      if (edit.shape !== undefined && SHAPES.includes(edit.shape)) s.shape = edit.shape;
      if (edit.seconds !== undefined) s.seconds = clampSeconds(Number(edit.seconds) || s.seconds);
      if (!s.spoken && !s.onScreen && !s.text) throw new VideoError("invalid_request", "A scene needs words to say or something to show.");
      if (JSON.stringify(s) === before) return false;
    });
  }

  /** The voice, the captions and the Brand Brain switch, changed from the storyboard. Free. */
  async updateSettings(caller: Principal, workspaceId: string, id: string, patch: { voice?: Voice; captions?: Partial<Captions>; brand?: boolean }): Promise<VideoProject> {
    return this.locked(id, async () => {
      const v = await this.row(caller, workspaceId, id, "run_agents");
      v.brief ??= defaultBrief(v.title);
      if (patch.voice !== undefined) {
        if (!VOICES.some((x) => x.value === patch.voice)) throw new VideoError("invalid_request", "Pick a voice.");
        v.voice = patch.voice;
        v.brief.voiceover = patch.voice !== "none";
        if (patch.voice !== "none") v.brief.voice = patch.voice;
      }
      if (patch.captions) v.brief = normalizeBrief({ ...v.brief, captions: { ...v.brief.captions, ...patch.captions } })!;
      if (typeof patch.brand === "boolean") v.brief.brand = patch.brand;
      v.updatedAt = this.now().toISOString();
      await this.opts.store.videos.update(v);
      return v;
    });
  }

  /** A picture for every scene that has none. One credit job for the lot. */
  async storyboard(caller: Principal, workspaceId: string, id: string, look = ""): Promise<VideoProject> {
    const v = await this.row(caller, workspaceId, id, "run_agents");
    const todo = v.scenes.map((s, i) => (s.imageFileId ? -1 : i)).filter((i) => i >= 0);
    if (!todo.length) return v;
    return this.draw(caller, v, todo, "storyboard", look);
  }

  /** One scene's picture made again, after its words or idea changed. */
  async redraw(caller: Principal, workspaceId: string, id: string, index: number, look = ""): Promise<VideoProject> {
    const v = await this.row(caller, workspaceId, id, "run_agents");
    if (!v.scenes[index]) throw new VideoError("invalid_request", "No such scene.");
    return this.draw(caller, v, [index], "redraw", look);
  }

  /**
   * Another style: for the whole video, every scene that is not locked and
   * not the person's own photo or clip is drawn again in it (one credit job);
   * for one scene, only that scene. Undo brings the old pictures back.
   */
  async restyle(caller: Principal, workspaceId: string, id: string, style: VideoStyle, look = "", index?: number): Promise<VideoProject> {
    const v = await this.row(caller, workspaceId, id, "run_agents");
    if (isMotion(v)) throw new VideoError("invalid_request", "A motion graphics video has no pictures to restyle. Start a new video for another style.");
    if (!(PICTURE_STYLES as string[]).includes(style)) throw new VideoError("invalid_request", "Motion graphics needs its own plan. Start a new video for it.");
    if (index !== undefined && !v.scenes[index]) throw new VideoError("invalid_request", "No such scene.");
    if (index !== undefined && v.scenes[index].locked) throw new VideoError("invalid_request", "This scene is locked. Unlock it to change its look.");
    const changed = await this.change(caller, workspaceId, id, index === undefined ? `Style: ${styleOf(style).label}` : `Scene ${index + 1} look: ${styleOf(style).label}`, (x) => {
      x.brief ??= defaultBrief(x.title);
      if (index === undefined) {
        x.brief.style = style;
        for (const i of restyleTargets(x)) delete x.scenes[i].style;
      } else x.scenes[index].style = style === x.brief.style ? undefined : style;
    });
    const targets = index === undefined ? restyleTargets(changed) : [index];
    if (!targets.length) return changed;
    return this.draw(caller, changed, targets, "restyle", look);
  }

  private async draw(caller: Principal, v: VideoProject, indexes: number[], stage: "storyboard" | "redraw" | "restyle", look: string): Promise<VideoProject> {
    const userId = caller.kind === "user" ? caller.userId : null;
    await this.limit(userId, v.workspaceId);
    const label = stage === "storyboard" ? `Storyboard: ${indexes.length} picture${indexes.length === 1 ? "" : "s"}` : stage === "restyle" ? `Storyboard: ${indexes.length} picture${indexes.length === 1 ? "" : "s"} in a new style` : "Storyboard: one picture again";
    const { hold, estimate } = await this.hold(v, stage, userId, label);
    let cost = 0;
    const made = new Map<string, string>();
    const failures: string[] = [];
    const queue = [...indexes];
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        try {
          const r = await this.drawOne(v, i, look, AbortSignal.timeout(120_000));
          cost += r.cost;
          made.set(v.scenes[i].id!, r.fileId);
        } catch (err) {
          cost += err instanceof MediaFailure ? err.costMicroUsd : 0;
          failures.push(`Scene ${i + 1}: ${err instanceof Error ? err.message : "the picture could not be made"}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.opts.concurrency ?? 3, indexes.length) }, worker));
    const latest = await this.locked(v.id, async () => {
      const x = await this.latest(v.id, v);
      for (const s of x.scenes) {
        const file = s.id ? made.get(s.id) : undefined;
        if (file) Object.assign(s, { imageFileId: file, clipFileId: null, own: false, options: null });
      }
      await this.settle(x, stage, hold, estimate, made.size > 0, cost);
      restage(x);
      x.updatedAt = this.now().toISOString();
      await this.opts.store.videos.update(x);
      return x;
    });
    if (failures.length) throw new VideoError("media", `${failures.join(" ")} ${made.size ? "The others are made; press Draw again for the rest." : "Nothing was charged."}`);
    return latest;
  }

  /**
   * Starts making the video: checks it can be made, claims it (one making at
   * a time per video), holds the credits, and returns at once with `done`,
   * which settles when the video is made or has failed. The progress is
   * written to the video at every step, for the screen to poll.
   */
  async beginRender(caller: Principal, workspaceId: string, id: string, input: { voice?: Voice; brand?: BrandLook | null } = {}): Promise<{ video: VideoProject; done: Promise<VideoProject> }> {
    const userId = caller.kind === "user" ? caller.userId : null;
    let voice: Voice = "warm";
    const claimed = await this.locked(id, async () => {
      const v = await this.row(caller, workspaceId, id, "run_agents");
      voice = input.voice ?? v.voice ?? (v.brief ? (v.brief.voiceover ? v.brief.voice : "none") : "warm");
      if (!VOICES.some((x) => x.value === voice)) throw new VideoError("invalid_request", "Pick a voice.");
      if (!isMotion(v) && !v.scenes.every((s) => s.imageFileId)) throw new VideoError("invalid_request", "Every scene needs its picture first.");
      if (isMotion(v) && !this.opts.animate) throw new VideoError("media", "Motion graphics is not set up here.");
      if (rendering(v, this.now())) throw new VideoError("invalid_request", "This video is being made right now. It will be ready in a moment.");
      const at = this.now().toISOString();
      v.voice = voice;
      v.progress = { step: "voice", startedAt: at, at };
      await this.opts.store.videos.update(v);
      return v;
    });
    let hold: Awaited<ReturnType<VideoStudio["hold"]>>;
    try {
      await this.limit(userId, workspaceId);
      hold = await this.hold(claimed, "video", userId, "Video: voiceover and cut");
    } catch (err) {
      await this.locked(id, async () => {
        const v = await this.latest(id, claimed);
        v.progress = null;
        await this.opts.store.videos.update(v);
      });
      throw err;
    }
    return { video: claimed, done: this.runRender(claimed, voice, hold.hold, hold.estimate, input.brand ?? null) };
  }

  /** Makes the video and waits for it: beginRender, then its end. */
  async render(caller: Principal, workspaceId: string, id: string, voice?: Voice, brand?: BrandLook | null): Promise<VideoProject> {
    return (await this.beginRender(caller, workspaceId, id, { voice, brand })).done;
  }

  private async step(id: string, step: RenderStep, error?: string) {
    await this.locked(id, async () => {
      const v = await this.opts.store.videos.get(id);
      if (!v?.progress) return;
      v.progress = { ...v.progress, step, at: this.now().toISOString(), ...(error ? { error } : {}) };
      await this.opts.store.videos.update(v);
    });
  }

  private async runRender(v: VideoProject, voice: Voice, hold: RunCredits | null, estimate: number, brandLook: BrandLook | null): Promise<VideoProject> {
    const { workspaceId, id } = v;
    let cost = 0;
    const kept = new Map<string, Scene["voiceClip"]>();
    try {
      const motion = isMotion(v);
      const brief = v.brief ?? defaultBrief(v.title);
      const brand = brief.brand ? brandLook : null;
      const palette = brand ? brandPalette(brand.colors) : null;
      const images = motion ? [] : await Promise.all(v.scenes.map(async (s) => (await this.opts.files.get(workspaceId, s.imageFileId!))?.bytes ?? null));
      if (!motion && images.some((b) => !b)) throw new MediaFailure("A scene's picture is missing; draw it again.");
      const clips = motion ? [] : await Promise.all(v.scenes.map(async (s) => (s.clipFileId ? ((await this.opts.files.get(workspaceId, s.clipFileId))?.bytes ?? null) : null)));

      // 1. The voice: one clip per scene, so each picture stays exactly as long as its lines take to say. A clip
      // already made for the same words in the same voice is used again, so a remake only records what changed.
      const voiced = await Promise.all(
        v.scenes.map(async (s, i) => {
          const words = s.spoken.trim();
          if (!words || voice === "none") return null;
          const key = voiceKey(voice, words);
          if (s.voiceClip?.key === key) {
            const file = await this.opts.files.get(workspaceId, s.voiceClip.fileId);
            if (file) {
              kept.set(s.id!, s.voiceClip);
              return { bytes: file.bytes, seconds: s.voiceClip.seconds };
            }
          }
          // A clip far longer than its words take was not read as written (the model talked instead): made once more, then refused.
          for (let attempt = 0; attempt < 2; attempt++) {
            const clip = await this.opts.media.speech(words, voice, AbortSignal.timeout(120_000));
            cost += clip.costMicroUsd;
            const seconds = await this.opts.media.duration(clip.bytes, AbortSignal.timeout(30_000));
            if (seconds <= maxSpeechSeconds(words)) {
              const stored = await this.opts.files.put(workspaceId, { name: `voice-${i + 1}.mp3`, mimeType: "audio/mpeg", bytes: clip.bytes });
              kept.set(s.id!, { key, fileId: stored.id, seconds });
              return { bytes: clip.bytes, seconds };
            }
          }
          throw new MediaFailure(`Scene ${i + 1}: the voice did not read the words as written. Make the video again.`);
        }),
      );

      // 2. The scenes: the cut over the pictures, or every frame of the motion graphics.
      await this.step(id, "scenes");
      const held = v.scenes.map((s, i) => Math.min(VIDEO_LIMITS.seconds.max + 10, Math.max(s.seconds, voiced[i] ? Math.ceil((voiced[i]!.seconds + 0.4) * 10) / 10 : 0)));
      const seconds = motion ? held.map((x) => Math.max(x + 0.4, 3)) : held;
      const [W, H] = SIZES[brief.aspect] ?? SIZES["9:16"];
      const captionsOn = brief.captions.on && v.scenes.some((s) => s.spoken.trim());
      const style = styleFor(brief);
      const mp4 = motion
        ? await this.opts.animate!(
            v.scenes.map((s, i) => ({ top: s.text ?? "", bottom: s.bottom ?? "", shape: s.shape ?? "circle", seconds: seconds[i], audio: voiced[i]?.bytes ?? null })),
            { ...motionLook(brief.vibe, brief.aspect, palette?.accent ?? brief.reference?.accent), ...(brief.reference?.bg ? { bg: brief.reference.bg } : {}), ...(brief.reference?.fg ? { fg: brief.reference.fg } : {}) },
            AbortSignal.timeout(300_000),
            { captions: captionsOn },
          )
        : await this.opts.media.cut(
            v.scenes.map((s, i) => ({ image: images[i]!, clip: clips[i], seconds: seconds[i], audio: voiced[i]?.bytes ?? null, headline: s.text })),
            AbortSignal.timeout(240_000),
            { aspect: brief.aspect, motion: style.motion, headline: style.headline, ...(palette?.accent ? { headlineColor: palette.accent } : {}) },
          );

      // 3. The captions over it, timed to each scene's voice (or a reading pace without one), and the end card.
      await this.step(id, "captions");
      const position = motion ? "bottom" : brief.captions.position;
      let start = 0;
      const timed = v.scenes.map((s, i) => {
        const words = s.spoken.trim();
        const speechStart = motion && voiced[i] ? 0.3 : 0;
        const t = { words, start, seconds: seconds[i], speechStart, speechSeconds: voiced[i]?.seconds ?? readingSeconds(words, seconds[i]) };
        start += seconds[i];
        return t;
      });
      const finish: FinishOptions = {
        width: W,
        height: H,
        cues: captionsOn ? videoCues(timed, brief.captions.look, position, W, H) : [],
        captions: captionsOn ? { look: brief.captions.look, position, highlight: palette?.highlight ?? "#FFD84D" } : null,
        card: brand && this.opts.card ? { png: await this.opts.card(brand, W, H), seconds: END_CARD_SECONDS } : null,
      };
      const out = finish.cues.length || finish.card ? await this.opts.media.finish(mp4, finish, AbortSignal.timeout(240_000)) : mp4;
      const stored = await this.opts.files.put(workspaceId, { name: `${slug(v.title)}.mp4`, mimeType: "video/mp4", bytes: out });
      const total = start + (finish.card ? END_CARD_SECONDS : 0);

      return await this.locked(id, async () => {
        const latest = await this.latest(id, v);
        for (const s of latest.scenes) if (s.id && kept.has(s.id) && kept.get(s.id)!.key === voiceKey(voice, s.spoken)) s.voiceClip = kept.get(s.id);
        latest.video = { fileId: stored.id, seconds: Math.round(total), sizeBytes: out.byteLength, voice, at: this.now().toISOString() };
        latest.voice = voice;
        latest.stage = "done";
        latest.progress = { ...(latest.progress ?? { startedAt: this.now().toISOString() }), step: "done", at: this.now().toISOString() };
        await this.settle(latest, "video", hold, estimate, true, cost);
        latest.updatedAt = this.now().toISOString();
        await this.opts.store.videos.update(latest);
        return latest;
      });
    } catch (err) {
      const message = `${err instanceof Error ? err.message : "The video could not be made."} Nothing was charged.`;
      await this.locked(id, async () => {
        const latest = await this.latest(id, v);
        // Voice clips that were made stay with their scenes, so trying again does not record them twice.
        for (const s of latest.scenes) if (s.id && kept.has(s.id) && kept.get(s.id)!.key === voiceKey(voice, s.spoken)) s.voiceClip = kept.get(s.id);
        await this.settle(latest, "video", hold, estimate, false, cost + (err instanceof MediaFailure ? err.costMicroUsd : 0));
        latest.progress = { ...(latest.progress ?? { startedAt: this.now().toISOString() }), step: "failed", at: this.now().toISOString(), error: message };
        latest.updatedAt = this.now().toISOString();
        await this.opts.store.videos.update(latest);
      });
      throw new VideoError("media", message);
    }
  }

  /** Remembers the post pack's two runs on the video, so it shows under the video every time it opens. */
  async setPack(caller: Principal, workspaceId: string, id: string, pack: Omit<PostPack, "at">): Promise<VideoProject> {
    return this.locked(id, async () => {
      const v = await this.row(caller, workspaceId, id, "run_agents");
      v.pack = { ...pack, at: this.now().toISOString() };
      await this.opts.store.videos.update(v);
      return v;
    });
  }

  /** A picture, a picture option, a clip or the video, for members of the video's workspace only. */
  async file(caller: Principal, workspaceId: string, id: string, fileId: string) {
    const v = await this.row(caller, workspaceId, id);
    if (!ownedFiles(v).has(fileId)) throw new VideoError("not_found", "No such file.");
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

/** The scenes a whole-video restyle draws again: not locked and not the person's own photo or clip. */
export function restyleTargets(v: Pick<VideoProject, "scenes">): number[] {
  return v.scenes.map((s, i) => (s.locked || s.own ? -1 : i)).filter((i) => i >= 0);
}

/** Is the video being made right now? A making that has not moved for a while is taken as stopped. */
export function rendering(v: Pick<VideoProject, "progress">, now = new Date()): boolean {
  const p = v.progress;
  return Boolean(p && p.step !== "done" && p.step !== "failed" && now.getTime() - Date.parse(p.at) < RENDER_STALE_MS);
}

/** The stage after a storyboard change: a made video stays made; otherwise it is a storyboard once every scene has a picture. */
function restage(v: VideoProject) {
  if (v.stage === "done") return;
  v.stage = isMotion(v) || v.scenes.every((s) => s.imageFileId) ? "storyboard" : "script";
}

function roomFor(v: VideoProject, n: number) {
  if (v.scenes.length + n > VIDEO_LIMITS.scenes.max) throw new VideoError("invalid_request", `A video has at most ${VIDEO_LIMITS.scenes.max} scenes.`);
}

/** The longest a voice clip of these words may be: a slow reader is about 1.6 words a second, plus room to breathe. */
export function maxSpeechSeconds(words: string): number {
  return words.split(/\s+/).filter(Boolean).length / 1.6 + 2;
}

/** Motion graphics: line animation drawn frame by frame, no pictures. */
export function isMotion(v: Pick<VideoProject, "brief">): boolean {
  return v.brief?.style === "motion" || v.brief?.kind === "minimal";
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
