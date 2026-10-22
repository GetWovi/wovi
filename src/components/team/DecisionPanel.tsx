"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clientDecide } from "@/app/client/actions";
import { decideItem, reopenItem, sendForReview } from "@/app/app/review/actions";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { Decision, ItemState } from "@/lib/team/types";
import { ItemStateTag, Votes } from "./ItemState";
import styles from "@/components/app/App.module.css";
import t from "./Team.module.css";

export type DecisionProps = {
  id: string;
  state: ItemState;
  running: boolean;
  approvals: { name: string; at: string }[];
  needed: number;
  last: { decision: Decision; name: string; note: string } | null;
  reRuns: string[];
  /** Where items live: "/app/review/" or the client's "/client/<token>/". */
  itemBase: string;
  /** The member's way in (csrf) or the client's (token). */
  as: { kind: "member"; csrf: string; canDecide: boolean; why: string | null; canSend: boolean; rule: string } | { kind: "client"; token: string; canApprove: boolean };
};

const DONE_WORDS: Record<Decision, string> = { approve: "Approved", request_changes: "Changes asked", reject: "Rejected" };

/**
 * The decision: approve, ask for changes (with a note, which starts a new
 * draft) or reject; the yeses so far when two are needed; the decision made
 * and taking it back. Clients approve or ask for changes only.
 */
export function DecisionPanel(p: DecisionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const member = p.as.kind === "member";
  const allowed = p.as.kind === "member" ? p.as.canDecide : p.as.canApprove;
  const decided = p.state === "approved" || p.state === "rejected" || p.state === "changes_requested";

  async function decide(d: Decision) {
    if (d === "request_changes" && note.trim().length < 3) return toast({ tone: "warning", title: "Say what to change first, so the next draft can do it." });
    setBusy(d);
    if (p.as.kind === "member") {
      const r = await decideItem(p.as.csrf, p.id, d, note);
      setBusy(null);
      if (!r.ok) return toast({ tone: "warning", title: r.error });
      setNote("");
      const s = r.value.item.state;
      toast({
        tone: s === "approved" ? "success" : "info",
        title: s === "approved" ? "Approved. Ready to post." : s === "needs_review" ? "Your yes is in. It needs one more." : s === "changes_requested" ? (r.value.reRun ? "Changes asked. A new draft is on its way." : "Changes asked.") : "Rejected.",
      });
    } else {
      if (d === "reject") return;
      const r = await clientDecide(p.as.token, p.id, d, note);
      setBusy(null);
      if (!r.ok) return toast({ tone: "warning", title: r.error });
      setNote("");
      toast({ tone: r.value.state === "approved" ? "success" : "info", title: r.value.state === "approved" ? "Thank you. Approved." : r.value.state === "needs_review" ? "Your yes is in. The team adds theirs." : "Thank you. A new draft is on its way." });
    }
    router.refresh();
  }

  async function act(kind: "reopen" | "send") {
    if (p.as.kind !== "member") return;
    setBusy(kind);
    const r = kind === "reopen" ? await reopenItem(p.as.csrf, p.id) : await sendForReview(p.as.csrf, p.id);
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    toast({ tone: "info", title: kind === "reopen" ? "Back in review." : "Sent for review." });
    router.refresh();
  }

  return (
    <section className={[styles.panel, styles.panelTight, t.decide].join(" ")}>
      <div className={t.decideHead}>
        <h2>{decided ? "Decided" : p.state === "draft" ? "A draft" : member ? "Your call" : "Your say"}</h2>
        <ItemStateTag state={p.state} />
      </div>

      {p.state === "draft" && (
        <div className={t.decidedBox}>
          <span className={styles.muted}>{p.running ? "Still running. It can be decided once it lands." : "Not sent for review yet. Send it when it looks right to you."}</span>
          {member && p.as.kind === "member" && p.as.canSend && !p.running && (
            <Button onClick={() => act("send")} loading={busy === "send"} leading={<Icon name="inbox" size={18} />}>
              Send for review
            </Button>
          )}
        </div>
      )}

      {p.needed > 1 && !decided && p.state !== "draft" && (
        <div className={t.progress}>
          <div className={t.progressTop}>
            <b>{p.approvals.length === 0 ? `${p.needed} yeses needed` : `${p.approvals.length} of ${p.needed} said yes`}</b>
            <Votes given={p.approvals.length} needed={p.needed} />
          </div>
          {p.approvals.length > 0 && (
            <div className={t.progressList}>
              {p.approvals.map((a) => (
                <span key={a.name + a.at}>{a.name} said yes</span>
              ))}
            </div>
          )}
        </div>
      )}

      {decided && p.last && (
        <div className={t.decidedBox}>
          <span>
            <b>{DONE_WORDS[p.last.decision]}</b> by {p.last.name}
          </span>
          {p.last.note && <blockquote>{p.last.note}</blockquote>}
          {p.state === "changes_requested" && p.reRuns.length > 0 && (
            <Link href={`${p.itemBase}${p.reRuns[p.reRuns.length - 1]}`} className={t.banner}>
              <Icon name="refresh" size={20} />
              <span>
                A new draft with these changes. <b>Open it</b>
              </span>
            </Link>
          )}
        </div>
      )}

      {!decided && p.state === "needs_review" && allowed && (
        <>
          <Textarea label={member ? "A note (needed to ask for changes)" : "What to change, if anything"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder={member ? "Shorter, and name the oven in the first line" : "Shorter, and say the opening hours"} />
          <div className={t.buttons}>
            <Button onClick={() => decide("approve")} loading={busy === "approve"} disabled={busy !== null} leading={<Icon name="check-circle" size={18} />}>
              Approve
            </Button>
            <Button variant="secondary" onClick={() => decide("request_changes")} loading={busy === "request_changes"} disabled={busy !== null} leading={<Icon name="refresh" size={18} />}>
              Ask for changes
            </Button>
            {member && (
              <Button variant="ghost" onClick={() => decide("reject")} loading={busy === "reject"} disabled={busy !== null} leading={<Icon name="x-circle" size={18} />}>
                Reject
              </Button>
            )}
          </div>
        </>
      )}

      {!decided && p.state === "needs_review" && !allowed && <span className={styles.muted}>{p.as.kind === "member" ? p.as.why : "This link can look and comment. Your contact decides."}</span>}

      {decided && member && p.as.kind === "member" && p.as.canDecide && (
        <Button variant="ghost" size="sm" onClick={() => act("reopen")} loading={busy === "reopen"}>
          Take it back
        </Button>
      )}

      <span className={t.rule}>{p.as.kind === "member" ? p.as.rule : "Nothing is posted until you and the team say yes."}</span>
    </section>
  );
}
