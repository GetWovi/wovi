/**
 * Wallet links, so holder features can read a wallet later. The server writes
 * a Sign-In With Ethereum message (EIP-4361) with a single-use nonce; the
 * wallet signs it as plain text (personal_sign) and the server recovers the
 * signer offline with viem. Signing a message never sends funds or approves
 * anything, and nothing here ever asks a wallet for a transaction. One wallet
 * links to one account. Plain key wallets (EOAs) only; smart contract wallets
 * (EIP-1271) would need a chain call and are not supported yet.
 */
import { getAddress, isAddress, isHex, recoverMessageAddress } from "viem";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import type { Accounts } from "./accounts";
import { newId } from "./crypto";
import { AccountError } from "./errors";
import type { Challenge, WalletLink } from "./types";

export const WALLET_STATEMENT = "Link this wallet to your WOVI account. Signing this message does not send funds or approve any transaction.";

export type WalletView = Pick<WalletLink, "address" | "chainId" | "linkedAt">;

export class Wallets {
  constructor(private readonly a: Accounts) {}

  /** The exact message the wallet signs, and the challenge to send back with the signature. */
  async linkMessage(userId: string, addressInput: string, chainId: number): Promise<{ challengeId: string; message: string }> {
    if (!(await this.a.store.users.get(userId))) throw new AccountError("unauthenticated", "Sign in again.");
    if (typeof addressInput !== "string" || !isAddress(addressInput, { strict: false })) throw new AccountError("invalid_request", "That is not a wallet address.");
    if (!Number.isSafeInteger(chainId) || chainId < 1) throw new AccountError("invalid_request", "The wallet sent an unknown network id.");
    const address = getAddress(addressInput);
    const url = new URL(this.a.cfg.appUrl);
    const message = createSiweMessage({
      domain: url.host,
      address,
      statement: WALLET_STATEMENT,
      uri: url.origin,
      version: "1",
      chainId,
      nonce: generateSiweNonce(),
      issuedAt: this.a.now(),
      expirationTime: new Date(this.a.now().getTime() + this.a.cfg.challengeTtlMs),
    });
    const c: Challenge = {
      id: newId("chl"),
      kind: "wallet_link",
      userId,
      value: message,
      address,
      meta: null,
      createdAt: this.a.iso(),
      expiresAt: this.a.iso(this.a.cfg.challengeTtlMs),
      usedAt: null,
    };
    await this.a.store.challenges.insert(c);
    return { challengeId: c.id, message };
  }

  /** Checks the signature over the stored message and links the wallet. */
  async verifyLink(userId: string, challengeId: string, signature: string): Promise<WalletView> {
    const c = await this.a.takeChallenge(challengeId, "wallet_link", userId);
    if (!c || !c.address) throw new AccountError("invalid_signature", "This request has expired. Try linking again.");
    if (typeof signature !== "string" || !isHex(signature) || signature.length > 1000) throw new AccountError("invalid_signature", "The signature is not valid.");

    let signer: string;
    try {
      signer = await recoverMessageAddress({ message: c.value, signature });
    } catch {
      throw new AccountError("invalid_signature", "The signature is not valid.");
    }
    if (signer.toLowerCase() !== c.address.toLowerCase()) throw new AccountError("invalid_signature", "The signature is not from that wallet.");

    const id = c.address.toLowerCase();
    const existing = await this.a.store.wallets.get(id);
    if (existing && existing.userId !== userId) throw new AccountError("conflict", "This wallet is linked to another account.");
    if (existing) return this.view(existing);
    const chainId = Number(/\nChain ID: (\d+)\n/.exec(c.value)?.[1] ?? 0);
    const link: WalletLink = { id, userId, address: c.address, chainId, linkedAt: this.a.iso() };
    await this.a.store.wallets.insert(link);
    return this.view(link);
  }

  private view(w: WalletLink): WalletView {
    return { address: w.address, chainId: w.chainId, linkedAt: w.linkedAt };
  }

  async list(userId: string): Promise<WalletView[]> {
    return (await this.a.store.wallets.find({ userId })).sort((x, y) => x.linkedAt.localeCompare(y.linkedAt)).map((w) => this.view(w));
  }

  async unlink(userId: string, address: string): Promise<void> {
    const w = typeof address === "string" ? await this.a.store.wallets.get(address.toLowerCase()) : null;
    if (!w || w.userId !== userId) throw new AccountError("not_found", "No such linked wallet.");
    await this.a.store.wallets.delete(w.id);
  }
}
