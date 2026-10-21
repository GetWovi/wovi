import type { CSSProperties } from "react";

/**
 * The one place the logo files are named. Every logo on the site goes through
 * <Logo />, so replacing these files in public/brand/ swaps the logo everywhere.
 * The files there are cut from Funkai's art (WOWI-banner.png); the w alone is its
 * left half mirrored, so it stands clean without the O.
 */
export const LOGO_FILES = {
  wordmark: {
    /** Blaze letters, cream face: for night grounds. */
    night: "/brand/wovi-wordmark.png",
    /** Blaze letters, night face: for cream and white grounds. */
    light: "/brand/wovi-wordmark-on-light.png",
    /** Night letters: for a Blaze ground. */
    "on-blaze": "/brand/wovi-wordmark-night.png",
    /** Cream letters: for a Cobalt ground. */
    "on-cobalt": "/brand/wovi-wordmark-cream.png",
  },
  mark: {
    night: "/brand/wovi-mark.png",
    light: "/brand/wovi-mark-on-light.png",
    "on-blaze": "/brand/wovi-mark-night.png",
    "on-cobalt": "/brand/wovi-mark-cream.png",
  },
  favicon: "/brand/favicon-48.png",
  ico: "/favicon.ico",
  appIcon192: "/brand/app-icon-192.png",
  appIcon512: "/brand/app-icon-512.png",
  ogBanner: "/brand/og-banner.png",
} as const;

export type LogoKind = "wordmark" | "mark";
export type LogoVariant = "theme" | keyof typeof LOGO_FILES.wordmark;

export type LogoProps = {
  kind?: LogoKind;
  /** "theme" follows night and light; the others pick one file. */
  variant?: LogoVariant;
  /** Rendered height in px; the width follows the file. */
  height: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

/** The wordmark or the w mark, from the files in public/brand. */
export function Logo({ kind = "wordmark", variant = "theme", height, label = "WOVI", className, style }: LogoProps) {
  const files = LOGO_FILES[kind];
  const cls = ["wovi-logo", className ?? ""].filter(Boolean).join(" ");
  const s = { height, ...style };
  if (variant === "theme") {
    // Both files are in the tree; CSS on [data-theme] shows the right one, so there is no flash on load.
    return (
      <span className={cls} style={s} role="img" aria-label={label}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wovi-logo-night" src={files.night} alt="" height={height} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wovi-logo-light" src={files.light} alt="" height={height} />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={cls} src={files[variant]} alt={label} height={height} style={s} />;
}
