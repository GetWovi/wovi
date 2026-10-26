"use client";

import Link from "next/link";
import { useState } from "react";
import type { Result } from "@/app/app/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { FeedbackRequest } from "@/lib/app/api";
import type { RunFeedback } from "@/lib/stats/feedback";
import type { ThumbRating } from "@/lib/stats/types";
import styles from "./Stats.module.css";

export const NO_FEEDBACK: RunFeedback = { used: false, edited: null, regenerated: false, rating: null, note: null };

/**
 * Use, Edit, Try again and the thumbs under a result (product doc: "results
 * as cards with Use, Edit, Regenerate and rating"). Each one is recorded once
 * per run for the agent's live stats. Viewers can use and rate; editing and
 * running again need the editor role. Edit opens the result's own cards in
 * place (the screen does that); this bar shows what was kept.
 *
 * `compact` is the same bar for one part of a pipeline's package: no Use (the
 * part has its copy button), no heading and no fine print.
 */
export function ResultFeedback({
  text,
  state,
  onState,
  send,
  editor,
  editing = false,
  onEdit,
  onAgain,
  compact = false,
}: {
  /** What Use it copies. */
  text: string;
  state: RunFeedback;
  onState: (next: RunFeedback) => void;
  /** Records one action on the run and gives back what the workspace did with it. */
  send: (req: FeedbackRequest) => Promise<Result<RunFeedback>>;
  editor: boolean;
  /** An item is open for editing. */
  editing?: boolean;
  /** Opens the first item for editing. Left out, there is no Edit. */
  onEdit?: () => void;
  /** Runs the same job again. Left out, there is no Try again. Resolves once it has started or failed. */
  onAgain?: () => Promise<unknown>;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<ThumbRating | null>(null);
  const [note, setNote] = useState("");

  async function record(req: FeedbackRequest, key: string): Promise<boolean> {
    setBusy(key);
    const r = await send(req);
    setBusy(null);
    if (!r.ok) {
      toast({ tone: "warning", title: r.error });
      return false;
    }
    onState(r.value);
    return true;
  }

  async function use() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      /* The text stays on screen to select. */
    }
    if (await record({ action: "use", how: "copy_all" }, "use")) toast({ tone: "success", title: copied ? "Copied. Ready to paste." : "Marked as used.", description: copied ? undefined : "Select the text above to copy it." });
  }

  async function again() {
    if (!onAgain) return;
    setBusy("again");
    await onAgain();
    setBusy(null);
  }

  async function rate(rating: ThumbRating) {
    if (await record({ action: "rating", rating }, `rate-${rating}`)) {
      setNoteFor(rating);
      setNote("");
    }
  }

  async function sendNote() {
    if (!noteFor) return;
    if (await record({ action: "rating", rating: noteFor, note }, "note")) {
      setNoteFor(null);
      toast({ tone: "success", title: "Thanks. That goes to the agent's builder." });
    }
  }

  const changed = state.edited ? `${Math.max(1, Math.round(state.edited.distance * 100))}% changed` : null;

  const actions = (
    <div className={styles.feedbackActions}>
      {state.used && !state.edited && !compact && (
        <span className={styles.done}>
          <Icon name="check" size={14} /> Used
        </span>
      )}
      {changed && (
        <span className={styles.done}>
          <Icon name="pen" size={14} /> Your version, {changed}
        </span>
      )}
      {state.regenerated && (
        <span className={styles.done}>
          <Icon name="refresh" size={14} /> Ran again
        </span>
      )}
      {!compact && (
        <Button size="sm" onClick={use} loading={busy === "use"} disabled={busy !== null} leading={<Icon name="copy" size={16} />}>
          Use it
        </Button>
      )}
      {editor && onEdit && (
        <Button size="sm" variant="secondary" onClick={onEdit} disabled={busy !== null} leading={<Icon name="pen" size={16} />} aria-expanded={editing}>
          Edit
        </Button>
      )}
      {editor && onAgain && (
        <Button size="sm" variant="ghost" onClick={again} loading={busy === "again"} disabled={busy !== null} leading={<Icon name="refresh" size={16} />}>
          Try again
        </Button>
      )}
      <span className={styles.thumbs}>
        <button type="button" className={styles.thumb} aria-pressed={state.rating === "up"} aria-label="Thumbs up" onClick={() => rate("up")} disabled={busy !== null}>
          <Icon name="thumb-up" size={18} />
        </button>
        <button type="button" className={styles.thumb} aria-pressed={state.rating === "down"} aria-label="Thumbs down" onClick={() => rate("down")} disabled={busy !== null}>
          <Icon name="thumb-down" size={18} />
        </button>
      </span>
    </div>
  );

  const noteRow = noteFor && (
    <div className={styles.noteRow}>
      <Input label={noteFor === "up" ? "What worked? (optional)" : "What missed? (optional)"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={noteFor === "up" ? "The second hook is exactly us" : "Too salesy for our shop"} />
      <Button size="sm" variant="secondary" onClick={sendNote} loading={busy === "note"} disabled={busy !== null || !note.trim()}>
        Send
      </Button>
    </div>
  );

  if (compact) {
    return (
      <div className={styles.feedbackCompact} aria-label="What you did with this part">
        {actions}
        {noteRow}
      </div>
    );
  }

  return (
    <section className={styles.feedback} aria-label="What you did with this result">
      <div className={styles.feedbackRow}>
        <div className={styles.feedbackLabel}>
          <b>Did it work for you?</b>
          <span>Counts toward this agent&apos;s live stats.</span>
        </div>
        {actions}
      </div>

      {noteRow}

      <span className={styles.fine}>
        {editor ? "Press the pen on any card to change just that one; what you keep is copied for you. " : ""}How much you change a result is counted for everyone. Your edited text and notes reach the agent&apos;s builder only if you turned on <Link href="/account">Use my edits to improve agents</Link>.
      </span>
    </section>
  );
}
