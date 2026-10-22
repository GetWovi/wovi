import { CopyButton } from "@/components/app/CopyButton";
import { KEY_PLACEHOLDER, type Snippet } from "@/lib/api/snippets";
import s from "./Api.module.css";

/** The placeholder key stands out, so nobody mistakes it for a real one. */
function withPlaceholder(code: string) {
  const parts = code.split(KEY_PLACEHOLDER);
  return parts.flatMap((p, i) => (i === 0 ? [p] : [<span key={i} className={s.ph}>{KEY_PLACEHOLDER}</span>, p]));
}

/** A titled code block with a copy button. */
export function CodeBlock({ snippet }: { snippet: Pick<Snippet, "title" | "where" | "code" | "note"> }) {
  return (
    <figure className={s.code} aria-label={snippet.title}>
      <figcaption className={s.codeHead}>
        <span className={s.codeTitle}>
          <b>{snippet.title}</b>
          <span>{snippet.where}</span>
        </span>
        <CopyButton text={snippet.code} />
      </figcaption>
      <pre className={s.pre}>
        <code>{withPlaceholder(snippet.code)}</code>
      </pre>
      {snippet.note && <div className={s.codeNote}>{snippet.note}</div>}
    </figure>
  );
}
