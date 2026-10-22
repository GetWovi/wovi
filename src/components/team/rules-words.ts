import type { ReviewSettings } from "@/lib/team/types";

/** The approval rule in one line, for the queue and the decision panel. */
export function ruleWords(s: Pick<ReviewSettings, "approvers" | "approvalsNeeded">): string {
  const who = s.approvers === "admins" ? "admins and owners" : "anyone who can edit";
  return s.approvalsNeeded === 2 ? `Two yeses from different people (${who}, or the client's link) approve it.` : `One yes from ${who} approves it.`;
}
