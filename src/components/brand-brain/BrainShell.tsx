import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import shell from "@/components/builder/Builder.module.css";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import styles from "./Brain.module.css";

/** The app chrome for Brand Brain screens: logo left, where to go, the workspace and the theme right. Proper app screens come in phase 9. */
export function BrainShell({ workspace, role, who, builder, children }: { workspace: string; role: string | null; who: string; builder?: boolean; children: ReactNode }) {
  return (
    <div className={shell.page}>
      <header className={shell.header}>
        <div className={["container", shell.headerInner].join(" ")}>
          <Link href="/brand-brain" className={shell.brand} aria-label="Brand Brains">
            <Logo height={28} />
          </Link>
          <nav className={shell.nav} aria-label="App">
            <Link href="/brand-brain" className={shell.navLink} aria-current="page">
              Brand Brains
            </Link>
            {builder && (
              <Link href="/builder" className={shell.navLink}>
                Builder
              </Link>
            )}
            <Link href="/account" className={shell.navLink}>
              Account
            </Link>
          </nav>
          <div className={shell.right}>
            <span className={styles.wsPill} title={`You are ${role ?? "a member"} here`}>
              <Avatar name={who} size={24} />
              {workspace}
              {role && <small>{role}</small>}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className={["container", shell.main].join(" ")}>{children}</main>
      <footer className={shell.footer}>
        <div className="container">Brand Brains. Every agent reads one before it writes.</div>
      </footer>
    </div>
  );
}
