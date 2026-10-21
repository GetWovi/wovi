import Link from "next/link";
import type { ReactNode } from "react";
import { Sticker } from "@/components/brand/Accents";
import { Logo } from "@/components/brand/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import styles from "./Builder.module.css";

/** The builder's chrome: logo and the builder sticker left, the two places to go, the builder's name and the theme switch right. */
export function BuilderShell({ active, who, children }: { active?: "agents" | "new"; who: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={["container", styles.headerInner].join(" ")}>
          <Link href="/builder" className={styles.brand} aria-label="Builder home">
            <Logo height={28} />
            <Sticker tilt={-5} className={styles.brandSticker}>
              builder
            </Sticker>
          </Link>
          <nav className={styles.nav} aria-label="Builder">
            <Link href="/builder" className={styles.navLink} aria-current={active === "agents" ? "page" : undefined}>
              Agents
            </Link>
            <Link href="/builder/new" className={styles.navLink} aria-current={active === "new" ? "page" : undefined}>
              New agent
            </Link>
            <Link href="/account" className={styles.navLink}>
              Account
            </Link>
          </nav>
          <div className={styles.right}>
            <span className={styles.who}>
              <Avatar name={who} size={32} />
              <span className={styles.whoName}>{who}</span>
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className={["container", styles.main].join(" ")}>{children}</main>
      <footer className={styles.footer}>
        <div className="container">Agent Builder. Only builders can see this. Nothing here is linked from the site.</div>
      </footer>
    </div>
  );
}

export function StatusPill({ status }: { status: "draft" | "live" | "hidden" }) {
  const cls = { live: styles.statusLive, draft: styles.statusDraft, hidden: styles.statusHidden }[status];
  return <span className={[styles.status, cls].join(" ")}>{status}</span>;
}
