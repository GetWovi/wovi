import { Icon } from "@/components/ui/Icon";
import s from "./Safety.module.css";

/** A refused request: what WOVI will not write, field by field, and nothing held or charged. */
export function BlockedNotice({ lines, fieldLabel }: { lines: string[]; fieldLabel?: (key: string) => string }) {
  return (
    <div className={s.blocked} role="alert">
      <Icon name="warning" size={28} />
      <div className={s.blockedText}>
        <h3>WOVI cannot make this</h3>
        <ul>
          {lines.map((line) => {
            const m = /^([a-zA-Z_][a-zA-Z0-9_]*): ([^]*?)(?: \(Found: "([^]*)"\))?$/.exec(line);
            const field = m ? (fieldLabel ? fieldLabel(m[1]) : m[1]) : null;
            return (
              <li key={line}>
                {field && <b>{field}: </b>}
                {m ? m[2] : line}
                {m?.[3] && <span className={s.found}> Found: &ldquo;{m[3]}&rdquo;</span>}
              </li>
            );
          })}
        </ul>
        <p>
          Nothing ran and no credits were held. Change the request and run it again. <a href="/terms#content-rules">What WOVI does not write</a>
        </p>
      </div>
    </div>
  );
}
