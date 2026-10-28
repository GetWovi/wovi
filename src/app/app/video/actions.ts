"use server";

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { AccountError } from "@/lib/accounts/errors";
import { AppError } from "@/lib/app/api";
import { appAction } from "@/lib/app/server";
import { appBrands } from "@/lib/brand/server";
import type { BrainBody } from "@/lib/brand/types";
import { ffmpegMedia } from "@/lib/clips/media";
import { RIGHTS_REFUSAL, recordRights, rightsGiven } from "@/lib/safety/rights";
import { appSafetyStore } from "@/lib/safety/server";
import type { Voice } from "@/lib/video/media";
import { startPostPack } from "@/lib/video/pack";
import { normalizeBrief, type Brief, type Reference } from "@/lib/video/planner";
import type { Proposal } from "@/lib/video/proposal";
import { REFERENCE_ESTIMATE_MICRO_USD, readReference } from "@/lib/video/reference";
import { appVideo, videoAllowed } from "@/lib/video/server";
import { VideoError, type Scene, type VideoPrices, type VideoProject } from "@/lib/video/studio";
import type { BrandLook, Captions, VideoStyle } from "@/lib/video/styles";

/** The video after a change, with every price the storyboard shows worked out again for it. */
export type VideoResult = { ok: true; video: VideoProject; prices: VideoPrices } | { ok: false; error: string };

async function ctx(csrf: string) {
  const c = await appAction(csrf);
  if (!videoAllowed(c.info.user)) throw new VideoError("not_found", "Make a video is not open yet.");
  return c;
}
type Ctx = Awaited<ReturnType<typeof ctx>>;

const known = (err: unknown) => err instanceof VideoError || err instanceof AccountError || err instanceof AppError;

async function call(csrf: string, fn: (c: Ctx) => Promise<VideoProject>): Promise<VideoResult> {
  try {
    const video = await fn(await ctx(csrf));
    return { ok: true, video, prices: appVideo().prices(video) };
  } catch (err) {
    if (known(err)) return { ok: false, error: (err as Error).message };
    throw err;
  }
}

/** The default Brand Brain's body, when the workspace has one. */
async function brainOf(c: Ctx): Promise<{ id: string; body: BrainBody } | null> {
  try {
    const brains = await appBrands().list(c.me, c.workspaceId);
    const b = brains.find((x) => x.isDefault) ?? brains[0];
    if (!b) return null;
    return { id: b.id, body: (await appBrands().get(c.me, c.workspaceId, b.id)).body };
  } catch {
    return null;
  }
}

/** The look the pictures follow: the default Brand Brain's niche and mood board, when there is one. */
async function lookOf(c: Ctx): Promise<string> {
  const body = (await brainOf(c))?.body;
  if (!body) return "";
  const board = body.moodBoard.map((m) => [m.text, m.note, m.color].filter(Boolean).join(" ")).filter(Boolean);
  return [body.niche, ...board].filter(Boolean).join("; ").slice(0, 600);
}

