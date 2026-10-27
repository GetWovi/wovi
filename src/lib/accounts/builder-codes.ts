/**
 * Builder codes: the way into the hidden Agent Builder without putting
 * anyone's email in a config. A code is made on the command line
 * (`npm run builder:code`), handed over out of band, and redeemed once on the
 * hidden join page with a passkey. The person gets an account with no email,
 * the builder role, and ownership of the platform workspace.
 *
 * Only the sha256 of a code is stored. A code expires after
 * `builderCodeTtlMs` (7 days) and can be revoked before it is used.
 *
 * The join is two steps, like adding a passkey: `startJoin` checks the code
 * and makes the browser's passkey creation options for a user id that does
 * not exist yet; `finishJoin` verifies the passkey, takes the code (the one
 * single-use step), and only then creates the user, the passkey and the
 * session. A passkey prompt that fails leaves the code open for another try.
 */
import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { Accounts } from "./accounts";
import { newId, randomToken, sha256 } from "./crypto";
import { AccountError } from "./errors";
import type { SignInResult } from "./sign-in";
import type { BuilderCode, Challenge } from "./types";

export const BUILDER_CODE_PREFIX = "wovi_builder_";

export type BuilderCodeView = Pick<BuilderCode, "id" | "suffix" | "label" | "createdAt" | "expiresAt" | "usedAt" | "usedBy" | "revokedAt"> & {
  state: "open" | "used" | "revoked" | "expired";
};

const BAD_CODE = "This builder code is not valid, was already used, or has expired.";
const BAD_NAME = "Enter a display name of 1 to 60 characters.";

function cleanName(name: unknown): string {
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (n.length < 1 || n.length > 60) throw new AccountError("invalid_request", BAD_NAME);
  return n;
}

export class BuilderCodes {
  constructor(private readonly a: Accounts) {}

  /** A new single-use code. The plain code is returned once and never stored. */
  async issue(label: string | null = null): Promise<{ code: string; view: BuilderCodeView }> {
    const code = BUILDER_CODE_PREFIX + randomToken(32);
    const row: BuilderCode = {
      id: newId("bcd"),
      codeHash: sha256(code),
      suffix: code.slice(-6),
      label: label?.trim().slice(0, 60) || null,
      createdAt: this.a.iso(),
      expiresAt: this.a.iso(this.a.cfg.builderCodeTtlMs),
      usedAt: null,
      usedBy: null,
      revokedAt: null,
    };
    await this.a.store.builderCodes.insert(row);
    return { code, view: this.view(row) };
  }

  /**
   * Stores a code made somewhere else (a hidden server variable, for a host
   * with no shell). Safe to call on every start: a code already stored, used
   * or revoked is left alone and null comes back.
   */
  async issueKnown(code: string, label: string | null = null): Promise<BuilderCodeView | null> {
    const trimmed = code.trim();
    if (!trimmed.startsWith(BUILDER_CODE_PREFIX) || trimmed.length < 40 || trimmed.length > 120) throw new Error(`A builder code starts with ${BUILDER_CODE_PREFIX} and is 40 to 120 characters long.`);
    if ((await this.a.store.builderCodes.find({ codeHash: sha256(trimmed) })).length) return null;
    const row: BuilderCode = {
      id: newId("bcd"),
      codeHash: sha256(trimmed),
      suffix: trimmed.slice(-6),
      label: label?.trim().slice(0, 60) || null,
      createdAt: this.a.iso(),
      expiresAt: this.a.iso(this.a.cfg.builderCodeTtlMs),
      usedAt: null,
      usedBy: null,
      revokedAt: null,
    };
    await this.a.store.builderCodes.insert(row);
    return this.view(row);
  }

  async list(): Promise<BuilderCodeView[]> {
    return (await this.a.store.builderCodes.find()).sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map((r) => this.view(r));
  }

  /** Revokes an open code. Used and expired codes are left as they are. */
  async revoke(id: string): Promise<BuilderCodeView> {
    const row = await this.a.store.builderCodes.get(id);
    if (!row) throw new AccountError("not_found", "No such builder code.");
    const next = (await this.a.store.builderCodes.updateIf(id, { usedAt: null, revokedAt: null }, { revokedAt: this.a.iso() })) ?? row;
    return this.view(next);
  }

