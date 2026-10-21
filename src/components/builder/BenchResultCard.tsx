"use client";

import { useState } from "react";
import { rateRun } from "@/app/builder/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { GUARDRAILS } from "@/lib/agents/catalog";
import type { BenchResult } from "@/lib/builder/bench";
import type { Scorecard } from "@/lib/builder/scoring";
import { BENCH_LIMITS, RATINGS, type RatingValue } from "@/lib/builder/types";
import styles from "./Builder.module.css";
import { RATING_LABELS, ROUTE_LABELS, duration, money } from "./labels";
import { OutputView } from "./OutputView";

const STATUS: Record<BenchResult["status"], { label: string; tone: "neutral" | "blaze" | "cobalt" }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "cobalt" },
  succeeded: { label: "Passed", tone: "blaze" },
  failed: { label: "Failed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  refused: { label: "Refused", tone: "neutral" },
};

const guardrailLabel = (id: string) => GUARDRAILS.find((g) => g.id === id)?.label ?? id;

/** One bench result: the produced output beside the ideal one, the checks, the facts, and the builder's rating. */
export function BenchResultCard({ csrf, agentId, result, onRated }: { csrf: string; agentId: string; result: BenchResult; onRated: (card: Scorecard) => void }) {
  const { toast } = useToast();
  const [rating, setRating] = useState<RatingValue | null>(result.rating?.rating ?? null);
  const [note, setNote] = useState(result.rating?.note ?? "");
  const [saving, setSaving] = useState(false);
  const r = result;
  const pending = r.status === "queued" || r.status === "running";
  const finished = r.status === "succeeded" || r.status === "failed";
  const status = r.status === "succeeded" && r.needsReview ? { label: "Needs review", tone: "neutral" as const } : STATUS[r.status];
  const fails = r.checks.filter((c) => c.status === "fail");

  async function rate(next: RatingValue, nextNote = note) {
    if (!r.runId) return;
    setSaving(true);
    try {
      const res = await rateRun(csrf, agentId, r.runId, { rating: next, note: nextNote });
      if (!res.ok) return toast({ tone: "warning", title: res.error });
      setRating(next);
      onRated(res.value.scorecard);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="sm" className={styles.result} data-status={r.status}>
      <div className={styles.resultHead}>
        {r.label && <Tag tone={r.label === "gold" ? "blaze" : "neutral"}>{r.label}</Tag>}
        <span className={styles.resultTitle}>{r.title}</span>
        <Tag tone={status.tone}>{status.label}</Tag>
        {r.status === "running" && <Mascot pose="move" size={28} label="" />}
        {finished && (
          <div className={styles.resultMeta}>
            {r.model && (
              <span title={`${ROUTE_LABELS[r.model.route] ?? r.model.route}`}>
                <span className={styles.mono}>{r.model.model}</span>
              </span>
            )}
            <span>{duration(r.ms)}</span>
            <span>{r.tokensIn + r.tokensOut} tokens</span>
            <span>{money(r.costMicroUsd)}</span>
            {r.autoScore !== null && <Badge score={r.autoScore} label="Auto score" size="sm" />}
          </div>
        )}
      </div>

      {pending ? (
        <div className={styles.resultBody}>
          <div className={[styles.block, styles.resultPending].join(" ")}>
            <Mascot pose={r.status === "running" ? "move" : "wait"} size={56} />
            <span>{r.status === "running" ? "The model is writing." : "Waiting for a free slot."}</span>
          </div>
          {r.idealOutput !== null && (
            <div className={styles.block}>
              <span className={styles.blockTitle}>{r.label === "bad" ? "What to avoid" : "Ideal output"}</span>
              <pre className={styles.pre}>{r.idealOutput}</pre>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.resultBody}>
          <div className={styles.block}>
            <span className={styles.blockTitle}>Produced</span>
            {r.output ? (
              <OutputView output={r.output} />
            ) : (
              <p className={styles.fieldError}>
                <Icon name="warning" size={16} /> {r.error ?? "No output."}
              </p>
            )}
          </div>
          {r.idealOutput !== null ? (
            <div className={styles.block}>
              <span className={styles.blockTitle}>{r.label === "bad" ? "What to avoid" : "Ideal output"}</span>
              <pre className={styles.pre}>{r.idealOutput}</pre>
            </div>
          ) : (
            <div className={styles.block}>
              <span className={styles.blockTitle}>Inputs</span>
              <dl className={styles.kv}>
                {Object.entries(r.inputs).map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x.name)).join(", ") : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {finished && (
        <>
          <div className={styles.checks}>
            <span className={[styles.check, r.parsed === "first" ? styles.checkPass : styles.checkFail].join(" ")} title={r.parsed === "first" ? "The first answer fit the output shape." : "The first answer did not fit; one repair fixed it."}>
              <Icon name={r.parsed === "first" ? "check" : "warning"} size={14} /> {r.parsed === "first" ? "Parsed first time" : "Needed a repair"}
            </span>
            {r.checks.map((c) => (
              <span key={c.check} className={[styles.check, c.status === "pass" ? styles.checkPass : c.status === "fail" ? styles.checkFail : styles.checkNote].join(" ")} title={c.message}>
                <Icon name={c.status === "pass" ? "check" : c.status === "fail" ? "close" : "info"} size={14} /> {guardrailLabel(c.guardrail)}
              </span>
            ))}
          </div>
          {fails.length > 0 && (
            <ul className={styles.checkList}>
              {fails.map((c) => (
                <li key={c.check}>
                  {guardrailLabel(c.guardrail)}: {c.message} {c.findings?.length ? `(${c.findings.slice(0, 3).join("; ")})` : ""}
                </li>
              ))}
            </ul>
          )}
          {r.status === "failed" && r.error && (
            <p className={styles.fieldError}>
              <Icon name="warning" size={16} /> {r.error}
            </p>
          )}
          <div className={styles.rateRow}>
            <span className={styles.uploadLabel}>Your rating</span>
            <div className={styles.rateGroup} role="group" aria-label="Rate this result">
              {RATINGS.map((v) => (
                <button key={v} type="button" className={[styles.rateBtn, rating === v ? styles[`rate-${v}`] : ""].filter(Boolean).join(" ")} onClick={() => rate(v)} disabled={saving} aria-pressed={rating === v}>
                  {RATING_LABELS[v]}
                </button>
              ))}
            </div>
            <div className={styles.rateNote}>
              <Input aria-label="Rating note" placeholder="Why, in a few words" value={note} maxLength={BENCH_LIMITS.ratingNote} onChange={(e) => setNote(e.target.value)} onBlur={() => rating && note !== (result.rating?.note ?? "") && rate(rating, note)} />
            </div>
          </div>
        </>
      )}
      {r.status === "refused" && (
        <p className={styles.fieldError}>
          <Icon name="warning" size={16} /> {r.error}
        </p>
      )}
    </Card>
  );
}
