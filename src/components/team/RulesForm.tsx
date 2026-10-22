"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveReviewRules } from "@/app/app/review/actions";
import styles from "@/components/app/App.module.css";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import type { ReviewSettings } from "@/lib/team/types";
import t from "./Team.module.css";

type Rules = Pick<ReviewSettings, "approvers" | "approvalsNeeded" | "autoSubmit" | "emailNotifications">;

function Choice({ on, title, text, onPick, disabled }: { on: boolean; title: string; text: string; onPick: () => void; disabled: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={t.choice} onClick={onPick} disabled={disabled}>
      <b>{title}</b>
      <span>{text}</span>
    </button>
  );
}

/** The approval rules: who decides, how many yeses, drafts to review on their own, emails. */
export function RulesForm({ csrf, initial, canEdit }: { csrf: string; initial: Rules; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [r, setR] = useState<Rules>(initial);
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(r) !== JSON.stringify(initial);

  async function save() {
    setBusy(true);
    const res = await saveReviewRules(csrf, r);
    setBusy(false);
    if (!res.ok) return toast({ tone: "warning", title: res.error });
    toast({ tone: "success", title: "Approval rules saved" });
    router.refresh();
  }

  return (
    <section className={[styles.panel, styles.panelTight, styles.stack].join(" ")} aria-label="Approval rules">
      <div className={t.sideHead}>
        <h3>Approval rules</h3>
        {!canEdit && <span className={styles.fine}>Admins and owners change these.</span>}
      </div>
      <div className={t.group}>
        <span className={t.groupLabel}>Who may approve, ask for changes or reject</span>
        <div className={t.choices} role="radiogroup" aria-label="Who decides">
          <Choice on={r.approvers === "editors"} title="Anyone who can edit" text="Editors, admins and owners. Viewers comment." onPick={() => setR({ ...r, approvers: "editors" })} disabled={!canEdit} />
          <Choice on={r.approvers === "admins"} title="Admins and owners only" text="Editors make and send. Admins and owners decide." onPick={() => setR({ ...r, approvers: "admins" })} disabled={!canEdit} />
        </div>
      </div>
      <div className={t.group}>
        <span className={t.groupLabel}>How many yeses it takes</span>
        <div className={t.choices} role="radiogroup" aria-label="Approvals needed">
          <Choice on={r.approvalsNeeded === 1} title="One" text="The first yes approves it." onPick={() => setR({ ...r, approvalsNeeded: 1 })} disabled={!canEdit} />
          <Choice on={r.approvalsNeeded === 2} title="Two, from different people" text="For agencies: a teammate and the client, or two teammates." onPick={() => setR({ ...r, approvalsNeeded: 2 })} disabled={!canEdit} />
        </div>
      </div>
      <Toggle checked={r.autoSubmit} onChange={(v) => setR({ ...r, autoSubmit: v })} disabled={!canEdit} label="Send finished results to review on their own" description="Off: each result stays a draft until its maker sends it." />
      <Toggle checked={r.emailNotifications} onChange={(v) => setR({ ...r, emailNotifications: v })} disabled={!canEdit} label="Email notifications too" description="Assigned, mentioned, changes asked and approved, also by email." />
      {canEdit && (
        <div className={styles.actions}>
          <Button onClick={save} loading={busy} disabled={!changed}>
            Save the rules
          </Button>
          {changed && (
            <Button variant="ghost" onClick={() => setR(initial)}>
              Undo
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
