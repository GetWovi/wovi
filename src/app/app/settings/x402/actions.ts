"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/account/ActionForm";
import { accounts, actionSession } from "@/lib/accounts/server";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { appX402 } from "@/lib/api/server";

/**
 * The owner sent a refund from their own wallet and pastes its transaction
 * here. WOVI records it; it checks nothing on chain and sends nothing.
 */
export async function markRefundPaid(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const info = await actionSession(fd);
    const role = await accounts().roleIn({ kind: "user", userId: info.user.id }, PLATFORM_WORKSPACE_ID);
    if (role !== "owner") return { error: "Only the owner of WOVI can do this." };
    await appX402().markRefundPaid(String(fd.get("id") ?? ""), String(fd.get("txHash") ?? "").trim(), info.user.id);
    revalidatePath("/app/settings/x402");
    return { ok: "Marked as paid." };
  } catch (err) {
    if (err instanceof Error && (err.name === "ApiError" || err.name === "AccountError")) {
      const issues = (err as Error & { issues?: { message: string }[] }).issues;
      return { error: issues?.length ? issues.map((i) => i.message).join(" ") : err.message };
    }
    throw err;
  }
}
