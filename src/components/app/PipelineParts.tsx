import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { ago } from "@/components/builder/labels";
import { RowCharge } from "@/components/credits/CreditParts";
import { Icon } from "@/components/ui/Icon";
import type { PipelineInfo, PipelineView } from "@/lib/app/api";
import { PIPELINE_STATE_LABELS, pipelinePose, stepTraits, type PipelineState } from "@/lib/app/pipelines";
import styles from "./App.module.css";
import p from "./Pipeline.module.css";
import { agentIcon } from "./agent-icons";

export function PipelineStateTag({ state }: { state: PipelineState }) {
  return <span className={[styles.state, styles[`state-${state}`]].join(" ")}>{PIPELINE_STATE_LABELS[state]}</span>;
}

/** The chain as a row of icon tiles: one per step, dashed when it only runs sometimes, ending in the approve step. */
export function ChainRow({ info }: { info: Pick<PipelineInfo, "spec" | "steps"> }) {
  return (
    <div className={p.chain} aria-label={`${info.steps.map((s) => s.agentName).join(", then ")}, then you approve`}>
      {info.steps.map((s, i) => (
        <Fragment key={s.id}>
          <span className={[p.chainTile, info.spec.steps[i].runIf ? p.chainTileOptional : ""].join(" ")} title={`${s.agentName}${info.spec.steps[i].runIf ? " (only when you ask for ideas)" : ""}`}>
            <Icon name={agentIcon(s.agentId)} size={18} />
          </span>
          <span className={p.chainArrow} aria-hidden="true">
            <Icon name="chevron-right" size={12} />
          </span>
        </Fragment>
      ))}
      <span className={[p.chainTile, p.chainTileEnd].join(" ")} title="You approve">
        <Icon name="check" size={18} />
      </span>
    </div>
  );
}

/** One pipeline the person can start. */
export function PipelineCard({ info, alt = false }: { info: PipelineInfo; alt?: boolean }) {
  const asks = info.spec.steps.filter((s) => s.choose?.kind === "ask").length;
  return (
    <Link href={`/app/pipelines/${info.spec.id}`} className={styles.cardLink} aria-label={`Start ${info.spec.name}`}>
      <article className={[styles.panel, styles.panelTight, alt ? styles.panelAlt : "", p.card].join(" ")}>
        <div className={p.cardTop}>
          <span className={[styles.chip, styles.chipCobalt].join(" ")}>
            {info.steps.length} steps{asks ? `, ${asks} pick${asks === 1 ? "" : "s"}` : ""}
          </span>
          <Mascot pose="wait" size={40} label="" />
        </div>
        <h3 className={p.cardName}>{info.spec.name}</h3>
        <p className={p.cardJob}>{info.spec.job}</p>
        <ChainRow info={info} />
        <div className={p.cardFoot}>
          <span className={styles.fine}>You approve at the end</span>
          <span className={p.start}>
            Start <Icon name="arrow-right" size={16} />
          </span>
        </div>
      </article>
    </Link>
  );
}

/** The chain as a list: each step, its agent, what it does about picks and checks, then the approve step. */
export function ChainList({ info }: { info: Pick<PipelineInfo, "spec" | "steps"> }) {
  return (
    <ol className={p.list}>
      {info.steps.map((s, i) => {
        const traits = stepTraits(info.spec.steps[i]);
        return (
          <li key={s.id} className={p.item}>
            <span className={[p.chainTile, info.spec.steps[i].runIf ? p.chainTileOptional : ""].join(" ")}>
              <Icon name={agentIcon(s.agentId)} size={20} />
            </span>
            <span className={p.itemText}>
              <b>{s.label}</b>
              <span>{s.agentName}</span>
              {traits.length > 0 && (
                <span className={p.traits}>
                  {traits.map((t, n) => (
                    <span key={t} className={t.startsWith("You") ? p.traitYou : undefined}>
                      {n > 0 ? " · " : ""}
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </li>
        );
      })}
      <li className={p.item}>
        <span className={[p.chainTile, p.chainTileEnd].join(" ")}>
          <Icon name="check" size={20} />
        </span>
        <span className={p.itemText}>
          <b>You approve</b>
          <span>Nothing is used until you say yes.</span>
        </span>
      </li>
    </ol>
  );
}

/** One pipeline run in a list: Wovi in the pose of its state, the pipeline, the idea, the steps as dots. */
export function PipelineRow({ view, now, action }: { view: PipelineView; now: number; action?: ReactNode }) {
  const { run, state, title } = view;
  const cls = [styles.runRow, state === "running" ? styles.runRowRunning : "", state === "needs_review" || state === "waiting" ? styles.runRowReview : ""].join(" ");
  return (
    <div className={cls}>
      <Link href={`/app/pipelines/runs/${run.id}`} className={styles.runMain}>
        <span className={styles.runMascot}>
          <Mascot pose={pipelinePose(state)} size={56} label={`Wovi, ${PIPELINE_STATE_LABELS[state].toLowerCase()}`} />
        </span>
        <span className={styles.runText}>
          <span className={styles.runTop}>
            <span className={styles.runAgent}>{run.pipeline.name}</span>
            <PipelineStateTag state={state} />
            <span className={p.kind}>
              <Icon name="layers" size={12} /> Pipeline
            </span>
            {run.charge && <RowCharge charge={run.charge} />}
          </span>
          <span className={styles.runTitle}>{title}</span>
          <span className={styles.runMeta}>
            <span className={p.rowChain} aria-label={`${run.steps.length} steps`}>
              {run.steps.map((s) => (
                <span key={s.id} className={p.rowDot} data-state={s.status} title={`${s.label}: ${s.status}`} />
              ))}
            </span>{" "}
            {ago(run.createdAt, now)}
            {run.brandBrain?.name ? ` for ${run.brandBrain.name}` : ""}
            {run.decision?.note ? ` · "${run.decision.note}"` : ""}
          </span>
        </span>
      </Link>
      {action && <span className={styles.runSide}>{action}</span>}
    </div>
  );
}
