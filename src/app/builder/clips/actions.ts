"use server";

import { revalidatePath } from "next/cache";
import { AccountError } from "@/lib/accounts/errors";
import { builderAction } from "@/lib/builder/server";
import type { ClipEdit, ClipTotals } from "@/lib/clips/library";
import { appClips } from "@/lib/clips/server";
import type { Clip } from "@/lib/clips/types";

export type ClipResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

async function run<T>(csrf: string, fn: (ctx: Awaited<ReturnType<typeof builderAction>>) => Promise<T>, revalidate: string[] = []): Promise<ClipResult<T>> {
  try {
    const ctx = await builderAction(csrf);
    const value = await fn(ctx);
    for (const p of revalidate) revalidatePath(p);
    return { ok: true, value };
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message, code: err.code };
    throw err;
  }
}

/** Polled by the library while clips are being read. */
export async function listClips(csrf: string): Promise<ClipResult<{ clips: Clip[]; totals: ClipTotals }>> {
  return run(csrf, async ({ me }) => {
    const lib = appClips();
    const [clips, totals] = await Promise.all([lib.list(me), lib.totals(me)]);
    return { clips, totals };
  });
}

export async function getClip(csrf: string, id: string): Promise<ClipResult<Clip | null>> {
  return run(csrf, async ({ me }) => (await appClips().get(me, id))?.clip ?? null);
}

export async function updateClip(csrf: string, id: string, edit: ClipEdit): Promise<ClipResult<Clip>> {
  const clean: ClipEdit = {};
  for (const k of ["title", "label", "note", "hook", "transcript", "onScreenText", "description", "platform"] as const) {
    if (edit && edit[k] !== undefined) (clean as Record<string, unknown>)[k] = edit[k];
  }
  return run(csrf, ({ me }) => appClips().update(me, id, clean), ["/builder/clips", `/builder/clips/${id}`]);
}

export async function assignClip(csrf: string, id: string, agentIds: string[]): Promise<ClipResult<{ clip: Clip; added: string[]; problems: string[] }>> {
  return run(csrf, ({ me }) => appClips().assign(me, id, Array.isArray(agentIds) ? agentIds.map(String) : []), ["/builder/clips", `/builder/clips/${id}`]);
}

export async function unassignClip(csrf: string, id: string, agentId: string): Promise<ClipResult<Clip>> {
  return run(csrf, ({ me }) => appClips().unassign(me, id, String(agentId)), ["/builder/clips", `/builder/clips/${id}`]);
}

export async function retryClip(csrf: string, id: string): Promise<ClipResult<Clip>> {
  return run(csrf, ({ me }) => appClips().retry(me, id), ["/builder/clips", `/builder/clips/${id}`]);
}

export async function removeClip(csrf: string, id: string): Promise<ClipResult<null>> {
  return run(
    csrf,
    async ({ me }) => {
      await appClips().remove(me, id);
      return null;
    },
    ["/builder/clips"],
  );
}
