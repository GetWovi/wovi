/**
 * Workspaces, members and invites. Every user has a personal workspace and
 * can make more for a team or a client. Members hold one role each. Invites
 * go by email, expire, and work once, for the address they were sent to.
 * A workspace always keeps at least one owner.
 */
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { memberId, normalizeEmail, type Accounts, type Principal } from "./accounts";
import { newId, randomToken, sha256 } from "./crypto";
import { AccountError } from "./errors";
import { canAssign, canRemove, isRole, type Role } from "./policy";
import type { Invite, Member, User, Workspace } from "./types";

export type MemberView = { userId: string; email: string; name: string | null; role: Role; joinedAt: string };
export type InviteView = Pick<Invite, "id" | "email" | "role" | "createdAt" | "expiresAt"> & { invitedBy: string | null; expired: boolean };
export type WorkspaceView = Workspace & { role: Role };

const PLATFORM_MEMBERS = "Members of this workspace come from the builder allowlist.";

function cleanName(name: unknown): string {
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (n.length < 1 || n.length > 60) throw new AccountError("invalid_request", "A workspace name is 1 to 60 characters.");
  return n;
}

export class Workspaces {
  constructor(private readonly a: Accounts) {}

  private requireUser(principal: Principal): string {
    if (principal.kind !== "user") throw new AccountError("forbidden", "An API key cannot do this. Sign in instead.");
    return principal.userId;
  }

  /** A new workspace for a team or a client, owned by the caller. */
  async create(principal: Principal, name: string): Promise<Workspace> {
    const userId = this.requireUser(principal);
    if (!(await this.a.store.users.get(userId))) throw new AccountError("unauthenticated", "Sign in again.");
    return this.a.createWorkspaceRow(userId, cleanName(name), false);
  }

  /** The workspaces the user can open, personal first, with their role in each. */
  async listForUser(userId: string): Promise<WorkspaceView[]> {
    const out: WorkspaceView[] = [];
    for (const m of await this.a.store.members.find({ userId })) {
      const role = await this.a.roleIn({ kind: "user", userId }, m.workspaceId);
      const ws = role && (await this.a.store.workspaces.get(m.workspaceId));
      if (role && ws) out.push({ ...ws, role });
    }
    return out.sort((x, y) => Number(y.personal) - Number(x.personal) || x.createdAt.localeCompare(y.createdAt));
  }

  async get(principal: Principal, workspaceId: string): Promise<WorkspaceView> {
    const role = await this.a.authorize(principal, workspaceId, "view");
    const ws = await this.a.store.workspaces.get(workspaceId);
    if (!ws) throw new AccountError("not_found", "No such workspace.");
    return { ...ws, role };
  }

  async rename(principal: Principal, workspaceId: string, name: string): Promise<Workspace> {
    await this.a.authorize(principal, workspaceId, "manage_workspace");
    const ws = await this.a.store.workspaces.get(workspaceId);
    if (!ws) throw new AccountError("not_found", "No such workspace.");
    const next = { ...ws, name: cleanName(name), updatedAt: this.a.iso() };
    await this.a.store.workspaces.update(next);
    return next;
  }

  /* ---------- Members ---------- */

  async members(principal: Principal, workspaceId: string): Promise<MemberView[]> {
    await this.a.authorize(principal, workspaceId, "view");
    const out: MemberView[] = [];
    for (const m of await this.a.store.members.find({ workspaceId })) {
      const user = await this.a.store.users.get(m.userId);
      if (user) out.push({ userId: user.id, email: user.email, name: user.name, role: m.role, joinedAt: m.createdAt });
    }
    const rank: Record<Role, number> = { owner: 0, admin: 1, editor: 2, viewer: 3 };
    return out.sort((x, y) => rank[x.role] - rank[y.role] || x.email.localeCompare(y.email));
  }

  private async owners(workspaceId: string): Promise<number> {
    return (await this.a.store.members.find({ workspaceId, role: "owner" })).length;
  }

  private async requireMember(workspaceId: string, userId: string): Promise<Member> {
    const m = await this.a.store.members.get(memberId(workspaceId, userId));
    if (!m) throw new AccountError("not_found", "That person is not a member of this workspace.");
    return m;
  }

