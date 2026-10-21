import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import styles from "./Site.module.css";

export function SiteHeader({ active }: { active?: "home" | "design" }) {
  return (
    <header className={styles.header}>
      <div className={["container", styles.headerInner].join(" ")}>
        <Link href="/" className={styles.logo} aria-label="WOVI home">
          <Wordmark variant="theme" height={34} />
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <Link href="/design" className={styles.navLink} aria-current={active === "design" ? "page" : undefined}>
            Design system
          </Link>
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
