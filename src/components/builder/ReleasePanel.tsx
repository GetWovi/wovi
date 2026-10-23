"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { promoteCanary, rollBackCanary, runGoldSet, startCanary, updateCanary } from "@/app/builder/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { ReleaseView } from "@/lib/builder/releases";
import { SHARE_LIMITS, type CanaryThresholds, type StatsNumbers } from "@/lib/stats/types";
import { changeOf, meanOf, pctOf, secondsOf, usd } from "@/lib/stats/words";
import s from "@/components/stats/Stats.module.css";
import styles from "./Builder.module.css";
import { ago } from "./labels";

type Row = { label: string; get: (n: StatsNumbers) => [string, string?]; check?: "acceptance" | "edited" | "regenerate" | "quality" };

const of = (r: { count: number; n: number }) => `${r.count} of ${r.n}`;
const ROWS: Row[] = [
  { label: "Runs", get: (n) => [String(n.runs)] },
  { label: "Used as is", get: (n) => [pctOf(n.acceptance), of(n.acceptance)], check: "acceptance" },
  { label: "Edited", get: (n) => [pctOf(n.edited), of(n.edited)], check: "edited" },
  { label: "How much changed", get: (n) => [changeOf(n.editSize), `${n.editSize.n} edits`] },
  { label: "Run again", get: (n) => [pctOf(n.regenerate), of(n.regenerate)], check: "regenerate" },
  { label: "Thumbs up", get: (n) => [pctOf(n.rating), of(n.rating)] },
  { label: "Fits the format", get: (n) => [pctOf(n.compliance), of(n.compliance)] },
  { label: "Quality", get: (n) => [meanOf(n.quality)], check: "quality" },
  { label: "Typical time", get: (n) => [secondsOf(n.latency.p50Ms)] },
  { label: "Cost per run", get: (n) => [usd(n.cost.avgMicroUsd)] },
];

function Cell({ v }: { v: [string, string?] }) {
  return (
    <>
      <span className={s.num}>{v[0]}</span>
      {v[1] && <span className={s.of}>{v[1]}</span>}
    </>
  );
}

const STATUS_WORDS: Record<string, string> = { canary: "Running", promoted: "Published to everyone", rolled_back: "Rolled back", stopped: "Stopped automatically", replaced: "Replaced" };

/**
 * The release of a live agent: the canary beside the stable version with
 * both sides' live numbers, its share and stop rules, the regression gate on
 * the gold set, and publish to everyone or roll back in one click.
 */
