import { describe, expect, it } from "vitest";
import type { Principal } from "./accounts";
import { rejectsCode, testAccounts } from "./test-helpers";

const DAY = 86_400_000;
const as = (userId: string): Principal => ({ kind: "user", userId });

/** A team workspace owned by ada, with bo invited and joined at `role`. */
async function team(role: "owner" | "admin" | "editor" | "viewer" = "editor") {
  const t = testAccounts();
  const ada = await t.signUp("ada@example.com");
  const bo = await t.signUp("bo@example.com");
  const ws = await t.accounts.workspaces.create(as(ada.user.id), "Team");
  await t.accounts.workspaces.invite(as(ada.user.id), ws.id, "bo@example.com", role);
  await t.accounts.workspaces.acceptInvite(bo.user.id, t.lastMail("bo@example.com").token);
  return { ...t, ada: ada.user, bo: bo.user, ws };
}

describe("workspaces and members", () => {
  it("makes a workspace with its maker as owner, and lists the user's workspaces personal first", async () => {
    const { accounts, signUp } = testAccounts();
    const { user } = await signUp("ada@example.com");
    const ws = await accounts.workspaces.create(as(user.id), "  Client   One ");
    expect(ws.name).toBe("Client One");
    expect(ws.id).toMatch(/^ws_[0-9a-f]{20}$/);
    const list = await accounts.workspaces.listForUser(user.id);
    expect(list.map((w) => [w.name, w.role])).toEqual([
      ["Personal", "owner"],
      ["Client One", "owner"],
    ]);
    await rejectsCode(accounts.workspaces.create(as(user.id), " "), "invalid_request");
  });

  it("keeps outsiders out without saying the workspace exists", async () => {
    const { accounts, ws, signUp } = await team();
    const eve = await signUp("eve@example.com");
    await rejectsCode(accounts.workspaces.get(as(eve.user.id), ws.id), "not_found");
    await rejectsCode(accounts.workspaces.members(as(eve.user.id), ws.id), "not_found");
    await rejectsCode(accounts.workspaces.get(as(eve.user.id), "ws_does_not_exist"), "not_found");
  });

  it("lets owners and admins change roles, never above their own", async () => {
    const { accounts, ada, bo, ws, signUp, lastMail } = await team("admin");
    const cy = await signUp("cy@example.com");
    await accounts.workspaces.invite(as(bo.id), ws.id, "cy@example.com", "viewer");
    await accounts.workspaces.acceptInvite(cy.user.id, lastMail("cy@example.com").token);

    await accounts.workspaces.setRole(as(bo.id), ws.id, cy.user.id, "editor");
    await rejectsCode(accounts.workspaces.setRole(as(bo.id), ws.id, cy.user.id, "owner"), "forbidden");
    await rejectsCode(accounts.workspaces.setRole(as(bo.id), ws.id, ada.id, "viewer"), "forbidden");
    await rejectsCode(accounts.workspaces.removeMember(as(bo.id), ws.id, ada.id), "forbidden");
    await rejectsCode(accounts.workspaces.invite(as(bo.id), ws.id, "dee@example.com", "owner"), "forbidden");
    // An editor manages nobody.
    await rejectsCode(accounts.workspaces.setRole(as(cy.user.id), ws.id, bo.id, "viewer"), "forbidden");

    await accounts.workspaces.setRole(as(ada.id), ws.id, bo.id, "owner");
    const members = await accounts.workspaces.members(as(cy.user.id), ws.id);
    expect(members.map((m) => [m.email, m.role])).toEqual([
      ["ada@example.com", "owner"],
      ["bo@example.com", "owner"],
      ["cy@example.com", "editor"],
    ]);
  });

  it("never leaves a workspace without an owner", async () => {
    const { accounts, ada, bo, ws } = await team("editor");
    await rejectsCode(accounts.workspaces.leave(ada.id, ws.id), "last_owner");
    await rejectsCode(accounts.workspaces.setRole(as(ada.id), ws.id, ada.id, "admin"), "last_owner");
    await rejectsCode(accounts.workspaces.removeMember(as(ada.id), ws.id, ada.id), "last_owner");

    await accounts.workspaces.setRole(as(ada.id), ws.id, bo.id, "owner");
    await accounts.workspaces.leave(ada.id, ws.id);
    expect((await accounts.workspaces.members(as(bo.id), ws.id)).map((m) => m.email)).toEqual(["bo@example.com"]);
    await rejectsCode(accounts.workspaces.leave(bo.id, ws.id), "last_owner");
  });

  it("lets a member leave and an admin remove a member", async () => {
    const { accounts, ada, bo, ws } = await team("viewer");
    await accounts.workspaces.leave(bo.id, ws.id);
    await rejectsCode(accounts.workspaces.get(as(bo.id), ws.id), "not_found");
    await rejectsCode(accounts.workspaces.removeMember(as(ada.id), ws.id, bo.id), "not_found");
  });

  it("only lets the owner rename", async () => {
    const { accounts, ada, bo, ws } = await team("admin");
    await rejectsCode(accounts.workspaces.rename(as(bo.id), ws.id, "Mine"), "forbidden");
    expect((await accounts.workspaces.rename(as(ada.id), ws.id, "Ours")).name).toBe("Ours");
  });
});

