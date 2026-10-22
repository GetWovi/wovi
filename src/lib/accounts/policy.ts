/**
 * The permission policy: one table of who may do what in a workspace. Pure
 * functions, no storage. Every guarded call (registry, engine, members,
 * API keys) asks `can` through Accounts.authorize.
 */

export const ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "view",
  "run_agents",
  "edit_agents",
  "edit_brand_brain",
  "see_costs",
  "manage_members",
  "manage_api_keys",
  "manage_workspace",
  // Review and teams (phase 11)
  "comment",
  "send_for_review",
  "assign",
  "decide",
  "manage_review_rules",
  "manage_clients",
  // Credits (phase 13)
  "manage_credits",
  // MCP and REST (phase 14)
  "manage_webhooks",
] as const;
export type Action = (typeof ACTIONS)[number];

/** The lowest role that may take each action. */
export const MIN_ROLE: Record<Action, Role> = {
  view: "viewer",
  run_agents: "editor",
  edit_agents: "editor",
  edit_brand_brain: "editor",
  see_costs: "admin",
  manage_members: "admin",
  manage_api_keys: "admin",
  manage_workspace: "owner",
  comment: "viewer",
  send_for_review: "editor",
  assign: "editor",
  // The workspace's approval rules can raise this to admin (phase 11, team/rules.ts).
  decide: "editor",
  manage_review_rules: "admin",
  manage_clients: "admin",
  // Top up and set monthly limits. Never an API key: a leaked key cannot spend money or lift a limit.
  manage_credits: "admin",
  // Register, change and remove webhook URLs. Admin keys may, so software can wire itself up.
  manage_webhooks: "admin",
};

/**
 * What an API key may do, whatever its role. A leaked key can run agents and
 * read results, but never add people, mint more keys or change the workspace.
 * Keys may comment, send drafts for review and assign them, but never approve,
 * reject or ask for changes: people approve.
 */
export const API_KEY_ACTIONS: readonly Action[] = ["view", "run_agents", "edit_agents", "edit_brand_brain", "see_costs", "comment", "send_for_review", "assign", "manage_webhooks"];

/** Roles an API key can carry. */
export const API_KEY_ROLES = ["admin", "editor", "viewer"] as const;

const RANK: Record<Role, number> = { owner: 4, admin: 3, editor: 2, viewer: 1 };

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/** The lower of two roles. */
export function lowerRole(a: Role, b: Role): Role {
  return RANK[a] <= RANK[b] ? a : b;
}

export function can(role: Role, action: Action, via: "user" | "api_key" = "user"): boolean {
  if (via === "api_key" && !API_KEY_ACTIONS.includes(action)) return false;
  return atLeast(role, MIN_ROLE[action]);
}

/**
 * Whether someone with `actor` may give `next` to a member who has `current`
 * (null for a new member or invite). Nobody hands out or takes away a role
 * above their own, so only owners make or unmake owners.
 */
export function canAssign(actor: Role, current: Role | null, next: Role): boolean {
  if (!atLeast(actor, MIN_ROLE.manage_members)) return false;
  if (current && !atLeast(actor, current)) return false;
  return atLeast(actor, next);
}

/** Whether `actor` may remove a member who has `target`. */
export function canRemove(actor: Role, target: Role): boolean {
  return atLeast(actor, MIN_ROLE.manage_members) && atLeast(actor, target);
}

/** Words for messages: "cannot run agents in this workspace". */
export const ACTION_WORDS: Record<Action, string> = {
  view: "see this workspace",
  run_agents: "run agents",
  edit_agents: "edit agents",
  edit_brand_brain: "edit the Brand Brain",
  see_costs: "see costs",
  manage_members: "manage members",
  manage_api_keys: "manage API keys",
  manage_workspace: "change workspace settings",
  comment: "comment",
  send_for_review: "send drafts for review",
  assign: "assign drafts",
  decide: "approve, reject or ask for changes",
  manage_review_rules: "change the approval rules",
  manage_clients: "manage clients and their links",
  manage_credits: "top up credits or set limits",
  manage_webhooks: "manage webhooks",
};
