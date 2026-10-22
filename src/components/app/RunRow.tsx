import Link from "next/link";
import type { ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { ago } from "@/components/builder/labels";
import type { RunView } from "@/lib/app/api";
import { STATE_LABELS, poseFor, runTitle, type RunState } from "@/lib/app/results";
import { RowCharge } from "@/components/credits/CreditParts";
import styles from "./App.module.css";

export function StateTag({ state }: { state: RunState }) {
  return <span className={[styles.state, styles[`state-${state}`]].join(" ")}>{STATE_LABELS[state]}</span>;
}

/** One run in a list: Wovi in the pose of its state, the agent, what it was about, when, and the state. */
export function RunRow({ view, now, action }: { view: RunView; now: number; action?: ReactNode }) {
  const { run, agent, state } = view;
  const running = state === "queued" || state === "running";
  const cls = [styles.runRow, running ? styles.runRowRunning : "", state === "needs_review" ? styles.runRowReview : ""].join(" ");
  return (
    <div className={cls}>
      <Link href={`/app/runs/${run.id}`} className={styles.runMain}>
        <span className={styles.runMascot}>
          <Mascot pose={poseFor(state)} size={56} label={`Wovi, ${STATE_LABELS[state].toLowerCase()}`} />
        </span>
        <span className={styles.runText}>
          <span className={styles.runTop}>
            <span className={styles.runAgent}>{agent?.name ?? run.agent.id}</span>
            <StateTag state={state} />
            {run.charge && <RowCharge charge={run.charge} />}
          </span>
          <span className={styles.runTitle}>{runTitle(run, null)}</span>
          <span className={styles.runMeta}>
            {ago(run.createdAt, now)}
            {run.brandBrain?.name ? ` for ${run.brandBrain.name}` : ""}
            {view.note ? " with a quick edit" : ""}
            {view.review?.note ? ` · "${view.review.note}"` : ""}
          </span>
        </span>
      </Link>
      {action && <span className={styles.runSide}>{action}</span>}
    </div>
  );
}
