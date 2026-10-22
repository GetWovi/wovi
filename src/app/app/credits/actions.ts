"use server";

import { appCall, type Result } from "@/app/app/actions";
import { AppError } from "@/lib/app/api";
import { CreditError } from "@/lib/credits/credits";
import { appCredits } from "@/lib/credits/server";
import type { CreditLimits, TopUp } from "@/lib/credits/types";

/** Credit errors in the app's words, so the screen shows the message. */
async function credits<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CreditError) throw new AppError(err.code === "not_found" ? "not_found" : "invalid_request", err.message);
    throw err;
  }
}

/** Buys a pack through the payment provider (the test provider locally: no money moves). */
export async function topUp(csrf: string, pack: number, idempotencyKey: string): Promise<Result<TopUp>> {
  return appCall(csrf, ({ me, workspaceId }) => credits(() => appCredits().topUp(me, workspaceId, pack, idempotencyKey)), { refresh: "/app" });
}

/** Sets the workspace's monthly limit and members' limits. Null takes a limit away. */
export async function setLimits(csrf: string, next: { monthly: number | null; members: Record<string, number | null> }): Promise<Result<CreditLimits>> {
  return appCall(csrf, ({ me, workspaceId }) => credits(() => appCredits().setLimits(me, workspaceId, next)), { refresh: "/app" });
}
