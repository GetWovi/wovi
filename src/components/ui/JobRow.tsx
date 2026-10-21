import type { ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import type { Pose } from "@/brand/geometry";
import { Tag } from "./Chip";
import styles from "./JobRow.module.css";

export type JobStatus = "running" | "idle" | "done";

const STATUS: Record<JobStatus, { pose: Pose; label: string }> = {
  running: { pose: "walking", label: "Running" },
  idle: { pose: "sleeping", label: "Idle" },
  done: { pose: "celebrating", label: "Done" },
};

export type JobRowProps = {
  status: JobStatus;
  /** The agent doing the job, such as "Hook Writer". */
  agent: ReactNode;
  /** What the job is about. */
  task: ReactNode;
  /** Short meta such as a time or a credit cost. */
  meta?: ReactNode;
  /** Right-side control, such as a button. */
  action?: ReactNode;
};

/** Job status row: one job and its agent, with Wovi showing the state. */
export function JobRow({ status, agent, task, meta, action }: JobRowProps) {
  const s = STATUS[status];
  return (
    <div className={[styles.row, styles[status]].join(" ")}>
      <span className={styles.mascot}>
        <Mascot pose={s.pose} size={56} label={`Wovi ${s.label.toLowerCase()}`} />
      </span>
      <span className={styles.text}>
        <span className={styles.top}>
          <span className={styles.agent}>{agent}</span>
          <Tag tone={status === "done" ? "blaze" : status === "running" ? "cobalt" : "neutral"}>{s.label}</Tag>
        </span>
        <span className={styles.task}>{task}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
      {action && <span className={styles.action}>{action}</span>}
    </div>
  );
}
