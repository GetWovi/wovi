"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import type { EditField } from "@/lib/app/results";
import { FEEDBACK_LIMITS } from "@/lib/stats/types";
import styles from "./App.module.css";
import e from "./ItemEdit.module.css";

/**
 * Changing one item of a result where it stands (product doc: "every result
 * is editable inline"): a text box per part of it, then Keep or Cancel.
 * `onKeep` saves through the result's edit and resolves true when it did.
 */
export function ItemEditor({ fields, onKeep, onCancel }: { fields: EditField[]; onKeep: (values: Record<string, string>) => Promise<boolean>; onCancel: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [busy, setBusy] = useState(false);
  const empty = fields.some((f) => !values[f.key]?.trim());
  const same = fields.every((f) => values[f.key] === f.value);

  async function keep() {
    setBusy(true);
    const ok = await onKeep(values);
    if (!ok) setBusy(false);
  }

  return (
    <div className={e.editor}>
      {fields.map((f, n) => (
        <Textarea
          key={f.key}
          label={f.label}
          rows={Math.min(8, Math.max(2, Math.ceil(f.value.length / 60) + f.value.split("\n").length - 1))}
          value={values[f.key] ?? ""}
          onChange={(ev) => setValues((all) => ({ ...all, [f.key]: ev.target.value }))}
          maxLength={FEEDBACK_LIMITS.keptChars}
          autoFocus={n === 0}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") onCancel();
          }}
        />
      ))}
      <div className={e.buttons}>
        <Button size="sm" onClick={keep} loading={busy} disabled={busy || empty || same} leading={<Icon name="check" size={16} />}>
          Keep my version
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The pen beside an item's copy button: opens it for editing in place. */
export function EditButton({ what, onClick }: { what: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.copy} onClick={onClick} aria-label={`Edit: ${what.slice(0, 40)}`} title="Change this one">
      <Icon name="pen" size={14} />
    </button>
  );
}

/** A small mark on an item the person changed and kept. */
export function EditedTag() {
  return (
    <span className={e.edited}>
      <Icon name="pen" size={12} /> Your version
    </span>
  );
}
