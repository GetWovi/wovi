import styles from "@/components/app/App.module.css";
import { ITEM_STATE_LABELS, type ItemState } from "@/lib/team/types";
import t from "./Team.module.css";

export function ItemStateTag({ state }: { state: ItemState }) {
  return <span className={[styles.state, styles[`state-${state}`]].join(" ")}>{ITEM_STATE_LABELS[state]}</span>;
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
