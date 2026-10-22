import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { BrandIcon, Icon, type IconName } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { accounts, csrfFor } from "@/lib/accounts/server";
import type { SessionInfo } from "@/lib/accounts/sessions";
import { appApi } from "@/lib/app/server";
import styles from "./App.module.css";
import { WorkspaceSwitch } from "./WorkspaceSwitch";

export type AppArea = "home" | "make" | "pipelines" | "history" | "brand" | "settings";

/** `short` is the label on the phone's tab bar, where six tabs share the width. */
const NAV: { id: AppArea; href: string; label: string; short?: string; icon: IconName }[] = [
  { id: "home", href: "/app", label: "Home", icon: "home" },
  { id: "make", href: "/app/make", label: "Make", icon: "bolt" },
  { id: "pipelines", href: "/app/pipelines", label: "Pipelines", icon: "layers" },
  { id: "history", href: "/app/history", label: "History", icon: "clock" },
  { id: "brand", href: "/brand-brain", label: "Brand Brain", short: "Brand", icon: "bulb" },
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
                {n.label}
                {n.id === "history" && open > 0 && <span className={styles.navCount}>{open}</span>}
              </Link>
            ))}
          </nav>
          <div className={styles.right}>
            <WorkspaceSwitch csrf={csrfFor(info)} current={workspaceId} workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, role: w.role }))} />
            {role && <span className={styles.wsRole}>{role}</span>}
            <Link href="/account" className={styles.avatarLink} title={who}>
              <Avatar name={who} size={32} />
              <span className={styles.avatarName}>{who}</span>
            </Link>
            <span className={styles.headerIcons}>
              <a href="#" className={styles.iconLink} aria-label="WOVI on GitHub">
                <BrandIcon name="github" />
              </a>
              <a href="#" className={styles.iconLink} aria-label="WOVI on X">
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
        </div>
      </footer>
      <nav className={styles.tabs} aria-label="App">
        {NAV.map((n) => (
          <Link key={n.id} href={n.href} className={styles.tab} aria-current={active === n.id ? "page" : undefined}>
            <Icon name={n.icon} size={22} />
            {n.short ?? n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
