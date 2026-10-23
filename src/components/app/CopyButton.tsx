"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import styles from "./App.module.css";

/** Copies a piece of text and says so for a moment. `onCopy` hears about it (live stats count a copy as a use). */
export function CopyButton({ text, label = "Copy", small = false, onCopy }: { text: string; label?: string; small?: boolean; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopy?.();
    } catch {
      /* Some browsers block the clipboard without a user gesture; the text stays on screen to select. */
    }
  }

  return (
    <button type="button" className={[styles.copy, copied ? styles.copied : ""].join(" ")} onClick={copy} aria-label={`${label}: ${text.slice(0, 40)}`}>
      <Icon name={copied ? "check" : "copy"} size={14} />
      {small ? null : copied ? "Copied" : label}
    </button>
  );
}
