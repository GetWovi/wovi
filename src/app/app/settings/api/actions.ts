"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/account/ActionForm";
import type { Principal } from "@/lib/accounts/accounts";
import type { KeyRole } from "@/lib/accounts/api-keys";
import { accounts, actionSession } from "@/lib/accounts/server";
import { appWebhooks } from "@/lib/api/server";
import type { WebhookInputError } from "@/lib/webhooks/webhooks";

type Ctx = { me: Principal; ws: string };

/** Origin, session and CSRF, then the change; errors come back as a message under the form. */
async function act(fd: FormData, fn: (ctx: Ctx) => Promise<ActionState | string | void>): Promise<ActionState> {
  try {
    const info = await actionSession(fd);
    const result = await fn({ me: { kind: "user", userId: info.user.id }, ws: info.session.workspaceId });
    revalidatePath("/app/settings/api");
    revalidatePath("/app/settings/webhooks");
    revalidatePath("/account");
    return typeof result === "string" ? { ok: result } : (result ?? null);
  } catch (err) {
    // By name: the services are shared per process and may come from another bundle's copy of the class.
    if (err instanceof Error && err.name === "AccountError") return { error: err.message };
    if (err instanceof Error && err.name === "WebhookInputError") return { error: (err as WebhookInputError).issues.map((i) => i.message).join(" ") };
    throw err;
  }
}

const field = (fd: FormData, name: string) => String(fd.get(name) ?? "");

/* ---------- API keys ---------- */

export async function createKey(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return act(fd, async ({ me, ws }) => {
    const { key } = await accounts().apiKeys.create(me, ws, { name: field(fd, "name"), role: field(fd, "role") as KeyRole });
    return { ok: "Copy this key now. It is not shown again.", secret: key };
  });
}

export async function revokeKey(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return act(fd, async ({ me, ws }) => {
    await accounts().apiKeys.revoke(me, ws, field(fd, "keyId"));
    return "Revoked. Anything using it stops working now.";
  });
}

/* ---------- Webhooks ---------- */

export async function createWebhook(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return act(fd, async ({ me, ws }) => {
    const made = await appWebhooks().create(me, ws, { url: field(fd, "url"), events: fd.getAll("events").map(String), description: field(fd, "description") });
    return { ok: "Added. Copy the signing secret now. It is not shown again.", secret: made.secret };
  });
}

export async function webhookAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return act(fd, async ({ me, ws }) => {
    const w = appWebhooks();
    const id = field(fd, "id");
    switch (field(fd, "op")) {
      case "test": {
        const d = await w.sendTest(me, ws, id);
        const last = d.attempts[d.attempts.length - 1];
        if (d.status === "delivered") return last?.sender === "dev" ? "Test logged on this machine. Nothing was sent." : "Test delivered.";
        return { error: `The test did not land: ${last?.error ?? "no answer"}. It will be tried again.` };
      }
      case "pause":
        await w.setPaused(me, ws, id, true);
        return "Paused. Nothing is sent until you resume it.";
      case "resume":
        await w.setPaused(me, ws, id, false);
        return "Resumed.";
      case "rotate": {
        const r = await w.rotateSecret(me, ws, id);
        return { ok: "New secret. The old one stopped working. Copy this now.", secret: r.secret };
      }
      case "remove":
        await w.remove(me, ws, id);
        return "Removed.";
      default:
        return { error: "Unknown action." };
    }
  });
}
