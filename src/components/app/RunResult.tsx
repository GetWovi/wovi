"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { giveFeedback, regenerateRun, rerun } from "@/app/app/make/actions";
import { NO_FEEDBACK, ResultFeedback } from "@/components/stats/ResultFeedback";
import { Mascot } from "@/components/brand/Mascot";
import { ago } from "@/components/builder/labels";
import { GateNote, QualityBreakdown, QualityScore } from "@/components/quality/QualityParts";
import q from "@/components/quality/Quality.module.css";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { PublicAgent } from "@/lib/accounts/guard";
import type { RunView } from "@/lib/app/api";
import { ideaToPostHref } from "@/lib/app/pipelines";
import { QUICK_EDITS } from "@/lib/app/quick-edits";
import { brandFitOf, copyAll, editFields, editItem, explainChecks, itemText, resultNoun, resultView, runTitle, type ResultItem, type ResultView } from "@/lib/app/results";
import type { RunOutput } from "@/lib/runs/output";
import type { RunFeedback } from "@/lib/stats/feedback";
import { splitNote } from "@/lib/app/quick-edits";
import { ChargeLine } from "@/components/credits/CreditParts";
import styles from "./App.module.css";
import { CopyButton } from "./CopyButton";
import { EditButton, EditedTag, ItemEditor } from "./ItemEdit";
import e from "./ItemEdit.module.css";
import { ReviewPanel } from "./ReviewControls";
import { AiLabelPanel } from "@/components/safety/AiLabelPanel";
import { ReportLink } from "@/components/safety/LegalLinks";

export type AgentForResult = Pick<PublicAgent, "id" | "name" | "job" | "inputs" | "output" | "guardrails"> & { platforms?: readonly string[] };

