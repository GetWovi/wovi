import { describe, expect, it } from "vitest";
import { SoftPasskey, rejectsCode, testAccounts } from "./test-helpers";

const RP = "localhost";
const ORIGIN = "http://localhost:3900";

async function withPasskey() {
  const t = testAccounts();
  const { user } = await t.signUp("ada@example.com");
  const key = new SoftPasskey(RP, ORIGIN);
  const { challengeId, options } = await t.accounts.passkeys.registrationOptions(user.id);
  expect(options.rp).toEqual({ id: RP, name: "WOVI" });
  const added = await t.accounts.passkeys.verifyRegistration(user.id, challengeId, key.register(options.challenge) as never, "MacBook");
  return { ...t, user, key, added };
}

describe("passkeys", () => {
  it("adds a passkey for a signed-in user", async () => {
    const { accounts, user, key, added } = await withPasskey();
    expect(added).toMatchObject({ id: key.id, name: "MacBook", lastUsedAt: null });
    expect(await accounts.passkeys.list(user.id)).toEqual([added]);
  });

  it("signs in with the passkey and no email", async () => {
    const { accounts, user, key, email } = await withPasskey();
    const before = email.sent.length;
    const { challengeId, options } = await accounts.passkeys.authenticationOptions("ip");
    const result = await accounts.passkeys.verifyAuthentication({ challengeId, response: key.authenticate(options.challenge, user.id) as never, ip: "ip" });
    expect(result.user.id).toBe(user.id);
    expect(result.session.method).toBe("passkey");
    expect(await accounts.sessions.get(result.token)).not.toBeNull();
    expect(email.sent.length).toBe(before);
    expect((await accounts.passkeys.list(user.id))[0].lastUsedAt).not.toBeNull();
  });

  it("uses each challenge once and refuses the wrong origin", async () => {
    const t = testAccounts();
    const { user } = await t.signUp("bo@example.com");
    const key = new SoftPasskey(RP, ORIGIN);
    const reg = await t.accounts.passkeys.registrationOptions(user.id);
    await rejectsCode(t.accounts.passkeys.verifyRegistration(user.id, reg.challengeId, key.register(reg.options.challenge, { origin: "https://evil.example" }) as never), "invalid_signature");
    await rejectsCode(t.accounts.passkeys.verifyRegistration(user.id, reg.challengeId, key.register(reg.options.challenge) as never), "invalid_signature");

    const reg2 = await t.accounts.passkeys.registrationOptions(user.id);
    await t.accounts.passkeys.verifyRegistration(user.id, reg2.challengeId, key.register(reg2.options.challenge) as never);
    const auth = await t.accounts.passkeys.authenticationOptions("ip");
    const response = key.authenticate(auth.options.challenge, user.id) as never;
    await t.accounts.passkeys.verifyAuthentication({ challengeId: auth.challengeId, response, ip: "ip" });
    await rejectsCode(t.accounts.passkeys.verifyAuthentication({ challengeId: auth.challengeId, response, ip: "ip" }), "invalid_signature");
  });

  it("refuses a passkey that claims another user, and one that was removed", async () => {
    const { accounts, user, key } = await withPasskey();
    const auth = await accounts.passkeys.authenticationOptions("ip");
    await rejectsCode(accounts.passkeys.verifyAuthentication({ challengeId: auth.challengeId, response: key.authenticate(auth.options.challenge, "usr_other") as never, ip: "ip" }), "invalid_signature");

    // A response signed for one challenge does not answer another.
    const a = await accounts.passkeys.authenticationOptions("ip");
    const b = await accounts.passkeys.authenticationOptions("ip");
    await rejectsCode(accounts.passkeys.verifyAuthentication({ challengeId: b.challengeId, response: key.authenticate(a.options.challenge, user.id) as never, ip: "ip" }), "invalid_signature");

    await accounts.passkeys.remove(user.id, key.id);
    const again = await accounts.passkeys.authenticationOptions("ip");
    await rejectsCode(accounts.passkeys.verifyAuthentication({ challengeId: again.challengeId, response: key.authenticate(again.options.challenge, user.id) as never, ip: "ip" }), "invalid_signature");
  });
});
