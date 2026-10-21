import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Mascot } from "@/components/brand/Mascot";
import styles from "./Button.module.css";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary = Blaze, secondary = Cobalt, ghost = no fill */
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  /** Shows Wovi walking and blocks clicks while a job runs. */
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Full width of its container. */
  block?: boolean;
};

const MASCOT_SIZE = { sm: 22, md: 26, lg: 30 } as const;

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leading,
  trailing,
  block = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = [styles.button, styles[variant], styles[size], block ? styles.block : "", loading ? styles.loading : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  // Ink for the walking mascot: Night on Blaze, Cream on Cobalt, theme ink on ghost.
  const ink = variant === "primary" ? "night" : variant === "secondary" ? "cream" : "auto";
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? (
        <span className={styles.spinner} aria-hidden="true">
          <Mascot pose="move" size={MASCOT_SIZE[size]} ink={ink} label="" />
        </span>
      ) : (
        leading && <span className={styles.icon}>{leading}</span>
      )}
      <span className={styles.label}>{children}</span>
      {!loading && trailing && <span className={styles.icon}>{trailing}</span>}
    </button>
  );
}

export type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  leading?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
};

/** A link styled as a button, for navigation. */
export function ButtonLink({ href, variant = "primary", size = "md", leading, trailing, block = false, className, children, ...rest }: ButtonLinkProps) {
  const cls = [styles.button, styles[variant], styles[size], block ? styles.block : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <Link href={href} className={cls} {...rest}>
      {leading && <span className={styles.icon}>{leading}</span>}
      <span className={styles.label}>{children}</span>
      {trailing && <span className={styles.icon}>{trailing}</span>}
    </Link>
  );
}
