"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import styles from "./Credits.module.css";

/**
 * Back from Stripe's page. Coming back proves nothing, so this only says what
 * happens next and looks again every two seconds for half a minute: the
 * credits land when Stripe's signed webhook says the payment went through.
 */
export function BackFromCard({ state, credits }: { state: "landed" | "waiting" | "cancelled" | "failed"; credits: number | null }) {
  const router = useRouter();
  const tries = useRef(0);
  useEffect(() => {
    if (state !== "waiting") return;
    const t = setInterval(() => {
      tries.current += 1;
      if (tries.current > 15) return clearInterval(t);
      router.refresh();
    }, 2000);
    return () => clearInterval(t);
  }, [state, router]);

  const words =
    state === "landed"
      ? `Paid. ${credits?.toLocaleString("en-US") ?? "The"} credits are in your balance.`
      : state === "waiting"
        ? "Thanks. Your credits land as soon as Stripe confirms the payment, usually within seconds."
        : state === "failed"
          ? "That card payment did not go through, so nothing was charged. Try again whenever you like."
          : "No payment was made. Pick a pack again whenever you like.";
  return (
    <p className={styles.backNote} role="status">
      <Icon name={state === "landed" ? "check-circle" : state === "waiting" ? "clock" : "info"} size={18} /> <span>{words}</span>
    </p>
  );
}