  async setRole(principal: Principal, workspaceId: string, userId: string, role: Role): Promise<Member> {
    this.requireUser(principal);
    if (!isRole(role)) throw new AccountError("invalid_request", "Pick owner, admin, editor or viewer.");
    const actor = await this.a.authorize(principal, workspaceId, "manage_members");
    if (workspaceId === PLATFORM_WORKSPACE_ID) throw new AccountError("forbidden", PLATFORM_MEMBERS);
    const member = await this.requireMember(workspaceId, userId);
    if (member.role === role) return member;
    if (!canAssign(actor, member.role, role)) throw new AccountError("forbidden", `Your role (${actor}) cannot change a ${member.role} to ${role}.`);
    if (member.role === "owner" && (await this.owners(workspaceId)) <= 1) {
      throw new AccountError("last_owner", "A workspace needs at least one owner. Make someone else an owner first.");
    }
    const next = { ...member, role, updatedAt: this.a.iso() };
    await this.a.store.members.update(next);
    return next;
  }

  async removeMember(principal: Principal, workspaceId: string, userId: string): Promise<void> {
    const self = this.requireUser(principal);
    if (userId === self) return this.leave(self, workspaceId);
    const actor = await this.a.authorize(principal, workspaceId, "manage_members");
    if (workspaceId === PLATFORM_WORKSPACE_ID) throw new AccountError("forbidden", PLATFORM_MEMBERS);
    const member = await this.requireMember(workspaceId, userId);
    if (!canRemove(actor, member.role)) throw new AccountError("forbidden", `Your role (${actor}) cannot remove a ${member.role}.`);
    if (member.role === "owner" && (await this.owners(workspaceId)) <= 1) {
      throw new AccountError("last_owner", "A workspace needs at least one owner.");
    }
    await this.a.store.members.delete(member.id);
    await this.revokeKeysOf(workspaceId, userId);
  }

  /** Leaves a workspace. The last owner cannot leave; they hand ownership over first. */
  async leave(userId: string, workspaceId: string): Promise<void> {
    await this.a.authorize({ kind: "user", userId }, workspaceId, "view");
    if (workspaceId === PLATFORM_WORKSPACE_ID) throw new AccountError("forbidden", PLATFORM_MEMBERS);
    const member = await this.requireMember(workspaceId, userId);
    if (member.role === "owner" && (await this.owners(workspaceId)) <= 1) {
      throw new AccountError("last_owner", "You are the last owner. Make someone else an owner before you leave.");
    }
    await this.a.store.members.delete(member.id);
    await this.revokeKeysOf(workspaceId, userId);
  }

  /** A member who goes takes their API keys with them. */
  private async revokeKeysOf(workspaceId: string, userId: string) {
    for (const k of await this.a.store.apiKeys.find({ workspaceId, createdBy: userId, revokedAt: null })) {
      await this.a.store.apiKeys.update({ ...k, revokedAt: this.a.iso() });
    }
  }

  /* ---------- Invites ---------- */

  /** Emails an invite link. A new invite to the same address replaces the open one. */
  async invite(principal: Principal, workspaceId: string, emailInput: string, role: Role): Promise<InviteView> {
    const inviterId = this.requireUser(principal);
    const email = normalizeEmail(emailInput);
    if (!email) throw new AccountError("invalid_email", "Enter a valid email address.");
    if (!isRole(role)) throw new AccountError("invalid_request", "Pick owner, admin, editor or viewer.");
    const actor = await this.a.authorize(principal, workspaceId, "manage_members");
    if (workspaceId === PLATFORM_WORKSPACE_ID) throw new AccountError("forbidden", PLATFORM_MEMBERS);
    if (!canAssign(actor, null, role)) throw new AccountError("forbidden", `Your role (${actor}) cannot invite a ${role}.`);

    const existing = await this.a.findUserByEmail(email);
    if (existing && (await this.a.store.members.get(memberId(workspaceId, existing.id)))) {
      throw new AccountError("already_member", `${email} is already a member.`);
    }
    await this.a.limiter.hit(`invite:${workspaceId}`, this.a.cfg.limits.invitesPerWorkspace, "Too many invites from this workspace today.");

    for (const open of await this.a.store.invites.find({ workspaceId, email, acceptedAt: null, revokedAt: null })) {
      await this.a.store.invites.update({ ...open, revokedAt: this.a.iso() });
    }
    const token = randomToken();
    const invite: Invite = {
      id: newId("inv"),
      workspaceId,
      email,
      role,
      tokenHash: sha256(token),
      invitedBy: inviterId,
      createdAt: this.a.iso(),
      expiresAt: this.a.iso(this.a.cfg.inviteTtlMs),
      acceptedAt: null,
      acceptedBy: null,
      revokedAt: null,
    };
    await this.a.store.invites.insert(invite);

    const ws = await this.a.store.workspaces.get(workspaceId);
    const inviter = await this.a.store.users.get(inviterId);
    const days = Math.round(this.a.cfg.inviteTtlMs / 86_400_000);
    await this.a.email.send({
      to: email,
      subject: `You are invited to ${ws?.name ?? "a workspace"} on WOVI`,
      text: [
        `${inviter?.email ?? "Someone"} invited you to the workspace "${ws?.name ?? ""}" on WOVI as ${role}.`,
        "",
        "Accept here:",
        `${this.a.cfg.appUrl}/invite?token=${token}`,
        "",
        `The link works once, for ${email}, and expires in ${days} days.`,
      ].join("\n"),
    });
    return this.inviteView(invite, inviter);
  }

