"use server";

import { revalidatePath } from "next/cache";
import { AccountError } from "@/lib/accounts/errors";
import { PLATFORM_CREATOR_ID, PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { Bump } from "@/lib/agents/semver";
import { builderAction } from "@/lib/builder/server";
import { PipelineError } from "@/lib/pipelines/errors";
import type { PipelineUpdateInput } from "@/lib/pipelines/registry";
import { appPipelines } from "@/lib/pipelines/server";
import { PIPELINE_TEMPLATES } from "@/lib/pipelines/templates";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: string; issues?: string[] };

/** Runs a builder change on the platform's pipelines and turns known errors into a message for the screen. */
async function run<T>(csrf: string, id: string | null, fn: (ctx: Awaited<ReturnType<typeof builderAction>>) => Promise<T>): Promise<Result<T>> {
  try {
    const ctx = await builderAction(csrf);
    const value = await fn(ctx);
    revalidatePath("/builder/pipelines");
    if (id) revalidatePath(`/builder/pipelines/${id}`);
    return { ok: true, value };
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message, code: err.code };
    if (err instanceof PipelineError) return { ok: false, error: err.message.split("\n")[0], code: err.code, issues: err.issues };
    throw err;
  }
}

/** Saves the body as a new version. */
export async function savePipeline(csrf: string, id: string, changes: PipelineUpdateInput, opts: { bump?: Bump; note?: string }): Promise<Result<{ version: string }>> {
  return run(csrf, id, async ({ me }) => {
    const bump = opts.bump && ["patch", "minor", "major"].includes(opts.bump) ? opts.bump : "patch";
    const note = typeof opts.note === "string" && opts.note.trim() ? opts.note.trim().slice(0, 200) : undefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { version, ...rest } = changes as PipelineUpdateInput & { version?: string };
    const saved = await appPipelines().update(me, PLATFORM_WORKSPACE_ID, id, rest, { bump, note });
    return { version: saved.version };
  });
}

export async function setPipelineStatus(csrf: string, id: string, status: "live" | "draft"): Promise<Result<{ status: string }>> {
  return run(csrf, id, async ({ me }) => {
    if (status !== "live" && status !== "draft") throw new AccountError("invalid_request", "Unknown status.");
    return { status: (await appPipelines().setStatus(me, PLATFORM_WORKSPACE_ID, id, status)).status };
  });
}

/** A new draft pipeline: a copy of a template, or one Caption Writer step to start from. */
export async function createPipeline(csrf: string, input: { id: string; name: string; from: string }): Promise<Result<{ id: string }>> {
  return run(csrf, null, async ({ me }) => {
    const base = PIPELINE_TEMPLATES.find((t) => t.id === input.from) ?? PIPELINE_TEMPLATES.find((t) => t.id === "caption-and-tags")!;
    const blank = input.from === "blank";
    const made = await appPipelines().create(
      me,
      PLATFORM_WORKSPACE_ID,
      {
        ...structuredClone(base),
        id: String(input.id ?? "").trim(),
        name: String(input.name ?? "").trim(),
        version: "1.0.0",
        ...(blank ? { steps: [base.steps![0]], package: [base.package![0]], job: "Describe the whole job in one line." } : {}),
        owner: { kind: "platform", creatorId: PLATFORM_CREATOR_ID },
        status: "draft",
        visibility: "public",
      },
      { note: blank ? "New pipeline" : `Copied from ${base.name}` },
    );
    return { id: made.id };
  });
}
