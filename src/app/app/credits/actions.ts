"use server";

import { appCall, type Result } from "@/app/app/actions";
import { AppError } from "@/lib/app/api";
import { CreditError } from "@/lib/credits/credits";
import { appCredits } from "@/lib/credits/server";
import type { CreditLimits, TopUp } from "@/lib/credits/types";
import type { Principal } from "@/lib/accounts/accounts";
import { accounts } from "@/lib/accounts/server";
import { tokenServices } from "@/lib/token/local";
import { PayError, type ClaimResult, type PayQuote } from "@/lib/token/pay";
import { PURCHASE_CONSENT } from "@/lib/legal/operator";
import { WithdrawalError } from "@/lib/legal/withdrawals";
import { appWithdrawals } from "@/lib/safety/server";

/** Credit errors in the app's words, so the screen shows the message. */
async function credits<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CreditError) throw new AppError(err.code === "not_found" ? "not_found" : "invalid_request", err.message);
    throw err;
  }
}

/**
 * Buys a pack through the payment provider (the test provider locally: no
 * money moves). Phase 18: only with the buyer's request to start at once and
 * their acceptance of the withdrawal terms, stored word for word on the top-up.
 */
export async function topUp(csrf: string, pack: number, idempotencyKey: string, consent = false): Promise<Result<TopUp>> {
  return appCall(
    csrf,
    ({ me, workspaceId }) => {
      if (consent !== true) throw new AppError("invalid_request", "Tick the box about starting your credits now first.");
      return credits(() => appCredits().topUp(me, workspaceId, pack, idempotencyKey, { at: new Date().toISOString(), wording: PURCHASE_CONSENT }));
    },
    { refresh: "/app" },
  );
}

/** Phase 18: withdraws from a purchase within 14 days. The unused credits leave the balance and are owed back as money. */
export async function withdrawPurchase(csrf: string, topUpId: string): Promise<Result<{ credits: number; amountCents: number; test: boolean }>> {
  return appCall(
    csrf,
    async ({ me, workspaceId }) => {
      try {
        const row = await appWithdrawals().withdraw(me, workspaceId, topUpId);
        return { credits: row.credits, amountCents: row.amountCents, test: row.test };
      } catch (err) {
        if (err instanceof WithdrawalError) throw new AppError(err.code === "not_found" ? "not_found" : "invalid_request", err.message);
        throw err;
      }
    },
    { refresh: "/app" },
  );
}

/** Sets the workspace's monthly limit and members' limits. Null takes a limit away. */
export async function setLimits(csrf: string, next: { monthly: number | null; members: Record<string, number | null> }): Promise<Result<CreditLimits>> {
  return appCall(csrf, ({ me, workspaceId }) => credits(() => appCredits().setLimits(me, workspaceId, next)), { refresh: "/app" });
}

/* ---------- Paying with $WOVI (phase 17) ---------- */

/** Owners and admins of the current workspace only, like top-ups; and only while paying with $WOVI is open. */
async function woviPay(me: Principal, workspaceId: string) {
  await accounts().authorize(me, workspaceId, "manage_credits");
  const pay = tokenServices().pay;
  if (!pay || !pay.status().on) throw new AppError("invalid_request", "Paying with $WOVI is not open.");
  return pay;
}

/** A price for a pack in $WOVI: what to send to the burn pot, valid for ten minutes. */
export async function woviQuote(csrf: string, pack: number, consent = false): Promise<Result<PayQuote>> {
  return appCall(csrf, async ({ me, workspaceId }) => {
    // Phase 18: the same request and acceptance as a card purchase.
    if (consent !== true) throw new AppError("invalid_request", "Tick the box about starting your credits now first.");
    const pay = await woviPay(me, workspaceId);
    try {
      return await pay.quote(me.userId, workspaceId, pack);
    } catch (err) {
      if (err instanceof PayError) throw new AppError("invalid_request", err.message);
      throw err;
    }
  });
}

/** Counts a $WOVI payment for a price by its transaction hash, read on chain. `pending`: ask again in a moment. */
export async function woviClaim(csrf: string, quoteId: string, tx: string): Promise<Result<ClaimResult>> {
  return appCall(
    csrf,
    async ({ me, workspaceId }) => {
      const pay = await woviPay(me, workspaceId);
      return pay.claim(me.userId, quoteId, tx);
    },
    { refresh: "/app" },
  );
}
