"use server";

import { redirect } from "next/navigation";
import { AccountError } from "@/lib/accounts/errors";
import { appAction } from "@/lib/app/server";
import { appBrands } from "@/lib/brand/server";
import type { Voice } from "@/lib/video/media";
import { appVideo, videoAllowed } from "@/lib/video/server";
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
    if (err instanceof VideoError || err instanceof AccountError) return { ok: false, error: err.message };
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

/** Stage 1 from a pasted script. */
export async function createVideo(csrf: string, input: { title: string; script: string }): Promise<VideoResult> {
  const r = await call(csrf, (c) => appVideo().create(c.me, c.workspaceId, { title: input.title, script: input.script }));
  if (r.ok) redirect(`/app/video/${r.video.id}`);
  return r;
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

export async function editScene(csrf: string, id: string, index: number, edit: Partial<Pick<Scene, "spoken" | "onScreen" | "seconds">>): Promise<VideoResult> {
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
  return call(csrf, (c) => appVideo().render(c.me, c.workspaceId, id, voice));
}
