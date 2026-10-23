import Link from "next/link";
import s from "./Safety.module.css";

/** The legal links every footer carries. */
export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/own-risk", label: "Own risk and $WOVI" },
  { href: "/report", label: "Report content" },
] as const;

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav className={[s.legalLinks, className].filter(Boolean).join(" ")} aria-label="Legal">
      {LEGAL_LINKS.map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** The homepage's last line: the legal links under the footer. */
export function HomeLegalStrip() {
  return (
    <div className={s.homeStrip}>
      <div className={["container", s.homeStripInner].join(" ")}>
        <LegalLinks />
      </div>
    </div>
  );
}

/** A small "Report" link that opens the report form on this content. */
export function ReportLink({ id, label = "Report this" }: { id: string; label?: string }) {
  return (
    <Link href={`/report?what=${encodeURIComponent(id)}`} className={s.reportLink} rel="nofollow">
      {label}
    </Link>
  );
}
