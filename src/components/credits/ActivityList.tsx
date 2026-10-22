import Link from "next/link";
import { ago } from "@/components/builder/labels";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { ActivityItem } from "@/lib/credits/credits";
import { creditWords } from "@/lib/credits/config";
import styles from "./Credits.module.css";

const ICONS: Record<ActivityItem["type"], IconName> = { run: "bolt", pipeline_run: "layers", top_up: "plus", grant: "spark", refund: "refresh", adjustment: "sliders", expire: "clock" };

/** What happened to the credits of one line, in words. */
function detail(a: ActivityItem): string {
  if (a.type === "run" || a.type === "pipeline_run") {
    const held = a.held ?? 0;
    if (a.state === "held") return `${creditWords(held)} held while it runs`;
    if (a.state === "refunded") return a.reason === "failed" ? `Failed, so all ${held} came back` : a.reason === "cancelled" ? `Stopped, so all ${held} came back` : `Nothing used, all ${held} came back`;
    const used = (a.back ?? 0) > 0 ? `Held ${held}, ${a.back} came back` : `Held ${held}, all used`;
    return a.holder > 0 ? `${used}, ${a.holder} of it holder credits` : used;
  }
  if (a.type === "top_up") return a.test ? "Test top-up, no money moved" : "Top-up";
  if (a.type === "grant") return a.holder > 0 ? "Holder credits: for runs only, gone at the end of the month" : "Given";
  if (a.type === "expire") return "Holder credits left at the end of their month";
  return a.note ?? (a.type === "refund" ? "Refunded" : "Adjusted");
}

function amount(a: ActivityItem): { text: string; sub: string | null; plus: boolean } {
  if (a.state === "held") return { text: `${(a.held ?? 0).toLocaleString("en-US")}`, sub: "held", plus: false };
  if (a.state === "refunded") return { text: "0", sub: "charged", plus: false };
  if (a.type === "run" || a.type === "pipeline_run") return { text: `-${(a.charged ?? 0).toLocaleString("en-US")}`, sub: "charged", plus: false };
  return { text: `${a.amount > 0 ? "+" : ""}${a.amount.toLocaleString("en-US")}`, sub: null, plus: a.amount > 0 };
}

/** The credits history: one line per run, pipeline run, top-up or correction, newest first. */
export function ActivityList({ items, names, now }: { items: ActivityItem[]; names: Map<string, string>; now: number }) {
  return (
    <ul className={styles.activity}>
      {items.map((a) => {
        const href = a.ref?.type === "run" ? `/app/runs/${a.ref.id}` : a.ref?.type === "pipeline_run" ? `/app/pipelines/runs/${a.ref.id}` : null;
        const who = names.get(a.userId ?? a.by ?? "") ?? null;
        const n = amount(a);
        return (
          <li key={a.id} className={styles.act}>
            <span className={[styles.actIcon, a.amount > 0 && a.type !== "run" && a.type !== "pipeline_run" ? styles.actIconUp : ""].join(" ")}>
              <Icon name={ICONS[a.type]} size={20} />
            </span>
            <span className={styles.actText}>
              <b>
                {href ? <Link href={href}>{a.label}</Link> : a.label}
                {a.test && <span className={styles.inlineTest}>Test</span>}
              </b>
              <span>
                {detail(a)}
                {who ? `, ${who}` : ""}, {ago(a.at, now)}
              </span>
            </span>
            <span className={styles.actAmount}>
              <b className={n.plus ? styles.plus : undefined}>{n.text}</b>
              {n.sub && <span>{n.sub}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
