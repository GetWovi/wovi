import styles from "@/components/app/App.module.css";
import { ITEM_STATE_LABELS, type ItemState } from "@/lib/team/types";
import { itemTag } from "./labels";
import t from "./Team.module.css";

/** With `flagged`, a clean item waiting for a decision reads "Ready", as in History. */
export function ItemStateTag({ state, flagged }: { state: ItemState; flagged?: boolean }) {
  const tag = flagged === undefined ? { tone: state, label: ITEM_STATE_LABELS[state] } : itemTag(state, flagged);
  return <span className={[styles.state, styles[`state-${tag.tone}`]].join(" ")}>{tag.label}</span>;
}

/** Dots for the yeses a round needs, filled for the ones given. */
export function Votes({ given, needed }: { given: number; needed: number }) {
  return (
    <span className={t.votes} aria-label={`${given} of ${needed} approvals`} title={`${given} of ${needed} approvals`}>
      {Array.from({ length: needed }, (_, i) => (
        <span key={i} className={[t.vote, i < given ? t.voteOn : ""].join(" ")} />
      ))}
    </span>
  );
}
