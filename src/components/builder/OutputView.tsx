import { Tag } from "@/components/ui/Chip";
import type { RunOutput } from "@/lib/runs/output";
import styles from "./Builder.module.css";
import { PLATFORM_LABELS } from "./labels";

/** A run's typed output, laid out by its kind. */
export function OutputView({ output }: { output: RunOutput }) {
  switch (output.kind) {
    case "text":
      return <p className={styles.outText}>{output.text}</p>;
    case "list":
      return (
        <ol className={styles.outList}>
          {output.items.map((it, i) => (
            <li key={i}>
              {typeof it === "string" ? (
                it
              ) : (
                <dl className={styles.kv}>
                  {Object.entries(it).map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k.replace(/_/g, " ")}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ol>
      );
    case "script":
      return (
        <div className={styles.outSections}>
          {output.sections.map((s, i) => (
            <div key={i} className={styles.outSection}>
              <div className={styles.outSectionHead}>
                <span className={styles.outSectionName}>{s.section.replace(/_/g, " ")}</span>
                <span className={styles.hint}>{s.seconds} s</span>
              </div>
              <p>{s.spoken}</p>
              <p className={styles.hint}>On screen: {s.on_screen}</p>
            </div>
          ))}
        </div>
      );
    case "caption_set":
      return (
        <div className={styles.outSections}>
          {output.captions.map((c) => (
            <div key={c.platform} className={styles.outSection}>
              <Tag tone="cobalt">{PLATFORM_LABELS[c.platform] ?? c.platform}</Tag>
              <ol className={styles.outList}>
                {c.variants.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      );
    case "post_set":
      return (
        <div className={styles.outSections}>
          {output.posts.map((p, i) => (
            <div key={i} className={styles.outSection}>
              <Tag tone="cobalt">{p.format}</Tag>
              <ol className={styles.outList}>
                {p.parts.map((t, j) => (
                  <li key={j}>{t}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      );
  }
}
