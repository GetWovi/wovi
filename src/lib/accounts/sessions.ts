/**
 * Sessions: the server side of the session cookie. The cookie holds a random
 * token; only its sha256 is stored. A session ends at its absolute expiry,
 * after a stretch without use, on sign out, or when the user signs out
 * everywhere. The token is replaced (rotated) once it is older than
 * `session.rotateMs`; the old one keeps working for `graceMs` so requests
 * already in flight do not fail.
 */
import type { Accounts } from "./accounts";
import { newId, randomToken, sha256 } from "./crypto";
import { AccountError } from "./errors";
import type { Session, SessionMethod, User } from "./types";

export type SessionInfo = {
  session: Session;
  user: User;
  /** Set when the token was rotated: the caller must send this new token in the cookie. */
  newToken: string | null;
};

/** A session as the user may see it in a list of their devices. */
export type SessionView = Pick<Session, "id" | "method" | "userAgent" | "createdAt" | "lastSeenAt" | "expiresAt">;

/** Only write lastSeenAt this often, so every request is not a write. */
const TOUCH_MS = 60_000;

export class Sessions {
  constructor(private readonly a: Accounts) {}

  /** A new session after a successful sign-in. The token goes in the cookie and is not kept. */
  async create(user: User, method: SessionMethod, userAgent: string | null = null): Promise<{ token: string; session: Session }> {
    const token = randomToken();
    const at = this.a.iso();
    const session: Session = {
      id: newId("ses"),
      tokenHash: sha256(token),
      prevTokenHash: null,
      prevValidUntil: null,
      userId: user.id,
      workspaceId: await this.a.homeWorkspace(user),
      method,
      userAgent: userAgent?.slice(0, 200) ?? null,
      createdAt: at,
      rotatedAt: at,
      lastSeenAt: at,
      expiresAt: this.a.iso(this.a.cfg.session.maxAgeMs),
    };
    await this.a.store.sessions.insert(session);
    return { token, session };
  }

  isExpired(s: Session): boolean {
    const now = this.a.now().getTime();
    return Date.parse(s.expiresAt) <= now || Date.parse(s.lastSeenAt) + this.a.cfg.session.idleMs <= now;
  }

  /**
   * The session for a cookie token, or null. With `rotate`, a token past its
   * rotation age is replaced and the new one returned in `newToken`; pass it
   * only where the response can set a cookie (server actions, route handlers).
   */
  async get(token: string | null | undefined, opts: { rotate?: boolean } = {}): Promise<SessionInfo | null> {
    if (!token || token.length > 200) return null;
    const hash = sha256(token);
    const now = this.a.now().getTime();

    let session = (await this.a.store.sessions.find({ tokenHash: hash }))[0] ?? null;
    let viaPrevious = false;
    if (!session) {
      session = (await this.a.store.sessions.find({ prevTokenHash: hash }))[0] ?? null;
      if (!session || !session.prevValidUntil || Date.parse(session.prevValidUntil) <= now) return null;
      viaPrevious = true;
    }
    if (this.isExpired(session)) {
      await this.a.store.sessions.delete(session.id);
      return null;
    }
    const user = await this.a.store.users.get(session.userId);
    if (!user) {
      await this.a.store.sessions.delete(session.id);
      return null;
    }

    let next: Session = session;
    // The current workspace may have gone (removed, left): fall back to home.
    if (!(await this.a.roleIn({ kind: "user", userId: user.id }, next.workspaceId))) {
      next = { ...next, workspaceId: await this.a.homeWorkspace(user) };
    }

    let newToken: string | null = null;
    if (opts.rotate && !viaPrevious && now - Date.parse(session.rotatedAt) >= this.a.cfg.session.rotateMs) {
      newToken = randomToken();
      next = {
        ...next,
        tokenHash: sha256(newToken),
        prevTokenHash: session.tokenHash,
        prevValidUntil: this.a.iso(this.a.cfg.session.graceMs),
        rotatedAt: this.a.iso(),
      };
    }
    if (now - Date.parse(session.lastSeenAt) >= TOUCH_MS) next = { ...next, lastSeenAt: this.a.iso() };

    if (next !== session) {
      // Only the request holding the current token may rotate it; a parallel one loses and keeps the old token.
      const saved = await this.a.store.sessions.updateIf(session.id, { tokenHash: session.tokenHash }, next);
      if (!saved) return this.get(token, { rotate: false });
      next = saved;
    }
    return { session: next, user, newToken };
  }

  /** Ends one session. */
  async signOut(token: string | null | undefined): Promise<void> {
    if (!token) return;
    const hash = sha256(token);
    for (const s of [...(await this.a.store.sessions.find({ tokenHash: hash })), ...(await this.a.store.sessions.find({ prevTokenHash: hash }))]) {
      await this.a.store.sessions.delete(s.id);
    }
  }

  /** Ends every session the user has, on every device. Returns how many. */
  async signOutEverywhere(userId: string): Promise<number> {
    const all = await this.a.store.sessions.find({ userId });
    for (const s of all) await this.a.store.sessions.delete(s.id);
    return all.length;
  }

  async list(userId: string): Promise<SessionView[]> {
    return (await this.a.store.sessions.find({ userId }))
      .filter((s) => !this.isExpired(s))
      .sort((x, y) => y.lastSeenAt.localeCompare(x.lastSeenAt))
      .map(({ id, method, userAgent, createdAt, lastSeenAt, expiresAt }) => ({ id, method, userAgent, createdAt, lastSeenAt, expiresAt }));
  }

  /** Makes another workspace current for this session. The user must be a member. */
  async switchWorkspace(sessionId: string, workspaceId: string): Promise<Session> {
    const session = await this.a.store.sessions.get(sessionId);
    if (!session) throw new AccountError("unauthenticated", "Sign in again.");
    await this.a.authorize({ kind: "user", userId: session.userId }, workspaceId, "view");
    const next = { ...session, workspaceId };
    await this.a.store.sessions.update(next);
    return next;
  }
}
