import { describe, expect, it } from "vitest";
import { PLATFORM_CREATOR_ID, PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { builderEmailsFromEnv, type Principal } from "./accounts";
import { rejectsCode, testAccounts } from "./test-helpers";

const as = (userId: string): Principal => ({ kind: "user", userId });

describe("the hidden builder role", () => {
  it("ships with nobody on the allowlist", () => {
    expect(builderEmailsFromEnv({} as NodeJS.ProcessEnv)).toEqual([]);
    expect(builderEmailsFromEnv({ WOVI_BUILDER_EMAILS: " A@Example.com, nope ,b@example.com" } as unknown as NodeJS.ProcessEnv)).toEqual(["a@example.com", "b@example.com"]);
  });

  it("makes ws_wovi and creator_wovi real records, with no owner until a builder signs in", async () => {
    const { accounts, store, signUp } = testAccounts();
    const { user } = await signUp("ada@example.com");
    expect(await store.workspaces.get(PLATFORM_WORKSPACE_ID)).toMatchObject({ id: PLATFORM_WORKSPACE_ID, name: "WOVI", personal: false });
    expect(await store.creators.get(PLATFORM_CREATOR_ID)).toMatchObject({ workspaceId: PLATFORM_WORKSPACE_ID, kind: "platform" });
    expect(await store.members.find({ workspaceId: PLATFORM_WORKSPACE_ID })).toEqual([]);
    expect(accounts.isBuilder(user)).toBe(false);
  });

  it("gives allowlisted emails ownership of the platform workspace, and nobody else sees it", async () => {
    const { accounts, signUp } = testAccounts({ builderEmails: ["Owner@Example.com"] });
    const owner = await signUp("owner@example.com");
    const ada = await signUp("ada@example.com");
    expect(await accounts.roleIn(as(owner.user.id), PLATFORM_WORKSPACE_ID)).toBe("owner");
    expect((await accounts.workspaces.listForUser(owner.user.id)).map((w) => w.id)).toContain(PLATFORM_WORKSPACE_ID);

    expect((await accounts.workspaces.listForUser(ada.user.id)).map((w) => w.id)).not.toContain(PLATFORM_WORKSPACE_ID);
    const err = await rejectsCode(accounts.workspaces.get(as(ada.user.id), PLATFORM_WORKSPACE_ID), "not_found");
    expect(err.message).not.toMatch(/builder/i);
    await rejectsCode(accounts.sessions.switchWorkspace(ada.session.id, PLATFORM_WORKSPACE_ID), "not_found");

    // Builders cannot invite people into it: the allowlist decides.
    await rejectsCode(accounts.workspaces.invite(as(owner.user.id), PLATFORM_WORKSPACE_ID, "ada@example.com", "viewer"), "forbidden");
    // Sessions start in the personal workspace, even for builders.
    expect(owner.session.workspaceId).toBe(owner.user.personalWorkspaceId);
  });

  it("takes the role away as soon as the email leaves the allowlist", async () => {
    const t = testAccounts({ builderEmails: ["owner@example.com"] });
    const owner = await t.signUp("owner@example.com");
    t.accounts.cfg.builderEmails = [];
    expect(await t.accounts.roleIn(as(owner.user.id), PLATFORM_WORKSPACE_ID)).toBeNull();
    // The leftover membership is cleaned up at the next sign-in.
    await t.signUp("owner@example.com");
    expect(await t.store.members.find({ workspaceId: PLATFORM_WORKSPACE_ID })).toEqual([]);
  });
});
