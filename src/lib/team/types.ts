/**
 * Review, approve and workspaces for teams (phase 11): the record shapes and
 * fixed lists. No storage here, so client components can import them.
 *
 * An item is one thing to review: a run (not a pipeline's own step runs) or a
 * pipeline run. Its id is the run's id, so links stay short and an item never
 * needs a lookup table. Every row carries its workspace id.
 */

export const ITEM_STATES = ["draft", "needs_review", "approved", "changes_requested", "rejected"] as const;
export type ItemState = (typeof ITEM_STATES)[number];

export const ITEM_STATE_LABELS: Record<ItemState, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  approved: "Approved",
  changes_requested: "Changes asked",
  rejected: "Rejected",
};

/** The three decisions. */
export const DECISIONS = ["approve", "request_changes", "reject"] as const;
export type Decision = (typeof DECISIONS)[number];

export type ItemKind = "run" | "pipeline";

/** Who may decide: anyone who can edit, or only admins and owners. */
export type Approvers = "editors" | "admins";

/** The workspace's approval rules. One row per workspace; defaults when there is none. */
export type ReviewSettings = {
  /** The workspace id. */
  id: string;
  workspaceId: string;
  approvers: Approvers;
  /** 2 for agencies that want two people (or a person and the client) to say yes. */
  approvalsNeeded: 1 | 2;
  /** Finished results go to "Needs review" on their own. Off, the maker sends each one. */
  autoSubmit: boolean;
  /** Notifications also go out by email (through the email sender; the dev sender locally). */
  emailNotifications: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

export const DEFAULT_SETTINGS: Omit<ReviewSettings, "id" | "workspaceId"> = {
  approvers: "editors",
  approvalsNeeded: 1,
  autoSubmit: true,
  emailNotifications: true,
  updatedBy: null,
  updatedAt: null,
};

/** One yes in the current round. `by` is a user id, or `link:<id>` for a client's share link. */
export type Approval = { by: string; name: string; at: string; note: string; via: "member" | "client" };

/** The last decision that closed a round. */
export type DecisionRecord = { decision: Decision; by: string; name: string; at: string; note: string; via: "member" | "client" };

/** The review side of a run or pipeline run. Made when someone first acts on it; until then the state is worked out from the run. */
export type ItemRow = {
  /** The run or pipeline run id. */
  id: string;
  workspaceId: string;
  kind: ItemKind;
  /** draft and needs_review are what was asked; a draft whose run is still going shows as a draft either way. */
  status: ItemState;
  /** Who made it, when the app knows (runs started from the app). */
  makerId: string | null;
  /** Re-runs from "ask for changes" go to review on their own when they land. */
  submitOnFinish: boolean;
  /** Who sent it for review, and when. */
  sentBy: string | null;
  sentAt: string | null;
  assigneeId: string | null;
  /** Yes votes in this round. A no or a change request ends the round. */
  approvals: Approval[];
  /** Rounds so far: each change request or reopen starts a new one. */
  round: number;
  last: DecisionRecord | null;
  /** The item this one re-runs after a change request, and the re-runs made from this one. */
  reRunOf: string | null;
  reRuns: string[];
  createdAt: string;
  updatedAt: string;
};

export type CommentRow = {
  id: string;
  workspaceId: string;
  itemId: string;
  /** The comment this one answers. Threads are one level deep: an answer to an answer joins the same thread. */
  parentId: string | null;
  body: string;
  /** Members mentioned with @, by user id. */
  mentions: string[];
  /** A user id, `key:<id>` or `link:<id>`. */
  authorId: string;
  authorName: string;
  /** Team only: a client never sees it. */
  internal: boolean;
  createdAt: string;
};

export const ACTIVITY_KINDS = [
  "made",
  "sent",
  "commented",
  "assigned",
  "unassigned",
  "approval_added",
  "approved",
  "changes_requested",
  "rejected",
  "reopened",
  "rerun_started",
  "rerun_of",
  "shared",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** What a client sees of the activity. Assignments, comments and the like stay with the team. */
export const CLIENT_ACTIVITY: readonly ActivityKind[] = ["sent", "approval_added", "approved", "changes_requested", "rejected", "rerun_started", "rerun_of"];

/** One line of an item's activity log: who did what, and when. Append only. */
export type ActivityRow = {
  id: string;
  workspaceId: string;
  itemId: string;
  kind: ActivityKind;
  by: string;
  byName: string;
  at: string;
  /** A decision's note, the assignee's name, the other item's id: whatever the line needs. */
  note: string;
  /** Another item this line points at (a re-run, the original). */
  ref: string | null;
};

export const NOTIFICATION_KINDS = ["assigned", "mentioned", "changes_requested", "approved", "comment"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  assigned: "Assigned to you",
  mentioned: "You were mentioned",
  changes_requested: "Changes asked",
  approved: "Approved",
  comment: "New comment",
};

export type NotificationRow = {
  id: string;
  workspaceId: string;
  /** Who it is for. */
  userId: string;
  kind: NotificationKind;
  itemId: string;
  actorName: string;
  /** The item's title, kept so the list reads well even after the run is gone. */
  title: string;
  /** One line: the note or the comment, shortened. */
  text: string;
  createdAt: string;
  readAt: string | null;
};

/** A client of an agency workspace, tied to the Brand Brains made for them. */
export type ClientRow = {
  id: string;
  workspaceId: string;
  name: string;
  /** A Brand Brain belongs to one client at most, so a client never sees another's work. */
  brandBrainIds: string[];
  /** Preselected in the app's Brand Brain pickers while working for this client. */
  defaultBrandBrainId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** A link a client opens without an account: their own items, read-only except approving, asking for changes and commenting. */
export type ShareLinkRow = {
  id: string;
  workspaceId: string;
  clientId: string;
  /** Who it is for, as the client's comments and approvals are signed: "Maya at Northside". */
  label: string;
  /** sha256 of the token. The token is shown once. */
  tokenHash: string;
  /** The last characters of the token, for telling links apart. */
  suffix: string;
  canApprove: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};
