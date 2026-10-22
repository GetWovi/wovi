"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { markRead } from "@/app/app/review/actions";
import { ago } from "@/components/builder/labels";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { NotificationRow } from "@/lib/team/types";
import { NOTIFICATION_ICONS, NOTIFICATION_VERBS } from "./labels";
import t from "./Team.module.css";

/** The bell's list: newest first, unread marked, one click opens the item and marks it read. */
/** Marks every notification read. */
export function MarkAllRead({ csrf, unread }: { csrf: string; unread: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function all() {
    setBusy(true);
    const r = await markRead(csrf, "all");
    setBusy(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    router.refresh();
  }
  return (
    <Button size="sm" variant="secondary" onClick={all} loading={busy} disabled={unread === 0} leading={<Icon name="check" size={16} />}>
      Mark all read
    </Button>
  );
}

export function NotificationList({ csrf, rows, now }: { csrf: string; rows: NotificationRow[]; now: number }) {
  const router = useRouter();

  async function open(n: NotificationRow) {
    if (!n.readAt) await markRead(csrf, [n.id]);
    router.push(`/app/review/${n.itemId}`);
  }

  return (
    <div className={t.notes}>
      {rows.map((n) => (
        <button key={n.id} type="button" className={[t.note, n.readAt ? "" : t.noteUnread].join(" ")} onClick={() => open(n)}>
          <span className={[t.noteIcon, n.kind === "approved" || n.kind === "assigned" ? t.noteIconBlaze : ""].join(" ")}>
            <Icon name={NOTIFICATION_ICONS[n.kind]} size={22} />
          </span>
          <span className={t.noteText}>
            <span className={t.noteLine}>
              <b>{n.actorName}</b> {NOTIFICATION_VERBS[n.kind]} <b>{n.title}</b>
            </span>
            {n.text && <span className={t.noteQuote}>{n.text}</span>}
          </span>
          <span className={t.noteSide}>
            {ago(n.createdAt, now)}
            {!n.readAt && <span className={t.unreadDot} aria-label="New" />}
          </span>
        </button>
      ))}
    </div>
  );
}