/**
 * A finished run: Wovi celebrating, the result in its typed shape with copy
 * buttons, each item editable in place, brand fit as one number, flagged
 * checks in plain words, quick edits that run again with a note, and the
 * human approve step.
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
  // The person's version, item by item, while they are on this result. Each Keep saves the whole of it as the run's edit.
  const [forRun, setForRun] = useState(run.id);
  const [kept, setKept] = useState<RunOutput | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [edited, setEdited] = useState<ReadonlySet<string>>(() => new Set());
  const [fb, setFb] = useState<RunFeedback>(view.feedback ?? NO_FEEDBACK);
  if (forRun !== run.id) {
    setForRun(run.id);
    setKept(null);
    setOpen(null);
    setEdited(new Set());
    setFb(view.feedback ?? NO_FEEDBACK);
  }
  const output = kept ?? run.output;
  const fit = brandFitOf(run);
  const flags = explainChecks(run.checks);
  const fails = flags.filter((f) => f.tone === "fail");
  const rv = output ? resultView(output) : null;
  const idle = run.status === "failed" || run.status === "cancelled";

  // Live stats: copying any part of a result is a use of it.
  const used = (how: "copy" | "copy_all" | "pick") => void giveFeedback(csrf, run.id, { action: "use", how });

  /** Keeps one changed item: the whole result with it goes in as the run's edit (the distance is measured on that), and the item is copied. */
  async function keepItem(block: number, item: number, values: Record<string, string>): Promise<boolean> {
    if (!output) return false;
    const next = editItem(output, block, item, values);
    const r = await giveFeedback(csrf, run.id, { action: "edit", text: copyAll(next) });
    if (!r.ok) {
      toast({ tone: "warning", title: r.error });
      return false;
    }
    setKept(next);
    setFb(r.value);
    setOpen(null);
    setEdited((all) => new Set(all).add(`${block}:${item}`));
    let copied = false;
    try {
      await navigator.clipboard.writeText(itemText(resultView(next), block, item));
      copied = true;
    } catch {
      /* The text stays on screen to select. */
    }
    toast({ tone: "success", title: "Kept your version", description: copied ? "Copied, ready to paste." : undefined });
    return true;
  }

  async function again() {
    const r = await regenerateRun(csrf, run.id);
    if (!r.ok) return toast({ tone: "warning", title: r.error });
    if (onRerun) onRerun(r.value.id);
    else router.push(`/app/make/${agent.id}?run=${r.value.id}`);
  }

  const slot = (block: number, item: number): ItemSlot => {
    const key = `${block}:${item}`;
    const out: ItemSlot = { edited: edited.has(key) };
    if (!editor || !output || !rv) return out;
    if (open === key) out.editor = <ItemEditor key={key} fields={editFields(output, block, item)} onKeep={(values) => keepItem(block, item, values)} onCancel={() => setOpen(null)} />;
    else out.tools = <EditButton what={itemText(rv, block, item)} onClick={() => setOpen(key)} />;
    // Chaining (product doc): an idea goes straight into "Idea to ready post".
    const idea = agent.id === "idea-generator" ? rv.blocks[block]?.items[item]?.text : undefined;
    if (idea) {
      out.foot = (
        <ButtonLink href={ideaToPostHref(idea, run)} size="sm" variant="ghost" leading={<Icon name="layers" size={16} />} onClick={() => used("pick")}>
          Make this into a post
        </ButtonLink>
      );
    }
    return out;
  };

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
            <h2>{run.withheld ? "Taken down after a report" : run.status === "cancelled" ? "Stopped" : run.error?.code === "blocked" ? "Withheld by the content rules" : "That one did not work"}</h2>
            <div className={styles.resultMeta}>
              <span>{agent.name}</span>
              <span>{ago(run.createdAt, now)}</span>
            </div>
            {run.withheld && <p className={styles.muted}>WOVI took this result down after a report ({run.withheld.reason}). The workspace&apos;s owners got the reasons by email and can reply to object.</p>}
            {run.error && <p className={styles.muted}>{run.error.message}</p>}
            {run.charge && <ChargeLine charge={run.charge} />}
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
          <h2>
            {resultNoun(agent, rv.count)}, {run.needsReview ? "for review" : "ready"}
          </h2>
          <div className={styles.resultMeta}>
            <span>{title}</span>
            {run.brandBrain?.name && <span>For {run.brandBrain.name}</span>}
            <span>{ago(run.createdAt, now)}</span>
          </div>
          {run.charge && <ChargeLine charge={run.charge} />}
          {view.note && (
            <span className={[styles.chip, styles.chipCobalt].join(" ")} title={view.note}>
              Quick edit: {QUICK_EDITS.find((q) => q.note === view.note)?.label ?? view.note}
            </span>
          )}
        </div>
        {(fit !== null || run.quality) && (
          <div className={q.scores}>
            {run.quality && <QualityScore q={run.quality} />}
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
        )}
      </div>

      {run.quality && <GateNote q={run.quality} />}

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
        <CopyButton text={copyAll(output)} label="Copy everything" onCopy={() => used("copy_all")} />
      </div>

      <ResultBody view={rv} onCopy={() => used("copy")} slot={slot} />

      {run.sources && run.sources.length > 0 && <Sources sources={run.sources} />}

      <ResultFeedback
        text={copyAll(output)}
        state={fb}
        onState={setFb}
        send={(req) => giveFeedback(csrf, run.id, req)}
        editor={editor}
        editing={open !== null}
        onEdit={() => setOpen((o) => (o ? null : "0:0"))}
        onAgain={again}
      />

      {run.quality && <QualityBreakdown q={run.quality} />}

      <AiLabelPanel csrf={csrf} runId={run.id} platforms={agent.platforms ?? []} initial={run.aiLabel ?? null} editable={editor} />

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
      <ReportLink id={run.id} />
    </section>
  );
}

