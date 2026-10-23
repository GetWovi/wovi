"use client";

import { useState } from "react";
import { noteAiLabel } from "@/app/app/make/actions";
import { useToast } from "@/components/ui/Toast";
import { AI_LABEL_CHECK, AI_LABEL_INTRO, aiLabelAdvice } from "@/lib/safety/ai-label";
import s from "./Safety.module.css";

export type AiLabelState = { at: string; by: string; platforms: string[] } | null;

/**
 * Under every result: it was written by AI, which platforms ask for a label
 * and where, and a box that stores the person's note with the output.
 */
export function AiLabelPanel({ csrf, runId, platforms, initial, editable }: { csrf: string; runId: string; platforms: readonly string[]; initial: AiLabelState; editable: boolean }) {
  const { toast } = useToast();
  const [note, setNote] = useState<AiLabelState>(initial);
  const [busy, setBusy] = useState(false);
  const advice = aiLabelAdvice(platforms);

  async function toggle(on: boolean) {
    setBusy(true);
    const r = await noteAiLabel(csrf, runId, on);
    setBusy(false);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    setNote(r.value?.run.aiLabel ?? null);
  }

  return (
    <section className={s.label} aria-label="AI label">
      <div className={s.labelHead}>
        <span className={s.aiTag}>Made with AI</span>
        <h3>Label it where the platform asks</h3>
      </div>
      <p className={s.labelDone}>{AI_LABEL_INTRO}</p>
      <div className={s.labelRows}>
        {advice.map((a) => (
          <div key={a.platform} className={s.labelRow}>
            <b>{a.name}</b>
            <span>{a.when}</span>
            <span>{a.where}</span>
          </div>
        ))}
      </div>
      {editable ? (
        <label className={[s.confirm, note ? s.confirmOn : ""].join(" ")}>
          <input type="checkbox" checked={Boolean(note)} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
          <span>
            {AI_LABEL_CHECK}
            {note && <span className={s.found}> Noted {new Date(note.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, kept with this result.</span>}
          </span>
        </label>
      ) : (
        note && <p className={s.labelDone}>Someone noted the AI label on {note.at.slice(0, 10)}.</p>
      )}
    </section>
  );
}
