"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/account/ActionForm";
import { actionSession } from "@/lib/accounts/server";
import { ReportError } from "@/lib/safety/reports";
import { appReports, appSafetyStore } from "@/lib/safety/server";

const PAGE = "/app/settings/safety";

async function owner(fd: FormData) {
  const info = await actionSession(fd);
  const me = { kind: "user" as const, userId: info.user.id };
  if (!(await appReports().isOwner(me))) throw new ReportError("forbidden", "Only the owners of WOVI can do this.");
  return me;
}

function answer(err: unknown): ActionState {
  if (err instanceof ReportError) return { error: err.issues.length ? err.issues.map((i) => i.replace(/^[a-zA-Z]+: /, "")).join(" ") : err.message };
  if (err instanceof Error && err.name === "AccountError") return { error: err.message };
  throw err;
}

export async function markReviewing(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await owner(fd);
    await appReports().markReviewing(me, String(fd.get("id") ?? ""));
    revalidatePath(PAGE);
    return { ok: "Marked as being reviewed." };
  } catch (err) {
    return answer(err);
  }
}

export async function decideReport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await owner(fd);
    const row = await appReports().decide(me, String(fd.get("id") ?? ""), { outcome: String(fd.get("outcome") ?? ""), ground: String(fd.get("ground") ?? ""), note: String(fd.get("note") ?? "") });
    revalidatePath(PAGE);
    return { ok: `Decided. ${row.notified.decisionAt ? "The reporter was told." : "No email to tell the reporter."}${row.notified.affectedAt ? " The workspace got the reasons." : ""}` };
  } catch (err) {
    return answer(err);
  }
}

/** The owner sent money owed back through the payment provider. WOVI records it and drops the contact. Nothing is sent from here. */
export async function markOwedPaid(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const me = await owner(fd);
    const store = appSafetyStore();
    const row = await store.owed.get(String(fd.get("id") ?? ""));
    if (!row) return { error: "No such refund." };
    if (row.status === "paid") return { ok: "Already marked as paid." };
    await store.owed.update({ ...row, status: "paid", paidAt: new Date().toISOString(), paidBy: me.userId, contact: null });
    revalidatePath(PAGE);
    return { ok: "Marked as paid." };
  } catch (err) {
    return answer(err);
  }
}
