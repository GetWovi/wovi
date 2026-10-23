"use client";

import { useMemo, useState } from "react";
import { tuneAgent } from "@/app/builder/actions";
import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { MODEL_ROUTES } from "@/lib/agents/catalog";
import type { UpdateInput } from "@/lib/agents/registry";
import type { Bump } from "@/lib/agents/semver";
import { validateAgentBody, type AgentSpec } from "@/lib/agents/spec";
import { gateDefaults } from "@/lib/quality/data";
import type { BenchView } from "@/lib/builder/bench";
import styles from "./Builder.module.css";
import { bodyOf, num, str } from "./editor-types";
import { ROUTE_LABELS } from "./labels";
import { SHARE_CHOICES, savedWords } from "./release-choice";
import { errorAt, parseIssues } from "./spec-errors";

type GateFields = { minScore?: number; maxRewrites?: number };
/** The gate fields that are set; empty ones keep the category's defaults. */
const cleanGate = (g: GateFields): GateFields => Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined));

/**
 * The focused tuning panel beside the bench: the instruction template, the
 * model slot and fallback, temperature and limits, the spend cap. Save makes
 * a new version; "Save and re-run" runs the chosen samples against it.
 */
export function TuningPanel({ csrf, spec, sampleIds, onTuned, canary = false }: { csrf: string; spec: AgentSpec; sampleIds: string[]; onTuned: (version: string, bench: BenchView | null) => void; canary?: boolean }) {
  const { toast } = useToast();
  const [instructions, setInstructions] = useState(spec.instructions);
  const [routing, setRouting] = useState({ ...spec.routing });
  // The quality gate (phase 12): empty fields keep the category's defaults.
  const [gate, setGate] = useState<GateFields>({ ...(spec.gate ?? {}) });
  const defaults = gateDefaults(spec.category);
  const [note, setNote] = useState("");
  const [bump, setBump] = useState<Bump>("patch");
  // A live agent's new version goes out as a canary (docs/stats.md).
  const [share, setShare] = useState("10");
  const [saving, setSaving] = useState<"rerun" | "save" | null>(null);
  const textRoutes = MODEL_ROUTES.filter((r) => r.modality === "text");

  const changes = useMemo(() => {
    const out: UpdateInput = {};
    if (instructions !== spec.instructions) out.instructions = instructions;
    if (JSON.stringify(routing) !== JSON.stringify(spec.routing)) out.routing = routing;
    if (JSON.stringify(cleanGate(gate)) !== JSON.stringify(cleanGate(spec.gate ?? {}))) out.gate = Object.keys(cleanGate(gate)).length ? cleanGate(gate) : undefined;
    return out;
  }, [instructions, routing, gate, spec]);
  const changed = Object.keys(changes).length > 0;
  const issues = useMemo(() => {
    const g = cleanGate(gate);
    const r = validateAgentBody({ ...bodyOf(spec), id: spec.id, version: spec.version, instructions, routing, gate: Object.keys(g).length ? g : undefined });
    return r.ok ? [] : parseIssues(r.errors);
  }, [spec, instructions, routing, gate]);
  const setR = (patch: Partial<typeof routing>) => setRouting((r) => ({ ...r, ...patch }));

  async function save(rerun: boolean) {
    setSaving(rerun ? "rerun" : "save");
    try {
      const r = await tuneAgent(csrf, spec.id, changes, { bump, note, rerun: rerun ? sampleIds : null, canaryShare: canary && spec.status === "live" ? Number(share) : null });
      if (!r.ok) return toast({ tone: "warning", title: r.error, description: r.issues?.slice(0, 3).join(" ") });
      const words = savedWords(r.value.version, r.value.canary);
      toast({ tone: "success", title: words.title, description: rerun ? `Running the same samples against it. ${r.value.canary === null ? "" : words.description}`.trim() : words.description });
      setNote("");
      onTuned(r.value.version, r.value.bench);
    } finally {
      setSaving(null);
    }
  }

  const canRerun = changed && issues.length === 0 && sampleIds.length > 0;

  return (
    <Card className={[styles.section, styles.tuning].join(" ")} title="Tuning" actions={<Mascot pose={changed && issues.length === 0 ? "done" : "wait"} size={44} />}>
      <p className={styles.sectionNote}>Change the instructions, the model slot or the quality bar, save as a new version, and run the same samples against it.</p>
      <Textarea label="Instructions" rows={8} value={instructions} onChange={(e) => setInstructions(e.target.value)} error={errorAt(issues, "instructions")} className={styles.instructions} spellCheck={false} />
      <div className={styles.fieldGrid}>
        <Select label="Model route" value={routing.model} onChange={(e) => setR({ model: e.target.value })} options={textRoutes.map((r) => ({ value: r.id, label: ROUTE_LABELS[r.id] ?? r.id }))} error={errorAt(issues, "routing.model")} />
        <Select label="Fallback" value={routing.fallback} onChange={(e) => setR({ fallback: e.target.value })} options={textRoutes.map((r) => ({ value: r.id, label: ROUTE_LABELS[r.id] ?? r.id }))} error={errorAt(issues, "routing.fallback")} />
      </div>
      <div className={styles.fieldGrid3}>
        <Input label="Temperature" type="number" min={0} max={2} step={0.1} value={str(routing.temperature)} onChange={(e) => setR({ temperature: num(e.target.value) })} error={errorAt(issues, "routing.temperature")} />
        <Input label="Max tokens" type="number" min={1} max={32000} value={str(routing.maxOutputTokens)} onChange={(e) => setR({ maxOutputTokens: num(e.target.value) })} error={errorAt(issues, "routing.maxOutputTokens")} />
        <Input label="Cap (USD)" type="number" min={0.01} max={10} step={0.01} value={str(routing.maxCostUsd)} onChange={(e) => setR({ maxCostUsd: num(e.target.value) ?? 0 })} error={errorAt(issues, "routing.maxCostUsd")} />
      </div>
      <div className={styles.fieldGrid}>
        <Input
          label="Quality bar"
          type="number"
          min={40}
          max={95}
          step={1}
          value={str(gate.minScore)}
          placeholder={`${defaults.minScore} (default)`}
          onChange={(e) => setGate((g) => ({ ...g, minScore: num(e.target.value) }))}
          error={errorAt(issues, "gate.minScore")}
          hint="Results under it are rewritten, then go to review."
        />
        <Select
          label="Rewrites below the bar"
          value={gate.maxRewrites === undefined ? "" : String(gate.maxRewrites)}
          onChange={(e) => setGate((g) => ({ ...g, maxRewrites: e.target.value === "" ? undefined : Number(e.target.value) }))}
          options={[{ value: "", label: `${defaults.maxRewrites} (default)` }, { value: "0", label: "None" }, { value: "1", label: "One" }, { value: "2", label: "Two" }]}
          error={errorAt(issues, "gate.maxRewrites")}
        />
      </div>
      <div className={styles.fieldGrid}>
        <Input label="Change note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed, in a few words" maxLength={200} />
        <Select label="Bump" value={bump} onChange={(e) => setBump(e.target.value as Bump)} options={[{ value: "patch", label: "Patch" }, { value: "minor", label: "Minor" }, { value: "major", label: "Major" }]} />
      </div>
      {canary && spec.status === "live" && <Select label="How it goes out" value={share} onChange={(e) => setShare(e.target.value)} options={SHARE_CHOICES} hint="The current version keeps serving everyone else. Publish to everyone on Stats once the gold set passes." />}
      <div className={styles.actions}>
        <Button onClick={() => save(true)} loading={saving === "rerun"} disabled={!canRerun || saving !== null}>
          Save and re-run
        </Button>
        <Button variant="ghost" onClick={() => save(false)} loading={saving === "save"} disabled={!changed || issues.length > 0 || saving !== null}>
          Save only
        </Button>
      </div>
      <span className={styles.hint}>
        {!changed ? `Version ${spec.version} as saved. Nothing changed yet.` : issues.length ? `${issues.length} thing${issues.length === 1 ? "" : "s"} to fix first.` : sampleIds.length ? `Re-runs the ${sampleIds.length} chosen sample${sampleIds.length === 1 ? "" : "s"} on the new version.` : "Pick samples on the left to re-run them after the save."}
      </span>
    </Card>
  );
}
