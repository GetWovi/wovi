import Link from "next/link";
import type { ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { ago } from "@/components/builder/labels";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import type { ItemView } from "@/lib/team/team";
import { ITEM_STATE_LABELS } from "@/lib/team/types";
import { ItemStateTag, Votes } from "./ItemState";
import { itemPose } from "./labels";
import t from "./Team.module.css";

/** One item in the review queue: Wovi in the state's pose, what made it, the client, who has it, the yeses so far. */
export function ItemRow({ item, now, action, href = `/app/review/${item.id}` }: { item: ItemView; now: number; action?: ReactNode; href?: string }) {
  const running = item.source === "running";
  return (
    <div className={[t.row, item.state === "needs_review" ? t.rowNeeds : ""].join(" ")}>
      <Link href={href} className={t.rowMain}>
        <span className={t.rowMascot}>
          <Mascot pose={itemPose(item.state, running)} size={56} label={`Wovi, ${ITEM_STATE_LABELS[item.state].toLowerCase()}`} />
        </span>
        <span className={t.rowText}>
          <span className={t.rowTop}>
            <span className={t.rowWhat}>{item.what.name}</span>
            <ItemStateTag state={item.state} />
            {running && <span className={t.client}>Still running</span>}
            {item.flagged && (
              <span className={t.flag}>
                <Icon name="warning" size={14} /> Flagged
              </span>
            )}
            {item.client && <span className={t.client}>{item.client.name}</span>}
          </span>
          <span className={t.rowTitle}>{item.title}</span>
          <span className={t.rowMeta}>
            <span>{ago(item.createdAt, now)}</span>
            {item.brand?.name && <span>for {item.brand.name}</span>}
            {item.maker && <span>by {item.maker.name}</span>}
            {item.comments > 0 && (
              <span>
                <Icon name="chat" size={14} /> {item.comments}
              </span>
            )}
            {item.reRunOf && (
              <span>
                <Icon name="refresh" size={14} /> New draft
              </span>
            )}
          </span>
        </span>
      </Link>
      <span className={t.rowSide}>
        {item.state === "needs_review" && item.approvalsNeeded > 1 && <Votes given={item.approvals.length} needed={item.approvalsNeeded} />}
        {item.assignee ? (
          <span className={t.who} title={`Assigned to ${item.assignee.name}`}>
            <Avatar name={item.assignee.name} size={32} />
            <b>{item.assignee.name.split("@")[0]}</b>
          </span>
        ) : (
          <span className={t.who}>Nobody yet</span>
        )}
        {action}
      </span>
    </div>
  );
}
