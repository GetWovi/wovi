import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { BrandIcon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LegalLinks } from "@/components/safety/LegalLinks";
import { tokenConfigFromEnv } from "@/lib/token/config";
import styles from "./Site.module.css";
import { GITHUB_URL, X_URL } from "@/lib/site";

export type NavLink = { href: string; label: string };

/** The main site's links: section jumps on the homepage, and the same places from every other page. */
export function mainLinks(onHome = false): NavLink[] {
  const at = (id: string) => (onHome ? `#${id}` : `/#${id}`);
  return [
    { href: onHome ? "#agents" : "/agents", label: "Agents" },
    { href: at("pipeline"), label: "How it works" },
    { href: at("brand-brain"), label: "Brand Brain" },
    { href: at("plug-in"), label: "MCP and API" },
    { href: at("creators"), label: "Creators" },
  ];
}

/** Site chrome: logo left, links in the middle, sign in, GitHub (once a repo exists) and X top right. */
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
        </nav>
        <div className={styles.right}>
          <Link href="/sign-in" className={styles.navLink}>
            Sign in
          </Link>
          {GITHUB_URL && (
            <a href={GITHUB_URL} className={styles.iconLink} aria-label="WOVI on GitHub" target="_blank" rel="noopener noreferrer">
              <BrandIcon name="github" />
            </a>
          )}
          <a href={X_URL} className={styles.iconLink} aria-label="WOVI on X" target="_blank" rel="noopener noreferrer">
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
        <p className={styles.footerFine}>Use at your own risk. Nothing here is financial, legal or professional advice.</p>
        <LegalLinks />
      </div>
    </footer>
  );
}
