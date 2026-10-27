"use server";

import { redirect } from "next/navigation";
import { AccountError } from "@/lib/accounts/errors";
import { AppError } from "@/lib/app/api";
import { appAction } from "@/lib/app/server";
import { appBrands } from "@/lib/brand/server";
import type { Voice } from "@/lib/video/media";
import { appVideo, videoAllowed } from "@/lib/video/server";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegMedia } from "@/lib/clips/media";
import { RIGHTS_REFUSAL, recordRights, rightsGiven } from "@/lib/safety/rights";
import { appSafetyStore } from "@/lib/safety/server";
import { ASPECTS, KINDS, LENGTHS, VIBES, type Brief } from "@/lib/video/planner";
import { VideoError, type Scene, type VideoProject } from "@/lib/video/studio";

export type VideoResult = { ok: true; video: VideoProject } | { ok: false; error: string };

async function ctx(csrf: string) {
  const c = await appAction(csrf);
  if (!videoAllowed(c.info.user)) throw new VideoError("not_found", "Make a video is not open yet.");
  return c;
}

async function call(csrf: string, fn: (c: Awaited<ReturnType<typeof ctx>>) => Promise<VideoProject>): Promise<VideoResult> {
  try {
    return { ok: true, video: await fn(await ctx(csrf)) };
  } catch (err) {
    if (err instanceof VideoError || err instanceof AccountError || err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}

/** The look the pictures follow: the default Brand Brain's niche and mood board, when there is one. */
async function lookOf(c: Awaited<ReturnType<typeof ctx>>): Promise<string> {
  try {
    const brains = await appBrands().list(c.me, c.workspaceId);
    const b = brains.find((x) => x.isDefault) ?? brains[0];
    if (!b) return "";
    const body = (await appBrands().get(c.me, c.workspaceId, b.id)).body;
    const board = body.moodBoard.map((m) => [m.text, m.note, m.color].filter(Boolean).join(" ")).filter(Boolean);
    return [body.niche, ...board].filter(Boolean).join("; ").slice(0, 600);
  } catch {
    return "";
  }
}

/** The brand's own colour for the glowing dot: the first colour swatch on the default Brand Brain's mood board. */
async function accentOf(c: Awaited<ReturnType<typeof ctx>>): Promise<string | undefined> {
  try {
    const brains = await appBrands().list(c.me, c.workspaceId);
    const b = brains.find((x) => x.isDefault) ?? brains[0];
    if (!b) return undefined;
    const swatch = (await appBrands().get(c.me, c.workspaceId, b.id)).body.moodBoard.find((m) => m.kind === "swatch" && /^#[0-9a-f]{6}$/i.test(m.color ?? ""));
    return swatch?.color ?? undefined;
  } catch {
    return undefined;
  }
}

/** Stage 1 from a pasted script. */
export async function createVideo(csrf: string, input: { title: string; script: string }): Promise<VideoResult> {
  const r = await call(csrf, (c) => appVideo().create(c.me, c.workspaceId, { title: input.title, script: input.script }));
  if (r.ok) redirect(`/app/video/${r.video.id}`);
  return r;
}

/** The brand as material for the plan: the default Brand Brain's name, niche, voice and topics. */
async function brandOf(c: Awaited<ReturnType<typeof ctx>>): Promise<string> {
  try {
    const brains = await appBrands().list(c.me, c.workspaceId);
    const b = brains.find((x) => x.isDefault) ?? brains[0];
    if (!b) return "";
    const body = (await appBrands().get(c.me, c.workspaceId, b.id)).body;
    return [`Name: ${body.name}`, body.niche ? `What they do: ${body.niche}` : "", body.voice.description ? `Voice: ${body.voice.description}` : "", body.topics.length ? `Topics: ${body.topics.join(", ")}` : "", body.dos.length ? `Do: ${body.dos.join(" ")}` : "", body.donts.length ? `Don't: ${body.donts.join(" ")}` : ""]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);
  } catch {
    return "";
  }
}

/** Stage 1 from the guided start: the idea and the answers become a scene plan, then the studio opens on it. */
export async function planVideo(csrf: string, brief: Brief): Promise<VideoResult> {
  const r = await call(csrf, async (c) => {
    const ok = KINDS.some((k) => k.value === brief.kind) || brief.kind === "custom";
    if (!ok || !VIBES.some((v) => v.value === brief.vibe) || !(LENGTHS as readonly number[]).includes(brief.seconds) || !ASPECTS.some((a) => a.value === brief.aspect)) throw new VideoError("invalid_request", "Pick the kind, vibe, length and format.");
    return appVideo().plan(c.me, c.workspaceId, brief, await brandOf(c));
  });
  if (r.ok) redirect(`/app/video/${r.video.id}`);
  return r;
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

/** One scene's picture, so the storyboard fills in scene by scene. */
export async function drawScene(csrf: string, id: string, index: number): Promise<VideoResult> {
  return call(csrf, async (c) => appVideo().drawScene(c.me, c.workspaceId, id, index, await lookOf(c)));
}

export async function addScene(csrf: string, id: string, after: number): Promise<VideoResult> {
  return call(csrf, (c) => appVideo().addScene(c.me, c.workspaceId, id, after));
}

export async function removeScene(csrf: string, id: string, index: number): Promise<VideoResult> {
  return call(csrf, (c) => appVideo().removeScene(c.me, c.workspaceId, id, index));
}

/** Stage 1 from a Script Writer result: its sections become the scenes. */
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

export async function editScene(csrf: string, id: string, index: number, edit: Partial<Pick<Scene, "spoken" | "onScreen" | "text" | "bottom" | "shape" | "seconds">>): Promise<VideoResult> {
  return call(csrf, (c) => appVideo().editScene(c.me, c.workspaceId, id, index, edit));
}

/** Stage 2. */
export async function drawStoryboard(csrf: string, id: string): Promise<VideoResult> {
  return call(csrf, async (c) => appVideo().storyboard(c.me, c.workspaceId, id, await lookOf(c)));
}

/** Stage 3: one picture again. */
export async function redrawScene(csrf: string, id: string, index: number): Promise<VideoResult> {
  return call(csrf, async (c) => appVideo().redraw(c.me, c.workspaceId, id, index, await lookOf(c)));
}

/** Stage 4. */
export async function renderVideo(csrf: string, id: string, voice: Voice): Promise<VideoResult> {
  return call(csrf, async (c) => appVideo().render(c.me, c.workspaceId, id, voice, await accentOf(c)));
}