  private isOpen(row: BuilderCode | null | undefined): row is BuilderCode {
    return Boolean(row && !row.usedAt && !row.revokedAt && Date.parse(row.expiresAt) > this.a.now().getTime());
  }

  private async findOpen(code: unknown): Promise<BuilderCode | null> {
    if (typeof code !== "string") return null;
    const trimmed = code.trim();
    if (!trimmed.startsWith(BUILDER_CODE_PREFIX) || trimmed.length < 40 || trimmed.length > 120) return null;
    const row = (await this.a.store.builderCodes.find({ codeHash: sha256(trimmed) }))[0];
    return this.isOpen(row) ? row : null;
  }

  /** Whether a code could be redeemed right now. Does not use it. */
  async peek(code: unknown): Promise<boolean> {
    return (await this.findOpen(code)) !== null;
  }

  /* ---------- Joining ---------- */

  /**
   * Step one of the join: the code must be open and the name valid. Returns
   * the browser's passkey creation options for a user that does not exist yet.
   */
  async startJoin(input: { code: string; name: string; ip: string }): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
    await this.a.limiter.hit(`builder-join:ip:${input.ip}`, this.a.cfg.limits.passkeyPerIp);
    const name = cleanName(input.name);
    const row = await this.findOpen(input.code);
    if (!row) throw new AccountError("invalid_code", BAD_CODE);
    const userId = newId("usr");
    const options = await this.a.passkeys.creationOptions(userId, name);
    const c: Challenge = {
      id: newId("chl"),
      kind: "builder_join",
      userId,
      value: options.challenge,
      address: null,
      meta: { codeId: row.id, name },
      createdAt: this.a.iso(),
      expiresAt: this.a.iso(this.a.cfg.challengeTtlMs),
      usedAt: null,
    };
    await this.a.store.challenges.insert(c);
    return { challengeId: c.id, options };
  }

  /**
   * Step two: verifies the passkey, takes the code, and makes the account.
   * The code is taken in one conditional write, so two people with the same
   * code cannot both get in.
   */
  async finishJoin(input: { challengeId: string; response: RegistrationResponseJSON; ip: string; userAgent?: string | null }): Promise<SignInResult> {
    await this.a.limiter.hit(`builder-join:ip:${input.ip}`, this.a.cfg.limits.passkeyPerIp);
    const c = typeof input.challengeId === "string" ? await this.a.store.challenges.get(input.challengeId) : null;
    if (!c || c.kind !== "builder_join" || c.usedAt || !c.userId || !c.meta || Date.parse(c.expiresAt) <= this.a.now().getTime()) {
      throw new AccountError("invalid_signature", "This join request has expired. Start again.");
    }
    // The passkey is checked before anything is written, so a failed prompt costs nothing.
    const info = await this.a.passkeys.checkRegistration(c.value, input.response);
    if (await this.a.store.passkeys.get(info.credential.id)) throw new AccountError("conflict", "This passkey already belongs to an account. Sign in with it instead.");

    const taken = await this.a.takeChallenge(c.id, "builder_join", c.userId);
    if (!taken) throw new AccountError("invalid_signature", "This join request was already used. Start again.");
    const codeRow = await this.a.store.builderCodes.get(c.meta.codeId);
    const claimed = this.isOpen(codeRow) ? await this.a.store.builderCodes.updateIf(codeRow.id, { usedAt: null, revokedAt: null }, { usedAt: this.a.iso(), usedBy: c.userId }) : null;
    if (!claimed) throw new AccountError("invalid_code", BAD_CODE);

    await this.a.ensurePlatform();
    const user = await this.a.createPasskeyOnlyUserWithId(c.userId, c.meta.name, true);
    await this.a.passkeys.savePasskey(user.id, info, input.response, "Builder passkey");
    await this.a.syncPlatform(user);
    const { token, session } = await this.a.sessions.create(user, "passkey", input.userAgent ?? null);
    return { user, created: true, token, session, next: "/builder" };
  }

  private view(r: BuilderCode): BuilderCodeView {
    const state = r.usedAt ? "used" : r.revokedAt ? "revoked" : Date.parse(r.expiresAt) <= this.a.now().getTime() ? "expired" : "open";
    const { id, suffix, label, createdAt, expiresAt, usedAt, usedBy, revokedAt } = r;
    return { id, suffix, label, createdAt, expiresAt, usedAt, usedBy, revokedAt, state };
  }
}
