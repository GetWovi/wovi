/**
 * Email sign-in without passwords. One request makes a link and a six-digit
 * code, mailed together. Either one signs in, once, within signInTtlMs. A new
 * request replaces the old one. Signing in with an unknown email signs up:
 * the user and their personal workspace are made then.
 *
 * Limits: requests per email and per IP, verify attempts per IP, and
 * `codeAttempts` wrong codes per request before it is used up. Answers never
 * say whether an email has an account.
 */
import { normalizeEmail, type Accounts } from "./accounts";
import { hmac, newId, randomToken, safeEqual, sha256, sixDigitCode } from "./crypto";
import { AccountError } from "./errors";
import type { Session, SignInRequest, User } from "./types";

export type SignInResult = {
  user: User;
  /** True when this sign-in made the account. */
  created: boolean;
  token: string;
  session: Session;
  /** Where to go next: the local path given at request time, if any. */
  next: string | null;
};

/** A path on this site only, so a sign-in link can never send someone elsewhere. */
export function safeNext(next: unknown): string | null {
  if (typeof next !== "string" || next.length > 500) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  return next;
}

const BAD_CODE = "That code is not right, or it has expired. Ask for a new one.";
const BAD_LINK = "This sign-in link has expired or was already used. Ask for a new one.";

export class SignIn {
  constructor(private readonly a: Accounts) {}

  private codeHash(requestId: string, code: string) {
    return hmac(this.a.secret, `signin-code:${requestId}:${code}`);
  }

  /** Mails a link and a code to the address. Always answers the same way for a valid address. */
  async request(input: { email: string; ip: string; next?: string | null }): Promise<{ expiresAt: string }> {
    const email = normalizeEmail(input.email);
    if (!email) throw new AccountError("invalid_email", "Enter a valid email address.");
    await this.a.limiter.hit(`signin:ip:${input.ip}`, this.a.cfg.limits.signInPerIp);
    await this.a.limiter.hit(`signin:email:${email}`, this.a.cfg.limits.signInPerEmail, "Too many sign-in emails for this address. Wait a little and try again.");
    await this.a.sweep();

    // One open request per address: a new one replaces the last.
    for (const old of await this.a.store.signInRequests.find({ email })) await this.a.store.signInRequests.delete(old.id);

    const id = newId("sir");
    const token = randomToken();
    const code = sixDigitCode();
    const req: SignInRequest = {
      id,
      email,
      tokenHash: sha256(token),
      codeHash: this.codeHash(id, code),
      next: safeNext(input.next),
      attempts: 0,
      createdAt: this.a.iso(),
      expiresAt: this.a.iso(this.a.cfg.signInTtlMs),
      usedAt: null,
    };
    await this.a.store.signInRequests.insert(req);

    const minutes = Math.round(this.a.cfg.signInTtlMs / 60_000);
    const link = `${this.a.cfg.appUrl}/sign-in/verify?token=${token}`;
    await this.a.email.send({
      to: email,
      subject: `Your WOVI sign-in code: ${code}`,
      text: [
        "Sign in to WOVI with this link:",
        link,
        "",
        `Or enter this code: ${code}`,
        "",
        `Both work once and expire in ${minutes} minutes. If you did not ask for this, ignore this email.`,
      ].join("\n"),
    });
    return { expiresAt: req.expiresAt };
  }

  /** Signs in with the code from the email. */
  async verifyCode(input: { email: string; code: string; ip: string; userAgent?: string | null }): Promise<SignInResult> {
    await this.a.limiter.hit(`verify:ip:${input.ip}`, this.a.cfg.limits.verifyPerIp);
    const email = normalizeEmail(input.email);
    const code = typeof input.code === "string" ? input.code.replace(/\s+/g, "") : "";
    if (!email || !/^\d{6}$/.test(code)) throw new AccountError("invalid_code", BAD_CODE);

    const now = this.a.now().getTime();
    const req = (await this.a.store.signInRequests.find({ email, usedAt: null })).find((r) => Date.parse(r.expiresAt) > now);
    if (!req) throw new AccountError("invalid_code", BAD_CODE);

    // Count the try first, so parallel guesses cannot pass the limit.
    const counted = await this.a.store.signInRequests.updateIf(req.id, { attempts: req.attempts, usedAt: null }, { attempts: req.attempts + 1 });
    if (!counted || counted.attempts > this.a.cfg.codeAttempts) {
      await this.a.store.signInRequests.updateIf(req.id, { usedAt: null }, { usedAt: this.a.iso() });
      throw new AccountError("invalid_code", BAD_CODE);
    }
    if (!safeEqual(this.codeHash(req.id, code), req.codeHash)) {
      if (counted.attempts >= this.a.cfg.codeAttempts) await this.a.store.signInRequests.updateIf(req.id, { usedAt: null }, { usedAt: this.a.iso() });
      throw new AccountError("invalid_code", BAD_CODE);
    }
    return this.complete(req, input.userAgent ?? null, BAD_CODE, "invalid_code");
  }

  /** Signs in with the token from the email link. */
  async verifyLink(input: { token: string; ip: string; userAgent?: string | null }): Promise<SignInResult> {
    await this.a.limiter.hit(`verify:ip:${input.ip}`, this.a.cfg.limits.verifyPerIp);
    if (typeof input.token !== "string" || input.token.length < 20 || input.token.length > 200) throw new AccountError("invalid_link", BAD_LINK);
    const req = (await this.a.store.signInRequests.find({ tokenHash: sha256(input.token) }))[0];
    if (!req || req.usedAt || Date.parse(req.expiresAt) <= this.a.now().getTime()) throw new AccountError("invalid_link", BAD_LINK);
    return this.complete(req, input.userAgent ?? null, BAD_LINK, "invalid_link");
  }

  /** What a link would sign in as, for the landing page. Does not use the link up. */
  async peekLink(token: string): Promise<{ email: string } | null> {
    if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
    const req = (await this.a.store.signInRequests.find({ tokenHash: sha256(token) }))[0];
    if (!req || req.usedAt || Date.parse(req.expiresAt) <= this.a.now().getTime()) return null;
    return { email: req.email };
  }

  private async complete(req: SignInRequest, userAgent: string | null, message: string, code: "invalid_code" | "invalid_link"): Promise<SignInResult> {
    // Single use: only one caller can move usedAt from null.
    const claimed = await this.a.store.signInRequests.updateIf(req.id, { usedAt: null }, { usedAt: this.a.iso() });
    if (!claimed) throw new AccountError(code, message);

    const { user, created } = await this.a.ensureUser(req.email);
    await this.a.syncPlatform(user);
    await this.a.limiter.reset(`signin:email:${req.email}`);
    const { token, session } = await this.a.sessions.create(user, "email", userAgent);
    return { user, created, token, session, next: req.next };
  }
}
