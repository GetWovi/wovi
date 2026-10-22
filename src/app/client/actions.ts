"use server";

import { revalidatePath } from "next/cache";
import type { Result } from "@/app/app/actions";
import { AccountError } from "@/lib/accounts/errors";
import { checkOrigin } from "@/lib/accounts/server";
import { appTeam } from "@/lib/team/server";
import { TeamError, type ClientItemView } from "@/lib/team/team";
import type { CommentRow } from "@/lib/team/types";

/**
 * The client's side: no account and no session, so the share link token is
 * the credential. Every call checks that the request came from this site and
 * that the link is still open, and reaches only that client's items.
 */
async function clientCall<T>(token: string, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    await checkOrigin();
    const value = await fn();
    revalidatePath(`/client/${token}`, "layout");
    return { ok: true, value };
  } catch (err) {
    if (err instanceof TeamError || err instanceof AccountError) return { ok: false, error: err.message, code: err.code };
    throw err;
  }
}

export async function clientDecide(token: string, id: string, decision: "approve" | "request_changes", note: string): Promise<Result<ClientItemView>> {
  return clientCall(token, () => appTeam().clientDecide(token, id, decision, note));
}

export async function clientComment(token: string, id: string, body: string, parentId: string | null): Promise<Result<CommentRow>> {
  return clientCall(token, () => appTeam().clientComment(token, id, { body, parentId }));
}
