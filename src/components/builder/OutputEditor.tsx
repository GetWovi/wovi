"use client";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import { ASPECTS, PLATFORMS } from "@/lib/agents/catalog";
import type { AgentOutput } from "@/lib/agents/spec";
import styles from "./Builder.module.css";
import { blankOutput, num, str, type AnyOutput } from "./editor-types";
import { OUTPUT_KIND_LABELS, PLATFORM_LABELS } from "./labels";
import { errorAt, type SpecIssue } from "./spec-errors";

const KINDS = Object.keys(OUTPUT_KIND_LABELS) as AgentOutput["kind"][];
const FORMATS = ["post", "thread", "carousel", "short"] as const;

export function OutputEditor({ output, issues, onChange }: { output: AnyOutput; issues: SpecIssue[]; onChange: (o: AnyOutput) => void }) {
  const at = (p: string) => errorAt(issues, `output.${p}`);
  const set = (patch: Record<string, unknown>) => onChange({ ...output, ...patch });
  const n = (k: string) => str(output[k]);
  const own = errorAt(issues, "output");

  return (
    <div className={styles.stack}>
      <div className={styles.fieldGrid}>
        <Select label="Kind" value={output.kind} onChange={(e) => onChange(blankOutput(e.target.value as AgentOutput["kind"]))} options={KINDS.map((k) => ({ value: k, label: OUTPUT_KIND_LABELS[k] }))} error={at("kind") ?? own} hint={["image", "storyboard", "video"].includes(output.kind) ? "Media kinds need tools from a later phase; the spec is valid, the engine refuses runs for now." : undefined} />
        {output.kind === "text" && <Input label="Max words" type="number" min={1} max={5000} value={n("maxWords")} onChange={(e) => set({ maxWords: num(e.target.value) })} error={at("maxWords")} />}
        {output.kind === "list" && (
          <>
            <Input label="Items" type="number" min={1} max={50} value={n("count")} onChange={(e) => set({ count: num(e.target.value) })} error={at("count")} />
            <Input label="Max words per item" type="number" min={1} max={500} value={n("maxWordsPerItem")} onChange={(e) => set({ maxWordsPerItem: num(e.target.value) })} error={at("maxWordsPerItem")} hint="Leave empty for no limit" />
            <Input
              label="Fields"
              value={Array.isArray(output.fields) ? (output.fields as string[]).join(", ") : ""}
              onChange={(e) => {
                const fields = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                set({ fields: fields.length ? fields : undefined });
              }}
              error={at("fields")}
              hint="Empty: each item is a line. Else each item has these snake_case fields."
              className={styles.mono}
            />
          </>
        )}
        {output.kind === "script" && (
          <>
            <Input label="Max seconds" type="number" min={1} max={600} value={n("maxSeconds")} onChange={(e) => set({ maxSeconds: num(e.target.value) })} error={at("maxSeconds")} />
            <Input label="Sections, in order" value={Array.isArray(output.sections) ? (output.sections as string[]).join(", ") : ""} onChange={(e) => set({ sections: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} error={at("sections")} className={styles.mono} />
          </>
        )}
        {output.kind === "caption_set" && (
          <>
            <Input label="Variants per platform" type="number" min={1} max={10} value={n("variants")} onChange={(e) => set({ variants: num(e.target.value) })} error={at("variants")} />
            <Input label="Max characters" type="number" min={1} max={5000} value={n("maxChars")} onChange={(e) => set({ maxChars: num(e.target.value) })} error={at("maxChars")} />
          </>
        )}
        {(output.kind === "image" || output.kind === "storyboard" || output.kind === "video") && (
          <Select label="Aspect" value={str(output.aspect) || "9:16"} onChange={(e) => set({ aspect: e.target.value })} options={ASPECTS.map((a) => ({ value: a, label: a }))} error={at("aspect")} />
        )}
        {output.kind === "image" && <Input label="Images" type="number" min={1} max={12} value={n("count")} onChange={(e) => set({ count: num(e.target.value) })} error={at("count")} />}
        {output.kind === "storyboard" && <Input label="Max frames" type="number" min={1} max={40} value={n("maxFrames")} onChange={(e) => set({ maxFrames: num(e.target.value) })} error={at("maxFrames")} />}
        {output.kind === "video" && <Input label="Max seconds" type="number" min={1} max={600} value={n("maxSeconds")} onChange={(e) => set({ maxSeconds: num(e.target.value) })} error={at("maxSeconds")} />}
      </div>

      {output.kind === "caption_set" && (
        <div className={styles.stackTight}>
          <span className={styles.uploadLabel}>Platforms in the set</span>
          <div className={styles.chips}>
            {PLATFORMS.map((p) => {
              const list = Array.isArray(output.platforms) ? (output.platforms as string[]) : [];
              const on = list.includes(p);
              return (
                <Chip key={p} selected={on} onClick={() => set({ platforms: on ? list.filter((x) => x !== p) : [...list, p] })}>
                  {PLATFORM_LABELS[p]}
                </Chip>
              );
            })}
          </div>
          {at("platforms") && (
            <p className={styles.fieldError}>
              <Icon name="warning" size={16} /> {at("platforms")}
            </p>
          )}
        </div>
      )}

      {output.kind === "storyboard" && <Toggle checked={Boolean(output.withImages)} onChange={(withImages) => set({ withImages })} label="Draw each frame" description="Off: text frames only." />}

      {output.kind === "post_set" && (
        <div className={styles.stackTight}>
          <span className={styles.uploadLabel}>Formats</span>
          {(Array.isArray(output.formats) ? (output.formats as { format: string; count: number }[]) : []).map((f, k, all) => (
            <div key={k} className={styles.optionRow}>
              <Select aria-label="Format" value={f.format} onChange={(e) => set({ formats: all.map((x, j) => (j === k ? { ...x, format: e.target.value } : x)) })} options={FORMATS.map((x) => ({ value: x, label: x }))} error={at(`formats[${k}].format`)} />
              <Input aria-label="Count" type="number" min={1} max={10} value={str(f.count)} onChange={(e) => set({ formats: all.map((x, j) => (j === k ? { ...x, count: num(e.target.value) } : x)) })} error={at(`formats[${k}].count`)} />
              <button type="button" className={[styles.iconButton, styles.iconButtonDanger].join(" ")} onClick={() => set({ formats: all.filter((_, j) => j !== k) })} aria-label="Remove format" style={{ marginBottom: 6 }}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          {at("formats") && (
            <p className={styles.fieldError}>
              <Icon name="warning" size={16} /> {at("formats")}
            </p>
          )}
          <div>
            <Button variant="ghost" size="sm" leading={<Icon name="plus" />} onClick={() => set({ formats: [...(Array.isArray(output.formats) ? (output.formats as unknown[]) : []), { format: "post", count: 1 }] })}>
              Add format
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
