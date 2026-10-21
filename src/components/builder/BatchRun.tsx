"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cancelBatch, getBatch, planBatch, runBatch } from "@/app/builder/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { BatchPlan, BatchView } from "@/lib/builder/bench";
import type { BuilderAgentRow } from "@/lib/builder/builder";
import styles from "./Builder.module.css";
import { StatusPill } from "./BuilderShell";
import { ago, duration, money, percent } from "./labels";

const POLL_MS = 1000;

/** Run every sample of a set of agents at once and read the summary. */
export function BatchRun({ csrf, agents, initialPlan, batches, now }: { csrf: string; agents: BuilderAgentRow[]; initialPlan: BatchPlan; batches: BatchView[]; now: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [picked, setPicked] = useState<string[]>(initialPlan.agents.map((a) => a.agentId));
  const [plan, setPlan] = useState<BatchPlan>(initialPlan);
  const [batch, setBatch] = useState<BatchView | null>(batches[0] ?? null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const running = batch?.status === "running";
  const batchId = batch?.id;
  const pickedKey = picked.join(",");

  useEffect(() => {
    if (!running || !batchId) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const r = await getBatch(csrf, batchId);
      if (stopped || !r.ok) return;
      setBatch(r.value);
      if (r.value.status !== "running") router.refresh();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [running, batchId, csrf, router]);

  useEffect(() => {
    if (pickedKey === initialPlan.agents.map((a) => a.agentId).join(",")) return;
    let stale = false;
    void planBatch(csrf, pickedKey ? pickedKey.split(",") : []).then((r) => {
      if (!stale && r.ok) setPlan(r.value);
    });
    return () => {
      stale = true;
    };
  }, [pickedKey, csrf, initialPlan]);

  async function start(confirmed: boolean) {
    setStarting(true);
    try {
      const r = await runBatch(csrf, picked, confirmed);
      if (!r.ok) {
        if (r.code === "confirmation_required") return setConfirming(true);
        return toast({ tone: "warning", title: r.error });
      }
      setConfirming(false);
      setBatch(r.value);
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (!batch) return;
    setStopping(true);
    try {
      const r = await cancelBatch(csrf, batch.id);
      if (!r.ok) return toast({ tone: "warning", title: r.error });
      setBatch(r.value);
      router.refresh();
    } finally {
      setStopping(false);
    }
  }

  const byId = new Map(agents.map((a) => [a.id, a]));
  const planFor = new Map(plan.agents.map((a) => [a.agentId, a]));

  return (
    <>
      <Card className={styles.section} title="Agents" actions={<span className="eyebrow">Builders only</span>}>
        <p className={styles.sectionNote}>Every sample of every agent you pick, in one go. Live agents are picked by default. The engine runs them a few at a time, inside each agent&apos;s own spend cap.</p>
        <div className={styles.agentPick}>
          {agents.map((a) => {
            const p = planFor.get(a.id);
            return (
              <Chip key={a.id} selected={picked.includes(a.id)} onClick={() => setPicked((x) => (x.includes(a.id) ? x.filter((y) => y !== a.id) : [...x, a.id]))} title={`${a.status}, v${a.version}`}>
                {a.name}
                {p ? ` · ${p.runs}` : ""}
              </Chip>
            );
          })}
          <Button size="sm" variant="ghost" onClick={() => setPicked(agents.filter((a) => a.status === "live").map((a) => a.id))}>
            Live
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(agents.map((a) => a.id))}>
            All
          </Button>
        </div>
        <div className={styles.runBar}>
          <span className={styles.estimate}>
            {plan.runs === 0 ? "Nothing to run: none of the picked agents has a sample." : `${plan.runs} run${plan.runs === 1 ? "" : "s"} across ${plan.agents.filter((a) => a.runs > 0).length} agent${plan.agents.filter((a) => a.runs > 0).length === 1 ? "" : "s"}, about ${money(plan.estimateMicroUsd)}, at most ${money(plan.capMicroUsd)}.${plan.needsConfirmation ? ` Above ${money(plan.thresholdMicroUsd)}, so it asks first.` : ""}`}
          </span>
          <Button onClick={() => (plan.needsConfirmation ? setConfirming(true) : start(false))} loading={starting} disabled={running || plan.runs === 0} leading={<Icon name="play" size={18} />}>
            Run batch
          </Button>
        </div>
      </Card>

      {batch ? (
        <>
          <div className={[styles.benchStatus, running ? styles.benchStatusRunning : ""].filter(Boolean).join(" ")} aria-live="polite">
            <Mascot pose={running ? "move" : batch.status === "cancelled" ? "wait" : "done"} size={64} />
            <div className={styles.benchStatusText}>
              <span className={styles.benchStatusTitle}>{running ? `Running ${batch.done} of ${batch.runs}` : batch.status === "cancelled" ? `Cancelled after ${batch.done} of ${batch.runs}` : `${batch.runs} of ${batch.runs} done`}</span>
              <span className={styles.hint}>
                {batch.agents.length} agent{batch.agents.length === 1 ? "" : "s"} · started {ago(batch.createdAt, now)} · {money(batch.costMicroUsd)} so far of about {money(batch.estimateMicroUsd)} estimated
                {batch.finishedAt ? ` · ${duration(Date.parse(batch.finishedAt) - Date.parse(batch.createdAt))} in all` : ""}
              </span>
              <div className={styles.progress} aria-hidden="true">
                <div className={styles.progressBar} style={{ width: `${batch.runs ? Math.round((batch.done / batch.runs) * 100) : 0}%` }} />
              </div>
            </div>
            {running && (
              <Button variant="ghost" onClick={stop} loading={stopping}>
                Cancel batch
              </Button>
            )}
          </div>
          <Card padding="sm" className={styles.section}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Version</th>
                    <th className={styles.num}>Samples</th>
                    <th className={styles.num}>Done</th>
                    <th className={styles.num}>Pass rate</th>
                    <th className={styles.num}>Score</th>
                    <th className={styles.num}>Guardrail fails</th>
                    <th className={styles.num}>Refused</th>
                    <th className={styles.num}>Cost</th>
                    <th className={styles.num}>Avg time</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {batch.agents.map((a) => {
                    const row = byId.get(a.agentId);
                    const finished = a.done - a.refused;
                    return (
                      <tr key={a.agentId}>
                        <td>
                          <span className={styles.tableName}>
                            {a.name}
                            {row && <StatusPill status={row.status} />}
                          </span>
                        </td>
                        <td className={styles.mono}>v{a.version}</td>
                        <td className={styles.num}>{a.total}</td>
                        <td className={styles.num}>
                          {a.done === a.total ? a.done : `${a.done} of ${a.total}`}
                          {a.done < a.total && running && <Mascot pose="move" size={20} label="" style={{ display: "inline-block", marginInlineStart: 6, verticalAlign: "middle" }} />}
                        </td>
                        <td className={styles.num}>{finished ? percent(a.passed / finished) : ""}</td>
                        <td className={styles.num}>{a.avgAuto !== null ? <Badge score={a.avgAuto} label="Score" size="sm" /> : ""}</td>
                        <td className={[styles.num, a.failedChecks ? styles.numWarn : ""].join(" ")}>{a.failedChecks}</td>
                        <td className={[styles.num, a.refused ? styles.numWarn : ""].join(" ")}>{a.refused}</td>
                        <td className={styles.num}>{money(a.costMicroUsd)}</td>
                        <td className={styles.num}>{duration(a.avgMs)}</td>
                        <td>
                          <Link href={`/builder/agents/${a.agentId}/bench`}>Open bench</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <EmptyState title="No batch yet" description="Pick the agents and run the batch. The summary table shows every agent's pass rate, score, guardrail fails, cost and time at once." />
      )}

      {batches.length > 1 && (
        <Card className={styles.section} title="Earlier batches">
          <div className={styles.stackTight}>
            {batches.slice(batch && batches[0]?.id === batch.id ? 1 : 0).map((b) => (
              <button key={b.id} type="button" className={styles.pastBatch} onClick={() => setBatch(b)}>
                <span>
                  {b.agents.length} agent{b.agents.length === 1 ? "" : "s"}, {b.runs} run{b.runs === 1 ? "" : "s"}
                </span>
                <span className={styles.hint}>
                  {b.status} · {ago(b.createdAt, now)} · {money(b.costMicroUsd)}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Start this batch?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={starting}>
              Not now
            </Button>
            <Button onClick={() => start(true)} loading={starting}>
              Run it
            </Button>
          </>
        }
      >
        <div className={styles.stackTight}>
          <p>
            {plan.runs} run{plan.runs === 1 ? "" : "s"} across {plan.agents.filter((a) => a.runs > 0).length} agents, estimated at about {money(plan.estimateMicroUsd)} and at most {money(plan.capMicroUsd)} if every run reaches its cap.
          </p>
          <p className={styles.hint}>That is above {money(plan.thresholdMicroUsd)}, so the batch waits for your yes.</p>
        </div>
      </Modal>
    </>
  );
}