export function ReleasePanel({ csrf, view, agentName, now }: { csrf: string; view: ReleaseView; agentName: string; now: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const a = view.active;
  const [busy, setBusy] = useState<string | null>(null);
  const [share, setShare] = useState(String(a?.share ?? SHARE_LIMITS.default));
  const [t, setT] = useState<CanaryThresholds | null>(a?.thresholds ?? null);
  const [confirm, setConfirm] = useState<"promote" | "rollback" | null>(null);
  const newer = view.versions.filter((v) => v.version !== view.stable).reverse();
  const [pick, setPick] = useState(newer[0]?.version ?? "");

  async function act<T>(key: string, fn: () => Promise<{ ok: true; value: T } | { ok: false; error: string; issues?: string[] }>, done: (v: T) => string) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    setConfirm(null);
    if (!r.ok) return toast({ tone: "warning", title: r.error, description: r.issues?.slice(0, 3).join(" ") });
    toast({ tone: "success", title: done(r.value) });
    router.refresh();
  }

  if (!view.live) {
    return (
      <Card title="Release" className={styles.section}>
        <div className={s.verdict}>
          <Icon name="info" size={18} />
          <span>{agentName} is not live, so it has no live runs to share. A save is current at once. Publish the agent, then new versions go out as a canary first.</span>
        </div>
      </Card>
    );
  }

  if (!a) {
    return (
      <Card title="Release" className={styles.section}>
        <div className={s.release}>
          <div className={s.verdict}>
            <Icon name="check-circle" size={18} />
            <span>
              Every live run gets <b>v{view.stable}</b>. A save from the editor or the bench goes out as a canary; you can also start one for a saved version here.
            </span>
          </div>
          {newer.length > 0 ? (
            <div className={s.controls}>
              <Select label="Version" value={pick} onChange={(e) => setPick(e.target.value)} options={newer.map((v) => ({ value: v.version, label: `v${v.version}${v.note ? `: ${v.note}` : ""}` }))} />
              <Input label="Share of live runs (%)" type="number" min={SHARE_LIMITS.min} max={SHARE_LIMITS.max} value={share} onChange={(e) => setShare(e.target.value)} hint="0 keeps it to the bench." />
              <div className={s.buttons}>
                <Button onClick={() => act("start", () => startCanary(csrf, view.agentId, pick, Number(share)), () => `Canary of v${pick} started`)} loading={busy === "start"} disabled={busy !== null || !pick} leading={<Icon name="play" size={16} />}>
                  Start the canary
                </Button>
              </div>
            </div>
          ) : (
            <p className={styles.hint}>No other version to try yet.</p>
          )}
          <History view={view} now={now} />
        </div>
      </Card>
    );
  }

  const arms = view.arms!;
  const gate = view.gate!;
  const worse = new Set(arms.comparison.checks.filter((c) => c.worse).map((c) => c.id));
  const enough = arms.comparison.counted;
  return (
    <Card title="Release" className={styles.section}>
      <div className={s.release}>
        <div className={s.releaseHead}>
          <h2>
            v{a.canary} <span className={[s.pill, s.pillCanary].join(" ")}>Canary {a.share}%</span> beside v{a.stable} <span className={[s.pill, s.pillStable].join(" ")}>Stable</span>
          </h2>
          <span className={styles.hint}>
            Started {ago(a.startedAt, now)}. Each workspace stays on one side, picked by a stable hash; the bench and pinned pipelines are never moved.
          </span>
        </div>

        <div className={s.split}>
          <div className={s.side}>
            <div className={s.tableWrap}>
              <table className={[s.table, s.compact].join(" ")}>
                <thead>
                  <tr>
                    <th>Live runs</th>
                    <th>Stable v{a.stable}</th>
                    <th>Canary v{a.canary}</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td>
                        <Cell v={r.get(arms.stable)} />
                      </td>
                      <td className={r.check && worse.has(r.check) ? s.worse : ""}>
                        <Cell v={r.get(arms.canary)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={[s.verdict, arms.comparison.worse ? s.verdictBad : enough ? s.verdictOk : ""].join(" ")}>
              <Icon name={arms.comparison.worse ? "warning" : enough ? "check-circle" : "clock"} size={18} />
              <span>
                {arms.comparison.worse
                  ? `Clearly worse, so it stops on its own: ${arms.comparison.reasons.join(" ")}`
                  : enough
                    ? "Not worse than the stable version on any stop rule so far."
                    : `Not enough runs to compare yet: each rule counts once both sides have ${a.thresholds.minRuns}. Until then nothing is stopped.`}
              </span>
            </div>
          </div>

          <div className={s.side}>
            <div className={s.gold}>
              <b>Regression gate</b>
              <div className={s.goldScores}>
                <div className={s.tile}>
                  <span className={s.tileLabel}>Gold set v{gate.stable.version}</span>
                  <span className={s.tileValue}>{gate.stable.score ?? "·"}</span>
                  <span className={s.tileHint}>{gate.stable.samples} of {gate.goldSamples} gold samples</span>
                </div>
                <div className={s.tile}>
                  <span className={s.tileLabel}>Gold set v{gate.candidate.version}</span>
                  <span className={s.tileValue}>{gate.candidate.score ?? "·"}</span>
                  <span className={s.tileHint}>{gate.candidate.samples} of {gate.goldSamples} gold samples</span>
                </div>
              </div>
              <div className={[s.verdict, gate.ok ? s.verdictOk : s.verdictBad].join(" ")}>
                <Icon name={gate.ok ? "shield" : "warning"} size={18} />
                <span>
                  {gate.ok ? "Passes: it can go to everyone." : gate.status === "needs_gold" ? "Not checked yet." : "Refused: it cannot go to everyone."}
                  <ul>
                    {gate.reasons.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </span>
              </div>
              {gate.goldSamples > 0 && (
                <Button size="sm" variant="secondary" onClick={() => act("gold", () => runGoldSet(csrf, view.agentId, gate.status !== "needs_gold"), (v) => (v.benches.length ? `Running the gold set on ${v.benches.map((b) => `v${b.version}`).join(" and ")}` : "Both versions have their gold scores"))} loading={busy === "gold"} disabled={busy !== null} leading={<Icon name="play" size={16} />}>
                  {gate.status === "needs_gold" ? "Run the gold set" : "Run the gold set again"}
                </Button>
              )}
            </div>

            <div className={s.buttons}>
              <Button onClick={() => setConfirm("promote")} disabled={busy !== null || !gate.ok} leading={<Icon name="arrow-right" size={16} />}>
                Publish to everyone
              </Button>
              <Button variant="ghost" onClick={() => setConfirm("rollback")} disabled={busy !== null} leading={<Icon name="refresh" size={16} />}>
                Roll back
              </Button>
            </div>

            <div className={s.controls}>
              <Input label="Share of live runs (%)" type="number" min={SHARE_LIMITS.min} max={SHARE_LIMITS.max} value={share} onChange={(e) => setShare(e.target.value)} hint={`0 to ${SHARE_LIMITS.max}. 0 keeps it to the bench.`} />
              <div className={s.buttons} style={{ alignSelf: "center" }}>
                <Button size="sm" variant="secondary" onClick={() => act("share", () => updateCanary(csrf, view.agentId, { share: Number(share) }), (v) => `Canary on ${v.share}% of live runs`)} loading={busy === "share"} disabled={busy !== null || Number(share) === a.share}>
                  Change the share
                </Button>
              </div>
            </div>

            {t && (
              <details>
                <summary className={styles.hint}>Stop rules: at least {a.thresholds.minRuns} runs a side</summary>
                <div className={s.controls} style={{ marginTop: 12 }}>
                  <Input label="Runs a side" type="number" min={5} max={500} value={String(t.minRuns)} onChange={(e) => setT({ ...t, minRuns: Number(e.target.value) })} />
                  <Input label="Used as is drops (%)" type="number" min={1} max={90} value={String(Math.round(t.acceptanceDrop * 100))} onChange={(e) => setT({ ...t, acceptanceDrop: Number(e.target.value) / 100 })} />
                  <Input label="Edited rises (%)" type="number" min={1} max={90} value={String(Math.round(t.editRise * 100))} onChange={(e) => setT({ ...t, editRise: Number(e.target.value) / 100 })} />
                  <Input label="Run again rises (%)" type="number" min={1} max={90} value={String(Math.round(t.regenerateRise * 100))} onChange={(e) => setT({ ...t, regenerateRise: Number(e.target.value) / 100 })} />
                  <Input label="Quality drops (points)" type="number" min={1} max={50} value={String(t.qualityDrop)} onChange={(e) => setT({ ...t, qualityDrop: Number(e.target.value) })} />
                  <div className={s.buttons} style={{ alignSelf: "end" }}>
                    <Button size="sm" variant="secondary" onClick={() => act("rules", () => updateCanary(csrf, view.agentId, { thresholds: t }), () => "Stop rules saved")} loading={busy === "rules"} disabled={busy !== null}>
                      Save the rules
                    </Button>
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>

        <History view={view} now={now} />
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "promote" ? `Publish v${a.canary} to everyone?` : `Roll back v${a.canary}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy !== null}>
              Cancel
            </Button>
            {confirm === "promote" ? (
              <Button onClick={() => act("promote", () => promoteCanary(csrf, view.agentId), (v) => `v${v.version} serves everyone`)} loading={busy === "promote"}>
                Publish to everyone
              </Button>
            ) : (
              <Button onClick={() => act("rollback", () => rollBackCanary(csrf, view.agentId), (v) => `Rolled back. v${v.version} serves everyone`)} loading={busy === "rollback"}>
                Roll back
              </Button>
            )}
          </>
        }
      >
        <p>{confirm === "promote" ? `Every live run gets v${a.canary} from now on, in place of v${a.stable}. The gate is checked once more first, and the decision goes in the audit log.` : `Every live run gets v${a.stable} again. v${a.canary} stays saved, and the decision goes in the audit log.`}</p>
      </Modal>
    </Card>
  );
}

function History({ view, now }: { view: ReleaseView; now: number }) {
  const past = view.history.filter((r) => r.status !== "canary").slice(0, 5);
  if (!past.length) return null;
  return (
    <div className={s.gold}>
      <b>Earlier releases</b>
      <ul className={s.history}>
        {past.map((r) => (
          <li key={r.id}>
            <span>
              v{r.canary} beside v{r.stable}, {r.share}%
            </span>
            <span className={styles.hint}>
              {STATUS_WORDS[r.status]} {r.endedAt ? ago(r.endedAt, now) : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
