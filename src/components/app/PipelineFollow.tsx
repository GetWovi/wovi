"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelPipeline, clearPipelineDecision, decidePipeline, pickInPipeline, pipelinePartUsed, pipelineView, retryPipeline } from "@/app/app/pipelines/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { PipelineView } from "@/lib/app/api";
import { STEP_LABELS, currentStepIndex, packageText, partText, pipelinePose, pipelineState, pipelineTitle } from "@/lib/app/pipelines";
import { resultView } from "@/lib/app/results";
import type { Candidate, PackageItem, PublicPipelineRun, PublicStepRun } from "@/lib/pipelines/run";
import type { RunOutput } from "@/lib/runs/output";
import { ChargeLine } from "@/components/credits/CreditParts";
import styles from "./App.module.css";
import { CopyButton } from "./CopyButton";
import p from "./Pipeline.module.css";
import { PipelineStateTag } from "./PipelineParts";
import { ResultBody } from "./RunResult";
import { agentIcon } from "./agent-icons";

const fitWords = (n: number) => (n >= 85 ? "Sounds like you" : n >= 70 ? "Close to your voice" : "A little off your voice");

/**
 * One pipeline run, live: Wovi and a headline for where it is, a bar per
 * step, the pick when a step asks the person, the package with the approve
 * step when it is done, and every step as a card that fills in as it lands.
 */