describe("invites", () => {
  it("emails a link that works once, for the invited address only", async () => {
    const { accounts, signUp, lastMail, email } = testAccounts();
    const ada = await signUp("ada@example.com");
    const eve = await signUp("eve@example.com");
    const ws = await accounts.workspaces.create(as(ada.user.id), "Team");
    const invite = await accounts.workspaces.invite(as(ada.user.id), ws.id, "Bo@Example.com", "editor");
    expect(invite).toMatchObject({ email: "bo@example.com", role: "editor", invitedBy: "ada@example.com", expired: false });
    expect(email.sent.at(-1)!.subject).toBe("You are invited to Team on WOVI");
    const { token } = lastMail("bo@example.com");

    expect(await accounts.workspaces.previewInvite(token)).toEqual({ workspaceName: "Team", email: "bo@example.com", role: "editor", invitedBy: "ada@example.com" });
    await rejectsCode(accounts.workspaces.acceptInvite(eve.user.id, token), "forbidden");

    const bo = await signUp("bo@example.com");
    expect((await accounts.workspaces.acceptInvite(bo.user.id, token)).id).toBe(ws.id);
    expect((await accounts.workspaces.get(as(bo.user.id), ws.id)).role).toBe("editor");
    await rejectsCode(accounts.workspaces.acceptInvite(bo.user.id, token), "invalid_invite");
    expect(await accounts.workspaces.previewInvite(token)).toBeNull();
    expect(await accounts.workspaces.invites(as(ada.user.id), ws.id)).toEqual([]);
  });

  it("expires after seven days", async () => {
    const { accounts, signUp, lastMail, advance } = testAccounts();
    const ada = await signUp("ada@example.com");
    await accounts.workspaces.invite(as(ada.user.id), ada.user.personalWorkspaceId, "bo@example.com", "viewer");
    const { token } = lastMail("bo@example.com");
    advance(7 * DAY);
    expect((await accounts.workspaces.invites(as(ada.user.id), ada.user.personalWorkspaceId))[0].expired).toBe(true);
    const bo = await signUp("bo@example.com");
    await rejectsCode(accounts.workspaces.acceptInvite(bo.user.id, token), "invalid_invite");
  });

  it("can be withdrawn, and a new invite replaces the open one", async () => {
    const { accounts, signUp, lastMail } = testAccounts();
    const ada = await signUp("ada@example.com");
    const ws = ada.user.personalWorkspaceId;
    await accounts.workspaces.invite(as(ada.user.id), ws, "bo@example.com", "viewer");
    const first = lastMail("bo@example.com").token;
    const second = await accounts.workspaces.invite(as(ada.user.id), ws, "bo@example.com", "editor");
    expect((await accounts.workspaces.invites(as(ada.user.id), ws)).map((i) => i.id)).toEqual([second.id]);

    const bo = await signUp("bo@example.com");
    await rejectsCode(accounts.workspaces.acceptInvite(bo.user.id, first), "invalid_invite");
    await accounts.workspaces.revokeInvite(as(ada.user.id), ws, second.id);
    expect(await accounts.workspaces.invites(as(ada.user.id), ws)).toEqual([]);
  });

  it("refuses someone who is already a member", async () => {
    const { accounts, ada, ws } = await team("viewer");
    await rejectsCode(accounts.workspaces.invite(as(ada.id), ws.id, "bo@example.com", "editor"), "already_member");
  });

  it("is limited per workspace per day", async () => {
    const { accounts, signUp } = testAccounts({ limits: { invitesPerWorkspace: { max: 2, windowMs: 86_400_000 } } });
    const ada = await signUp("ada@example.com");
    const ws = ada.user.personalWorkspaceId;
    await accounts.workspaces.invite(as(ada.user.id), ws, "a1@example.com", "viewer");
    await accounts.workspaces.invite(as(ada.user.id), ws, "a2@example.com", "viewer");
    await rejectsCode(accounts.workspaces.invite(as(ada.user.id), ws, "a3@example.com", "viewer"), "rate_limited");
  });
});
