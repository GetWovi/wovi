"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearReview, reviewRun } from "@/app/app/make/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { ReviewRow } from "@/lib/app/types";
import styles from "./App.module.css";
import { StateTag } from "./RunRow";

/** Approve or reject, in one line, for a list row. */
export function ReviewButtons({ csrf, runId, compact = false, onDone }: { csrf: string; runId: string; compact?: boolean; onDone?: (r: ReviewRow) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    const r = await reviewRun(csrf, runId, decision, "");
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    if (!r.value) toast({ tone: "info", title: "Your yes is in. It needs one more." });
    else {
      toast({ tone: decision === "approved" ? "success" : "info", title: decision === "approved" ? "Approved" : "Rejected" });
      onDone?.(r.value);
    }
    router.refresh();
  }

  return (
    <span className={styles.actions}>
      <Button size="sm" variant="ghost" onClick={() => decide("rejected")} loading={busy === "rejected"} disabled={busy !== null} leading={<Icon name="x-circle" size={16} />}>
        {compact ? "No" : "Reject"}
      </Button>
      <Button size="sm" onClick={() => decide("approved")} loading={busy === "approved"} disabled={busy !== null} leading={<Icon name="check-circle" size={16} />}>
        {compact ? "Yes" : "Approve"}
      </Button>
    </span>
  );
}

/**
 * The human approve step on a result: approve or reject with a note, or see
 * the decision made and take it back.
 */
export function ReviewPanel({ csrf, runId, review, editor, needsReview, by }: { csrf: string; runId: string; review: ReviewRow | null; editor: boolean; needsReview: boolean; by: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [current, setCurrent] = useState<ReviewRow | null>(review);

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    const r = await reviewRun(csrf, runId, decision, note);
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    setNote("");
    if (!r.value) {
      toast({ tone: "info", title: "Your yes is in. This workspace needs one more before it is approved." });
      router.refresh();
      return;
    }
    setCurrent(r.value);
    toast({ tone: decision === "approved" ? "success" : "info", title: decision === "approved" ? "Approved. Post it when you are ready." : "Rejected. Run it again or change the input." });
    router.refresh();
  }

  async function undo() {
    setBusy("undo");
    const r = await clearReview(csrf, runId);
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    setCurrent(null);
    router.refresh();
  }

  if (current) {
    return (
      <div className={styles.review}>
        <div className={styles.reviewHead}>
          <b>Your decision</b>
          <span className={styles.actions}>
            <Link href={`/app/review/${runId}`} className={styles.small}>
              In review
            </Link>
            <StateTag state={current.decision} />
          </span>
        </div>
        <div className={styles.decided}>
          <span className={styles.muted}>
            {current.decision === "approved" ? "Approved" : "Rejected"}
            {by ? ` by ${by}` : ""}.
          </span>
          {current.note && <blockquote>{current.note}</blockquote>}
          {editor && (
            <Button size="sm" variant="ghost" onClick={undo} loading={busy === "undo"}>
              Take it back
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.review}>
      <div className={styles.reviewHead}>
        <b>{needsReview ? "A check flagged this. Your call." : "Happy with it?"}</b>
        <span className={[styles.muted, styles.small].join(" ")}>
          Nothing is posted by WOVI. Approve means it is ready for you to use. <Link href={`/app/review/${runId}`}>Comments and the team&apos;s say</Link>
        </span>
      </div>
      {editor ? (
        <div className={styles.reviewRow}>
          <Input label="A note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Why, or what to change next time" />
          <Button variant="ghost" onClick={() => decide("rejected")} loading={busy === "rejected"} disabled={busy !== null} leading={<Icon name="x-circle" size={18} />}>
            Reject
          </Button>
          <Button onClick={() => decide("approved")} loading={busy === "approved"} disabled={busy !== null} leading={<Icon name="check-circle" size={18} />}>
            Approve
          </Button>
        </div>
      ) : (
        <span className={[styles.muted, styles.small].join(" ")}>Someone who can run agents in this workspace decides.</span>
      )}
    </div>
  );
}
