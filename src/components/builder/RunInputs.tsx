"use client";

import { Chip } from "@/components/ui/Chip";
import { Input, Select, Textarea } from "@/components/ui/Field";
import type { AgentInput, AgentSpec } from "@/lib/agents/spec";
import type { StoredFile } from "@/lib/builder/storage";
import styles from "./Builder.module.css";
import { FilePick } from "./FilePick";
import { INPUT_TYPE_LABELS } from "./labels";

/** Form values as the screen holds them: text, a choice list, or uploaded files. */
export type InputValues = Record<string, string | string[] | StoredFile[]>;

/** The form values as run inputs: files become references, numbers become numbers, empties are left out. */
export function asRunInputs(spec: Pick<AgentSpec, "inputs">, values: InputValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const input of spec.inputs) {
    const v = values[input.key];
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (input.type === "image" || input.type === "file" || input.type === "video") {
      out[input.key] = (v as StoredFile[]).map((f) => ({ assetId: f.id, name: f.name, mimeType: f.mimeType, sizeMb: Number((f.sizeBytes / 1024 / 1024).toFixed(3)) }));
    } else if (input.type === "number") out[input.key] = Number(v);
    else out[input.key] = v;
  }
  return out;
}

/** One field of the agent's own form, generated from its spec. */
export function RunInputField({
  input,
  value,
  uploading,
  onChange,
  onImages,
}: {
  input: AgentInput;
  value: InputValues[string] | undefined;
  uploading: boolean;
  onChange: (v: InputValues[string]) => void;
  /** Image inputs upload through the caller; left out, the field says uploads are not available here. */
  onImages?: (list: FileList | null) => void;
}) {
  const label = `${input.label}${input.required ? "" : " (optional)"}`;
  switch (input.type) {
    case "long_text":
      return <Textarea label={label} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={input.help} maxLength={input.limits.maxLength} />;
    case "text":
      return <Input label={label} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={input.help} maxLength={input.limits.maxLength} />;
    case "url":
      return <Input label={label} type="url" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={input.help} placeholder="https://" />;
    case "number":
      return <Input label={label} type="number" min={input.limits.min} max={input.limits.max} step={input.limits.step} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={input.help} />;
    case "profile":
      return <Input label={label} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} hint={input.help ?? "A Brand Brain id, or empty for the default"} placeholder="bb_default" className={styles.mono} />;
    case "choice": {
      if (input.multiple) {
        const list = (value as string[] | undefined) ?? [];
        return (
          <div className={styles.stackTight}>
            <span className={styles.uploadLabel}>{label}</span>
            <div className={styles.chips}>
              {input.options.map((o) => (
                <Chip key={o.value} selected={list.includes(o.value)} onClick={() => onChange(list.includes(o.value) ? list.filter((x) => x !== o.value) : [...list, o.value])}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
        );
      }
      return <Select label={label} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} options={[{ value: "", label: input.required ? "Pick one" : "Default" }, ...input.options]} hint={input.help} />;
    }
    case "image": {
      const list = (value as StoredFile[] | undefined) ?? [];
      if (!onImages) {
        return (
          <div className={styles.upload}>
            <span className={styles.uploadLabel}>{label}</span>
            <span className={styles.hint}>Add images on a sample; an ad-hoc run takes text inputs only.</span>
          </div>
        );
      }
      return (
        <div className={styles.upload}>
          <span className={styles.uploadLabel}>{label}</span>
          <div className={styles.uploadRow}>
            <FilePick label={uploading ? "Uploading" : "Add an image"} accept="image/png,image/jpeg,image/webp,image/gif" multiple={input.limits.maxFiles > 1} disabled={uploading || list.length >= input.limits.maxFiles} onFiles={onImages} />
            {list.map((f) => (
              <Chip key={f.id} onRemove={() => onChange(list.filter((x) => x.id !== f.id))}>
                {f.name}
              </Chip>
            ))}
          </div>
          <span className={styles.hint}>{input.help ?? `Up to ${input.limits.maxFiles} image${input.limits.maxFiles === 1 ? "" : "s"}, 8 MB each.`}</span>
        </div>
      );
    }
    default:
      return (
        <div className={styles.upload}>
          <span className={styles.uploadLabel}>{label}</span>
          <span className={styles.hint}>{INPUT_TYPE_LABELS[input.type]} uploads arrive with the media tools; this can stay empty for now.</span>
        </div>
      );
  }
}
