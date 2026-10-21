import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { WALLET_STATEMENT } from "./wallets";
import { rejectsCode, testAccounts } from "./test-helpers";

/** A throwaway key made for each test run. Never funded, never stored. */
const wallet = () => privateKeyToAccount(generatePrivateKey());

describe("wallet links", () => {
  it("links a wallet that signs the server's message, and stores only the address", async () => {
    const { accounts, signUp, store } = testAccounts();
    const { user } = await signUp("ada@example.com");
    const w = wallet();
    const { challengeId, message } = await accounts.wallets.linkMessage(user.id, w.address.toLowerCase(), 4663);
    expect(message).toContain("localhost:3900 wants you to sign in with your Ethereum account:");
    expect(message).toContain(w.address);
    expect(message).toContain(WALLET_STATEMENT);
    expect(message).toContain("Chain ID: 4663");

    const linked = await accounts.wallets.verifyLink(user.id, challengeId, await w.signMessage({ message }));
    expect(linked).toEqual({ address: w.address, chainId: 4663, linkedAt: expect.any(String) });
    expect(await accounts.wallets.list(user.id)).toEqual([linked]);
    expect(Object.keys((await store.wallets.find())[0]).sort()).toEqual(["address", "chainId", "id", "linkedAt", "userId"]);
  });

  it("refuses a signature from another wallet, a reused or expired request, and someone else's request", async () => {
    const { accounts, signUp, advance } = testAccounts();
    const ada = (await signUp("ada@example.com")).user;
    const bo = (await signUp("bo@example.com")).user;
    const w = wallet();

    const one = await accounts.wallets.linkMessage(ada.id, w.address, 1);
    await rejectsCode(accounts.wallets.verifyLink(ada.id, one.challengeId, await wallet().signMessage({ message: one.message })), "invalid_signature");
    // The failed try used the request up.
    await rejectsCode(accounts.wallets.verifyLink(ada.id, one.challengeId, await w.signMessage({ message: one.message })), "invalid_signature");

    const two = await accounts.wallets.linkMessage(ada.id, w.address, 1);
    await rejectsCode(accounts.wallets.verifyLink(bo.id, two.challengeId, await w.signMessage({ message: two.message })), "invalid_signature");

    const three = await accounts.wallets.linkMessage(ada.id, w.address, 1);
    advance(5 * 60_000);
    await rejectsCode(accounts.wallets.verifyLink(ada.id, three.challengeId, await w.signMessage({ message: three.message })), "invalid_signature");

    const four = await accounts.wallets.linkMessage(ada.id, w.address, 1);
    await rejectsCode(accounts.wallets.verifyLink(ada.id, four.challengeId, "0xdeadbeef"), "invalid_signature");
    await rejectsCode(accounts.wallets.linkMessage(ada.id, "0x123", 1), "invalid_request");
  });

  it("links one wallet to one account, and unlinks", async () => {
    const { accounts, signUp } = testAccounts();
    const ada = (await signUp("ada@example.com")).user;
    const bo = (await signUp("bo@example.com")).user;
    const w = wallet();
    const link = async (userId: string) => {
      const { challengeId, message } = await accounts.wallets.linkMessage(userId, w.address, 1);
      return accounts.wallets.verifyLink(userId, challengeId, await w.signMessage({ message }));
    };
    await link(ada.id);
    await rejectsCode(link(bo.id), "conflict");
    await rejectsCode(accounts.wallets.unlink(bo.id, w.address), "not_found");
    await accounts.wallets.unlink(ada.id, w.address.toUpperCase().replace("0X", "0x"));
    expect(await accounts.wallets.list(ada.id)).toEqual([]);
    await link(bo.id);
  });
});
