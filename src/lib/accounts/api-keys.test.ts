import { describe, expect, it } from "vitest";
import type { Principal } from "./accounts";
import { sha256 } from "./crypto";
import { rejectsCode, testAccounts } from "./test-helpers";

const as = (userId: string): Principal => ({ kind: "user", userId });

async function setup() {
  const t = testAccounts();
  const ada = await t.signUp("ada@example.com");
  const ws = ada.user.personalWorkspaceId;
  return { ...t, ada: ada.user, ws };
}

describe("API keys", () => {
  it("shows the key once and stores only its hash and a prefix", async () => {
    const { accounts, store, ada, ws } = await setup();
    const { key, apiKey } = await accounts.apiKeys.create(as(ada.id), ws, { name: "Claude", role: "editor" });
    expect(key).toMatch(/^wovi_sk_[A-Za-z0-9_-]{43}$/);
    expect(apiKey.prefix).toBe(key.slice(0, 14));
    expect(apiKey).not.toHaveProperty("keyHash");
    const [row] = await store.apiKeys.find();
    expect(row.keyHash).toBe(sha256(key));
    expect(JSON.stringify(row)).not.toContain(key);

    const list = await accounts.apiKeys.list(as(ada.id), ws);
    expect(list).toEqual([expect.objectContaining({ name: "Claude", prefix: apiKey.prefix, role: "editor", lastUsedAt: null, revokedAt: null })]);
    expect(JSON.stringify(list)).not.toContain(key);
  });

  it("authenticates a live key for its own workspace and role, and records when it was last used", async () => {
    const { accounts, ada, ws } = await setup();
    const { key, apiKey } = await accounts.apiKeys.create(as(ada.id), ws, { name: "Script", role: "viewer" });
    const p = await accounts.apiKeys.authenticate(key);
    expect(p).toEqual({ kind: "api_key", keyId: apiKey.id, userId: ada.id, workspaceId: ws, role: "viewer" });
    expect((await accounts.apiKeys.list(as(ada.id), ws))[0].lastUsedAt).not.toBeNull();

    expect(await accounts.authorize(p!, ws, "view")).toBe("viewer");
    await rejectsCode(accounts.authorize(p!, ws, "run_agents"), "forbidden");
    const other = await accounts.workspaces.create(as(ada.id), "Other");
    await rejectsCode(accounts.authorize(p!, other.id, "view"), "not_found");

    expect(await accounts.apiKeys.authenticate(key.slice(0, -1) + (key.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await accounts.apiKeys.authenticate("Bearer nonsense")).toBeNull();
  });

  it("stops working once revoked", async () => {
    const { accounts, ada, ws } = await setup();
    const { key, apiKey } = await accounts.apiKeys.create(as(ada.id), ws, { name: "Old", role: "editor" });
    await accounts.apiKeys.revoke(as(ada.id), ws, apiKey.id);
    expect(await accounts.apiKeys.authenticate(key)).toBeNull();
    expect((await accounts.apiKeys.list(as(ada.id), ws))[0].revokedAt).not.toBeNull();
  });

  it("acts with the lower of its role and its maker's current role, and dies when the maker leaves", async () => {
    const { accounts, ada, signUp, lastMail } = await setup();
    const team = await accounts.workspaces.create(as(ada.id), "Team");
    const bo = await signUp("bo@example.com");
    await accounts.workspaces.invite(as(ada.id), team.id, "bo@example.com", "admin");
    await accounts.workspaces.acceptInvite(bo.user.id, lastMail("bo@example.com").token);
    const { key } = await accounts.apiKeys.create(as(bo.user.id), team.id, { name: "Bo's", role: "admin" });
    expect((await accounts.apiKeys.authenticate(key))?.role).toBe("admin");

    await accounts.workspaces.setRole(as(ada.id), team.id, bo.user.id, "editor");
    expect((await accounts.apiKeys.authenticate(key))?.role).toBe("editor");

    await accounts.workspaces.removeMember(as(ada.id), team.id, bo.user.id);
    expect(await accounts.apiKeys.authenticate(key)).toBeNull();
  });

  it("is managed by owners and admins only, never by a key, and never above the maker's role", async () => {
    const { accounts, ada, signUp, lastMail } = await setup();
    const team = await accounts.workspaces.create(as(ada.id), "Team");
    const bo = await signUp("bo@example.com");
    await accounts.workspaces.invite(as(ada.id), team.id, "bo@example.com", "editor");
    await accounts.workspaces.acceptInvite(bo.user.id, lastMail("bo@example.com").token);
    await rejectsCode(accounts.apiKeys.create(as(bo.user.id), team.id, { name: "x", role: "viewer" }), "forbidden");
    await rejectsCode(accounts.apiKeys.list(as(bo.user.id), team.id), "forbidden");

    const { key } = await accounts.apiKeys.create(as(ada.id), team.id, { name: "Admin key", role: "admin" });
    const p = (await accounts.apiKeys.authenticate(key))!;
    await rejectsCode(accounts.apiKeys.create(p, team.id, { name: "more", role: "viewer" }), "forbidden");
    await rejectsCode(accounts.apiKeys.list(p, team.id), "forbidden");
    await rejectsCode(accounts.workspaces.invite(p, team.id, "x@example.com", "viewer"), "forbidden");
    await rejectsCode(accounts.apiKeys.create(as(ada.id), team.id, { name: "x", role: "owner" as never }), "invalid_request");
  });
});
