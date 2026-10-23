"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { ActionState } from "@/components/account/ActionForm";
import type { Principal } from "@/lib/accounts/accounts";
import { AccountError } from "@/lib/accounts/errors";
import type { KeyRole } from "@/lib/accounts/api-keys";
import type { Role } from "@/lib/accounts/policy";
import { SESSION_COOKIE, accounts, actionSession, clearSessionCookie } from "@/lib/accounts/server";
import type { SessionInfo } from "@/lib/accounts/sessions";
import { tokenServices } from "@/lib/token/local";
import { PrivacyError } from "@/lib/privacy/privacy";
import { appPrivacy } from "@/lib/safety/server";

/** A person's $WOVI holder status, read again after their wallets change (phase 17). Never fails the action. */
async function recheckHolder(userId: string) {
  const s = tokenServices();
  if (s.config.holder.on) await s.holders.refreshUser(userId).catch(() => false);
}

type Ctx = SessionInfo & { me: Principal; ws: string };

/** Checks origin, session and CSRF, runs the change, refreshes the page, and turns account errors into a message. */
async function act(formData: FormData | string, fn: (ctx: Ctx) => Promise<ActionState | string | void>): Promise<ActionState> {
  try {
    const info = await actionSession(formData);
    const result = await fn({ ...info, me: { kind: "user", userId: info.user.id }, ws: info.session.workspaceId });
    revalidatePath("/account");
    return typeof result === "string" ? { ok: result } : (result ?? null);
  } catch (err) {
    if (err instanceof AccountError) return { error: err.message };
    throw err;
  }
}

const field = (fd: FormData, name: string) => String(fd.get(name) ?? "");

/* ---------- Sessions ---------- */

export async function signOut(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const state = await act(fd, async () => {
    await accounts().sessions.signOut((await cookies()).get(SESSION_COOKIE)?.value);
  });
  if (state?.error) return state;
  await clearSessionCookie();
  redirect("/sign-in");
}

export async function signOutEverywhere(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const state = await act(fd, async ({ user }) => {
    await accounts().sessions.signOutEverywhere(user.id);
  });
  if (state?.error) return state;
  await clearSessionCookie();
  redirect("/sign-in");
}

/* ---------- Workspaces ---------- */

export async function switchWorkspace(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ session }) => {
    await accounts().sessions.switchWorkspace(session.id, field(fd, "workspace"));
  });
}

export async function createWorkspace(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ me, session }) => {
    const ws = await accounts().workspaces.create(me, field(fd, "name"));
    await accounts().sessions.switchWorkspace(session.id, ws.id);
  });
}

export async function renameWorkspace(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ me, ws }) => {
    await accounts().workspaces.rename(me, ws, field(fd, "name"));
    return "Saved.";
  });
}

export async function leaveWorkspace(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ user, ws }) => {
    await accounts().workspaces.leave(user.id, ws);
  });
}

/* ---------- Members and invites ---------- */

export async function setRole(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ me, ws }) => {
    await accounts().workspaces.setRole(me, ws, field(fd, "userId"), field(fd, "role") as Role);
    return "Role changed.";
  });
}

export async function removeMember(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ me, ws }) => {
    await accounts().workspaces.removeMember(me, ws, field(fd, "userId"));
  });
}

export async function invite(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ me, ws }) => {
    const sent = await accounts().workspaces.invite(me, ws, field(fd, "email"), field(fd, "role") as Role);
    return `Invite sent to ${sent.email}.`;
  });
}

export async function revokeInvite(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ me, ws }) => {
    await accounts().workspaces.revokeInvite(me, ws, field(fd, "inviteId"));
  });
}

/* ---------- API keys ---------- */

export async function createApiKey(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ me, ws }) => {
    const { key } = await accounts().apiKeys.create(me, ws, { name: field(fd, "name"), role: field(fd, "role") as KeyRole });
    return { ok: "Copy this key now. It is not shown again.", secret: key };
  });
}

export async function revokeApiKey(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ me, ws }) => {
    await accounts().apiKeys.revoke(me, ws, field(fd, "keyId"));
  });
}

/* ---------- Passkeys ---------- */

export async function passkeyRegisterOptions(csrf: string): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON } | { error: string }> {
  let out: { challengeId: string; options: PublicKeyCredentialCreationOptionsJSON } | null = null;
  const state = await act(csrf, async ({ user }) => {
    out = await accounts().passkeys.registrationOptions(user.id);
  });
  return out ?? { error: state?.error ?? "Could not start." };
}

export async function passkeyRegister(csrf: string, challengeId: string, response: RegistrationResponseJSON, name: string): Promise<ActionState> {
  return act(csrf, async ({ user }) => {
    await accounts().passkeys.verifyRegistration(user.id, challengeId, response, name);
    return "Passkey added.";
  });
}

export async function removePasskey(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ user }) => {
    await accounts().passkeys.remove(user.id, field(fd, "passkeyId"));
  });
}

/* ---------- Wallets ---------- */

export async function walletMessage(csrf: string, address: string, chainId: number): Promise<{ challengeId: string; message: string } | { error: string }> {
  let out: { challengeId: string; message: string } | null = null;
  const state = await act(csrf, async ({ user }) => {
    out = await accounts().wallets.linkMessage(user.id, address, chainId);
  });
  return out ?? { error: state?.error ?? "Could not start." };
}

export async function walletLink(csrf: string, challengeId: string, signature: string): Promise<ActionState> {
  return act(csrf, async ({ user }) => {
    await accounts().wallets.verifyLink(user.id, challengeId, signature);
    await recheckHolder(user.id);
    return "Wallet linked.";
  });
}

export async function unlinkWallet(_prev: ActionState, fd: FormData) {
  return act(fd, async ({ user }) => {
    await accounts().wallets.unlink(user.id, field(fd, "address"));
    await recheckHolder(user.id);
  });
}

/* ---------- Your data (phase 18) ---------- */

/** "Use my edits to improve agents": on or off, as easy either way. */
export async function setImproveConsent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return act(fd, async ({ user }) => {
    const on = field(fd, "on") === "yes";
    await appPrivacy().setConsent(user.id, on);
    return on ? "On. Builders may read your notes and drafts from now on." : "Off. Your notes and drafts are no longer shown to builders.";
  });
}

/** Deletes the account after the person typed their email, then signs them out. */
export async function deleteMyAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let done = false;
  const state = await act(fd, async ({ user }) => {
    try {
      await appPrivacy().deleteAccount(user.id, field(fd, "confirm"));
      done = true;
    } catch (err) {
      if (err instanceof PrivacyError) return { error: err.issues.length ? err.issues.map((i) => i.replace(/^confirm: /, "")).join(" ") : err.message };
      throw err;
    }
  });
  if (!done) return state;
  await clearSessionCookie();
  redirect("/?account=deleted");
}
