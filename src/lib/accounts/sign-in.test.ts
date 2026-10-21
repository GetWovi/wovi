import { describe, expect, it } from "vitest";
import { safeNext } from "./sign-in";
import { rejectsCode, testAccounts } from "./test-helpers";

const MIN = 60_000;

describe("email sign-in", () => {
  it("mails a link and a six-digit code, and signs up an unknown address with a personal workspace", async () => {
    const { accounts, email, lastMail, store } = testAccounts();
    await accounts.signIn.request({ email: "  Ada@Example.com ", ip: "1.1.1.1" });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("ada@example.com");
    const { token, code } = lastMail("ada@example.com");
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(code).toMatch(/^\d{6}$/);
    // Only hashes are stored.
    const [req] = await store.signInRequests.find();
    expect(JSON.stringify(req)).not.toContain(token);
    expect(JSON.stringify(req)).not.toContain(code);

    const result = await accounts.signIn.verifyCode({ email: "ada@example.com", code, ip: "1.1.1.1" });
    expect(result.created).toBe(true);
    expect(result.user.email).toBe("ada@example.com");
    expect(result.session.workspaceId).toBe(result.user.personalWorkspaceId);
    const ws = await accounts.workspaces.listForUser(result.user.id);
    expect(ws).toEqual([expect.objectContaining({ id: result.user.personalWorkspaceId, personal: true, role: "owner" })]);

    // Signing in again finds the same user.
    await accounts.signIn.request({ email: "ada@example.com", ip: "1.1.1.1" });
    const again = await accounts.signIn.verifyLink({ token: lastMail("ada@example.com").token, ip: "1.1.1.1" });
    expect(again.created).toBe(false);
    expect(again.user.id).toBe(result.user.id);
  });

  it("uses a request once: the link and the code together", async () => {
    const { accounts, lastMail } = testAccounts();
    await accounts.signIn.request({ email: "bo@example.com", ip: "ip" });
    const { token, code } = lastMail("bo@example.com");
    await accounts.signIn.verifyLink({ token, ip: "ip" });
    await rejectsCode(accounts.signIn.verifyLink({ token, ip: "ip" }), "invalid_link");
    await rejectsCode(accounts.signIn.verifyCode({ email: "bo@example.com", code, ip: "ip" }), "invalid_code");
  });

  it("lets only one of two parallel uses of a link through", async () => {
    const { accounts, lastMail } = testAccounts();
    await accounts.signIn.request({ email: "par@example.com", ip: "ip" });
    const { token } = lastMail("par@example.com");
    const results = await Promise.allSettled([accounts.signIn.verifyLink({ token, ip: "ip" }), accounts.signIn.verifyLink({ token, ip: "ip" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("expires the link and the code", async () => {
    const { accounts, lastMail, advance } = testAccounts();
    await accounts.signIn.request({ email: "cy@example.com", ip: "ip" });
    const { token, code } = lastMail("cy@example.com");
    expect(await accounts.signIn.peekLink(token)).toEqual({ email: "cy@example.com" });
    advance(15 * MIN);
    expect(await accounts.signIn.peekLink(token)).toBeNull();
    await rejectsCode(accounts.signIn.verifyLink({ token, ip: "ip" }), "invalid_link");
    await rejectsCode(accounts.signIn.verifyCode({ email: "cy@example.com", code, ip: "ip" }), "invalid_code");
  });

  it("replaces an open request with a new one", async () => {
    const { accounts, lastMail } = testAccounts();
    await accounts.signIn.request({ email: "di@example.com", ip: "ip" });
    const first = lastMail("di@example.com");
    await accounts.signIn.request({ email: "di@example.com", ip: "ip" });
    await rejectsCode(accounts.signIn.verifyLink({ token: first.token, ip: "ip" }), "invalid_link");
    await accounts.signIn.verifyLink({ token: lastMail("di@example.com").token, ip: "ip" });
  });

  it("burns the request after five wrong codes, even when the sixth is right", async () => {
    const { accounts, lastMail } = testAccounts();
    await accounts.signIn.request({ email: "ed@example.com", ip: "ip" });
    const { code } = lastMail("ed@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await rejectsCode(accounts.signIn.verifyCode({ email: "ed@example.com", code: wrong, ip: "ip" }), "invalid_code");
    await rejectsCode(accounts.signIn.verifyCode({ email: "ed@example.com", code, ip: "ip" }), "invalid_code");
  });

  it("rate limits requests per address and per IP", async () => {
    const { accounts, advance } = testAccounts();
    for (let i = 0; i < 5; i++) await accounts.signIn.request({ email: "fi@example.com", ip: `ip${i}` });
    const err = await rejectsCode(accounts.signIn.request({ email: "fi@example.com", ip: "ip9" }), "rate_limited");
    expect((err as unknown as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0);
    advance(15 * MIN);
    await accounts.signIn.request({ email: "fi@example.com", ip: "ip9" });

    for (let i = 0; i < 20; i++) await accounts.signIn.request({ email: `u${i}@example.com`, ip: "same" });
    await rejectsCode(accounts.signIn.request({ email: "new@example.com", ip: "same" }), "rate_limited");
  });

  it("rate limits code and link checks per IP", async () => {
    const { accounts } = testAccounts();
    for (let i = 0; i < 30; i++) await rejectsCode(accounts.signIn.verifyCode({ email: "x@example.com", code: "123456", ip: "bad" }), "invalid_code");
    await rejectsCode(accounts.signIn.verifyLink({ token: "x".repeat(43), ip: "bad" }), "rate_limited");
  });

  it("refuses an address that is not an email", async () => {
    const { accounts, email } = testAccounts();
    await rejectsCode(accounts.signIn.request({ email: "not an email", ip: "ip" }), "invalid_email");
    expect(email.sent).toHaveLength(0);
  });

  it("carries a local path to land on, and nothing else", async () => {
    const { accounts, lastMail } = testAccounts();
    await accounts.signIn.request({ email: "gi@example.com", ip: "ip", next: "/invite?token=abc" });
    expect((await accounts.signIn.verifyLink({ token: lastMail("gi@example.com").token, ip: "ip" })).next).toBe("/invite?token=abc");
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("/account")).toBe("/account");
  });
});
