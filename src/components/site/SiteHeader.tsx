import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import styles from "./Site.module.css";

export type NavLink = { href: string; label: string };

export function SiteHeader({ active, links = [], overlay = false }: { active?: "home" | "design"; links?: NavLink[]; overlay?: boolean }) {
  return (
    <header className={[styles.header, overlay ? styles.overlay : ""].filter(Boolean).join(" ")}>
      <div className={["container", styles.headerInner].join(" ")}>
        <Link href="/" className={styles.logo} aria-label="WOVI home">
          <Wordmark variant="theme" height={30} />
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <div className={styles.links}>
            {links.map((l) => (
              <a key={l.href} href={l.href} className={styles.navLink}>
                {l.label}
              </a>
            ))}
            <Link href="/design" className={styles.navLink} aria-current={active === "design" ? "page" : undefined}>
              Design system
            </Link>
          </div>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={["container", styles.footerInner].join(" ")}>
        <Wordmark variant="theme" height={22} />
        <p className={styles.footerText}>Single-purpose agents for social content. Night first.</p>
        <p className={styles.footerFine}>WOVI is in development. Nothing here is financial, legal or professional advice.</p>
      </div>
    </footer>
  );
}
