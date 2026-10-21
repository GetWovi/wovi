"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/components/account/ActionForm";
import { AccountError } from "@/lib/accounts/errors";
import { accounts, actionSession } from "@/lib/accounts/server";

/** Joins the invited workspace and makes it the current one. */
export async function acceptInvite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const info = await actionSession(formData);
    const ws = await accounts().workspaces.acceptInvite(info.user.id, String(formData.get("token") ?? ""));
    await accounts().sessions.switchWorkspace(info.session.id, ws.id);
  } catch (err) {
    if (err instanceof AccountError) return { error: err.message };
    throw err;
  }
  redirect("/account");
}
