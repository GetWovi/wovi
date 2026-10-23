import { LegalLinks } from "@/components/safety/LegalLinks";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { BrandIcon, Icon, type IconName } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { accounts, csrfFor } from "@/lib/accounts/server";
import type { SessionInfo } from "@/lib/accounts/sessions";
import { appApi } from "@/lib/app/server";
import { readClientFilter } from "@/lib/team/client-filter";
import { appTeam } from "@/lib/team/server";
import { appCredits } from "@/lib/credits/server";
import { CreditPill } from "@/components/ui/CreditPill";
import { Sparkle } from "@/components/brand/Accents";
import { holderBadgeFor } from "@/lib/token/local";
import c from "@/components/credits/Credits.module.css";
import styles from "./App.module.css";
import { ClientSwitch } from "./ClientSwitch";
import { WorkspaceSwitch } from "./WorkspaceSwitch";
import { GITHUB_URL, X_URL } from "@/lib/site";

export type AppArea = "home" | "make" | "pipelines" | "review" | "history" | "brand" | "settings" | "notifications" | "credits";

/** `short` is the label on the phone's tab bar, where six tabs share the width. */
/** `mid` is a shorter label for desktops under 1560px, where the header is full. */
const NAV: { id: AppArea; href: string; label: string; short?: string; mid?: string; icon: IconName }[] = [
  { id: "home", href: "/app", label: "Home", icon: "home" },
  { id: "make", href: "/app/make", label: "Make", icon: "bolt" },
  { id: "pipelines", href: "/app/pipelines", label: "Pipelines", short: "Chains", icon: "layers" },
  { id: "review", href: "/app/review", label: "Review", icon: "inbox" },
  { id: "history", href: "/app/history", label: "History", icon: "clock" },
  { id: "brand", href: "/brand-brain", label: "Brand Brain", short: "Brand", mid: "Brand", icon: "bulb" },
  { id: "settings", href: "/app/settings", label: "Settings", icon: "sliders" },
];

/**
 * The signed-in app chrome: logo left, the app nav, the workspace switcher,
 * the account, GitHub and X as the site chrome has them, and the theme. On a
 * phone the nav moves to a tab bar at the bottom.
 */
export async function AppShell({ info, active, children }: { info: SessionInfo; active: AppArea; children: ReactNode }) {
  const a = accounts();
  const me = { kind: "user" as const, userId: info.user.id };
  const workspaceId = info.session.workspaceId;
  const workspaces = await a.workspaces.listForUser(info.user.id);
  const current = workspaces.find((w) => w.id === workspaceId);
  const role = current?.role ?? (await a.roleIn(me, workspaceId));
  const who = info.user.name ?? info.user.email ?? "You";
  const open = await appApi().openCount(me, workspaceId).catch(() => 0);
  const team = appTeam();
  const [waiting, unread, clients, clientId] = await Promise.all([
    team.waitingCount(me, workspaceId).catch(() => 0),
    team.unreadCount(me, workspaceId).catch(() => 0),
    team.clients(me, workspaceId).catch(() => []),
    readClientFilter(workspaceId),
  ]);
  // Credits (phase 13): the balance everyone in the workspace sees. Null when billing is off.
  const balance = await appCredits()
    .balance(me, workspaceId)
    .catch(() => null);
  // $WOVI (phase 17): the holder mark on the avatar, from the stored status. False while holders are off.
  const holder = await holderBadgeFor(info.user.id);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={["container", styles.headerInner].join(" ")}>
          <Link href="/app" className={styles.logo} aria-label="WOVI home">
            <Logo height={28} />
          </Link>
          <nav className={styles.nav} aria-label="App">
            {NAV.map((n) => (
              <Link key={n.id} href={n.href} className={styles.navLink} aria-current={active === n.id ? "page" : undefined}>
                {n.mid ? (
                  <>
                    <span className={styles.navFull}>{n.label}</span>
                    <span className={styles.navMid}>{n.mid}</span>
                  </>
                ) : (
                  n.label
                )}
                {n.id === "history" && open > 0 && <span className={styles.navCount}>{open}</span>}
                {n.id === "review" && waiting > 0 && <span className={styles.navCount}>{waiting}</span>}
              </Link>
            ))}
          </nav>
          <div className={styles.right}>
            {balance && (
              <Link href="/app/credits" className={[c.balanceLink, balance.available < 10 ? c.balanceLow : ""].join(" ")} aria-current={active === "credits" ? "page" : undefined} aria-label={`Credits: ${balance.available.toLocaleString("en-US")} available`} title={balance.held ? `${balance.held} held for runs in progress` : "Credits"}>
                <CreditPill amount={balance.available} size="sm" />
              </Link>
            )}
            <WorkspaceSwitch csrf={csrfFor(info)} current={workspaceId} workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, role: w.role }))} />
            {role && <span className={styles.wsRole}>{role}</span>}
            {clients.length > 0 && <ClientSwitch csrf={csrfFor(info)} current={clients.some((c) => c.id === clientId) ? clientId : null} clients={clients.map((c) => ({ id: c.id, name: c.name }))} />}
            <Link href="/app/notifications" className={[styles.iconLink, styles.bell].join(" ")} aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-current={active === "notifications" ? "page" : undefined}>
              <Icon name="bell" size={22} />
              {unread > 0 && <span className={styles.bellCount}>{unread > 9 ? "9+" : unread}</span>}
            </Link>
            <Link href="/account" className={styles.avatarLink} title={holder ? `${who}, $WOVI holder` : who}>
              <span className={styles.avatarWrap}>
                <Avatar name={who} size={32} />
                {holder && (
                  <span className={styles.holderDot} aria-label="$WOVI holder">
                    <Sparkle size={10} color="var(--on-blaze)" />
                  </span>
                )}
              </span>
              <span className={styles.avatarName}>{who}</span>
            </Link>
            <span className={styles.headerIcons}>
              {GITHUB_URL && (
                <a href={GITHUB_URL} className={styles.iconLink} aria-label="WOVI on GitHub" target="_blank" rel="noopener noreferrer">
                  <BrandIcon name="github" />
                </a>
              )}
              <a href={X_URL} className={styles.iconLink} aria-label="WOVI on X" target="_blank" rel="noopener noreferrer">
                <BrandIcon name="x" size={20} />
              </a>
            </span>
            <ThemeToggle className={styles.theme} />
          </div>
        </div>
      </header>
      <main className={["container", styles.main].join(" ")}>{children}</main>
      <footer className={styles.footer}>
        <div className={["container", styles.footerInner].join(" ")}>
          <span>WOVI. One agent, one job. Every result is a draft until you approve it.</span>
          <span>Use at your own risk. Nothing here is financial, legal or professional advice.</span>
          <LegalLinks />
        </div>
      </footer>
      <nav className={styles.tabs} aria-label="App">
        {NAV.map((n) => (
          <Link key={n.id} href={n.href} className={styles.tab} aria-current={active === n.id ? "page" : undefined}>
            <span className={styles.tabIcon}>
              <Icon name={n.icon} size={22} />
              {n.id === "review" && waiting > 0 && <span className={styles.tabDot} aria-label={`${waiting} waiting`} />}
            </span>
            {n.short ?? n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
