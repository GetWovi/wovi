import styles from "@/components/app/App.module.css";
import { CopyButton } from "@/components/app/CopyButton";
import p from "@/components/app/Pipeline.module.css";
import { Part } from "@/components/app/PipelineFollow";
import { Asked, ResultBody, type AgentForResult } from "@/components/app/RunResult";
import { Mascot } from "@/components/brand/Mascot";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import type { PublicRun } from "@/lib/accounts/guard";
import { packageText } from "@/lib/app/pipelines";
import { brandFitOf, copyAll, explainChecks, resultNoun, resultView } from "@/lib/app/results";
import type { PackageItem } from "@/lib/pipelines/run";
import type { RunOutput } from "@/lib/runs/output";
import type { ItemState } from "@/lib/team/types";

type Props = {
  state: ItemState;
  eyebrow: string;
  title: string;
  /** Still running: nothing to show yet. */
  running: boolean;
  output: RunOutput | null;
  pkg: PackageItem[] | null;
  /** For members: the run with its checks and what was asked. Left out for clients. */
  run?: PublicRun | null;
  agent?: AgentForResult | null;
  meta: string[];
  /** The client view: no brand fit, no flags. */
  plain?: boolean;
};

/**
 * The result being reviewed, read-only: a run's typed output (with brand fit,
 * flagged checks and what was asked, for the team) or a pipeline's package.
 * Clients get the result alone.
 */
export function ItemResult({ state, eyebrow, title, running, output, pkg, run, agent, meta, plain = false }: Props) {
  if (running || (!output && !pkg)) {
    return (
      <section className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
        <Mascot pose={running ? "move" : "wait"} size={120} />
        <b>{running ? "Still running" : "No result to show"}</b>
        <span>{running ? "It can be decided once it lands. This page shows it then." : "This one stopped before it made anything."}</span>
      </section>
    );
  }
  const fit = run ? brandFitOf(run) : null;
  const flags = run ? explainChecks(run.checks) : [];
  const rv = output ? resultView(output) : null;
  const what = rv && agent ? resultNoun(agent, rv.count) : pkg ? "The package" : "The result";
  const heading = state === "needs_review" ? `${what}, for review` : state === "approved" ? `${what}, approved` : state === "draft" ? `${what}, a draft` : what;
  return (
    <section className={[styles.panel, styles.result].join(" ")}>
      <div className={styles.resultHead}>
        <Mascot pose="done" size={88} className="wovi" label="Wovi, job done" />
        <div className={styles.resultTitle}>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{heading}</h2>
          <div className={styles.resultMeta}>
            <span>{title}</span>
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
        {fit !== null && (
          <div className={styles.fit} title="How close this reads to the Brand Brain">
            <Badge score={fit} label="Brand fit" size="md" />
            <div className={styles.fitText}>
              <b>Brand fit</b>
              <span>{fit >= 85 ? "Sounds like them" : fit >= 70 ? "Close to the voice" : "A little off the voice"}</span>
            </div>
          </div>
        )}
      </div>

      {run && agent && <Asked run={run} agent={agent} />}

      {flags.length > 0 && (
        <div className={styles.flags}>
          {flags.map((f, i) => (
            <div key={i} className={[styles.flag, f.tone === "note" ? styles.flagNote : ""].join(" ")}>
              <Icon name={f.tone === "fail" ? "warning" : "info"} size={20} />
              <div className={styles.flagText}>
                <b>{f.title}</b>
                <span>{f.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.resultTools}>
        <span className={[styles.muted, styles.small].join(" ")}>A draft until it is approved. Nothing is posted by WOVI.</span>
        <CopyButton text={output ? copyAll(output) : pkg ? packageText({ package: pkg }) : ""} label="Copy everything" />
      </div>

      {rv && <ResultBody view={rv} />}
      {pkg && (
        <div className={p.parts}>
          {pkg.map((part) => (
            <Part key={part.step} part={part} plain={plain} />
          ))}
        </div>
      )}
    </section>
  );
}
