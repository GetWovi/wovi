import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import styles from "@/components/app/App.module.css";
import { BrandIcon, Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { ClientSession } from "@/lib/team/team";
import t from "./Team.module.css";
import { X_URL } from "@/lib/site";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/** The client view's own chrome: no app nav, no workspace, nothing of the agency's other work. */
export function ClientShell({ session, children }: { session: ClientSession | null; children: ReactNode }) {
  return (
    <div className={t.clientPage}>
      <header className={t.clientHeader}>
        <div className={["container", t.clientHeaderInner].join(" ")}>
          <div className={t.clientHeaderLeft}>
            <span className={styles.logo} aria-label="WOVI">
              <Logo height={28} />
            </span>
            {session && (
              <span className={t.forPill}>
                <Icon name="users" size={16} /> For {session.client.name}
              </span>
            )}
          </div>
          <div className={styles.right}>
            <span className={styles.headerIcons}>
              <a href="#" className={styles.iconLink} aria-label="WOVI on GitHub">
                <BrandIcon name="github" />
              </a>
              <a href={X_URL} className={styles.iconLink} aria-label="WOVI on X" target="_blank" rel="noopener noreferrer">
                <BrandIcon name="x" size={20} />
              </a>
            </span>
            <ThemeToggle className={styles.theme} />
          </div>
        </div>
      </header>
      <main className={["container", t.clientMain].join(" ")}>{children}</main>
      <footer className={t.clientFooter}>
        <div className={["container", t.clientFooterInner].join(" ")}>
          <span>{session ? `Shared by ${session.workspaceName} on WOVI with ${session.link.label}. This link ends on ${day(session.link.expiresAt)}.` : "WOVI. Every result is a draft until a person approves it."}</span>
          <span>Use at your own risk. Nothing here is financial, legal or professional advice.</span>
        </div>
      </footer>
    </div>
  );
}
