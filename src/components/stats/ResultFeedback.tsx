"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { giveFeedback, regenerateRun } from "@/app/app/make/actions";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { FeedbackRequest } from "@/lib/app/api";
import type { RunFeedback } from "@/lib/stats/feedback";
import type { ThumbRating } from "@/lib/stats/types";
import styles from "./Stats.module.css";

const EMPTY: RunFeedback = { used: false, edited: null, regenerated: false, rating: null, note: null };

/**
 * Use, Edit, Try again and the thumbs under a result (product doc: "results
 * as cards with Use, Edit, Regenerate and rating"). Each one is recorded once
 * per run for the agent's live stats. Viewers can use and rate; editing and
 * running again need the editor role.
 */
export function ResultFeedback({ csrf, runId, agentId, text, initial, editor, onRegenerated }: { csrf: string; runId: string; agentId: string; text: string; initial: RunFeedback | null | undefined; editor: boolean; onRegenerated?: (runId: string) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<RunFeedback>(initial ?? EMPTY);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<ThumbRating | null>(null);
  const [note, setNote] = useState("");

  async function send(req: FeedbackRequest, key: string): Promise<boolean> {
    setBusy(key);
    const r = await giveFeedback(csrf, runId, req);
    setBusy(null);
    if (!r.ok) {
      toast({ tone: "warning", title: r.error });
      return false;
    }
    setState(r.value);
    return true;
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  async function use() {
    const copied = await copy(text);
    if (await send({ action: "use", how: "copy_all" }, "use")) toast({ tone: "success", title: copied ? "Copied. Ready to paste." : "Marked as used.", description: copied ? undefined : "Select the text above to copy it." });
  }

  async function keep() {
    if (await send({ action: "edit", text: draft }, "edit")) {
      const copied = await copy(draft);
      setEditing(false);
      toast({ tone: "success", title: "Kept your version", description: copied ? "Copied, ready to paste." : undefined });
    }
  }

  async function again() {
    setBusy("again");
    const r = await regenerateRun(csrf, runId);
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    if (onRegenerated) onRegenerated(r.value.id);
    else router.push(`/app/make/${agentId}?run=${r.value.id}`);
  }

  async function rate(rating: ThumbRating) {
    if (await send({ action: "rating", rating }, `rate-${rating}`)) {
      setNoteFor(rating);
      setNote("");
    }
  }

  async function sendNote() {
    if (!noteFor) return;
    if (await send({ action: "rating", rating: noteFor, note }, "note")) {
      setNoteFor(null);
      toast({ tone: "success", title: "Thanks. That goes to the agent's builder." });
    }
  }

  const changed = state.edited ? `${Math.max(1, Math.round(state.edited.distance * 100))}% changed` : null;

  return (
    <section className={styles.feedback} aria-label="What you did with this result">
      <div className={styles.feedbackRow}>
        <div className={styles.feedbackLabel}>
          <b>Did it work for you?</b>
          <span>Counts toward this agent&apos;s live stats.</span>
        </div>
        <div className={styles.feedbackActions}>
          {state.used && !state.edited && (
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
          <Button size="sm" onClick={use} loading={busy === "use"} disabled={busy !== null} leading={<Icon name="copy" size={16} />}>
            Use it
          </Button>
          {editor && (
            <Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)} disabled={busy !== null} leading={<Icon name="pen" size={16} />} aria-expanded={editing}>
              Edit
            </Button>
          )}
          {editor && (
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
      </div>

      {editing && (
        <div className={styles.editor}>
          <Textarea label="Your version" rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20_000} hint="Change anything, then keep it. It is copied for you." />
          <div className={styles.buttons}>
            <Button size="sm" onClick={keep} loading={busy === "edit"} disabled={busy !== null || !draft.trim()} leading={<Icon name="check" size={16} />}>
              Keep my version
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(text);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {noteFor && (
        <div className={styles.noteRow}>
          <Input label={noteFor === "up" ? "What worked? (optional)" : "What missed? (optional)"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={noteFor === "up" ? "The second hook is exactly us" : "Too salesy for our shop"} />
          <Button size="sm" variant="secondary" onClick={sendNote} loading={busy === "note"} disabled={busy !== null || !note.trim()}>
            Send
          </Button>
        </div>
      )}

      <span className={styles.fine}>
        How much you change a result is counted for everyone. Your edited text and notes reach the agent&apos;s builder only if you turned on <Link href="/account">Use my edits to improve agents</Link>.
      </span>
    </section>
  );
}
