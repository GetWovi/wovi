import { describe, expect, it } from "vitest";
import { sha256 } from "./crypto";
import { rejectsCode, testAccounts } from "./test-helpers";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("sessions", () => {
  it("finds the session for its token and stores only a hash", async () => {
    const { accounts, signUp, store } = testAccounts();
    const { token, user } = await signUp("ada@example.com");
    const info = await accounts.sessions.get(token);
    expect(info?.user.id).toBe(user.id);
    expect(info?.newToken).toBeNull();
    const [row] = await store.sessions.find();
    expect(row.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(await accounts.sessions.get("nope")).toBeNull();
    expect(await accounts.sessions.get("")).toBeNull();
  });

  it("rotates an old token where a cookie can be set, and the old one works only for the grace minute", async () => {
    const { accounts, signUp, advance } = testAccounts();
    const { token } = await signUp("bo@example.com");
    advance(11 * HOUR);
    expect((await accounts.sessions.get(token, { rotate: true }))?.newToken).toBeNull();
    advance(2 * HOUR);
    // Pages cannot set cookies, so a plain read never rotates.
    expect((await accounts.sessions.get(token))?.newToken).toBeNull();
    const rotated = await accounts.sessions.get(token, { rotate: true });
    const fresh = rotated!.newToken!;
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(token);
    expect((await accounts.sessions.get(fresh))?.session.id).toBe(rotated!.session.id);
    // The old token still works for requests already on their way...
    expect(await accounts.sessions.get(token)).not.toBeNull();
    advance(MIN);
    // ...and then stops.
    expect(await accounts.sessions.get(token)).toBeNull();
    expect(await accounts.sessions.get(fresh)).not.toBeNull();
  });

  it("ends after a week without use, and after thirty days however active", async () => {
    const { accounts, signUp, advance } = testAccounts();
    const idle = await signUp("cy@example.com");
    advance(7 * DAY);
    expect(await accounts.sessions.get(idle.token)).toBeNull();

    let { token } = await signUp("di@example.com");
    for (let d = 0; d < 29; d++) {
      advance(DAY);
      const info = await accounts.sessions.get(token, { rotate: true });
      expect(info).not.toBeNull();
      token = info!.newToken ?? token;
    }
    advance(DAY);
    expect(await accounts.sessions.get(token)).toBeNull();
  });

  it("signs out one session, or every session of the user", async () => {
    const { accounts, signUp } = testAccounts();
    const a = await signUp("ed@example.com");
    const b = await signUp("ed@example.com");
    const c = await signUp("ed@example.com");
    const other = await signUp("fi@example.com");
    await accounts.sessions.signOut(a.token);
    expect(await accounts.sessions.get(a.token)).toBeNull();
    expect(await accounts.sessions.get(b.token)).not.toBeNull();
    expect(await accounts.sessions.list(a.user.id)).toHaveLength(2);

    expect(await accounts.sessions.signOutEverywhere(a.user.id)).toBe(2);
    expect(await accounts.sessions.get(b.token)).toBeNull();
    expect(await accounts.sessions.get(c.token)).toBeNull();
    expect(await accounts.sessions.get(other.token)).not.toBeNull();
  });

  it("switches the current workspace only to one the user belongs to, and falls back home when access goes", async () => {
    const { accounts, signUp, lastMail } = testAccounts();
    const ada = await signUp("ada@example.com");
    const bo = await signUp("bo@example.com");
    const me = { kind: "user", userId: ada.user.id } as const;
    const team = await accounts.workspaces.create(me, "Team");

    await rejectsCode(accounts.sessions.switchWorkspace(bo.session.id, team.id), "not_found");
    await accounts.workspaces.invite(me, team.id, "bo@example.com", "editor");
    await accounts.workspaces.acceptInvite(bo.user.id, lastMail("bo@example.com").token);
    await accounts.sessions.switchWorkspace(bo.session.id, team.id);
    expect((await accounts.sessions.get(bo.token))?.session.workspaceId).toBe(team.id);

    await accounts.workspaces.removeMember(me, team.id, bo.user.id);
    expect((await accounts.sessions.get(bo.token))?.session.workspaceId).toBe(bo.user.personalWorkspaceId);
  });
});
