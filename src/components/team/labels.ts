/** Words and poses for review screens. Data only, client-safe. */
import type { IconName } from "@/components/ui/Icon";
import type { ActivityKind, ItemState, NotificationKind } from "@/lib/team/types";

export function itemPose(state: ItemState, running: boolean): "move" | "wait" | "done" | "hello" {
  if (running) return "move";
  if (state === "needs_review") return "hello";
  if (state === "approved") return "done";
  return "wait";
}

/** One activity line: "approved it", "asked for changes". */
export const ACTIVITY_WORDS: Record<ActivityKind, string> = {
  made: "made it",
  sent: "sent it for review",
  commented: "commented",
  assigned: "assigned it to",
  unassigned: "took the assignment off",
  approval_added: "said yes",
  approved: "approved it",
  changes_requested: "asked for changes",
  rejected: "rejected it",
  reopened: "took the decision back",
  rerun_started: "started a new draft with the changes",
  rerun_of: "made this draft from the changes asked",
  shared: "shared it",
};

export const ACTIVITY_ICONS: Record<ActivityKind, IconName> = {
  made: "spark",
  sent: "inbox",
  commented: "chat",
  assigned: "user",
  unassigned: "user",
  approval_added: "check",
  approved: "check-circle",
  changes_requested: "refresh",
  rejected: "x-circle",
  reopened: "arrow-left",
  rerun_started: "refresh",
  rerun_of: "refresh",
  shared: "link",
};

export const NOTIFICATION_ICONS: Record<NotificationKind, IconName> = {
  assigned: "user",
  mentioned: "chat",
  changes_requested: "refresh",
  approved: "check-circle",
  comment: "chat",
};

export const NOTIFICATION_VERBS: Record<NotificationKind, string> = {
  assigned: "assigned you",
  mentioned: "mentioned you on",
  changes_requested: "asked for changes on",
  approved: "approved",
  comment: "commented on",
};

/** Up to two initials for a client's mark: "Northside Bakery" is NB, "Night Owl" is NO. */
export function clientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
