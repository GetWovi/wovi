"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/account/ActionForm";
import { AccountError } from "@/lib/accounts/errors";
import { RegistryError, type CreateInput, type UpdateInput } from "@/lib/agents/registry";
import type { Bump } from "@/lib/agents/semver";
import type { AgentSpec } from "@/lib/agents/spec";
import type { DraftResult } from "@/lib/builder/drafter";
import { builderAction } from "@/lib/builder/server";
import type { FileKind, StoredFile } from "@/lib/builder/storage";
import type { BoardItem, BoardKind, Sample, SampleLabel } from "@/lib/builder/types";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; issues?: string[] };

/** Runs a builder change and turns known errors into a message for the screen. */
async function run<T>(csrf: string, agentId: string | null, fn: (ctx: Awaited<ReturnType<typeof builderAction>>) => Promise<T>): Promise<Result<T>> {
  try {
    const ctx = await builderAction(csrf);
    const value = await fn(ctx);
    revalidatePath("/builder");
    if (agentId) revalidatePath(`/builder/agents/${agentId}`);
    return { ok: true, value };
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    if (err instanceof RegistryError) return { ok: false, error: err.message.split("\n")[0], issues: err.issues };
    throw err;
  }
}

/* ---------- Drafting ---------- */

export async function draftAgent(csrf: string, description: string): Promise<Result<DraftResult>> {
  return run(csrf, null, ({ builder, me }) => builder.draft(me, description));
}

export async function createAgent(csrf: string, spec: CreateInput): Promise<Result<{ id: string }>> {
  return run(csrf, null, async ({ builder, me }) => {
    const created = await builder.createAgent(me, spec);
    return { id: created.id };
  });
}

/* ---------- The editor ---------- */

export async function saveAgent(csrf: string, id: string, changes: UpdateInput, opts: { bump?: Bump; note?: string }): Promise<Result<{ version: string }>> {
  return run(csrf, id, async ({ builder, me }) => {
    const bump = opts.bump && ["patch", "minor", "major"].includes(opts.bump) ? opts.bump : "patch";
    const note = typeof opts.note === "string" && opts.note.trim() ? opts.note.trim().slice(0, 200) : undefined;
    const saved = await builder.saveAgent(me, id, changes, { bump, note });
    return { version: saved.version };
  });
}

export type StatusAction = "publish" | "unpublish" | "hide" | "unhide";

export async function setAgentStatus(csrf: string, id: string, action: StatusAction): Promise<Result<{ status: AgentSpec["status"] }>> {
  return run(csrf, id, async ({ builder, me }) => {
    const fn = { publish: builder.publish, unpublish: builder.unpublish, hide: builder.hide, unhide: builder.unhide }[action];
    if (!fn) throw new AccountError("invalid_request", "Unknown action.");
    const spec = await fn.call(builder, me, id);
    return { status: spec.status };
  });
}

/* ---------- Files ---------- */

/** A multipart form with `kind` and `file`. Returns the stored file's metadata. */
export async function uploadFile(csrf: string, formData: FormData): Promise<Result<StoredFile>> {
  return run(csrf, null, async ({ builder, me }) => {
    const kind = String(formData.get("kind") ?? "") as FileKind;
    if (kind !== "image" && kind !== "text") throw new AccountError("invalid_request", "Unknown file kind.");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AccountError("invalid_request", "Pick a file first.");
    return builder.putFile(me, kind, { name: file.name, mimeType: file.type || "application/octet-stream", bytes: new Uint8Array(await file.arrayBuffer()) });
  });
}

/* ---------- Samples ---------- */

export type SampleForm = {
  label: SampleLabel;
  title: string;
  inputs: Record<string, unknown>;
  idealOutput: string;
  note: string;
  links: string[];
  fileIds: string[];
};

export async function addSample(csrf: string, agentId: string, form: SampleForm): Promise<Result<Sample>> {
  return run(csrf, agentId, ({ builder, me }) => builder.addSample(me, agentId, form));
}

export async function removeSample(csrf: string, agentId: string, sampleId: string): Promise<Result<null>> {
  return run(csrf, agentId, async ({ builder, me }) => {
    await builder.removeSample(me, agentId, sampleId);
    return null;
  });
}

/* ---------- Mood board ---------- */

export type BoardForm = { kind: BoardKind; note: string; url?: string; text?: string; color?: string; fileId?: string };

export async function addBoardItem(csrf: string, agentId: string, form: BoardForm): Promise<Result<BoardItem>> {
  return run(csrf, agentId, ({ builder, me }) => builder.addBoardItem(me, agentId, form));
}

export async function removeBoardItem(csrf: string, agentId: string, itemId: string): Promise<Result<null>> {
  return run(csrf, agentId, async ({ builder, me }) => {
    await builder.removeBoardItem(me, agentId, itemId);
    return null;
  });
}

export type { ActionState };
