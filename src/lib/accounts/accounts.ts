/**
 * Accounts: users, the builder allowlist, the platform records and the one
 * authorize check every guarded call goes through. The parts live in their
 * own files and hang off this object:
 *
 *   accounts.signIn      email link and code          sign-in.ts
 *   accounts.sessions    cookies' server side          sessions.ts
 *   accounts.workspaces  workspaces, members, invites  workspaces.ts
 *   accounts.apiKeys     keys for MCP and REST         api-keys.ts
 *   accounts.passkeys    WebAuthn                      passkeys.ts
 *   accounts.wallets     wallet links by signature     wallets.ts
 */
import { PLATFORM_CREATOR_ID, PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { isWorkspaceId } from "@/lib/agents/registry";
import { ApiKeys } from "./api-keys";
import { newId } from "./crypto";
import type { EmailSender } from "./email";
import { AccountError } from "./errors";
import { Passkeys } from "./passkeys";
import { ACTION_WORDS, can, type Action, type Role } from "./policy";
import { RateLimiter, type Limit } from "./rate-limit";
import { Sessions } from "./sessions";
import { SignIn } from "./sign-in";
import type { AccountStore } from "./store";
import type { Challenge, ChallengeKind, Member, User, Workspace } from "./types";
import { Wallets } from "./wallets";
import { Workspaces } from "./workspaces";

/** Who is calling: a signed-in person, or an API key acting in one workspace. */
export type Principal =
  | { kind: "user"; userId: string }
  | { kind: "api_key"; keyId: string; userId: string; workspaceId: string; role: Exclude<Role, "owner"> };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type AccountsConfig = {
  /** Where the app runs. Links in emails, the passkey origin and the wallet message domain come from it. */
  appUrl: string;
  /** The passkey relying party name shown by the browser. */
  rpName: string;
  /** Emails that hold the hidden builder role. Empty by default. */
  builderEmails: string[];
  signInTtlMs: number;
  /** Wrong codes allowed per sign-in request before it is used up. */
  codeAttempts: number;
  inviteTtlMs: number;
  challengeTtlMs: number;
  session: {
    /** Absolute lifetime. */
    maxAgeMs: number;
    /** Ends a session not used for this long. */
    idleMs: number;
    /** A new token is issued when the current one is older than this. */
    rotateMs: number;
    /** How long the token before a rotation still works, for requests already in flight. */
    graceMs: number;
  };
  limits: {
    signInPerEmail: Limit;
    signInPerIp: Limit;
    verifyPerIp: Limit;
    passkeyPerIp: Limit;
    invitesPerWorkspace: Limit;
  };
};

export const DEFAULT_CONFIG: AccountsConfig = {
  appUrl: "http://localhost:3900",
  rpName: "WOVI",
  builderEmails: [],
  signInTtlMs: 15 * MIN,
  codeAttempts: 5,
  inviteTtlMs: 7 * DAY,
  challengeTtlMs: 5 * MIN,
  session: { maxAgeMs: 30 * DAY, idleMs: 7 * DAY, rotateMs: 12 * HOUR, graceMs: MIN },
  limits: {
    signInPerEmail: { max: 5, windowMs: 15 * MIN },
    signInPerIp: { max: 20, windowMs: 15 * MIN },
    verifyPerIp: { max: 30, windowMs: 15 * MIN },
    passkeyPerIp: { max: 30, windowMs: 15 * MIN },
    invitesPerWorkspace: { max: 30, windowMs: DAY },
  },
};

export type AccountsOptions = {
  store: AccountStore;
  email: EmailSender;
  /** Server secret for code hashes and CSRF tokens. At least 32 characters. */
  secret: string;
  config?: Partial<Omit<AccountsConfig, "session" | "limits">> & {
    session?: Partial<AccountsConfig["session"]>;
    limits?: Partial<AccountsConfig["limits"]>;
  };
  now?: () => Date;
};

/** Lowercased and trimmed, or null when it does not look like an email address. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@"<>()[\],;:]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)) return null;
  return email;
}

/** Reads WOVI_BUILDER_EMAILS: a comma-separated list. */
export function builderEmailsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.WOVI_BUILDER_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter((e): e is string => e !== null);
}

export const memberId = (workspaceId: string, userId: string) => `${workspaceId}:${userId}`;

