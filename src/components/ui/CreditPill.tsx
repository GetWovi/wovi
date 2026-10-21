import { Mark } from "@/components/brand/Mark";
import styles from "./CreditPill.module.css";

export type CreditPillProps = {
  amount: number;
  /** balance = your credits, cost = what a job costs, reward = what you earned */
  kind?: "balance" | "cost" | "reward";
  size?: "sm" | "md";
};

/** Credit pill: a credit amount with the w mark as the coin. */
export function CreditPill({ amount, kind = "balance", size = "md" }: CreditPillProps) {
  const sign = kind === "reward" ? "+" : "";
  const label = kind === "balance" ? "credits" : kind === "cost" ? "credits per run" : "credits earned";
  return (
    <span className={[styles.pill, styles[kind], styles[size]].join(" ")} title={`${amount} ${label}`}>
      <span className={styles.coin}>
        <Mark size={size === "sm" ? 14 : 18} ink={kind === "reward" ? "night" : "auto"} label="" />
      </span>
      <span className={styles.amount}>
        {sign}
        {amount.toLocaleString("en-US")}
      </span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
