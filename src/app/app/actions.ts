"use server";

import { revalidatePath } from "next/cache";
import { AccountError } from "@/lib/accounts/errors";
import { accounts } from "@/lib/accounts/server";
import { AppError } from "@/lib/app/api";
import { appAction } from "@/lib/app/server";
import { BrandError } from "@/lib/brand/brains";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: string; issues?: string[] };

/** Runs an app call in the session's workspace and turns known errors into a message for the screen. */
export async function appCall<T>(csrf: string, fn: (ctx: Awaited<ReturnType<typeof appAction>>) => Promise<T>, opts: { refresh?: string } = {}): Promise<Result<T>> {
  try {
    const value = await fn(await appAction(csrf));
    if (opts.refresh) revalidatePath(opts.refresh, "layout");
    return { ok: true, value };
  } catch (err) {
    if (err instanceof AppError || err instanceof BrandError) return { ok: false, error: err.message, code: err.code, issues: err.issues };
    if (err instanceof AccountError) return { ok: false, error: err.message, code: err.code };
    throw err;
  }
}

/** Switches the session to another workspace the person belongs to. */
export async function switchWorkspace(csrf: string, workspaceId: string): Promise<Result<null>> {
  return appCall(
    csrf,
    async ({ info }) => {
      await accounts().sessions.switchWorkspace(info.session.id, workspaceId);
      return null;
    },
    { refresh: "/app" },
  );
}
