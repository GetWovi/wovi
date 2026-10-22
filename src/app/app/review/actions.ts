"use server";

import { appCall, type Result } from "@/app/app/actions";
import { accounts } from "@/lib/accounts/server";
import { isRole } from "@/lib/accounts/policy";
import { AppError } from "@/lib/app/api";
import { writeClientFilter } from "@/lib/team/client-filter";
import { appTeam } from "@/lib/team/server";
import type { ItemView, ShareLinkView } from "@/lib/team/team";
import type { ClientRow, CommentRow, Decision, ReviewSettings } from "@/lib/team/types";

/* Every action: origin, session and CSRF checks, then one call to the team service in the session's workspace. */

export async function sendForReview(csrf: string, id: string): Promise<Result<ItemView>> {
  return appCall(csrf, ({ me, workspaceId }) => appTeam().send(me, workspaceId, id), { refresh: "/app" });
}

export async function decideItem(csrf: string, id: string, decision: Decision, note: string): Promise<Result<{ item: ItemView; reRun: string | null }>> {
  return appCall(csrf, ({ me, workspaceId }) => appTeam().decide(me, workspaceId, id, decision, note), { refresh: "/app" });
}

export async function reopenItem(csrf: string, id: string): Promise<Result<ItemView>> {
  return appCall(csrf, ({ me, workspaceId }) => appTeam().reopen(me, workspaceId, id), { refresh: "/app" });
}

export async function assignItem(csrf: string, id: string, userId: string | null): Promise<Result<ItemView>> {
  return appCall(csrf, ({ me, workspaceId }) => appTeam().assign(me, workspaceId, id, userId), { refresh: "/app" });
}

export async function addComment(csrf: string, id: string, body: string, parentId: string | null, internal: boolean): Promise<Result<CommentRow>> {
  return appCall(csrf, ({ me, workspaceId }) => appTeam().comment(me, workspaceId, id, { body, parentId, internal }), { refresh: "/app" });
}

export async function markRead(csrf: string, ids: string[] | "all"): Promise<Result<number>> {
  return appCall(csrf, ({ me, workspaceId }) => appTeam().markRead(me, workspaceId, ids), { refresh: "/app" });
}

export async function saveReviewRules(csrf: string, patch: Partial<Pick<ReviewSettings, "approvers" | "approvalsNeeded" | "autoSubmit" | "emailNotifications">>): Promise<Result<ReviewSettings>> {
  return appCall(csrf, ({ me, workspaceId }) => appTeam().saveSettings(me, workspaceId, patch), { refresh: "/app" });
}

/** A member's role, through the phase 4 rules (nobody hands out a role above their own, the last owner stays). */
export async function setMemberRole(csrf: string, userId: string, role: string): Promise<Result<null>> {
  return appCall(
    csrf,
    async ({ me, workspaceId }) => {
      if (!isRole(role)) throw new AppError("invalid_request", "Pick owner, admin, editor or viewer.");
      await accounts().workspaces.setRole(me, workspaceId, userId, role);
      return null;
    },
    { refresh: "/app" },
  );
}

export async function createClient(csrf: string, input: { name: string; brandBrainIds: string[]; defaultBrandBrainId: string | null }): Promise<Result<ClientRow>> {
  return appCall(csrf, ({ me, workspaceId }) => appTeam().createClient(me, workspaceId, input), { refresh: "/app" });
}

export async function updateClient(csrf: string, id: string, patch: { name?: string; brandBrainIds?: string[]; defaultBrandBrainId?: string | null }): Promise<Result<ClientRow>> {
  return appCall(csrf, ({ me, workspaceId }) => appTeam().updateClient(me, workspaceId, id, patch), { refresh: "/app" });
}

export async function removeClient(csrf: string, id: string): Promise<Result<null>> {
  return appCall(
    csrf,
    async ({ me, workspaceId }) => {
      await appTeam().removeClient(me, workspaceId, id);
      return null;
    },
    { refresh: "/app" },
  );
}

export async function createShareLink(csrf: string, clientId: string, input: { label: string; days: number; canApprove: boolean }): Promise<Result<{ link: ShareLinkView; url: string }>> {
  return appCall(
    csrf,
    async ({ me, workspaceId }) => {
      const made = await appTeam().createShareLink(me, workspaceId, clientId, input);
      return { link: made.link, url: made.url };
    },
    { refresh: "/app" },
  );
}

export async function revokeShareLink(csrf: string, linkId: string): Promise<Result<null>> {
  return appCall(
    csrf,
    async ({ me, workspaceId }) => {
      await appTeam().revokeShareLink(me, workspaceId, linkId);
      return null;
    },
    { refresh: "/app" },
  );
}

/** Works for one client (or all with null): a view filter for the queue, History and the brand pickers. */
export async function setClientFilter(csrf: string, clientId: string | null): Promise<Result<null>> {
  return appCall(
    csrf,
    async ({ me, workspaceId }) => {
      if (clientId && !(await appTeam().clients(me, workspaceId)).some((c) => c.id === clientId)) throw new AppError("not_found", "No such client.");
      await writeClientFilter(workspaceId, clientId);
      return null;
    },
    { refresh: "/app" },
  );
}
