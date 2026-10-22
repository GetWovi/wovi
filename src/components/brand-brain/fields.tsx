"use client";

import { useState } from "react";
import shell from "@/components/builder/Builder.module.css";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PLATFORMS, type Platform } from "@/lib/agents/catalog";
import { TONE_TAGS } from "@/lib/brand/types";
import styles from "./Brain.module.css";
import { PLATFORM_LABELS } from "./labels";


function Label({ label, help }: { label: string; help?: string }) {
  return (
    <div>
      <div className={styles.fieldLabel}>{label}</div>
      {help && <div className={styles.fieldHelp}>{help}</div>}
    </div>
  );
}

/** Short words as removable chips, with a line to add more. */
export function WordsField({ label, help, value, onChange, placeholder, max = 40 }: { label: string; help?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const words = draft.split(",").map((w) => w.trim()).filter(Boolean);
    const next = [...value];
    for (const w of words) if (!next.some((x) => x.toLowerCase() === w.toLowerCase())) next.push(w);
    onChange(next.slice(0, max));
    setDraft("");
  };
  return (
    <div className={styles.field}>
      <Label label={label} help={help} />
      {value.length > 0 && (
        <div className={styles.chipRow}>
          {value.map((w) => (
            <Chip key={w} onRemove={() => onChange(value.filter((x) => x !== w))}>
              {w}
            </Chip>
          ))}
        </div>
      )}
      <div className={styles.addLine}>
        <Input aria-label={`Add to ${label}`} value={draft} placeholder={placeholder ?? "Type and press Enter"} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()} leading={<Icon name="plus" size={18} />}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** Lines (rules, sample lines) as rows with a remove button, and a line to add one. */
export function LinesField({ label, help, value, onChange, placeholder, max = 20 }: { label: string; help?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const line = draft.trim();
    if (line && !value.includes(line)) onChange([...value, line].slice(0, max));
    setDraft("");
  };
  return (
    <div className={styles.field}>
      <Label label={label} help={help} />
      {value.length > 0 && (
        <div className={styles.rows}>
          {value.map((line, i) => (
            <div key={`${i}:${line}`} className={styles.rowItem}>
              <span>{line}</span>
              <button type="button" className={[shell.iconButton, shell.iconButtonDanger].join(" ")} onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove "${line}"`}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={styles.addLine}>
        <Input aria-label={`Add to ${label}`} value={draft} placeholder={placeholder ?? "Add a line"} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim() || value.length >= max} leading={<Icon name="plus" size={18} />}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function PlatformsField({ value, onChange }: { value: Platform[]; onChange: (v: Platform[]) => void }) {
  return (
    <div className={styles.field}>
      <Label label="Platforms" />
      <div className={styles.chipRow}>
        {PLATFORMS.map((p) => (
          <Chip key={p} selected={value.includes(p)} onClick={() => onChange(value.includes(p) ? value.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || value.includes(x)))}>
            {PLATFORM_LABELS[p]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Tone tags: the common ones as toggles, plus any others already on the voice. */
export function ToneField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [more, setMore] = useState(false);
  const others = TONE_TAGS.filter((t) => !value.includes(t));
  const all = [...value, ...(more ? others : others.slice(0, 6))];
  return (
    <div className={styles.field}>
      <Label label="Tone" help="Pick up to five." />
      <div className={styles.chipRow}>
        {all.map((t) => (
          <Chip key={t} selected={value.includes(t)} disabled={!value.includes(t) && value.length >= 5} onClick={() => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])}>
            {t}
          </Chip>
        ))}
        {others.length > 6 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setMore(!more)}>
            {more ? "Fewer" : `${others.length - 6} more`}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The field errors from a failed save, as a list. */
export function Issues({ error, issues }: { error: string | null; issues?: string[] }) {
  if (!error) return null;
  return (
    <div role="alert" className={shell.fieldError}>
      <Icon name="warning" size={16} />
      <span>
        {error}
        {issues?.length ? ` ${issues.join(" ")}` : ""}
      </span>
    </div>
  );
}
