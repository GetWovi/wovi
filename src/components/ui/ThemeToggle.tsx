"use client";

import { useCallback } from "react";
import { Icon } from "./Icon";
import styles from "./ThemeToggle.module.css";

export type Theme = "night" | "light";

export function readTheme(): Theme {
  if (typeof document === "undefined") return "night";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "night";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("wovi-theme", theme);
  } catch {
    /* storage can be blocked; the theme still applies for this page */
  }
}

/**
 * Switches between night and light. The current theme is read from <html>,
 * which an inline script sets before paint from the saved choice or the
 * system preference, so the toggle never flashes or mismatches on hydration.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const onClick = useCallback(() => {
    applyTheme(readTheme() === "light" ? "night" : "light");
  }, []);
  return (
    <button type="button" className={[styles.toggle, className].filter(Boolean).join(" ")} onClick={onClick} aria-label="Switch theme">
      <span className={styles.night}>
        <Icon name="moon" size={20} />
      </span>
      <span className={styles.light}>
        <Icon name="sun" size={20} />
      </span>
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
