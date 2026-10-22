"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/account/ActionForm";
import { accounts, actionSession } from "@/lib/accounts/server";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { holdersTick } from "@/lib/token/jobs";
import { keeperOnce } from "@/lib/token/local";

/** The owner of WOVI only (owners of the platform workspace), like the x402 page. */
async function owner(fd: FormData): Promise<string | null> {
  const info = await actionSession(fd);
  const role = await accounts().roleIn({ kind: "user", userId: info.user.id }, PLATFORM_WORKSPACE_ID);
  return role === "owner" ? null : "Only the owner of WOVI can do this.";
}

/** One keeper run now: the same checks and limits as the schedule. It only ever sends sweep() and burn(0). */
export async function runKeeperNow(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const no = await owner(fd);
  if (no) return { error: no };
  const r = await keeperOnce();
  revalidatePath("/app/settings/token");
  if (r.done === "off") return { error: "The keeper is off." };
  if (r.done === "error") return { error: r.reason };
  if (r.done === "refused") return { error: r.reason };
  if (r.done === "busy") return { error: "The keeper is running already." };
  if (r.done === "waiting") return { ok: "A transaction is still out. Nothing new was sent." };
  const sent = [r.sweep && "a sweep", r.burn && "a burn"].filter(Boolean).join(" and ");
  return { ok: sent ? `Sent ${sent}.` : (r.notes[0] ?? "Nothing to send.") };
}

/** Every linked wallet read again now, and this month's holder credits if they are due. */
export async function checkHoldersNow(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const no = await owner(fd);
  if (no) return { error: no };
  try {
    await holdersTick(true);
  } catch {
    return { error: "Robinhood Chain did not answer. Try again in a moment." };
  }
  revalidatePath("/app/settings/token");
  return { ok: "Holders checked." };
}