/** The brand as material for the plan and the proposal: the default Brand Brain's name, niche, voice and topics. */
async function brandOf(c: Ctx): Promise<string> {
  const body = (await brainOf(c))?.body;
  if (!body) return "";
  return [`Name: ${body.name}`, body.niche ? `What they do: ${body.niche}` : "", body.voice.description ? `Voice: ${body.voice.description}` : "", body.topics.length ? `Topics: ${body.topics.join(", ")}` : "", body.dos.length ? `Do: ${body.dos.join(" ")}` : "", body.donts.length ? `Don't: ${body.donts.join(" ")}` : ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
}

/**
 * The brand for the video itself: its name, its colour swatches (on the
 * words and the shapes) and its logo for the end card: a mood board image
 * whose note or file name says "logo".
 */
async function brandLookOf(c: Ctx): Promise<BrandLook | null> {
  const body = (await brainOf(c))?.body;
  if (!body) return null;
  const colors = body.moodBoard.filter((m) => m.kind === "swatch" && /^#[0-9a-f]{6}$/i.test(m.color ?? "")).map((m) => m.color!);
  const item = body.moodBoard.find((m) => m.kind === "image" && m.file && /logo/i.test(`${m.note} ${m.text ?? ""} ${m.file.name}`));
  let logo: BrandLook["logo"] = null;
  if (item?.file && ["image/png", "image/jpeg", "image/webp"].includes(item.file.mimeType)) {
    const f = await appBrands().getFile(c.me, c.workspaceId, item.file.id).catch(() => null);
    if (f) logo = { bytes: f.bytes, mimeType: f.meta.mimeType };
  }
  return { name: body.name, colors, logo };
}

/** From a pasted script. */
export async function createVideo(csrf: string, input: { title: string; script: string }): Promise<VideoResult> {
  const r = await call(csrf, (c) => appVideo().create(c.me, c.workspaceId, { title: input.title, script: input.script }));
  if (r.ok) redirect(`/app/video/${r.video.id}`);
  return r;
}

/** The AI's proposal for an idea: the settings, one sentence, why, and at most two questions. Free. */
export async function proposeVideo(csrf: string, input: { idea: string; reference: Reference | null }): Promise<{ ok: true; proposal: Proposal; fallback: boolean; hasBrand: boolean } | { ok: false; error: string }> {
  try {
    const c = await ctx(csrf);
    const reference = input.reference ? normalizeBrief({ reference: input.reference })?.reference ?? null : null;
    const brand = await brandOf(c);
    const r = await appVideo().propose(c.me, c.workspaceId, { idea: String(input.idea ?? ""), reference, brand });
    return { ok: true, proposal: r.proposal, fallback: r.fallback, hasBrand: Boolean(brand) };
  } catch (err) {
    if (known(err)) return { ok: false, error: (err as Error).message };
    throw err;
  }
}

/** The plan from the idea and the confirmed settings. The screen opens the storyboard after placing any own photos. */
export async function planVideo(csrf: string, raw: Brief): Promise<VideoResult> {
  return call(csrf, async (c) => {
    const brief = normalizeBrief(raw);
    if (!brief) throw new VideoError("invalid_request", "Pick the settings first.");
    if (brief.reference) brief.reference.style = brief.reference.style.slice(0, 400);
    // Version 2 never sends a kind; an old one is not taken from a form.
    delete brief.kind;
    delete brief.customKind;
    return appVideo().plan(c.me, c.workspaceId, brief, await brandOf(c));
  });
}

const OWN_IMAGES = ["image/jpeg", "image/png", "image/webp"];
const OWN_CLIPS = ["video/mp4", "video/quicktime", "video/webm"];
const OWN_MAX_MB = 40;

/**
 * The person's own photo or clip for one scene. The rights box is required
 * and kept, like every upload. A clip is checked with ffmpeg (a real video,
 * at most two minutes) and its first second becomes the panel's poster.
 */
export async function sendOwnMedia(csrf: string, id: string, index: number, form: FormData): Promise<VideoResult> {
  return call(csrf, async (c) => {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new VideoError("invalid_request", "Pick a photo or a clip first.");
    if (!rightsGiven(form)) throw new VideoError("invalid_request", RIGHTS_REFUSAL);
    if (file.size > OWN_MAX_MB * 1024 * 1024) throw new VideoError("invalid_request", `At most ${OWN_MAX_MB} MB. Trim the clip or send a smaller one.`);
    const type = file.type.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "own";
    let image: { name: string; mimeType: string; bytes: Uint8Array };
    let clip: { name: string; mimeType: string; bytes: Uint8Array } | null = null;
    if (OWN_IMAGES.includes(type)) image = { name, mimeType: type, bytes };
    else if (OWN_CLIPS.includes(type)) {
      const dir = mkdtempSync(join(tmpdir(), "wovi-own-"));
      try {
        writeFileSync(join(dir, "in"), bytes);
        const media = ffmpegMedia();
        const probe = await media.probe(join(dir, "in")).catch(() => null);
        if (!probe || !probe.width) throw new VideoError("invalid_request", "That clip could not be read. Send an MP4 or MOV.");
        if (probe.durationSec > 120) throw new VideoError("invalid_request", "Clips can be at most two minutes. Trim it first.");
        await media.frame(join(dir, "in"), Math.min(1, probe.durationSec / 2), join(dir, "poster.jpg"), 1280);
        image = { name: `${name}-poster.jpg`, mimeType: "image/jpeg", bytes: new Uint8Array(readFileSync(join(dir, "poster.jpg"))) };
        clip = { name, mimeType: type, bytes };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    } else throw new VideoError("invalid_request", "Send a JPG, PNG or WebP photo, or an MP4, MOV or WebM clip.");
    const v = await appVideo().useOwnMedia(c.me, c.workspaceId, id, index, { image, clip });
    const scene = v.scenes[index];
    await recordRights(appSafetyStore(), { workspaceId: c.workspaceId, userId: c.me.kind === "user" ? c.me.userId : "api", subject: "video_scene", fileId: scene.clipFileId ?? scene.imageFileId!, fileName: name });
    return v;
  });
}

/**
 * "Make it like this": reads the style of the person's reference video (a
 * small paid job). Only the style comes back; the clip is not kept.
 */
export async function readReferenceVideo(csrf: string, form: FormData): Promise<{ ok: true; reference: Reference } | { ok: false; error: string }> {
  try {
    const c = await ctx(csrf);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new VideoError("invalid_request", "Pick your reference video first.");
    if (!rightsGiven(form)) throw new VideoError("invalid_request", "Tick the box to confirm you may use this video as a reference.");
    if (file.size > OWN_MAX_MB * 1024 * 1024) throw new VideoError("invalid_request", `At most ${OWN_MAX_MB} MB.`);
    if (!OWN_CLIPS.includes(file.type.toLowerCase())) throw new VideoError("invalid_request", "Send an MP4, MOV or WebM video.");
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new VideoError("media", "Reading a reference is not set up on this server.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const reference = await appVideo().paidJob(c.me, c.workspaceId, "Video: read your reference", REFERENCE_ESTIMATE_MICRO_USD, async () => {
      const r = await readReference(bytes, key, AbortSignal.timeout(120_000));
      return { value: r.reference, costMicroUsd: r.costMicroUsd };
    });
    return { ok: true, reference };
  } catch (err) {
    if (known(err)) return { ok: false, error: (err as Error).message };
    throw err;
  }
}

/** One scene's picture, so the storyboard fills in scene by scene. */
export async function drawScene(csrf: string, id: string, index: number): Promise<VideoResult> {
  return call(csrf, async (c) => appVideo().drawScene(c.me, c.workspaceId, id, index, await lookOf(c)));
}

/** "Draw again": two new pictures to pick from. */
export async function drawOptions(csrf: string, id: string, index: number): Promise<VideoResult> {
  return call(csrf, async (c) => appVideo().drawOptions(c.me, c.workspaceId, id, index, await lookOf(c)));
}

export async function pickOption(csrf: string, id: string, index: number, which: number): Promise<VideoResult> {
  return call(csrf, (c) => appVideo().pickOption(c.me, c.workspaceId, id, index, which));
}

/** Another style for the whole video, or for one scene when `index` is given. */
export async function restyleVideo(csrf: string, id: string, style: VideoStyle, index?: number): Promise<VideoResult> {
  return call(csrf, async (c) => appVideo().restyle(c.me, c.workspaceId, id, style, await lookOf(c), index));
}

/** The storyboard's arrange actions, each one undoable. */
export async function arrangeScene(csrf: string, id: string, action: "add" | "remove" | "duplicate" | "split" | "merge" | "lock" | "unlock" | "move", index: number, to = 0): Promise<VideoResult> {
  return call(csrf, (c) => {
    const s = appVideo();
    switch (action) {
      case "add":
        return s.addScene(c.me, c.workspaceId, id, index);
      case "remove":
        return s.removeScene(c.me, c.workspaceId, id, index);
      case "duplicate":
        return s.duplicateScene(c.me, c.workspaceId, id, index);
      case "split":
        return s.splitScene(c.me, c.workspaceId, id, index);
      case "merge":
        return s.mergeScenes(c.me, c.workspaceId, id, index);
      case "lock":
      case "unlock":
        return s.lockScene(c.me, c.workspaceId, id, index, action === "lock");
      case "move":
        return s.moveScene(c.me, c.workspaceId, id, index, to);
      default:
        throw new VideoError("invalid_request", "No such change.");
    }
  });
}

export async function undoChange(csrf: string, id: string): Promise<VideoResult> {
  return call(csrf, (c) => appVideo().undo(c.me, c.workspaceId, id));
}

export async function editScene(csrf: string, id: string, index: number, edit: Partial<Pick<Scene, "spoken" | "onScreen" | "text" | "bottom" | "shape" | "seconds">>): Promise<VideoResult> {
  return call(csrf, (c) => appVideo().editScene(c.me, c.workspaceId, id, index, edit));
}

/** The voice, the captions and the Brand Brain switch, from the storyboard. */
export async function updateVideoSettings(csrf: string, id: string, patch: { voice?: Voice; captions?: Partial<Captions>; brand?: boolean }): Promise<VideoResult> {
  return call(csrf, (c) => appVideo().updateSettings(c.me, c.workspaceId, id, patch));
}

/** From a Script Writer result: its sections become the scenes. */
export async function videoFromRun(csrf: string, runId: string): Promise<VideoResult> {
  const r = await call(csrf, async (c) => {
    const view = await c.api.run(c.me, c.workspaceId, runId);
    const out = view?.run.output;
    if (!out || out.kind !== "script") throw new VideoError("invalid_request", "Start from a Script Writer result.");
    const scenes: Omit<Scene, "imageFileId">[] = out.sections.map((s) => ({ spoken: s.spoken, onScreen: s.on_screen, seconds: s.seconds }));
    const first = view.run.inputs.idea ?? view.run.inputs.topic;
    return appVideo().create(c.me, c.workspaceId, { title: typeof first === "string" ? first.slice(0, 80) : "", scenes, fromRunId: runId });
  });
  if (r.ok) redirect(`/app/video/${r.video.id}`);
  return r;
}

/**
 * Starts making the video and answers at once: the voice, the scenes and the
 * captions run after the answer, and the screen follows them on the status
 * route (status/route.ts).
 */
export async function renderVideo(csrf: string, id: string, voice?: Voice): Promise<VideoResult> {
  return call(csrf, async (c) => {
    const { video, done } = await appVideo().beginRender(c.me, c.workspaceId, id, { voice, brand: await brandLookOf(c) });
    after(() => done.catch(() => undefined));
    return video;
  });
}

/**
 * The ready-to-post pack: Caption Writer and Hashtag Optimizer runs from the
 * script, through the normal app API, never charged more than the prices the
 * button showed.
 */
export async function makePostPack(csrf: string, id: string, quoted: { captions?: number; hashtags?: number }): Promise<VideoResult> {
  return call(csrf, async (c) => {
    const v = await appVideo().get(c.me, c.workspaceId, id);
    if (v.stage !== "done" || !v.video) throw new VideoError("invalid_request", "Make the video first.");
    const brain = v.brief?.brand === false ? null : await brainOf(c);
    const r = await startPostPack(c.api, c.me, c.workspaceId, v, { brandBrainId: brain?.id ?? null, quoted });
    const saved = await appVideo().setPack(c.me, c.workspaceId, id, { captionRunId: r.captionRunId, hashtagRunId: r.hashtagRunId, platform: r.platform });
    if (r.error) throw new VideoError("media", `The captions are on their way, but the tags could not start: ${r.error}`);
    return saved;
  });
}
