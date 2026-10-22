import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { accounts } from "@/lib/accounts/server";
import { appPage } from "@/lib/app/server";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { info, me, workspaceId, api } = await appPage("/app/settings");
  const a = accounts();
  const workspaces = await a.workspaces.listForUser(info.user.id);
  const current = workspaces.find((w) => w.id === workspaceId);
  const brains = await api.brains(me, workspaceId);
  const builder = a.isBuilder(info.user);

  const cards: { href: string; icon: IconName; title: string; text: string; foot: string }[] = [
    { href: "/brand-brain", icon: "bulb", title: "Brand Brains", text: brains.length ? `${brains.length} in ${current?.name ?? "this workspace"}. Voice, references, mood board, dos and don'ts.` : "None yet. Build one from your past posts, or start blank.", foot: brains.length ? "Open" : "Build one" },
    { href: "/app/credits", icon: "coin", title: "Credits", text: "One credit is one cent. Your balance, what each run cost, top-ups, and monthly limits for the workspace and each person.", foot: "Open credits" },
    { href: "/app/settings/team", icon: "inbox", title: "Team and approvals", text: "Who may approve, ask for changes or reject, how many yeses it takes, and everyone's role.", foot: "Open the rules" },
    { href: "/app/clients", icon: "users", title: "Clients", text: "For agencies: each client with their Brand Brains, a default brand, and a link that shows them their own work only.", foot: "Open clients" },
    { href: "/app/notifications", icon: "bell", title: "Notifications", text: "Assigned to you, mentioned, changes asked and approved. In the app, and by email when the workspace wants it.", foot: "Open the list" },
    { href: "/account", icon: "user", title: "Workspace and members", text: `${current?.name ?? "This workspace"}, you are ${current?.role ?? "a member"}. Rename it, invite people, set roles, or make a new workspace for a client.`, foot: "Open account" },
    { href: "/account", icon: "link", title: "API keys", text: "Keys for using these agents from your own software or assistant. One workspace each, revoke any time.", foot: "Manage keys" },
    { href: "/account", icon: "check-circle", title: "Sign-in and wallet", text: info.user.email ? `A link and a code to ${info.user.email}. Add a passkey or link a wallet.` : "Passkey account. Add another passkey or link a wallet.", foot: "Open account" },
    { href: "/app/welcome?restart=1", icon: "refresh", title: "Onboarding again", text: "Walk through the welcome once more: niche, platforms and 3 to 5 posts make a new Brand Brain.", foot: "Start over" },
  ];

  return (
    <AppShell info={info} active="settings">
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Settings</span>
          <h1 className={styles.h1}>Your setup</h1>
          <p className={styles.lead}>Everything the agents lean on, in one place.</p>
        </div>
        <div className={styles.actions}>
          {builder && (
            <ButtonLink href="/builder" variant="secondary" size="sm" leading={<Icon name="sliders" size={16} />}>
              Agent Builder
            </ButtonLink>
          )}
          <span className={[styles.muted, styles.small].join(" ")}>Night or light</span>
          <ThemeToggle />
        </div>
      </div>
      <div className={styles.grid3}>
        {cards.map((c, i) => (
          <Link key={c.title} href={c.href} className={styles.cardLink}>
            <article className={[styles.panel, styles.panelTight, i % 2 ? styles.panelAlt : "", styles.settingCard].join(" ")}>
              <span className={[styles.iconTile, i === 0 ? styles.iconTileBlaze : ""].join(" ")}>
                <Icon name={c.icon} size={22} />
              </span>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
              <span className={styles.settingFoot}>
                {c.foot} <Icon name="arrow-right" size={16} />
              </span>
            </article>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
