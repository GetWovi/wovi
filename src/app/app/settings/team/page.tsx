import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { MemberRoles } from "@/components/team/MemberRoles";
import { RulesForm } from "@/components/team/RulesForm";
import { clientInitials } from "@/components/team/labels";
import t from "@/components/team/Team.module.css";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can, canAssign, ROLES, type Role } from "@/lib/accounts/policy";
import { appPage } from "@/lib/app/server";
import { deciderProblem } from "@/lib/team/rules";
import { appTeam } from "@/lib/team/server";

export const metadata: Metadata = { title: "Team and approvals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** What a role does here, in a few words, under the current rules. */
function roleWhat(role: Role, approvers: "editors" | "admins"): string {
  const decides = deciderProblem(role, { approvers }) === null;
  if (role === "viewer") return "Reads and comments";
  return [role === "owner" ? "Runs everything" : role === "admin" ? "Manages people and clients" : "Makes and sends for review", decides ? "decides" : null].filter(Boolean).join(", ");
}

export default async function TeamSettingsPage() {
  const { info, me, workspaceId, csrf } = await appPage("/app/settings/team");
  const team = appTeam();
  const a = accounts();
  const [settings, members, role, clients] = await Promise.all([team.settings(me, workspaceId), a.workspaces.members(me, workspaceId), a.roleIn(me, workspaceId), team.clients(me, workspaceId)]);
  const mine = role ?? "viewer";
  const ws = (await a.workspaces.listForUser(info.user.id)).find((w) => w.id === workspaceId);

  return (
    <AppShell info={info} active="settings">
      <div className={styles.head}>
        <div className={styles.headText}>
          <Link href="/app/settings" className={styles.crumb}>
            <Icon name="arrow-left" size={16} /> Settings
          </Link>
          <h1 className={styles.h1}>Team and approvals</h1>
          <p className={styles.lead}>Who decides in {ws?.name ?? "this workspace"}, how many yeses it takes, and who does what. Nothing is posted until a person says yes.</p>
        </div>
      </div>
      <div className={t.settingsGrid}>
        <RulesForm csrf={csrf} initial={{ approvers: settings.approvers, approvalsNeeded: settings.approvalsNeeded, autoSubmit: settings.autoSubmit, emailNotifications: settings.emailNotifications }} canEdit={can(mine, "manage_review_rules")} />
        <div className={styles.stack}>
          <MemberRoles
            csrf={csrf}
            canInvite={can(mine, "manage_members")}
            members={members.map((m) => ({
              userId: m.userId,
              name: m.name ?? m.email ?? "Passkey account",
              role: m.role,
              self: m.userId === info.user.id,
              roles: ROLES.filter((r) => canAssign(mine, m.role, r)),
              what: roleWhat(m.role, settings.approvers),
            }))}
          />
          <section className={[styles.panel, styles.panelTight, styles.stack].join(" ")} aria-label="Clients">
            <div className={t.sideHead}>
              <h3>Clients and their default brand</h3>
              <ButtonLink href="/app/clients" size="sm" variant="secondary" leading={<Icon name="users" size={16} />}>
                {clients.length ? "Manage" : "Add one"}
              </ButtonLink>
            </div>
            {clients.length ? (
              <ul className={t.members}>
                {clients.map((c) => (
                  <li key={c.id} className={t.member}>
                    <span className={t.clientMark} style={{ width: 40, height: 40, fontSize: 18, borderRadius: 13 }}>
                      {clientInitials(c.name)}
                    </span>
                    <span className={t.memberText}>
                      <b>{c.name}</b>
                      <span>{c.brands.length ? c.brands.map((b) => b.name).join(", ") : "No Brand Brain yet"}</span>
                    </span>
                    <span className={t.rolePill}>{c.defaultBrand ? c.defaultBrand.name : "No default"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={[styles.muted, styles.small].join(" ")}>For agencies: tie each client to their Brand Brains, then share a link that shows them their own work only.</p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
