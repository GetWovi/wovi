/**
 * Passkeys (WebAuthn), through @simplewebauthn/server. A signed-in user adds
 * a passkey from settings; after that they can sign in with it and no email.
 * Every ceremony uses a server challenge that lives challengeTtlMs and works
 * once. The origin and relying party id come from appUrl.
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Accounts } from "./accounts";
import { newId } from "./crypto";
import { AccountError } from "./errors";
import type { SignInResult } from "./sign-in";
import type { Challenge, ChallengeKind, Passkey } from "./types";

export type PasskeyView = Pick<Passkey, "id" | "name" | "createdAt" | "lastUsedAt">;

const b64u = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

const FAILED = "That passkey did not work. Try again, or sign in with email.";

export class Passkeys {
  constructor(private readonly a: Accounts) {}

  get origin(): string {
    return new URL(this.a.cfg.appUrl).origin;
  }

  get rpId(): string {
    return new URL(this.a.cfg.appUrl).hostname;
  }

  private async saveChallenge(kind: ChallengeKind, userId: string | null, value: string): Promise<Challenge> {
    const c: Challenge = {
      id: newId("chl"),
      kind,
      userId,
      value,
      address: null,
      createdAt: this.a.iso(),
      expiresAt: this.a.iso(this.a.cfg.challengeTtlMs),
      usedAt: null,
    };
    await this.a.store.challenges.insert(c);
    return c;
  }

  /* ---------- Adding a passkey (signed in) ---------- */

  async registrationOptions(userId: string): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
    const user = await this.a.store.users.get(userId);
    if (!user) throw new AccountError("unauthenticated", "Sign in again.");
    const existing = await this.a.store.passkeys.find({ userId });
    const options = await generateRegistrationOptions({
      rpName: this.a.cfg.rpName,
      rpID: this.rpId,
      userName: user.email,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    const c = await this.saveChallenge("passkey_register", userId, options.challenge);
    return { challengeId: c.id, options };
  }

  async verifyRegistration(userId: string, challengeId: string, response: RegistrationResponseJSON, name = "Passkey"): Promise<PasskeyView> {
    const c = await this.a.takeChallenge(challengeId, "passkey_register", userId);
    if (!c) throw new AccountError("invalid_signature", FAILED);
    let info;
    try {
      const result = await verifyRegistrationResponse({
        response,
        expectedChallenge: c.value,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        requireUserVerification: false,
      });
      if (!result.verified) throw new Error("not verified");
      info = result.registrationInfo;
    } catch {
      throw new AccountError("invalid_signature", FAILED);
    }
    if (await this.a.store.passkeys.get(info.credential.id)) throw new AccountError("conflict", "This passkey is already added.");
    const passkey: Passkey = {
      id: info.credential.id,
      userId,
      publicKey: b64u(info.credential.publicKey),
      counter: info.credential.counter,
      transports: info.credential.transports ?? response.response.transports ?? [],
      name: name.trim().slice(0, 60) || "Passkey",
      createdAt: this.a.iso(),
      lastUsedAt: null,
    };
    await this.a.store.passkeys.insert(passkey);
    return this.view(passkey);
  }

  /* ---------- Signing in with a passkey ---------- */

  async authenticationOptions(ip: string): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
    await this.a.limiter.hit(`passkey:ip:${ip}`, this.a.cfg.limits.passkeyPerIp);
    const options = await generateAuthenticationOptions({ rpID: this.rpId, userVerification: "preferred" });
    const c = await this.saveChallenge("passkey_auth", null, options.challenge);
    return { challengeId: c.id, options };
  }

  async verifyAuthentication(input: { challengeId: string; response: AuthenticationResponseJSON; ip: string; userAgent?: string | null }): Promise<SignInResult> {
    await this.a.limiter.hit(`passkey:ip:${input.ip}`, this.a.cfg.limits.passkeyPerIp);
    const c = await this.a.takeChallenge(input.challengeId, "passkey_auth", null);
    const passkey = typeof input.response?.id === "string" ? await this.a.store.passkeys.get(input.response.id) : null;
    if (!c || !passkey) throw new AccountError("invalid_signature", FAILED);
    const handle = input.response.response?.userHandle;
    if (handle && Buffer.from(handle, "base64url").toString("utf8") !== passkey.userId) throw new AccountError("invalid_signature", FAILED);

    let newCounter: number;
    try {
      const result = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: c.value,
        expectedOrigin: this.origin,
        expectedRPID: this.rpId,
        credential: { id: passkey.id, publicKey: fromB64u(passkey.publicKey), counter: passkey.counter, transports: passkey.transports },
        requireUserVerification: false,
      });
      if (!result.verified) throw new Error("not verified");
      newCounter = result.authenticationInfo.newCounter;
    } catch {
      throw new AccountError("invalid_signature", FAILED);
    }

    const user = await this.a.store.users.get(passkey.userId);
    if (!user) throw new AccountError("invalid_signature", FAILED);
    await this.a.store.passkeys.update({ ...passkey, counter: newCounter, lastUsedAt: this.a.iso() });
    await this.a.syncPlatform(user);
    const { token, session } = await this.a.sessions.create(user, "passkey", input.userAgent ?? null);
    return { user, created: false, token, session, next: null };
  }

  /* ---------- Managing ---------- */

  private view(p: Passkey): PasskeyView {
    return { id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt };
  }

  async list(userId: string): Promise<PasskeyView[]> {
    return (await this.a.store.passkeys.find({ userId })).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map((p) => this.view(p));
  }

  async remove(userId: string, passkeyId: string): Promise<void> {
    const p = await this.a.store.passkeys.get(passkeyId);
    if (!p || p.userId !== userId) throw new AccountError("not_found", "No such passkey.");
    await this.a.store.passkeys.delete(passkeyId);
  }
}
