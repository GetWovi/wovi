import { Icon } from "@/components/ui/Icon";
import { PLATFORMS, type Platform } from "@/lib/agents/catalog";
import { PLATFORM_POLICIES } from "@/lib/safety/platforms";
import s from "./Safety.module.css";

/** Each platform's rules beside the form, one fold per platform. */
export function PlatformRules({ platforms, open = false }: { platforms: readonly string[]; open?: boolean }) {
  const list = platforms.filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
  if (!list.length) return null;
  return (
    <div className={s.rules}>
      <span className={s.rulesHead}>
        <Icon name="info" size={18} /> Platform rules
      </span>
      {list.map((p, i) => {
        const r = PLATFORM_POLICIES[p];
        return (
          <details key={p} className={s.rule} open={open && i === 0}>
            <summary>{r.name}</summary>
            <ul className={s.ruleList}>
              <li>
                <b>Length.</b> {r.limits}
              </li>
              <li>
                <b>AI label.</b> {r.ai.when} {r.ai.where}
              </li>
              <li>
                <b>Music.</b> {r.music}
              </li>
              <li>
                <b>Paid or own promotion.</b> {r.paid}
              </li>
              <li>
                <b>No automation.</b> {r.automation}
              </li>
            </ul>
          </details>
        );
      })}
    </div>
  );
}
