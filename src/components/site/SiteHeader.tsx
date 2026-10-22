import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { BrandIcon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { tokenConfigFromEnv } from "@/lib/token/config";
import styles from "./Site.module.css";

export type NavLink = { href: string; label: string };

/** Site chrome: logo left, links in the middle, GitHub and X top right. */
export function SiteHeader({ active, links = [] }: { active?: "home" | "design" | "token"; links?: NavLink[] }) {
  // The $WOVI page (phase 17) is linked only while it is on.
  const token = tokenConfigFromEnv().pageOn;
  return (
    <header className={styles.header}>
      <div className={["container", styles.headerInner].join(" ")}>
        <Link href="/" className={styles.logo} aria-label="WOVI home">
          <Logo height={28} />
        </Link>
        <nav className={styles.nav} aria-label="Main">
          {links.map((l) => (
            <a key={l.href} href={l.href} className={styles.navLink}>
              {l.label}
            </a>
          ))}
          {token && (
            <Link href="/token" className={styles.navLink} aria-current={active === "token" ? "page" : undefined}>
              $WOVI
            </Link>
          )}
          <Link href="/design" className={styles.navLink} aria-current={active === "design" ? "page" : undefined}>
            Design
          </Link>
        </nav>
        <div className={styles.right}>
          <a href="#" className={styles.iconLink} aria-label="WOVI on GitHub">
            <BrandIcon name="github" />
          </a>
          <a href="#" className={styles.iconLink} aria-label="WOVI on X">
            <BrandIcon name="x" size={20} />
          </a>
          <ThemeToggle className={styles.theme} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={["container", styles.footerInner].join(" ")}>
        <Logo height={22} />
        <p className={styles.footerText}>AI agents for content. One agent, one job.</p>
        <p className={styles.footerFine}>WOVI is in development. Use at your own risk. Nothing here is financial, legal or professional advice.</p>
      </div>
    </footer>
  );
}