export function PipelineFollow({ csrf, initial, editor, decidedBy, now }: { csrf: string; initial: PipelineView; editor: boolean; decidedBy: string | null; now: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<PipelineView>(initial);
  const [nowMs, setNowMs] = useState(now);
  const [busy, setBusy] = useState<string | null>(null);
  const polling = useRef(false);
  const { run, state } = view;

  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const r = await pipelineView(csrf, run.id);
      if (r.ok && r.value) setView(r.value);
    } finally {
      polling.current = false;
    }
  }, [csrf, run.id]);

  const live = state === "running";
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
      void refresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [live, refresh]);

  const apply = (next: PublicPipelineRun) => setView({ run: next, state: pipelineState(next), title: pipelineTitle(next) });

  async function call(key: string, fn: () => Promise<{ ok: true; value: PublicPipelineRun } | { ok: false; error: string }>, done?: string | ((next: PublicPipelineRun) => string)) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    apply(r.value);
    const said = typeof done === "function" ? done(r.value) : done;
    if (said) toast({ tone: "success", title: said });
    router.refresh();
  }

  const i = currentStepIndex(run);
  const step = run.steps[i];
  const waitingStep = run.steps.find((s) => s.status === "waiting") ?? null;

  return (
    <div className={styles.stack}>
      <StatusPanel run={run} state={state} index={i} step={step} nowMs={nowMs} editor={editor} busy={busy} onStop={() => call("stop", () => cancelPipeline(csrf, run.id))} onRetry={() => call("retry", () => retryPipeline(csrf, run.id))} />

      {waitingStep && state === "waiting" && (
        <PickPanel key={waitingStep.id} run={run} step={waitingStep} editor={editor} busy={busy === "pick"} onPick={(index) => call("pick", () => pickInPipeline(csrf, run.id, waitingStep.id, index))} />
      )}

      {run.package && (state === "ready" || state === "needs_review" || state === "approved" || state === "rejected") && (
        <PackagePanel run={run} onCopyPart={(step) => void pipelinePartUsed(csrf, run.id, step)} editor={editor} decidedBy={decidedBy} busy={busy} onDecide={(d, note) => call(d, () => decidePipeline(csrf, run.id, d, note), (next) => (d === "rejected" ? "Rejected. Start it again with a new idea." : next.status === "approved" ? "Approved. Post it when you are ready." : "Your yes is in. This workspace needs one more."))} onClear={() => call("clear", () => clearPipelineDecision(csrf, run.id))} />
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <span className="eyebrow">{run.package ? "How it was made" : "The chain"}</span>
            <h2>Step by step</h2>
          </div>
          <span className={styles.fine}>Each step reads the one before it, and your Brand Brain.</span>
        </div>
        <div className={p.steps}>
          {run.steps.map((s, n) => (
            <StepCard key={s.id} run={run} step={s} n={n} nowMs={nowMs} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- Where it is ---------- */

function StatusPanel({ run, state, index, step, nowMs, editor, busy, onStop, onRetry }: { run: PublicPipelineRun; state: PipelineView["state"]; index: number; step: PublicStepRun; nowMs: number; editor: boolean; busy: string | null; onStop: () => void; onRetry: () => void }) {
  const total = run.steps.length;
  const def = run.spec.steps[index];
  let title: string;
  let line: string;
  switch (state) {
    case "running":
      title = `Step ${index + 1} of ${total}: ${step.label}`;
      line = step.status === "rewriting" ? `${step.agent.name} is rewriting it once, to fit your Brand Brain.` : step.status === "todo" ? `Handing over to ${step.agent.name}.` : `${step.agent.name} is writing in your voice.`;
      break;
    case "waiting":
      title = `Your turn: ${def.choose?.kind === "ask" ? def.choose.label.replace(/^\w/, (c) => c.toLowerCase()) : "pick one"}`;
      line = `Step ${index + 1} of ${total} is done. The rest of the chain waits for your pick.`;
      break;
    case "ready":
      title = "Your post is ready";
      line = "Every step is done and checked against your Brand Brain. Have a look, then approve it.";
      break;
    case "needs_review":
      title = "Ready, with something to check";
      line = "A check flagged part of it. Look at the flags below before you approve.";
      break;
    case "approved":
      title = "Approved and ready to post";
      line = "WOVI posts nothing. Copy each part and post it when you are ready.";
      break;
    case "rejected":
      title = "Rejected";
      line = "Start it again with a new idea, or take the decision back.";
      break;
    case "failed":
      title = `Stopped at ${run.steps.find((s) => s.status === "failed")?.label ?? "a step"}`;
      line = run.error?.message ?? "A step did not finish.";
      break;
    default:
      title = "Stopped";
      line = "You stopped this run. The steps before it are kept.";
  }
  const seconds = step.startedAt && state === "running" ? Math.max(0, Math.round((nowMs - Date.parse(step.startedAt)) / 1000)) : null;
  const pose = pipelinePose(state);
  return (
    <section className={[styles.panel, p.status].join(" ")} aria-live="polite">
      <Mascot pose={pose} size={132} className="wovi" label={`Wovi, ${pose === "move" ? "on the move" : pose === "done" ? "job done" : pose === "hello" ? "waving you over" : "waiting"}`} />
      <div className={p.statusText}>
        <span className="eyebrow">{run.brandBrain ? `For ${run.brandBrain.name}` : "Your run"}</span>
        <h2>{title}</h2>
        <p className={p.statusLine}>{line}</p>
        {run.charge && <ChargeLine charge={run.charge} />}
        <div className={p.segments}>
          {run.steps.map((s) => (
            <div key={s.id} className={p.segment} data-state={segmentState(s)} title={`${s.label}: ${STEP_LABELS[s.status]}`}>
              <span className={p.segmentBar} />
              <span className={p.segmentName}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={p.statusSide}>
        <PipelineStateTag state={state} />
        {seconds !== null && <span className={styles.fine}>{seconds} s on this step</span>}
        {editor && (state === "running" || state === "waiting") && (
          <Button size="sm" variant="ghost" onClick={onStop} loading={busy === "stop"} disabled={busy !== null}>
            Stop
          </Button>
        )}
        {editor && state === "failed" && (
          <Button size="sm" variant="secondary" onClick={onRetry} loading={busy === "retry"} leading={<Icon name="refresh" size={16} />}>
            Try again from here
          </Button>
        )}
      </div>
    </section>
  );
}

function segmentState(s: PublicStepRun): string {
  if (s.status === "running" || s.status === "rewriting") return "now";
  if (s.status === "waiting") return "wait";
  if (s.status === "failed" || s.status === "cancelled") return "stop";
  return s.status;
}

/* ---------- The pick ---------- */

function PickPanel({ run, step, editor, busy, onPick }: { run: PublicPipelineRun; step: PublicStepRun; editor: boolean; busy: boolean; onPick: (index: number) => void }) {
  const def = run.spec.steps.find((d) => d.id === step.id)!;
  const [chosen, setChosen] = useState<number>(step.suggested ?? 0);
  const label = def.choose?.kind === "ask" ? def.choose.label : "Pick one";
  return (
    <section className={[styles.panel, p.pick].join(" ")}>
      <div className={p.pickHead}>
        <div className={styles.stackTight}>
          <span className="eyebrow">{step.agent.name}</span>
          <h2>{step.candidates.length} to choose from</h2>
        </div>
        <span className={styles.fine}>Brand fit beside each one. The best fit is picked to start with.</span>
      </div>
      <div className={p.options} role="radiogroup" aria-label={label}>
        {step.candidates.map((c, n) => (
          <button key={n} type="button" role="radio" aria-checked={chosen === n} className={p.option} onClick={() => setChosen(n)} disabled={!editor}>
            <span className={p.optionNo}>{n + 1}</span>
            <OptionText c={c} />
            <span className={p.optionSide}>
              {c.brandFit !== null && <Badge score={c.brandFit} label="Brand fit" size="sm" />}
              {step.suggested === n && <span className={p.best}>Best fit</span>}
            </span>
          </button>
        ))}
      </div>
      <div className={p.pickBar}>
        <span>{editor ? `The next step, ${run.steps[run.steps.indexOf(step) + 1]?.label.toLowerCase() ?? "the package"}, starts from the one you pick.` : "Your role here is viewer, so someone with edit rights picks."}</span>
        <Button size="lg" onClick={() => onPick(chosen)} loading={busy} disabled={!editor} trailing={<Icon name="arrow-right" />}>
          Use number {chosen + 1}
        </Button>
      </div>
    </section>
  );
}

function OptionText({ c }: { c: Candidate }) {
  if (c.fields) {
    const lead = c.fields.idea ?? c.fields.term ?? Object.values(c.fields)[0];
    const rest = c.fields.format ?? c.fields.where ?? null;
    return (
      <span className={p.optionText}>
        {lead}
        {rest && <small>{rest}</small>}
      </span>
    );
  }
  return <span className={p.optionText}>{c.text}</span>;
}

/* ---------- The package and the approve step ---------- */

function PackagePanel({ run, editor, decidedBy, busy, onDecide, onClear, onCopyPart }: { run: PublicPipelineRun; editor: boolean; decidedBy: string | null; busy: string | null; onDecide: (d: "approved" | "rejected", note: string) => void; onClear: () => void; onCopyPart?: (step: string) => void }) {
  const [note, setNote] = useState("");
  const parts = run.package ?? [];
  return (
    <section className={[styles.panel, p.package].join(" ")}>
      <div className={p.packageHead}>
        <div className={styles.stackTight}>
          <span className="eyebrow">The package</span>
          <h2>Your post, in one place</h2>
          <span className={[styles.muted, styles.small].join(" ")}>
            Each part is copyable, with its brand fit. A draft until you approve it. <Link href={`/app/review/${run.id}`}>Comments and the team&apos;s say</Link>
          </span>
        </div>
        <CopyButton text={packageText(run)} label="Copy everything" onCopy={() => parts.forEach((part) => onCopyPart?.(part.step))} />
      </div>

      <div className={p.parts}>
        {parts.map((part) => (
          <Part key={part.step} part={part} onCopy={onCopyPart ? () => onCopyPart(part.step) : undefined} />
        ))}
      </div>

      {run.decision ? (
        <div className={p.decided}>
          <span className={styles.actions}>
            <PipelineStateTag state={run.decision.decision} />
            <span className={styles.muted}>
              {decidedBy ? `By ${decidedBy}` : ""}
              {run.decision.note ? ` · "${run.decision.note}"` : ""}
            </span>
          </span>
          {editor && (
            <Button size="sm" variant="ghost" onClick={onClear} loading={busy === "clear"}>
              Take it back
            </Button>
          )}
        </div>
      ) : editor ? (
        <div className={p.approve}>
          <div className={p.approveText}>
            <b>{run.spec.approve.label}</b>
            <Input label="A note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="For Friday, with the second caption" />
          </div>
          <span className={styles.actions}>
            <Button variant="ghost" onClick={() => onDecide("rejected", note)} loading={busy === "rejected"} disabled={busy !== null} leading={<Icon name="x-circle" size={18} />}>
              Reject
            </Button>
            <Button onClick={() => onDecide("approved", note)} loading={busy === "approved"} disabled={busy !== null} leading={<Icon name="check-circle" size={18} />}>
              Approve
            </Button>
          </span>
        </div>
      ) : (
        <p className={[styles.muted, styles.small].join(" ")}>Someone with edit rights approves or rejects this.</p>
      )}
    </section>
  );
}

/** One part of a package, copyable, with its brand fit and flags. `plain` drops the fit and the flags (the client view). */
export function Part({ part, plain = false, onCopy }: { part: PackageItem; plain?: boolean; onCopy?: () => void }) {
  const text = partText(part);
  return (
    <div className={p.part}>
      <div className={p.partHead}>
        <span className={p.partName}>
          <h3>{part.label}</h3>
          {!plain && part.brandFit !== null && <Badge score={part.brandFit} label="Brand fit" size="sm" />}
          {!plain && part.brandFit !== null && <span className={styles.fine}>{fitWords(part.brandFit)}</span>}
        </span>
        <span className={p.partTools}>
          <CopyButton text={text} onCopy={onCopy} />
        </span>
      </div>
      {!plain && part.flags.length > 0 && (
        <div className={p.partFlags}>
          {part.flags.map((f) => (
            <span key={f} className={p.partFlag}>
              <Icon name="warning" size={14} /> {f}
            </span>
          ))}
        </div>
      )}
      {part.item ? (
        part.item.fields ? (
          <dl className={styles.kv}>
            {Object.entries(part.item.fields).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={p.partText}>{part.item.text}</p>
        )
      ) : part.output ? (
        <ResultBody view={resultView(part.output)} />
      ) : null}
    </div>
  );
}

/* ---------- One step ---------- */

function StepCard({ run, step, n, nowMs }: { run: PublicPipelineRun; step: PublicStepRun; n: number; nowMs: number }) {
  void nowMs;
  const def = run.spec.steps[n];
  return (
    <article className={p.step} data-state={step.status}>
      <span className={p.stepNo}>
        <Icon name={agentIcon(step.agent.id)} size={22} />
        <span className={p.stepNum}>{n + 1}</span>
      </span>
      <div className={p.stepMain}>
        <div className={p.stepTitle}>
          <b>{step.label}</b>
          <span>
            {step.agent.name} v{step.agent.version}
          </span>
        </div>
        <StepBody run={run} step={step} def={def} />
      </div>
      <div className={p.stepSide}>
        <span className={[styles.state, step.status === "done" ? styles["state-ready"] : step.status === "flagged" || step.status === "waiting" ? styles["state-needs_review"] : step.status === "running" || step.status === "rewriting" ? styles["state-running"] : styles["state-cancelled"]].join(" ")}>{STEP_LABELS[step.status]}</span>
        {step.brandFit !== null && (step.status === "done" || step.status === "flagged") && !step.picked && <Badge score={step.brandFit} label="Brand fit" size="sm" />}
        {step.picked && step.candidates[step.picked.index]?.brandFit != null && <Badge score={step.candidates[step.picked.index].brandFit!} label="Brand fit" size="sm" />}
      </div>
    </article>
  );
}

function StepBody({ run, step, def }: { run: PublicPipelineRun; step: PublicStepRun; def: PublicPipelineRun["spec"]["steps"][number] }) {
  switch (step.status) {
    case "todo":
      return <span className={p.stepNote}>{run.status === "running" || run.status === "waiting" ? "Up next. It starts from what the step before it hands over." : "Did not run."}</span>;
    case "skipped":
      return <span className={p.stepNote}>{def.runIf ? "Skipped. You brought your own idea." : "Skipped."}</span>;
    case "running":
    case "rewriting":
      return (
        <span className={p.working}>
          <Mascot pose="move" size={48} label="Wovi, on the move" />
          {step.status === "rewriting" ? "Rewriting once. The first draft broke a brand rule." : "Writing in your voice"}
        </span>
      );
    case "waiting":
      return <span className={p.stepNote}>{step.candidates.length} to choose from. Waiting for your pick above.</span>;
    case "failed":
      return <span className={p.stepNote}>{step.error?.message ?? "It did not finish."}</span>;
    case "cancelled":
      return <span className={p.stepNote}>Stopped.</span>;
  }
  const picked = step.picked ? step.candidates[step.picked.index] : null;
  return (
    <>
      {picked ? (
        <p className={p.quote}>{picked.fields?.idea ?? picked.text}</p>
      ) : step.output ? (
        <OutputSummary output={step.output} />
      ) : null}
      <span className={p.stepMeta}>
        {step.picked && <span>{step.picked.by === "person" ? `You picked number ${step.picked.index + 1}` : step.picked.by === "brand_fit" ? `Best brand fit of ${step.candidates.length}` : "Took the first one"}</span>}
        {step.rewrite && <span title={step.rewrite.note}>Rewritten once to fit your brand</span>}
        {step.status === "flagged" && <span>A check flagged it</span>}
        {step.runId && <Link href={`/app/runs/${step.runId}`}>See the run</Link>}
      </span>
    </>
  );
}

function OutputSummary({ output }: { output: RunOutput }) {
  switch (output.kind) {
    case "script": {
      const total = output.sections.reduce((n, s) => n + s.seconds, 0);
      return (
        <p className={p.quote}>
          {output.sections.length} beats, {total} seconds. &ldquo;{output.sections[0]?.spoken}&rdquo;
        </p>
      );
    }
    case "list":
      return (
        <span className={p.tagRow}>
          {output.items.slice(0, 6).map((it, i) => (
            <span key={i} className={p.tagPill}>
              {typeof it === "string" ? it : (it.term ?? it.idea ?? Object.values(it)[0])}
            </span>
          ))}
        </span>
      );
    case "caption_set":
      return <p className={p.quote}>{output.captions[0]?.variants[0]}</p>;
    case "post_set":
      return <p className={p.quote}>{output.posts[0]?.parts[0]}</p>;
    case "text":
      return <p className={p.quote}>{output.text}</p>;
  }
}
