import { describe, expect, it } from "vitest";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { Principal } from "./accounts";
import { BUILDER_CODE_PREFIX } from "./builder-codes";
import { sha256 } from "./crypto";
import { SoftPasskey, rejectsCode, testAccounts } from "./test-helpers";

const RP = "localhost";
const ORIGIN = "http://localhost:3900";
const DAY = 86_400_000;
const as = (userId: string): Principal => ({ kind: "user", userId });

/** Runs the whole join: code, name, passkey. */
async function join(t: ReturnType<typeof testAccounts>, code: string, name = "Funkai") {
  const key = new SoftPasskey(RP, ORIGIN);
  const start = await t.accounts.builderCodes.startJoin({ code, name, ip: "ip" });
  const result = await t.accounts.builderCodes.finishJoin({ challengeId: start.challengeId, response: key.register(start.options.challenge) as never, ip: "ip" });
  return { key, result };
}

describe("builder codes", () => {
  it("stores a code made elsewhere once, so a host can store it on every start", async () => {
    const t = testAccounts();
    const code = `${BUILDER_CODE_PREFIX}${"k".repeat(40)}`;
    const view = await t.accounts.builderCodes.issueKnown(code, "Funkai");
    expect(view).toMatchObject({ label: "Funkai", state: "open", suffix: code.slice(-6) });
    expect(await t.accounts.builderCodes.issueKnown(code, "Funkai")).toBeNull();
    expect(await t.store.builderCodes.find()).toHaveLength(1);
    await join(t, code);
    expect(await t.accounts.builderCodes.issueKnown(code)).toBeNull();
    await expect(t.accounts.builderCodes.issueKnown("short")).rejects.toThrow();
  });

  it("issues a long random code and stores only its hash", async () => {
    const { accounts, store } = testAccounts();
    const { code, view } = await accounts.builderCodes.issue("Funkai");
    expect(code.startsWith(BUILDER_CODE_PREFIX)).toBe(true);
    expect(code.length).toBeGreaterThan(50);
    expect(view).toMatchObject({ label: "Funkai", state: "open", suffix: code.slice(-6), usedAt: null, revokedAt: null });
    const rows = await store.builderCodes.find();
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).toBe(sha256(code));
    expect(JSON.stringify(rows)).not.toContain(code);
    const again = await accounts.builderCodes.issue();
    expect(again.code).not.toBe(code);
  });

  it("makes a passkey-only builder account that owns the platform workspace", async () => {
    const t = testAccounts();
    const { code } = await t.accounts.builderCodes.issue();
    const { result } = await join(t, code, "  Funkai  ");
    expect(result.user).toMatchObject({ email: null, name: "Funkai", builder: true });
    expect(result.created).toBe(true);
    expect(result.next).toBe("/builder");
    expect(result.session.method).toBe("passkey");
    expect(t.accounts.isBuilder(result.user)).toBe(true);
    expect(await t.accounts.roleIn(as(result.user.id), PLATFORM_WORKSPACE_ID)).toBe("owner");
    // Sessions still start in the personal workspace.
    expect(result.session.workspaceId).toBe(result.user.personalWorkspaceId);
    expect((await t.accounts.workspaces.listForUser(result.user.id)).map((w) => w.id)).toContain(PLATFORM_WORKSPACE_ID);
    expect((await t.accounts.builderCodes.list())[0]).toMatchObject({ state: "used", usedBy: result.user.id });
    expect(t.email.sent).toHaveLength(0);
  });

  it("lets the passkey-only account sign in again with the passkey and no email", async () => {
    const t = testAccounts();
    const { code } = await t.accounts.builderCodes.issue();
    const { key, result } = await join(t, code);
    await t.accounts.sessions.signOutEverywhere(result.user.id);

    const auth = await t.accounts.passkeys.authenticationOptions("ip");
    const again = await t.accounts.passkeys.verifyAuthentication({ challengeId: auth.challengeId, response: key.authenticate(auth.options.challenge, result.user.id) as never, ip: "ip" });
    expect(again.user.id).toBe(result.user.id);
    expect(again.user.email).toBeNull();
    expect(await t.accounts.roleIn(as(again.user.id), PLATFORM_WORKSPACE_ID)).toBe("owner");
    expect((await t.accounts.sessions.get(again.token))?.user.builder).toBe(true);
    // No email means no email sign-in: nothing to send to.
    await rejectsCode(t.accounts.signIn.request({ email: "", ip: "ip" }), "invalid_email");
  });

  it("works once: a second join with the same code is refused", async () => {
    const t = testAccounts();
    const { code } = await t.accounts.builderCodes.issue();
    await join(t, code);
    await rejectsCode(t.accounts.builderCodes.startJoin({ code, name: "Again", ip: "ip" }), "invalid_code");
    expect(await t.accounts.builderCodes.peek(code)).toBe(false);
  });

  it("refuses an unknown or malformed code, and a bad name", async () => {
    const t = testAccounts();
    await t.accounts.builderCodes.issue();
    await rejectsCode(t.accounts.builderCodes.startJoin({ code: BUILDER_CODE_PREFIX + "x".repeat(43), name: "Nope", ip: "ip" }), "invalid_code");
    await rejectsCode(t.accounts.builderCodes.startJoin({ code: "hello", name: "Nope", ip: "ip" }), "invalid_code");
    const { code } = await t.accounts.builderCodes.issue();
    await rejectsCode(t.accounts.builderCodes.startJoin({ code, name: "   ", ip: "ip" }), "invalid_request");
    expect(await t.accounts.builderCodes.peek(code)).toBe(true);
  });

  it("expires after seven days", async () => {
    const t = testAccounts();
    const { code } = await t.accounts.builderCodes.issue();
    t.advance(7 * DAY - 1000);
    expect(await t.accounts.builderCodes.peek(code)).toBe(true);
    t.advance(2000);
    expect(await t.accounts.builderCodes.peek(code)).toBe(false);
    await rejectsCode(t.accounts.builderCodes.startJoin({ code, name: "Late", ip: "ip" }), "invalid_code");
    expect((await t.accounts.builderCodes.list())[0].state).toBe("expired");
  });

  it("can be revoked before use, and a revoke never reopens a used code", async () => {
    const t = testAccounts();
    const { code, view } = await t.accounts.builderCodes.issue("Old laptop");
    expect((await t.accounts.builderCodes.revoke(view.id)).state).toBe("revoked");
    await rejectsCode(t.accounts.builderCodes.startJoin({ code, name: "Nope", ip: "ip" }), "invalid_code");
    await rejectsCode(t.accounts.builderCodes.revoke("bcd_missing"), "not_found");

    const second = await t.accounts.builderCodes.issue();
    const { result } = await join(t, second.code);
    const after = await t.accounts.builderCodes.revoke(second.view.id);
    expect(after.state).toBe("used");
    expect(after.usedBy).toBe(result.user.id);
  });

  it("keeps the code open when the passkey prompt fails, and takes it only once when two finishes race", async () => {
    const t = testAccounts();
    const { code } = await t.accounts.builderCodes.issue();
    const key = new SoftPasskey(RP, ORIGIN);
    const start = await t.accounts.builderCodes.startJoin({ code, name: "Owner", ip: "ip" });
    // Wrong origin: the passkey check fails before anything is written.
    await rejectsCode(
      t.accounts.builderCodes.finishJoin({ challengeId: start.challengeId, response: key.register(start.options.challenge, { origin: "https://evil.example" }) as never, ip: "ip" }),
      "invalid_signature",
    );
    expect(await t.accounts.builderCodes.peek(code)).toBe(true);
    expect(await t.store.users.find()).toEqual([]);

    // Two join attempts for the same code: only the first to finish gets in.
    const a = await t.accounts.builderCodes.startJoin({ code, name: "A", ip: "ip" });
    const b = await t.accounts.builderCodes.startJoin({ code, name: "B", ip: "ip" });
    const keyA = new SoftPasskey(RP, ORIGIN);
    const keyB = new SoftPasskey(RP, ORIGIN);
    const [ra, rb] = await Promise.allSettled([
      t.accounts.builderCodes.finishJoin({ challengeId: a.challengeId, response: keyA.register(a.options.challenge) as never, ip: "ip" }),
      t.accounts.builderCodes.finishJoin({ challengeId: b.challengeId, response: keyB.register(b.options.challenge) as never, ip: "ip" }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect((await t.store.users.find()).filter((u) => u.builder)).toHaveLength(1);
  });

  it("does not let a join request be finished twice", async () => {
    const t = testAccounts();
    const { code } = await t.accounts.builderCodes.issue();
    const key = new SoftPasskey(RP, ORIGIN);
    const start = await t.accounts.builderCodes.startJoin({ code, name: "Owner", ip: "ip" });
    const response = key.register(start.options.challenge) as never;
    await t.accounts.builderCodes.finishJoin({ challengeId: start.challengeId, response, ip: "ip" });
    await rejectsCode(t.accounts.builderCodes.finishJoin({ challengeId: start.challengeId, response, ip: "ip" }), "invalid_signature");
  });

  it("keeps the email allowlist working, empty by default, next to the codes", async () => {
    const t = testAccounts({ builderEmails: ["owner@example.com"] });
    const listed = await t.signUp("owner@example.com");
    expect(t.accounts.isBuilder(listed.user)).toBe(true);
    expect(listed.user.builder).toBe(false);
    const { code } = await t.accounts.builderCodes.issue();
    const { result } = await join(t, code);
    const members = await t.store.members.find({ workspaceId: PLATFORM_WORKSPACE_ID });
    expect(members.map((m) => m.userId).sort()).toEqual([listed.user.id, result.user.id].sort());
    expect(members.every((m) => m.role === "owner")).toBe(true);
    // Members of the platform workspace show without an email.
    const views = await t.accounts.workspaces.members(as(result.user.id), PLATFORM_WORKSPACE_ID);
    expect(views.find((m) => m.userId === result.user.id)).toMatchObject({ email: null, name: "Funkai", role: "owner" });
  });

  it("never gives a builder from a code any other workspace, and a plain user never the platform one", async () => {
    const t = testAccounts();
    const ada = await t.signUp("ada@example.com");
    const { code } = await t.accounts.builderCodes.issue();
    const { result } = await join(t, code);
    await rejectsCode(t.accounts.workspaces.get(as(result.user.id), ada.user.personalWorkspaceId), "not_found");
    await rejectsCode(t.accounts.workspaces.get(as(ada.user.id), PLATFORM_WORKSPACE_ID), "not_found");
    // A passkey-only account cannot accept an invite meant for an email.
    await t.accounts.workspaces.invite(as(ada.user.id), ada.user.personalWorkspaceId, "bo@example.com", "editor");
    await rejectsCode(t.accounts.workspaces.acceptInvite(result.user.id, t.lastMail("bo@example.com").token), "forbidden");
  });
});