export class Accounts {
  readonly cfg: AccountsConfig;
  readonly now: () => Date;
  readonly limiter: RateLimiter;
  readonly signIn: SignIn;
  readonly sessions: Sessions;
  readonly workspaces: Workspaces;
  readonly apiKeys: ApiKeys;
  readonly passkeys: Passkeys;
  readonly wallets: Wallets;

  constructor(readonly opts: AccountsOptions) {
    if (!opts.secret || opts.secret.length < 32) throw new Error("Accounts need a secret of at least 32 characters.");
    const c = opts.config ?? {};
    this.cfg = {
      ...DEFAULT_CONFIG,
      ...c,
      builderEmails: (c.builderEmails ?? DEFAULT_CONFIG.builderEmails).map(normalizeEmail).filter((e): e is string => e !== null),
      session: { ...DEFAULT_CONFIG.session, ...c.session },
      limits: { ...DEFAULT_CONFIG.limits, ...c.limits },
    };
    this.now = opts.now ?? (() => new Date());
    this.limiter = new RateLimiter(opts.store.rateLimits, this.now);
    this.signIn = new SignIn(this);
    this.sessions = new Sessions(this);
    this.workspaces = new Workspaces(this);
    this.apiKeys = new ApiKeys(this);
    this.passkeys = new Passkeys(this);
    this.wallets = new Wallets(this);
  }

  get store(): AccountStore {
    return this.opts.store;
  }

  get email(): EmailSender {
    return this.opts.email;
  }

  get secret(): string {
    return this.opts.secret;
  }

  iso(offsetMs = 0): string {
    return new Date(this.now().getTime() + offsetMs).toISOString();
  }

  /* ---------- Builder and platform ---------- */

  /** The hidden platform role. Read from the allowlist on every check, so removing an email takes effect at once. */
  isBuilder(email: string): boolean {
    return this.cfg.builderEmails.includes(email.toLowerCase());
  }

  /** Makes the platform workspace ws_wovi and the platform creator creator_wovi real records. Safe to call again. */
  async ensurePlatform(): Promise<void> {
    const at = this.iso();
    if (!(await this.store.workspaces.get(PLATFORM_WORKSPACE_ID))) {
      await this.store.workspaces
        .insert({ id: PLATFORM_WORKSPACE_ID, name: "WOVI", personal: false, plan: "free", createdBy: null, createdAt: at, updatedAt: at })
        .catch(() => undefined);
    }
    if (!(await this.store.creators.get(PLATFORM_CREATOR_ID))) {
      await this.store.creators
        .insert({ id: PLATFORM_CREATOR_ID, workspaceId: PLATFORM_WORKSPACE_ID, kind: "platform", name: "WOVI", createdAt: at })
        .catch(() => undefined);
    }
  }

  /** Builders own the platform workspace; anyone else loses that membership. Runs at every sign-in. */
  async syncPlatform(user: User): Promise<void> {
    await this.ensurePlatform();
    const id = memberId(PLATFORM_WORKSPACE_ID, user.id);
    const member = await this.store.members.get(id);
    if (this.isBuilder(user.email)) {
      if (!member) await this.addMember(PLATFORM_WORKSPACE_ID, user.id, "owner", null);
      else if (member.role !== "owner") await this.store.members.update({ ...member, role: "owner", updatedAt: this.iso() });
    } else if (member) {
      await this.store.members.delete(id);
    }
  }

  /* ---------- Users ---------- */

  async getUser(id: string): Promise<User | null> {
    return this.store.users.get(id);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const e = normalizeEmail(email);
    return e ? ((await this.store.users.find({ email: e }))[0] ?? null) : null;
  }

  /** The user with this email, made with a personal workspace when new. */
  async ensureUser(emailInput: string): Promise<{ user: User; created: boolean }> {
    const email = normalizeEmail(emailInput);
    if (!email) throw new AccountError("invalid_email", "Enter a valid email address.");
    const existing = await this.findUserByEmail(email);
    if (existing) return { user: existing, created: false };

    const at = this.iso();
    const id = newId("usr");
    const workspace = await this.createWorkspaceRow(id, "Personal", true);
    const user: User = { id, email, name: null, personalWorkspaceId: workspace.id, createdAt: at, updatedAt: at };
    await this.store.users.insert(user);
    return { user, created: true };
  }

