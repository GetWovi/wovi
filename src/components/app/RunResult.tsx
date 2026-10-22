"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { rerun } from "@/app/app/make/actions";
import { Mascot } from "@/components/brand/Mascot";
import { ago } from "@/components/builder/labels";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { PublicAgent } from "@/lib/accounts/guard";
import type { RunView } from "@/lib/app/api";
import { QUICK_EDITS } from "@/lib/app/quick-edits";
import { brandFitOf, copyAll, explainChecks, resultNoun, resultView, runTitle, type ResultItem, type ResultView } from "@/lib/app/results";
import { splitNote } from "@/lib/app/quick-edits";
import styles from "./App.module.css";
import { CopyButton } from "./CopyButton";
import { ReviewPanel } from "./ReviewControls";

export type AgentForResult = Pick<PublicAgent, "id" | "name" | "job" | "inputs" | "output" | "guardrails">;

/**
 * A finished run: Wovi celebrating, the result in its typed shape with copy
 * buttons, brand fit as one number, flagged checks in plain words, quick
 * edits that run again with a note, and the human approve step.
 */
export function RunResult({
  csrf,
  agent,
  view,
  editor,
  reviewer,
  now,
  onRerun,
  onAnother,
  showAsked = false,
}: {
  csrf: string;
  agent: AgentForResult;
  view: RunView;
  editor: boolean;
  /** Who decided, for the review panel. */
  reviewer: string | null;
  now: number;
  /** Called with the new run's id after a quick edit; left out, the screen goes to the agent's page with it. */
  onRerun?: (runId: string) => void;
  onAnother?: () => void;
  /** Shows what was asked for, above the result. */
  showAsked?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { run } = view;
  const output = run.output;
  const fit = brandFitOf(run);
  const flags = explainChecks(run.checks);
  const fails = flags.filter((f) => f.tone === "fail");
  const rv = output ? resultView(output) : null;
  const idle = run.status === "failed" || run.status === "cancelled";

  async function edit(id: string) {
    setBusy(id);
    const r = await rerun(csrf, run.id, id);
    setBusy(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    if (onRerun) onRerun(r.value.id);
    else router.push(`/app/make/${agent.id}?run=${r.value.id}`);
  }

  if (idle || !output || !rv) {
    return (
      <section className={[styles.panel, styles.result].join(" ")}>
        <div className={styles.resultHead}>
          <Mascot pose="wait" size={96} className="wovi" label="Wovi, waiting" />
          <div className={styles.resultTitle}>
            <h2>{run.status === "cancelled" ? "Stopped" : "That one did not work"}</h2>
            <div className={styles.resultMeta}>
              <span>{agent.name}</span>
              <span>{ago(run.createdAt, now)}</span>
            </div>
            {run.error && <p className={styles.muted}>{run.error.message}</p>}
          </div>
        </div>
        <div className={styles.actions}>
          {onAnother ? (
            <Button variant="secondary" onClick={onAnother} leading={<Icon name="refresh" size={18} />}>
              Try again
            </Button>
          ) : (
            <ButtonLink href={`/app/make/${agent.id}`} variant="secondary" leading={<Icon name="refresh" size={18} />}>
              Try again
            </ButtonLink>
          )}
        </div>
      </section>
    );
  }

  const title = runTitle(run, agent);
  return (
    <section className={[styles.panel, styles.result].join(" ")}>
      <div className={styles.resultHead}>
        <Mascot pose="done" size={96} className="wovi" label="Wovi, job done" />
        <div className={styles.resultTitle}>
          <span className="eyebrow">{agent.name}</span>
          <h2>{resultNoun(agent, rv.count)}, ready</h2>
          <div className={styles.resultMeta}>
            <span>{title}</span>
            {run.brandBrain?.name && <span>For {run.brandBrain.name}</span>}
            <span>{ago(run.createdAt, now)}</span>
          </div>
          {view.note && (
            <span className={[styles.chip, styles.chipCobalt].join(" ")} title={view.note}>
              Quick edit: {QUICK_EDITS.find((q) => q.note === view.note)?.label ?? view.note}
            </span>
          )}
        </div>
        {fit !== null && (
          <div className={styles.fit} title="How close this reads to your Brand Brain: its rules and its sample lines">
            <Badge score={fit} label="Brand fit" size="md" />
            <div className={styles.fitText}>
              <b>Brand fit</b>
              <span>{fit >= 85 ? "Sounds like you" : fit >= 70 ? "Close to your voice" : fails.length ? "Breaks a brand rule" : "A little off your voice"}</span>
            </div>
          </div>
        )}
      </div>

      {showAsked && <Asked run={run} agent={agent} />}

      {flags.length > 0 && (
        <div className={styles.flags}>
          {flags.map((f, i) => (
            <div key={i} className={[styles.flag, f.tone === "note" ? styles.flagNote : ""].join(" ")}>
              <Icon name={f.tone === "fail" ? "warning" : "info"} size={20} />
              <div className={styles.flagText}>
                <b>{f.title}</b>
                <span>{f.detail}</span>
                {f.findings.length > 0 && (
                  <span className={styles.findings}>
                    {f.findings.slice(0, 6).map((x) => (
                      <span key={x} className={styles.finding} title={x}>
                        {x}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.resultTools}>
        <span className={[styles.muted, styles.small].join(" ")}>{fails.length ? "A draft to fix before you use it." : "A draft, ready to paste. Nothing is posted by WOVI."}</span>
        <CopyButton text={copyAll(output)} label="Copy everything" />
      </div>

      <Body view={rv} />

      <div className={styles.resultFoot}>
        {editor && (
          <div className={styles.quick}>
            <span className={styles.quickLabel}>Run again</span>
            {QUICK_EDITS.map((q) => (
              <Button key={q.id} size="sm" variant="ghost" onClick={() => edit(q.id)} loading={busy === q.id} disabled={busy !== null} title={q.note}>
                {q.label}
              </Button>
            ))}
            {onAnother ? (
              <Button size="sm" variant="secondary" onClick={onAnother} leading={<Icon name="plus" size={16} />}>
                Make another
              </Button>
            ) : (
              <ButtonLink href={`/app/make/${agent.id}`} size="sm" variant="secondary" leading={<Icon name="plus" size={16} />}>
                Make another
              </ButtonLink>
            )}
          </div>
        )}
        <ReviewPanel csrf={csrf} runId={run.id} review={view.review} editor={editor} needsReview={run.needsReview} by={reviewer} />
      </div>
    </section>
  );
}

/** What was asked for: every input the run carried, in plain words. */
export function Asked({ run, agent }: { run: RunView["run"]; agent: AgentForResult }) {
  const rows = agent.inputs
    .filter((i) => i.type !== "profile" && run.inputs[i.key] !== undefined)
    .map((i) => {
      const v = run.inputs[i.key];
      let text: string;
      if (i.type === "choice") {
        const picked = Array.isArray(v) ? (v as string[]) : [String(v)];
        text = picked.map((p) => i.options.find((o) => o.value === p)?.label ?? p).join(", ");
      } else if (Array.isArray(v)) text = v.map((f) => (typeof f === "string" ? f : f.name)).join(", ");
      else text = splitNote(String(v)).text;
      return { label: i.label, text };
    });
  return (
    <dl className={[styles.panelAlt, styles.panelTight, styles.panel, styles.asked].join(" ")} style={{ margin: 0 }}>
      {rows.map((r) => (
        <div key={r.label} className={styles.askedRow}>
          <dt>{r.label}</dt>
          <dd>{r.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function Body({ view }: { view: ResultView }) {
  switch (view.layout) {
    case "lines":
      return (
        <ol className={styles.lines}>
          {view.blocks[0].items.map((it) => (
            <li key={it.label} className={styles.line}>
              <span className={styles.lineNo}>{view.count > 1 ? it.label : <Icon name="pen" size={16} />}</span>
              <span className={styles.lineText}>{it.text}</span>
              <CopyButton text={it.text} small />
            </li>
          ))}
        </ol>
      );
    case "cards":
      return (
        <div className={styles.cards}>
          {view.blocks[0].items.map((it) => (
            <Card key={it.label} item={it} />
          ))}
        </div>
      );
    case "beats":
      return (
        <div className={styles.beats}>
          {view.blocks[0].items.map((it) => (
            <div key={it.label} className={styles.beat}>
              <div className={styles.beatHead}>
                <span className={styles.beatName}>{it.label}</span>
                {it.meta && <span className={styles.beatTime}>{it.meta}</span>}
              </div>
              <div className={styles.beatBody}>
                <p className={styles.spoken}>{it.text}</p>
                <p className={styles.onScreen}>
                  <b>On screen</b>
                  {it.fields.find((f) => f.label === "On screen")?.value}
                </p>
              </div>
              <CopyButton text={it.fields.map((f) => `${f.label}: ${f.value}`).join("\n")} small />
            </div>
          ))}
        </div>
      );
    case "platforms":
      return (
        <div className={styles.blocks}>
          {view.blocks.map((b) => (
            <div key={b.title ?? ""} className={styles.block}>
              <div className={styles.blockTitle}>
                <h3>{b.title}</h3>
                <span className={styles.chip}>
                  {b.items.length} {b.items.length === 1 ? "version" : "versions"}
                </span>
              </div>
              <div className={styles.variants}>
                {b.items.map((it) => (
                  <div key={it.label} className={styles.variant}>
                    {it.fields.length ? (
                      <dl className={styles.kv}>
                        {it.fields.map((f) => (
                          <div key={f.label} style={{ display: "contents" }}>
                            <dt>{f.label}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className={styles.variantText}>{it.text}</p>
                    )}
                    <div className={styles.variantFoot}>
                      <span>
                        {it.label}
                        {it.fields.length ? "" : ` · ${it.text.length} characters`}
                      </span>
                      <CopyButton text={it.text} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
  }
}

function Card({ item }: { item: ResultItem }) {
  const rest = item.fields.filter((f) => f.value !== item.text);
  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <span className={styles.chip}>{item.meta ? item.meta : item.label}</span>
        <CopyButton text={item.fields.map((f) => `${f.label}: ${f.value}`).join("\n")} small />
      </div>
      <p className={styles.cardLead}>{item.text}</p>
      {rest.length > 0 && (
        <dl className={styles.kv}>
          {rest.map((f) => (
            <div key={f.label} style={{ display: "contents" }}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
