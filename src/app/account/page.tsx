import type { Metadata } from "next";
import { ActionForm } from "@/components/account/ActionForm";
import styles from "@/components/account/Account.module.css";
import { PasskeyAdd } from "@/components/account/PasskeyAdd";
import { WalletLink } from "@/components/account/WalletLink";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import type { Principal } from "@/lib/accounts/accounts";
import { API_KEY_ROLES, ROLES, can, canAssign, canRemove, type Role } from "@/lib/accounts/policy";
import { accounts, csrfFor, requireSession } from "@/lib/accounts/server";
import {
  createApiKey,
  createWorkspace,
  invite,
  leaveWorkspace,
  removeMember,
  removePasskey,
  renameWorkspace,
  revokeApiKey,
  revokeInvite,
  setRole,
  signOut,
  signOutEverywhere,
  switchWorkspace,
  unlinkWallet,
} from "./actions";

export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "never");
const roleOptions = (roles: readonly Role[]) => roles.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }));

export default async function AccountPage() {
  const info = await requireSession("/account");
  const a = accounts();
  const me: Principal = { kind: "user", userId: info.user.id };
  const wsId = info.session.workspaceId;
  const csrf = csrfFor(info);

  const workspaces = await a.workspaces.listForUser(info.user.id);
  const current = workspaces.find((w) => w.id === wsId) ?? (await a.workspaces.get(me, wsId));
  const role = current.role;
  const members = await a.workspaces.members(me, wsId);
  const invites = can(role, "manage_members") ? await a.workspaces.invites(me, wsId) : [];
  const keys = can(role, "manage_api_keys") ? (await a.apiKeys.list(me, wsId)).filter((k) => !k.revokedAt) : [];
  const passkeys = await a.passkeys.list(info.user.id);
  const wallets = await a.wallets.list(info.user.id);
  const invitable = ROLES.filter((r) => canAssign(role, null, r));
  const lastOwner = role === "owner" && members.filter((m) => m.role === "owner").length === 1;

  return (
    <AppShell info={info} active="settings">
      <div key={wsId} className={styles.page}>
        <div className={styles.pageHead}>
          <div>
            <span className="eyebrow">Account</span>
            <h1>{info.user.name ?? "Your account"}</h1>
            <p className={styles.lead}>{info.user.email ?? "Passkey account"}</p>
          </div>
          <div className={styles.headActions}>
            <ActionForm action={signOut} csrf={csrf}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </ActionForm>
            <ActionForm action={signOutEverywhere} csrf={csrf}>
              <Button type="submit" variant="secondary" size="sm">
                Sign out everywhere
              </Button>
            </ActionForm>
          </div>
        </div>

        <Card title="Workspace" className={styles.section}>
          {workspaces.length > 1 && (
            <ActionForm action={switchWorkspace} csrf={csrf} className={styles.row}>
              <Select label="Current workspace" name="workspace" defaultValue={wsId} options={workspaces.map((w) => ({ value: w.id, label: `${w.name} (${w.role})` }))} />
              <Button type="submit" variant="secondary">
                Switch
              </Button>
            </ActionForm>
          )}
          {can(role, "manage_workspace") ? (
            <ActionForm action={renameWorkspace} csrf={csrf} className={styles.row}>
              <Input label={workspaces.length > 1 ? "Name" : "Current workspace"} name="name" defaultValue={current.name} maxLength={60} required />
              <Button type="submit" variant="secondary">
                Rename
              </Button>
            </ActionForm>
          ) : (
            <p>
              {current.name} <span className={styles.role}>{role}</span>
            </p>
          )}
          <ActionForm action={createWorkspace} csrf={csrf} className={styles.row}>
            <Input label="New workspace" name="name" placeholder="A team or a client" maxLength={60} required />
            <Button type="submit">Create</Button>
          </ActionForm>
          {!lastOwner && (
            <ActionForm action={leaveWorkspace} csrf={csrf}>
              <Button type="submit" variant="ghost" size="sm">
                Leave this workspace
              </Button>
            </ActionForm>
          )}
        </Card>

        <Card title="Members" className={styles.section}>
          <ul className={styles.list}>
            {members.map((m) => {
              const self = m.userId === info.user.id;
              const assignable = ROLES.filter((r) => canAssign(role, m.role, r));
              return (
                <li key={m.userId} className={styles.item}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemTitle}>
                      {m.email ?? m.name ?? "Passkey account"}
                      {self && " (you)"}
                    </span>
                    <span className={styles.itemMeta}>Joined {day(m.joinedAt)}</span>
                  </div>
                  <div className={styles.itemActions}>
                    {!self && assignable.length > 1 ? (
                      <ActionForm action={setRole} csrf={csrf} className={styles.inline}>
                        <input type="hidden" name="userId" value={m.userId} />
                        <select name="role" defaultValue={m.role} aria-label={`Role of ${m.email ?? m.name ?? m.userId}`} className={styles.smallSelect}>
                          {roleOptions(assignable).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" variant="ghost" size="sm">
                          Save
                        </Button>
                      </ActionForm>
                    ) : (
                      <span className={styles.role}>{m.role}</span>
                    )}
                    {!self && canRemove(role, m.role) && (
                      <ActionForm action={removeMember} csrf={csrf}>
                        <input type="hidden" name="userId" value={m.userId} />
                        <Button type="submit" variant="ghost" size="sm">
                          Remove
                        </Button>
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {invitable.length > 0 && (
            <>
              <ActionForm action={invite} csrf={csrf} className={styles.row}>
                <Input label="Invite by email" name="email" type="email" placeholder="teammate@example.com" required />
                <Select label="Role" name="role" defaultValue="editor" options={roleOptions(invitable)} />
                <Button type="submit">Send invite</Button>
              </ActionForm>
              {invites.length > 0 && (
                <ul className={styles.list}>
                  {invites.map((i) => (
                    <li key={i.id} className={styles.item}>
                      <div className={styles.itemMain}>
                        <span className={styles.itemTitle}>{i.email}</span>
                        <span className={styles.itemMeta}>
                          Invited as {i.role}, {i.expired ? "expired" : `expires ${day(i.expiresAt)}`}
                        </span>
                      </div>
                      <ActionForm action={revokeInvite} csrf={csrf}>
                        <input type="hidden" name="inviteId" value={i.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Withdraw
                        </Button>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        {can(role, "manage_api_keys") && (
          <Card title="API keys" className={styles.section}>
            <p className={styles.sectionNote}>For using this workspace&apos;s agents from your own software or assistant. A key works in this workspace only.</p>
            {keys.length > 0 ? (
              <ul className={styles.list}>
                {keys.map((k) => (
                  <li key={k.id} className={styles.item}>
                    <div className={styles.itemMain}>
                      <span className={styles.itemTitle}>
                        {k.name} <span className={styles.role}>{k.role}</span>
                      </span>
                      <span className={styles.itemMeta}>
                        <span className={styles.mono}>{k.prefix}...</span> made {day(k.createdAt)}, last used {day(k.lastUsedAt)}
                      </span>
                    </div>
                    <ActionForm action={revokeApiKey} csrf={csrf}>
                      <input type="hidden" name="keyId" value={k.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Revoke
                      </Button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>No keys yet.</p>
            )}
            <ActionForm action={createApiKey} csrf={csrf} className={styles.row}>
              <Input label="New key" name="name" placeholder="What it is for" maxLength={60} required />
              <Select label="Role" name="role" defaultValue="editor" options={roleOptions(API_KEY_ROLES.filter((r) => canAssign(role, null, r)))} />
              <Button type="submit">Create key</Button>
            </ActionForm>
          </Card>
        )}

        <Card title="Sign-in and wallet" className={styles.section}>
          <ul className={styles.list}>
            {info.user.email && (
              <li className={styles.item}>
                <div className={styles.itemMain}>
                  <span className={styles.itemTitle}>Email</span>
                  <span className={styles.itemMeta}>A link and a code to {info.user.email}</span>
                </div>
              </li>
            )}
            {passkeys.map((p) => (
              <li key={p.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <span className={styles.itemTitle}>Passkey: {p.name}</span>
                  <span className={styles.itemMeta}>
                    Added {day(p.createdAt)}, last used {day(p.lastUsedAt)}
                  </span>
                </div>
                <ActionForm action={removePasskey} csrf={csrf}>
                  <input type="hidden" name="passkeyId" value={p.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </ActionForm>
              </li>
            ))}
            {wallets.map((w) => (
              <li key={w.address} className={styles.item}>
                <div className={styles.itemMain}>
                  <span className={[styles.itemTitle, styles.mono].join(" ")}>{w.address}</span>
                  <span className={styles.itemMeta}>Wallet linked {day(w.linkedAt)}</span>
                </div>
                <ActionForm action={unlinkWallet} csrf={csrf}>
                  <input type="hidden" name="address" value={w.address} />
                  <Button type="submit" variant="ghost" size="sm">
                    Unlink
                  </Button>
                </ActionForm>
              </li>
            ))}
          </ul>
          <div className={styles.headActions}>
            <PasskeyAdd csrf={csrf} />
            <WalletLink csrf={csrf} />
          </div>
          <p className={styles.fine}>Linking a wallet only signs a message to prove it is yours. It never sends funds or approves a transaction.</p>
        </Card>
      </div>
    </AppShell>
  );
}
