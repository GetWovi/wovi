import { Mascot } from "@/components/brand/Mascot";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Chip";
import { GUARDRAILS, TOOLS } from "@/lib/agents/catalog";
import type { CreateInput } from "@/lib/agents/registry";
import type { AgentOutput } from "@/lib/agents/spec";
import styles from "./Builder.module.css";
import { BRAND_PART_LABELS, CATEGORY_LABELS, INPUT_TYPE_LABELS, PLATFORM_LABELS, ROUTE_LABELS } from "./labels";

export function describeOutput(o: AgentOutput): string {
  switch (o.kind) {
    case "text":
      return `Text, up to ${o.maxWords} words`;
    case "list":
      return `A list of ${o.count}${o.fields ? ` with ${o.fields.join(", ")}` : o.maxWordsPerItem ? `, up to ${o.maxWordsPerItem} words each` : ""}`;
    case "script":
      return `A script up to ${o.maxSeconds} s: ${o.sections.join(", ")}`;
    case "caption_set":
      return `${o.variants} caption${o.variants === 1 ? "" : "s"} for ${o.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}, up to ${o.maxChars} characters`;
    case "post_set":
      return o.formats.map((f) => `${f.count} ${f.format}${f.count === 1 ? "" : "s"}`).join(", ");
    case "image":
      return `${o.count} image${o.count === 1 ? "" : "s"}, ${o.aspect}`;
    case "storyboard":
      return `Up to ${o.maxFrames} frames, ${o.aspect}${o.withImages ? ", drawn" : ""}`;
    case "video":
      return `A video up to ${o.maxSeconds} s, ${o.aspect}`;
  }
}

/** A drafted spec, read at a glance. Shown after the drafter answers. */
export function DraftPreview({ spec, notes, showModel }: { spec: CreateInput; notes?: string[]; showModel: boolean }) {
  return (
    <div className={styles.preview}>
      <div className={styles.previewHead}>
        <Avatar name={spec.name} kind="agent" size={56} />
        <div className={styles.previewHeadText}>
          <h2>{spec.name}</h2>
          <span className={styles.previewId}>
            <span className={styles.mono}>{spec.id}</span> · v{spec.version} · {CATEGORY_LABELS[spec.category]} · {spec.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}
          </span>
        </div>
        <Mascot pose="done" size={64} style={{ marginInlineStart: "auto" }} />
      </div>
      <p>{spec.job}</p>
      <div className={styles.previewGrid}>
        <div className={styles.block}>
          <span className={styles.blockTitle}>Inputs</span>
          <dl className={styles.kv}>
            {spec.inputs.map((i) => (
              <div key={i.key} style={{ display: "contents" }}>
                <dt>{i.label}</dt>
                <dd>
                  {INPUT_TYPE_LABELS[i.type]}
                  {i.required ? "" : ", optional"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className={styles.block}>
          <span className={styles.blockTitle}>Output</span>
          <div className={styles.blockBody}>{describeOutput(spec.output)}</div>
          <span className={styles.blockTitle}>Brand Brain</span>
          <div className={styles.blockBody}>{(spec.brandBrain ?? []).map((p) => BRAND_PART_LABELS[p]?.label ?? p).join(", ") || "Not read"}</div>
        </div>
        <div className={styles.block}>
          <span className={styles.blockTitle}>Guardrails</span>
          <div className={styles.chips}>
            {(spec.guardrails ?? []).map((g) => (
              <Tag key={g} tone="blaze">
                {GUARDRAILS.find((x) => x.id === g)?.label ?? g}
              </Tag>
            ))}
          </div>
        </div>
        <div className={styles.block}>
          <span className={styles.blockTitle}>Tools</span>
          <div className={styles.chips}>
            {(spec.tools ?? []).length ? (spec.tools ?? []).map((t) => <Tag key={t}>{TOOLS.find((x) => x.id === t)?.label ?? t}</Tag>) : <span className={styles.blockBody}>None</span>}
          </div>
          {showModel && (
            <>
              <span className={styles.blockTitle}>Model slot</span>
              <div className={styles.blockBody}>
                {ROUTE_LABELS[spec.routing.model] ?? spec.routing.model}, then {ROUTE_LABELS[spec.routing.fallback] ?? spec.routing.fallback}. Cap ${spec.routing.maxCostUsd} a run.
              </div>
            </>
          )}
        </div>
        <div className={[styles.block, styles.blockWide].join(" ")}>
          <span className={styles.blockTitle}>Instructions</span>
          <pre className={styles.pre}>{spec.instructions}</pre>
        </div>
      </div>
      {notes && notes.length > 0 && <p className={styles.notes}>{notes.join(" ")}</p>}
    </div>
  );
}