  /**
   * The workspace a session lands in: the personal one, or else the first
   * membership. A user left with none (they handed their only workspaces to
   * others) gets a new personal workspace.
   */
  async homeWorkspace(user: User): Promise<string> {
    if (await this.roleIn({ kind: "user", userId: user.id }, user.personalWorkspaceId)) return user.personalWorkspaceId;
    const memberships = (await this.store.members.find({ userId: user.id }))
      .filter((m) => m.workspaceId !== PLATFORM_WORKSPACE_ID)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (memberships[0]) return memberships[0].workspaceId;
    const ws = await this.createWorkspaceRow(user.id, "Personal", true);
    await this.store.users.update({ ...user, personalWorkspaceId: ws.id, updatedAt: this.iso() });
    return ws.id;
  }

  /** A workspace and its first owner. */
  async createWorkspaceRow(ownerId: string, name: string, personal: boolean): Promise<Workspace> {
    const at = this.iso();
    const ws: Workspace = { id: newId("ws"), name, personal, plan: "free", createdBy: ownerId, createdAt: at, updatedAt: at };
    await this.store.workspaces.insert(ws);
    await this.addMember(ws.id, ownerId, "owner", null);
    return ws;
  }

  async addMember(workspaceId: string, userId: string, role: Role, invitedBy: string | null): Promise<Member> {
    const at = this.iso();
    const member: Member = { id: memberId(workspaceId, userId), workspaceId, userId, role, invitedBy, createdAt: at, updatedAt: at };
    await this.store.members.insert(member);
    return member;
  }

  /* ---------- Authorization ---------- */

  /**
   * The caller's role in a workspace, or null when they have none. An API key
   * only reaches its own workspace. The platform workspace answers only to
   * builders on the allowlist right now.
   */
  async roleIn(principal: Principal, workspaceId: string): Promise<Role | null> {
    if (!isWorkspaceId(workspaceId)) return null;
    if (principal.kind === "api_key") return principal.workspaceId === workspaceId ? principal.role : null;
    const user = await this.store.users.get(principal.userId);
    if (!user) return null;
    if (workspaceId === PLATFORM_WORKSPACE_ID && !this.isBuilder(user.email)) return null;
    return (await this.store.members.get(memberId(workspaceId, user.id)))?.role ?? null;
  }

  /**
   * Returns the caller's role when they may take `action` in the workspace.
   * Someone outside the workspace gets not_found, so they learn nothing about
   * it; a member without the role gets forbidden.
   */
  async authorize(principal: Principal, workspaceId: string, action: Action): Promise<Role> {
    const role = await this.roleIn(principal, workspaceId);
    if (!role) throw new AccountError("not_found", "No such workspace.");
    if (!can(role, action, principal.kind)) {
      const who = principal.kind === "api_key" ? "This API key" : `Your role (${role})`;
      throw new AccountError("forbidden", `${who} cannot ${ACTION_WORDS[action]} in this workspace.`);
    }
    return role;
  }

  /** Takes a challenge once. Null when it is unknown, used, expired, of another kind or for someone else. */
  async takeChallenge(id: string, kind: ChallengeKind, userId: string | null): Promise<Challenge | null> {
    if (typeof id !== "string") return null;
    const c = await this.store.challenges.updateIf(id, { usedAt: null, kind, userId }, { usedAt: this.iso() });
    if (!c || Date.parse(c.expiresAt) <= this.now().getTime()) return null;
    return c;
  }

  /** Drops expired sign-in requests, challenges, sessions and rate windows. Cheap enough to run now and then. */
  async sweep(): Promise<void> {
    const now = this.now().getTime();
    const past = (iso: string | null) => iso !== null && Date.parse(iso) <= now;
    for (const r of await this.store.signInRequests.find()) if (past(r.expiresAt) || r.usedAt) await this.store.signInRequests.delete(r.id);
    for (const c of await this.store.challenges.find()) if (past(c.expiresAt) || c.usedAt) await this.store.challenges.delete(c.id);
    for (const s of await this.store.sessions.find()) if (this.sessions.isExpired(s)) await this.store.sessions.delete(s.id);
    for (const b of await this.store.rateLimits.find()) if (past(b.resetAt)) await this.store.rateLimits.delete(b.id);
  }
}
