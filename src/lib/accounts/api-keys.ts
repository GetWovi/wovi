/**
 * API keys for power users (MCP and REST, phase 14). A key belongs to one
 * workspace and carries one role (admin, editor or viewer). The full key is
 * shown once at creation; only its sha256 and a short prefix are stored.
 * A key acts with the lower of its own role and its creator's current role,
 * and stops working when it is revoked or its creator leaves the workspace.
 */
import { memberId, type Accounts, type Principal } from "./accounts";
import { newId, randomToken, sha256 } from "./crypto";
import { AccountError } from "./errors";
import { API_KEY_ROLES, canAssign, lowerRole, type Role } from "./policy";
import type { ApiKey } from "./types";

export const API_KEY_PREFIX = "wovi_sk_";
const KEY_SHAPE = /^wovi_sk_[A-Za-z0-9_-]{43}$/;
/** Only write lastUsedAt this often. */
const TOUCH_MS = 60_000;

export type ApiKeyView = Omit<ApiKey, "keyHash">;
export type KeyRole = (typeof API_KEY_ROLES)[number];

const view = (k: ApiKey): ApiKeyView => ({
  id: k.id,
  workspaceId: k.workspaceId,
  name: k.name,
  prefix: k.prefix,
  role: k.role,
  createdBy: k.createdBy,
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt,
  revokedAt: k.revokedAt,
});

export class ApiKeys {
  constructor(private readonly a: Accounts) {}

  /** Makes a key. The returned `key` is the only time the full key exists outside the caller. */
  async create(principal: Principal, workspaceId: string, input: { name: string; role: KeyRole }): Promise<{ key: string; apiKey: ApiKeyView }> {
    if (principal.kind !== "user") throw new AccountError("forbidden", "An API key cannot make API keys.");
    const actor = await this.a.authorize(principal, workspaceId, "manage_api_keys");
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (name.length < 1 || name.length > 60) throw new AccountError("invalid_request", "Give the key a name of 1 to 60 characters.");
    if (!(API_KEY_ROLES as readonly string[]).includes(input.role)) throw new AccountError("invalid_request", "A key's role is admin, editor or viewer.");
    if (!canAssign(actor, null, input.role)) throw new AccountError("forbidden", `Your role (${actor}) cannot make a ${input.role} key.`);

    const key = `${API_KEY_PREFIX}${randomToken(32)}`;
    const row: ApiKey = {
      id: newId("key"),
      workspaceId,
      name,
      prefix: key.slice(0, API_KEY_PREFIX.length + 6),
      keyHash: sha256(key),
      role: input.role,
      createdBy: principal.userId,
      createdAt: this.a.iso(),
      lastUsedAt: null,
      revokedAt: null,
    };
    await this.a.store.apiKeys.insert(row);
    return { key, apiKey: view(row) };
  }

  /** The workspace's keys, newest first, prefix only. Revoked keys are kept with their revokedAt. */
  async list(principal: Principal, workspaceId: string): Promise<ApiKeyView[]> {
    await this.a.authorize(principal, workspaceId, "manage_api_keys");
    return (await this.a.store.apiKeys.find({ workspaceId })).sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map(view);
  }

  async revoke(principal: Principal, workspaceId: string, keyId: string): Promise<void> {
    await this.a.authorize(principal, workspaceId, "manage_api_keys");
    const row = await this.a.store.apiKeys.get(keyId);
    if (!row || row.workspaceId !== workspaceId) throw new AccountError("not_found", "No such API key.");
    await this.a.store.apiKeys.updateIf(keyId, { revokedAt: null }, { revokedAt: this.a.iso() });
  }

  /** The principal for a key from a request header, or null for anything that is not a live key. */
  async authenticate(key: string | null | undefined): Promise<Extract<Principal, { kind: "api_key" }> | null> {
    if (typeof key !== "string" || !KEY_SHAPE.test(key)) return null;
    const row = (await this.a.store.apiKeys.find({ keyHash: sha256(key) }))[0];
    if (!row || row.revokedAt) return null;

    const creatorRole = await this.a.roleIn({ kind: "user", userId: row.createdBy }, row.workspaceId);
    if (!creatorRole || !(await this.a.store.members.get(memberId(row.workspaceId, row.createdBy)))) return null;

    const now = this.a.now().getTime();
    if (!row.lastUsedAt || now - Date.parse(row.lastUsedAt) >= TOUCH_MS) {
      await this.a.store.apiKeys.updateIf(row.id, { revokedAt: null }, { lastUsedAt: this.a.iso() });
    }
    const role = lowerRole(row.role, creatorRole) as Exclude<Role, "owner">;
    return { kind: "api_key", keyId: row.id, userId: row.createdBy, workspaceId: row.workspaceId, role };
  }
}
