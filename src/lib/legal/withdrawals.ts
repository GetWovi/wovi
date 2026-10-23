/**
 * The right of withdrawal for credit purchases (phase 18; Consumer Rights
 * Directive Art. 9, 11a, 14(3) and 16(a)
 * and 15 §). For 14 days after a purchase the buyer can withdraw from it
 * with one button and a confirm. They get back the credits from it they have
 * not used: those leave the balance at once and the money is written down as
 * owed, for the owner to send through the payment provider. Credits already
 * used are paid for, as the buyer accepted when they bought. Once every
 * credit from a purchase is used, it can no longer be withdrawn.
 */
import { randomBytes } from "node:crypto";
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import type { EmailSender } from "@/lib/accounts/email";
import { centsFor, creditWords, priceWords } from "@/lib/credits/config";
import type { Credits } from "@/lib/credits/credits";
import type { TopUp } from "@/lib/credits/types";
import type { OwedRow, SafetyStore } from "@/lib/safety/store";
import { unitsWords } from "@/lib/x402/money";
import { CONTACT_EMAIL, WITHDRAWAL_DAYS, operatorLine } from "./operator";

export class WithdrawalError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_request",
    message: string,
  ) {
    super(message);
    this.name = "WithdrawalError";
  }
}

export type WithdrawableTopUp = { topUp: TopUp; until: string; withdrawn: OwedRow | null };

const DAY = 86_400_000;

export class Withdrawals {
  private readonly now: () => Date;

  constructor(private readonly o: { credits: Credits; accounts: Accounts; safety: SafetyStore; email?: EmailSender; now?: () => Date }) {
    this.now = o.now ?? (() => new Date());
  }

  private until(t: TopUp): string {
    return new Date(Date.parse(t.completedAt ?? t.createdAt) + WITHDRAWAL_DAYS * DAY).toISOString();
  }

  /** Paid top-ups still inside their 14 days, and the ones already withdrawn. */
  async list(caller: Principal, workspaceId: string): Promise<WithdrawableTopUp[]> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_credits");
    const owed = await this.o.safety.owed.find({ workspaceId, kind: "withdrawal" });
    const now = this.now().getTime();
    return (await this.o.credits.topUps(workspaceId))
      .filter((t) => t.status === "paid")
      .map((t) => ({ topUp: t, until: this.until(t), withdrawn: owed.find((o) => o.topUpId === t.id) ?? null }))
      .filter((w) => w.withdrawn || Date.parse(w.until) > now);
  }

  /** Withdraws from one purchase: the unused credits from it leave the balance and are owed back as money. */
  async withdraw(caller: Principal, workspaceId: string, topUpId: string): Promise<OwedRow> {
    await this.o.accounts.authorize(caller, workspaceId, "manage_credits");
    const topUp = (await this.o.credits.topUps(workspaceId)).find((t) => t.id === topUpId);
    if (!topUp || topUp.status !== "paid") throw new WithdrawalError("not_found", "No such purchase.");
    if ((await this.o.safety.owed.find({ workspaceId, topUpId })).length) throw new WithdrawalError("invalid_request", "You already withdrew from this purchase.");
    if (Date.parse(this.until(topUp)) <= this.now().getTime()) throw new WithdrawalError("invalid_request", `The ${WITHDRAWAL_DAYS} days to withdraw from this purchase are over.`);
    const balance = await this.o.credits.balance(workspaceId);
    // Credits a refund through the provider already took off (a card refund in Stripe's dashboard) are not taken twice.
    const left = topUp.credits - (await this.o.credits.removedFromTopUp(workspaceId, topUp.id));
    const back = Math.min(left, balance.paid);
    if (back <= 0) throw new WithdrawalError("invalid_request", "Every credit from this purchase is used, so it can no longer be withdrawn.");
    await this.o.credits.adjust(workspaceId, { amount: -back, key: `withdraw:${topUp.id}`, by: caller.userId, note: `Withdrawal from the purchase of ${creditWords(topUp.credits)}` });
    const user = await this.o.accounts.store.users.get(caller.userId);
    const at = this.now().toISOString();
    const row: OwedRow = {
      id: `owed_${randomBytes(8).toString("hex")}`,
      kind: "withdrawal",
      workspaceId,
      topUpId: topUp.id,
      credits: back,
      amountCents: centsFor(back),
      currency: "usd",
      test: topUp.test,
      contact: user?.email ?? null,
      status: "owed",
      createdAt: at,
      paidAt: null,
      paidBy: null,
      // Paid in USDC or ETH: the share of what was sent, back to the wallet it came from, in the same asset.
      ...(topUp.chain ? { chain: { symbol: topUp.chain.symbol, token: topUp.chain.token, decimals: topUp.chain.decimals, amount: ((BigInt(topUp.chain.amount) * BigInt(back)) / BigInt(topUp.credits)).toString(), to: topUp.chain.payer, tx: topUp.chain.tx, chainId: topUp.chain.chainId } } : {}),
    };
    await this.o.safety.owed.insert(row);
    if (user?.email && this.o.email) {
      await this.o.email.send({
        to: user.email,
        subject: "You withdrew from a WOVI purchase",
        text: [
          `We got your withdrawal from the purchase of ${creditWords(topUp.credits)} on ${topUp.createdAt.slice(0, 10)}.`,
          `${creditWords(back)} you had not used left your balance. ${row.chain ? `We will send ${unitsWords(row.chain.amount, row.chain.decimals)} ${row.chain.symbol} back to the wallet it came from, ${row.chain.to}, within 14 days.` : `We will pay back ${priceWords(back)} to the way you paid, within 14 days.`}${topUp.test ? " This was a test top-up, so no money moved and none goes back." : ""}`,
          `${operatorLine()}. ${CONTACT_EMAIL}`,
        ].join("\n\n"),
      });
    }
    return row;
  }
}