/** The web pages a run's trend lookup found, with their dates and when the search ran. Results are only as good as these. */
export function Sources({ sources }: { sources: NonNullable<RunView["run"]["sources"]> }) {
  const searched = sources.map((x) => x.searchedAt).filter(Boolean).sort()[0];
  return (
    <div className={[styles.panelAlt, styles.panelTight, styles.panel].join(" ")}>
      <b>Sources</b>
      <span className={[styles.muted, styles.small].join(" ")}>
        {" "}
        From a live web search{searched ? ` on ${searched.slice(0, 10)}` : ""}. Check a trend on the platform before you build a post on it.
      </span>
      <ul className={styles.sourceList}>
        {sources.map((x) => (
          <li key={x.url}>
            <a href={x.url} target="_blank" rel="noreferrer noopener nofollow">
              {x.title}
            </a>
            <span className={[styles.muted, styles.small].join(" ")}>{x.published ? ` published ${x.published}` : " date not given"}</span>
          </li>
        ))}
      </ul>
    </div>
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

/** What a screen adds to one item: buttons beside its copy button, an editor in its place, a mark once it was changed, a row under a card. */
export type ItemSlot = { tools?: ReactNode; editor?: ReactNode; edited?: boolean; foot?: ReactNode };

/** The typed output in its shape: lines, cards, beats or platforms. `slot` adds to each item by its place (block, item). */
export function ResultBody({ view, onCopy, slot }: { view: ResultView; onCopy?: () => void; slot?: (block: number, item: number) => ItemSlot | null }) {
  const at = (b: number, i: number): ItemSlot => slot?.(b, i) ?? {};
  switch (view.layout) {
    case "lines":
      return (
        <ol className={styles.lines}>
          {view.blocks[0].items.map((it, i) => {
            const s = at(0, i);
            return (
              <li key={it.label} className={styles.line}>
                <span className={styles.lineNo}>{view.count > 1 ? it.label : <Icon name="pen" size={16} />}</span>
                {s.editor ? (
                  <div className={e.inLine}>{s.editor}</div>
                ) : (
                  <>
                    <span className={styles.lineText}>
                      {it.text}
                      {s.edited && (
                        <>
                          {" "}
                          <EditedTag />
                        </>
                      )}
                    </span>
                    <span className={e.tools}>
                      <CopyButton text={itemText(view, 0, i)} small onCopy={onCopy} />
                      {s.tools}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      );
    case "cards":
      return (
        <div className={styles.cards}>
          {view.blocks[0].items.map((it, i) => (
            <Card key={it.label} item={it} text={itemText(view, 0, i)} onCopy={onCopy} slot={at(0, i)} />
          ))}
        </div>
      );
    case "beats":
      return (
        <div className={styles.beats}>
          {view.blocks[0].items.map((it, i) => {
            const s = at(0, i);
            return (
              <div key={it.label} className={styles.beat}>
                <div className={styles.beatHead}>
                  <span className={styles.beatName}>{it.label}</span>
                  {it.meta && <span className={styles.beatTime}>{it.meta}</span>}
                  {s.edited && !s.editor && <EditedTag />}
                </div>
                {s.editor ? (
                  <div className={e.inBeat}>{s.editor}</div>
                ) : (
                  <>
                    <div className={styles.beatBody}>
                      <p className={styles.spoken}>{it.text}</p>
                      <p className={styles.onScreen}>
                        <b>On screen</b>
                        {it.fields.find((f) => f.label === "On screen")?.value}
                      </p>
                    </div>
                    <span className={[e.tools, e.toolsTop].join(" ")}>
                      <CopyButton text={itemText(view, 0, i)} small onCopy={onCopy} />
                      {s.tools}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      );
    case "platforms":
      return (
        <div className={styles.blocks}>
          {view.blocks.map((b, bi) => (
            <div key={b.title ?? ""} className={styles.block}>
              <div className={styles.blockTitle}>
                <h3>{b.title}</h3>
                <span className={styles.chip}>
                  {b.items.length} {b.items.length === 1 ? "version" : "versions"}
                </span>
              </div>
              <div className={styles.variants}>
                {b.items.map((it, i) => {
                  const s = at(bi, i);
                  return (
                    <div key={it.label} className={styles.variant}>
                      {s.editor ? (
                        s.editor
                      ) : it.fields.length ? (
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
                      {!s.editor && (
                        <div className={styles.variantFoot}>
                          <span className={e.tools}>
                            <span>
                              {it.label}
                              {it.fields.length ? "" : ` · ${it.text.length} characters`}
                            </span>
                            {s.edited && <EditedTag />}
                          </span>
                          <span className={e.tools}>
                            <CopyButton text={itemText(view, bi, i)} onCopy={onCopy} />
                            {s.tools}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
  }
}

function Card({ item, text, onCopy, slot }: { item: ResultItem; text: string; onCopy?: () => void; slot: ItemSlot }) {
  const rest = item.fields.filter((f) => f.value !== item.text);
  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <span className={e.label}>
          <span className={[styles.chip, e.chipFit].join(" ")} title={item.meta ?? undefined}>
            {item.meta ? item.meta : item.label}
          </span>
          {slot.edited && !slot.editor && <EditedTag />}
        </span>
        {!slot.editor && (
          <span className={e.tools}>
            <CopyButton text={text} small onCopy={onCopy} />
            {slot.tools}
          </span>
        )}
      </div>
      {slot.editor ?? (
        <>
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
        </>
      )}
      {slot.foot && !slot.editor && <div className={e.cardFoot}>{slot.foot}</div>}
    </div>
  );
}
