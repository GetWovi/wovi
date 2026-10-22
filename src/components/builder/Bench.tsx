"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cancelBench, estimateBench, getBench, runBench } from "@/app/builder/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import type { AgentSpec } from "@/lib/agents/spec";
import type { BenchEstimate, BenchView } from "@/lib/builder/bench";
import { emptyScorecard, type Scorecard } from "@/lib/builder/scoring";
import type { Sample } from "@/lib/builder/types";
import type { VersionEntry } from "@/lib/builder/versions";
import { BenchResultCard } from "./BenchResultCard";
import styles from "./Builder.module.css";
import { ago, duration, money } from "./labels";
import { RunInputField, asRunInputs, type InputValues } from "./RunInputs";
import { ScoreRow } from "./ScoreRow";
import { TuningPanel } from "./TuningPanel";

const POLL_MS = 1000;

/** The test bench page: pick a version and samples, run them through the engine, see each result beside its ideal, rate it, and tune beside it. */
export type BenchBrain = { id: string; name: string; isDefault: boolean };

export function Bench({ csrf, spec, history, samples, latest, now, brains = [] }: { csrf: string; spec: AgentSpec; history: VersionEntry[]; samples: Sample[]; latest: BenchView | null; now: number; brains?: BenchBrain[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [version, setVersion] = useState(spec.version);
  const [brainId, setBrainId] = useState(latest?.brandBrain && brains.some((b) => b.id === latest.brandBrain!.id && !b.isDefault) ? latest.brandBrain.id : "");
  const [selected, setSelected] = useState<string[]>(samples.map((s) => s.id));
  const [mode, setMode] = useState<"samples" | "adhoc">(samples.length ? "samples" : "adhoc");
  const [adhoc, setAdhoc] = useState<InputValues>({});
  const [bench, setBench] = useState<BenchView | null>(latest);
  const [cards, setCards] = useState<Record<string, Scorecard>>(() => Object.fromEntries(history.map((v) => [v.version, v.scorecard])));
  const [estimate, setEstimate] = useState<BenchEstimate | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const running = bench?.status === "running";
  const benchId = bench?.id;

  // Poll while a bench runs. The server page refreshes once it ends, so the head's score follows.
  useEffect(() => {
    if (!running || !benchId) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const r = await getBench(csrf, benchId);
      if (stopped || !r.ok) return;
      setBench(r.value);
      setCards((c) => ({ ...c, [r.value.version]: r.value.scorecard }));
      if (r.value.status !== "running") router.refresh();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [running, benchId, csrf, router]);

  // The estimate for what is picked, for builders' eyes.
  const selectedKey = selected.join(",");
  useEffect(() => {
    if (mode !== "samples" || !selected.length) return;
    let stale = false;
    void estimateBench(csrf, spec.id, { version, sampleIds: selectedKey.split(",") }).then((r) => {
      if (!stale && r.ok) setEstimate(r.value);
    });
    return () => {
      stale = true;
    };
  }, [csrf, spec.id, version, selectedKey, selected.length, mode]);

  const card = cards[version] ?? emptyScorecard(version);

  async function start() {
    setStarting(true);
    try {
      const pick = brainId ? { brandBrainId: brainId } : {};
      const req = mode === "adhoc" ? { version, adhoc: { inputs: asRunInputs(spec, adhoc), title: "Ad-hoc run" }, ...pick } : { version, sampleIds: selected, ...pick };
      const r = await runBench(csrf, spec.id, req);
      if (!r.ok) return toast({ tone: "warning", title: r.error });
      setBench(r.value);
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (!bench) return;
    setStopping(true);
    try {
      const r = await cancelBench(csrf, bench.id);
      if (!r.ok) return toast({ tone: "warning", title: r.error });
      setBench(r.value);
      setCards((c) => ({ ...c, [r.value.version]: r.value.scorecard }));
      router.refresh();
    } finally {
      setStopping(false);
    }
  }

  function onTuned(newVersion: string, started: BenchView | null) {
    setVersion(newVersion);
    if (started) setBench(started);
    router.refresh();
  }

  const unfit = new Set(estimate?.unfit.map((u) => u.sampleId) ?? []);
  const runnable = mode === "adhoc" ? true : selected.length > 0 && (estimate ? estimate.runs > 0 : true);

  return (
    <div className={styles.benchGrid}>
      <div className={styles.stack}>
        <Card className={styles.section} title="Run" actions={<span className="eyebrow">Builders only</span>}>
          <div className={styles.controlRow}>
            <Select label="Version" value={version} onChange={(e) => setVersion(e.target.value)} options={[...history].reverse().map((v) => ({ value: v.version, label: `v${v.version}${v.current ? " (current)" : ""}${v.note ? `: ${v.note}` : ""}` }))} />
            <Select
              label="Brand Brain"
              value={brainId}
              onChange={(e) => setBrainId(e.target.value)}
              disabled={!brains.length}
              options={[{ value: "", label: brains.length ? `Default (${brains.find((b) => b.isDefault)?.name ?? brains[0].name})` : "None in ws_wovi yet" }, ...brains.filter((b) => !b.isDefault).map((b) => ({ value: b.id, label: b.name }))]}
            />
            <Tabs variant="pill" value={mode} onChange={(id) => setMode(id as "samples" | "adhoc")} items={[{ id: "samples", label: "Samples", count: samples.length }, { id: "adhoc", label: "Ad-hoc" }]} />
          </div>

          {mode === "samples" ? (
            <>
              <div className={styles.sampleChips}>
                {samples.length === 0 && <span className={styles.hint}>No samples yet. Add some on the Samples tab of the editor, or run an ad-hoc form.</span>}
                {samples.map((s) => (
                  <Chip key={s.id} selected={selected.includes(s.id)} onClick={() => setSelected((x) => (x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id]))} title={unfit.has(s.id) ? "Its inputs do not fit this version" : s.label === "bad" ? "A bad sample: what to avoid" : "A golden sample"} leading={unfit.has(s.id) ? <Icon name="warning" size={14} /> : undefined}>
                    {s.title}
                  </Chip>
                ))}
                {samples.length > 1 && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(samples.map((s) => s.id))}>
                      All
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                      None
                    </Button>
                  </>
                )}
              </div>
              <div className={styles.runBar}>
                <span className={styles.estimate}>
                  {selected.length === 0
                    ? "Pick at least one sample."
                    : estimate && estimate.version === version
                      ? `${estimate.runs} run${estimate.runs === 1 ? "" : "s"} on v${version}, about ${money(estimate.estimateMicroUsd)}, at most ${money(estimate.capMicroUsd)}.${estimate.unfit.length ? ` ${estimate.unfit.length} sample${estimate.unfit.length === 1 ? " does" : "s do"} not fit this version and will be skipped.` : ""}`
                      : `${selected.length} run${selected.length === 1 ? "" : "s"} on v${version}.`}
                </span>
                <Button onClick={start} loading={starting} disabled={running || !runnable} leading={<Icon name="play" size={18} />}>
                  Run {selected.length === samples.length ? "all" : selected.length} sample{selected.length === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className={styles.uploadLabel}>The agent&apos;s own form</span>
              {spec.inputs.map((input) => (
                <RunInputField key={input.key} input={input} value={adhoc[input.key]} uploading={false} onChange={(v) => setAdhoc((x) => ({ ...x, [input.key]: v }))} />
              ))}
              <div className={styles.runBar}>
                <span className={styles.estimate}>One run on v{version}, within the agent&apos;s cap.</span>
                <Button onClick={start} loading={starting} disabled={running} leading={<Icon name="play" size={18} />}>
                  Run once
                </Button>
              </div>
            </>
          )}
        </Card>

        <ScoreRow card={card} />

        {bench ? (
          <>
            <div className={[styles.benchStatus, running ? styles.benchStatusRunning : ""].filter(Boolean).join(" ")} aria-live="polite">
              <Mascot pose={running ? "move" : bench.status === "cancelled" ? "wait" : "done"} size={64} />
              <div className={styles.benchStatusText}>
                <span className={styles.benchStatusTitle}>
                  {running ? `Running ${bench.done} of ${bench.total}` : bench.status === "cancelled" ? `Cancelled after ${bench.done} of ${bench.total}` : `${bench.total} of ${bench.total} done`}
                  {" on v"}
                  {bench.version}
                </span>
                <span className={styles.hint}>
                  {bench.kind === "adhoc" ? "Ad-hoc run" : bench.kind === "batch" ? "Part of a batch" : "Samples"}
                  {bench.brandBrain ? ` with ${bench.brandBrain.name}` : ""} · started {ago(bench.createdAt, now)} · {money(bench.costMicroUsd)} so far
                  {bench.finishedAt && bench.createdAt ? ` · ${duration(Date.parse(bench.finishedAt) - Date.parse(bench.createdAt))} in all` : ""}
                </span>
                <div className={styles.progress} aria-hidden="true">
                  <div className={styles.progressBar} style={{ width: `${bench.total ? Math.round((bench.done / bench.total) * 100) : 0}%` }} />
                </div>
              </div>
              {running && (
                <Button variant="ghost" onClick={stop} loading={stopping}>
                  Cancel
                </Button>
              )}
            </div>
            <div className={styles.results}>
              {bench.results.map((r) => (
                <BenchResultCard key={`${bench.id}:${r.index}`} csrf={csrf} agentId={spec.id} result={r} onRated={(c) => setCards((x) => ({ ...x, [c.version]: c }))} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="No runs yet" description="Pick the samples above and run them. Each result shows up here beside its ideal output, with the checks, the time and the cost." />
        )}
      </div>

      <TuningPanel key={spec.version} csrf={csrf} spec={spec} sampleIds={mode === "samples" ? selected : []} onTuned={onTuned} />
    </div>
  );
}
