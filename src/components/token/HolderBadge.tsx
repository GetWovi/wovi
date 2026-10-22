import { Sparkle } from "@/components/brand/Accents";
import styles from "./HolderBadge.module.css";

/**
 * The $WOVI holder badge (phase 17). It says only that the person's linked
 * wallets hold at least the threshold; never a balance or an address.
 */
export function HolderBadge({ size = "sm", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span className={[styles.badge, size === "md" ? styles.md : "", className ?? ""].join(" ")} title="Holds $WOVI in a linked wallet">
      <Sparkle size={size === "md" ? 16 : 12} color="var(--blaze)" />
      $WOVI holder
    </span>
  );
}
