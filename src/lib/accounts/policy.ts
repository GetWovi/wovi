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
};

/**
 * What an API key may do, whatever its role. A leaked key can run agents and
 * read results, but never add people, mint more keys or change the workspace.
 */
export const API_KEY_ACTIONS: readonly Action[] = ["view", "run_agents", "edit_agents", "edit_brand_brain", "see_costs"];

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
};
