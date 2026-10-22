import { describe, expect, it } from "vitest";
import { ACTIONS, ROLES, can, canAssign, canRemove, lowerRole, type Action, type Role } from "./policy";

describe("permission policy", () => {
  it("matches the role table", () => {
    const table: Record<Action, Role[]> = {
      view: ["owner", "admin", "editor", "viewer"],
      run_agents: ["owner", "admin", "editor"],
      edit_agents: ["owner", "admin", "editor"],
      edit_brand_brain: ["owner", "admin", "editor"],
      see_costs: ["owner", "admin"],
      manage_members: ["owner", "admin"],
      manage_api_keys: ["owner", "admin"],
      manage_workspace: ["owner"],
      comment: ["owner", "admin", "editor", "viewer"],
      send_for_review: ["owner", "admin", "editor"],
      assign: ["owner", "admin", "editor"],
      decide: ["owner", "admin", "editor"],
      manage_review_rules: ["owner", "admin"],
      manage_clients: ["owner", "admin"],
      manage_credits: ["owner", "admin"],
      manage_webhooks: ["owner", "admin"],
    };
    for (const action of ACTIONS) {
      expect(ROLES.filter((r) => can(r, action))).toEqual(table[action]);
    }
  });

  it("never lets an API key manage people, keys or the workspace", () => {
    for (const action of ["manage_members", "manage_api_keys", "manage_workspace", "manage_credits"] as const) {
      expect(can("owner", action, "api_key")).toBe(false);
    }
    expect(can("editor", "run_agents", "api_key")).toBe(true);
    expect(can("viewer", "run_agents", "api_key")).toBe(false);
  });

  it("hands out and takes away roles only up to the actor's own", () => {
    expect(canAssign("owner", "owner", "viewer")).toBe(true);
    expect(canAssign("admin", null, "admin")).toBe(true);
    expect(canAssign("admin", null, "owner")).toBe(false);
    expect(canAssign("admin", "owner", "viewer")).toBe(false);
    expect(canAssign("editor", null, "viewer")).toBe(false);
    expect(canRemove("admin", "editor")).toBe(true);
    expect(canRemove("admin", "owner")).toBe(false);
    expect(canRemove("viewer", "viewer")).toBe(false);
    expect(lowerRole("admin", "editor")).toBe("editor");
  });
});