  private inviteView(i: Invite, inviter: User | null): InviteView {
    return {
      id: i.id,
      email: i.email,
      role: i.role,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      invitedBy: inviter?.email ?? null,
      expired: Date.parse(i.expiresAt) <= this.a.now().getTime(),
    };
  }

  /** Open invites: not accepted and not revoked. Expired ones are flagged. */
  async invites(principal: Principal, workspaceId: string): Promise<InviteView[]> {
    await this.a.authorize(principal, workspaceId, "manage_members");
    const out: InviteView[] = [];
    for (const i of await this.a.store.invites.find({ workspaceId, acceptedAt: null, revokedAt: null })) {
      out.push(this.inviteView(i, await this.a.store.users.get(i.invitedBy)));
    }
    return out.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  }

  async revokeInvite(principal: Principal, workspaceId: string, inviteId: string): Promise<void> {
    await this.a.authorize(principal, workspaceId, "manage_members");
    const invite = await this.a.store.invites.get(inviteId);
    if (!invite || invite.workspaceId !== workspaceId) throw new AccountError("not_found", "No such invite.");
    await this.a.store.invites.updateIf(inviteId, { acceptedAt: null, revokedAt: null }, { revokedAt: this.a.iso() });
  }

  private async openInvite(token: string): Promise<Invite> {
    const bad = new AccountError("invalid_invite", "This invite has expired, was withdrawn or was already used.");
    if (typeof token !== "string" || token.length < 20 || token.length > 200) throw bad;
    const invite = (await this.a.store.invites.find({ tokenHash: sha256(token) }))[0];
    if (!invite || invite.acceptedAt || invite.revokedAt || Date.parse(invite.expiresAt) <= this.a.now().getTime()) throw bad;
    return invite;
  }

  /** What the invite landing page shows. Does not use the invite up. */
  async previewInvite(token: string): Promise<{ workspaceName: string; email: string; role: Role; invitedBy: string | null } | null> {
    try {
      const invite = await this.openInvite(token);
      const ws = await this.a.store.workspaces.get(invite.workspaceId);
      const inviter = await this.a.store.users.get(invite.invitedBy);
      return ws ? { workspaceName: ws.name, email: invite.email, role: invite.role, invitedBy: inviter?.email ?? null } : null;
    } catch {
      return null;
    }
  }

  /** Joins the workspace. The signed-in user's email must be the one invited. */
  async acceptInvite(userId: string, token: string): Promise<Workspace> {
    const user = await this.a.store.users.get(userId);
    if (!user) throw new AccountError("unauthenticated", "Sign in again.");
    const invite = await this.openInvite(token);
    if (invite.email !== user.email) throw new AccountError("forbidden", `This invite is for ${invite.email}. Sign in with that address to accept it.`);
    const ws = await this.a.store.workspaces.get(invite.workspaceId);
    if (!ws) throw new AccountError("invalid_invite", "This workspace no longer exists.");

    const claimed = await this.a.store.invites.updateIf(invite.id, { acceptedAt: null, revokedAt: null }, { acceptedAt: this.a.iso(), acceptedBy: userId });
    if (!claimed) throw new AccountError("invalid_invite", "This invite has expired, was withdrawn or was already used.");
    if (!(await this.a.store.members.get(memberId(ws.id, userId)))) await this.a.addMember(ws.id, userId, invite.role, invite.invitedBy);
    return ws;
  }
}
