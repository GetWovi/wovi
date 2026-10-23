/**
 * Canary releases (product doc, sections 4 and 6): "Publish, canary to 10% of
 * traffic, or roll back in one click" and "new versions serve 10% of live
 * traffic first, compared on acceptance and edit rate", with the regression
 * gate before a version reaches everyone, an automatic stop when a canary is
 * clearly worse, and every decision in the audit log.
 *
 * The registry's current version is the stable one: what every form, the API
 * and MCP show, and what every run that follows "latest stable" gets. A
 * release names a newer version and a share; the router sends that share of
 * workspaces (by a stable hash) to it. Runs in the agent's own workspace (the
 * bench) and pinned runs are never routed.
 *
 * Who may act is checked by the caller (the Builder); this service trusts it.
 */
import { randomUUID } from "node:crypto";
import type { Collection } from "@/lib/accounts/store";
import type { AgentRegistry } from "@/lib/agents/registry";
import type { AgentSpec } from "@/lib/agents/spec";
import type { Bench, Sample } from "@/lib/builder/types";
import type { VersionRouter } from "@/lib/runs/engine";
import type { Run } from "@/lib/runs/run";
import { latestGoldScores, regressionGate, type GateResult } from "./gate";
import { compareArms, computeStats, type ArmComparison } from "./metrics";
import { armFor } from "./routing";
import type { StatsService } from "./service";
import type { StatsStore } from "./store";
import { DEFAULT_THRESHOLDS, SHARE_LIMITS, THRESHOLD_LIMITS, type AuditKind, type AuditRow, type CanaryThresholds, type ReleaseRow, type StatsNumbers } from "./types";

export class ReleaseError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_request" | "conflict" | "gate",
    message: string,
    readonly issues: string[] = [],
    readonly gate: GateResult | null = null,
  ) {
    super(message);
    this.name = "ReleaseError";
  }
}

export type ReleasesOptions = {
  store: Pick<StatsStore, "releases" | "audit">;
  /** The raw registry: the builder has checked the caller. */
  registry: AgentRegistry;
  stats: StatsService;
  /** The builder's benches and samples, for the gold set. */
  benches: Pick<Collection<Bench>, "find">;
  samples: Pick<Collection<Sample>, "find">;
  now?: () => Date;
  newId?: (prefix: string) => string;
};

/** Both sides of a release, counted the same way, with the comparison. */
export type ArmsView = {
  release: ReleaseRow;
  stable: StatsNumbers;
  canary: StatsNumbers;
  comparison: ArmComparison;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The router on the releases table alone: no engine, so the engine can be built with it. */
export function storeRouter(store: Pick<StatsStore, "releases">): VersionRouter {
  return {
    async route({ agentWorkspaceId, agentId, workspaceId }) {
      // The bench and the builder's own runs always get the current version.
      if (workspaceId === agentWorkspaceId) return null;
      const r = (await store.releases.find({ workspaceId: agentWorkspaceId, agentId, status: "canary" }))[0];
      if (!r) return null;
      const arm = armFor(r, workspaceId);
      return { version: arm === "canary" ? r.canary : r.stable, release: { id: r.id, arm } };
    },
  };
}

/**
 * Whether a canary can run beside the stable version: the same form (every
 * input with the same key, type and required flag, no new required input,
 * choices keeping their options) and the same kind of output, so a person
 * sees one form and a pipeline gets the shape it expects.
 */
export function formFits(stable: Pick<AgentSpec, "inputs" | "output">, canary: Pick<AgentSpec, "inputs" | "output">): string[] {
  const problems: string[] = [];
  for (const a of stable.inputs) {
    const b = canary.inputs.find((i) => i.key === a.key);
    if (!b) {
      problems.push(`The input "${a.label}" is gone.`);
      continue;
    }
    if (a.type !== b.type) problems.push(`"${a.label}" changed from ${a.type} to ${b.type}.`);
    else if (!a.required && b.required) problems.push(`"${a.label}" is now required.`);
    if (a.type === "choice" && b.type === "choice") {
      const lost = a.options.filter((o) => !b.options.some((p) => p.value === o.value));
      if (lost.length) problems.push(`"${a.label}" lost the option${lost.length === 1 ? "" : "s"} ${lost.map((o) => o.label).join(", ")}.`);
      if (a.multiple !== b.multiple) problems.push(`"${a.label}" changed between one choice and several.`);
    }
  }
  for (const b of canary.inputs) if (b.required && !stable.inputs.some((a) => a.key === b.key)) problems.push(`The new input "${b.label}" is required.`);
  if (stable.output.kind !== canary.output.kind) problems.push(`The output changed from ${stable.output.kind} to ${canary.output.kind}.`);
  return problems;
}

/** Thresholds within their limits. */
export function cleanThresholds(t: Partial<CanaryThresholds> | undefined, base: CanaryThresholds = DEFAULT_THRESHOLDS): CanaryThresholds {
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const r = THRESHOLD_LIMITS.rate;
  return {
    minRuns: Math.round(num(t?.minRuns, base.minRuns, THRESHOLD_LIMITS.minRuns.min, THRESHOLD_LIMITS.minRuns.max)),
    acceptanceDrop: num(t?.acceptanceDrop, base.acceptanceDrop, r.min, r.max),
    editRise: num(t?.editRise, base.editRise, r.min, r.max),
    regenerateRise: num(t?.regenerateRise, base.regenerateRise, r.min, r.max),
    qualityDrop: num(t?.qualityDrop, base.qualityDrop, THRESHOLD_LIMITS.qualityDrop.min, THRESHOLD_LIMITS.qualityDrop.max),
  };
}

export function checkShare(share: unknown): number {
  if (typeof share !== "number" || !Number.isInteger(share) || share < SHARE_LIMITS.min || share > SHARE_LIMITS.max) {
    throw new ReleaseError("invalid_request", `The canary share is a whole percent from ${SHARE_LIMITS.min} to ${SHARE_LIMITS.max}.`);
  }
  return share;
}

export class Releases {
  private readonly now: () => Date;
  private readonly newId: (prefix: string) => string;
  /** One check at a time per agent, so a burst of finished runs never stops a canary twice. */
  private readonly checking = new Map<string, Promise<unknown>>();

  constructor(private readonly o: ReleasesOptions) {
    this.now = o.now ?? (() => new Date());
    this.newId = o.newId ?? ((p) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 20)}`);
  }

  private iso() {
    return this.now().toISOString();
  }

  get router(): VersionRouter {
    return storeRouter(this.o.store);
  }

  /* ---------- Reading ---------- */

  /** The running canary of an agent, or null. */
  async active(workspaceId: string, agentId: string): Promise<ReleaseRow | null> {
    return (await this.o.store.releases.find({ workspaceId, agentId, status: "canary" }))[0] ?? null;
  }

  /** Every release of an agent, newest first. */
  async history(workspaceId: string, agentId: string): Promise<ReleaseRow[]> {
    return (await this.o.store.releases.find({ workspaceId, agentId })).sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
  }

  /** The version the builder works on: the canary while one runs, else the current version. */
  async head(workspaceId: string, agentId: string): Promise<string | null> {
    return (await this.active(workspaceId, agentId))?.canary ?? null;
  }

  /** The audit log, newest first: one agent's, or every agent's in the workspace. */
  async auditLog(workspaceId: string, agentId?: string, limit = 200): Promise<AuditRow[]> {
    const rows = await this.o.store.audit.find(agentId ? { workspaceId, agentId } : { workspaceId });
    return rows.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, limit);
  }

  /* ---------- Starting, changing, ending ---------- */

  /**
   * Starts a canary of `canary` beside `stable` (the current version). A
   * running canary of the agent is replaced. A share above 0 needs a form
   * that fits the stable one.
   */
  async start(input: { workspaceId: string; agentId: string; stable: string; canary: string; share: number; thresholds?: Partial<CanaryThresholds>; by: string; note?: string }): Promise<ReleaseRow> {
    const share = checkShare(input.share);
    if (input.stable === input.canary) throw new ReleaseError("invalid_request", "The canary is the version everyone already gets.");
    const [stable, canary] = await Promise.all([this.o.registry.get(input.workspaceId, input.agentId, input.stable), this.o.registry.get(input.workspaceId, input.agentId, input.canary)]);
    if (!stable || !canary) throw new ReleaseError("not_found", "That version does not exist.");
    if (share > 0) this.requireFit(stable, canary);
    const before = await this.active(input.workspaceId, input.agentId);
    if (before) await this.end(before, "replaced", input.by, `Replaced by the canary of v${input.canary}.`);
    const at = this.iso();
    const row: ReleaseRow = {
      id: this.newId("rel"),
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      stable: input.stable,
      canary: input.canary,
      share,
      status: "canary",
      thresholds: cleanThresholds(input.thresholds),
      startedAt: at,
      startedBy: input.by,
      endedAt: null,
      endedBy: null,
      reason: null,
      updatedAt: at,
    };
    await this.o.store.releases.insert(row);
    await this.audit({
      workspaceId: row.workspaceId,
      agentId: row.agentId,
      kind: "canary_started",
      version: row.canary,
      from: row.stable,
      by: input.by,
      detail: share ? `v${row.canary} serves ${share}% of live runs beside v${row.stable}.${input.note ? ` ${input.note}` : ""}` : `v${row.canary} is saved for the bench only; v${row.stable} still serves every live run.${input.note ? ` ${input.note}` : ""}`,
      data: { share },
    });
    return row;
  }

  /** Changes the share or the thresholds of the running canary. */
  async update(workspaceId: string, agentId: string, patch: { share?: number; thresholds?: Partial<CanaryThresholds> }, by: string): Promise<ReleaseRow> {
    const r = await this.requireActive(workspaceId, agentId);
    const share = patch.share === undefined ? r.share : checkShare(patch.share);
    if (share > 0 && r.share === 0) {
      const [stable, canary] = await Promise.all([this.o.registry.get(workspaceId, agentId, r.stable), this.o.registry.get(workspaceId, agentId, r.canary)]);
      if (!stable || !canary) throw new ReleaseError("not_found", "That version does not exist.");
      this.requireFit(stable, canary);
    }
    const thresholds = patch.thresholds ? cleanThresholds(patch.thresholds, r.thresholds) : r.thresholds;
    const next = await this.o.store.releases.updateIf(r.id, { status: "canary" }, { share, thresholds, updatedAt: this.iso() });
    if (!next) throw new ReleaseError("conflict", "The canary ended in the meantime.");
    const changes = [share !== r.share ? `share ${r.share}% to ${share}%` : null, patch.thresholds ? `stop rules: at least ${thresholds.minRuns} runs a side; acceptance down ${pct(thresholds.acceptanceDrop)}, edits up ${pct(thresholds.editRise)}, regenerates up ${pct(thresholds.regenerateRise)}, quality down ${thresholds.qualityDrop} points` : null].filter(Boolean);
    if (changes.length) await this.audit({ workspaceId, agentId, kind: "canary_share", version: r.canary, from: r.stable, by, detail: `Canary of v${r.canary}: ${changes.join("; ")}.`, data: { share, previous: r.share } });
    return next;
  }

  /**
   * Publishes the canary to everyone, through the regression gate: it must
   * not score below the stable version on the gold set, and must not be
   * clearly worse on live runs. A refusal is logged and thrown with the gate.
   */
  async promote(workspaceId: string, agentId: string, by: string): Promise<{ release: ReleaseRow; gate: GateResult; spec: AgentSpec }> {
    const r = await this.requireActive(workspaceId, agentId);
    const gate = await this.gate(workspaceId, agentId, r);
    if (!gate.ok) {
      await this.audit({ workspaceId, agentId, kind: "gate_refused", version: r.canary, from: r.stable, by, detail: `Publishing v${r.canary} to everyone was refused. ${gate.reasons.join(" ")}`, data: gateData(gate) });
      throw new ReleaseError("gate", gate.status === "needs_gold" ? gate.reasons[0] : `v${r.canary} cannot go to everyone yet.`, gate.reasons, gate);
    }
    const ended = await this.end(r, "promoted", by, `Published to everyone. ${gate.reasons.join(" ")}`);
    const spec = await this.o.registry.rollback(workspaceId, agentId, r.canary);
    await this.audit({ workspaceId, agentId, kind: "promoted", version: r.canary, from: r.stable, by, detail: `v${r.canary} now serves everyone in place of v${r.stable}. ${gate.reasons.join(" ")}`, data: gateData(gate) });
    return { release: ended, gate, spec };
  }

  /** Rolls the canary back in one step: the stable version serves everyone again. */
  async rollBack(workspaceId: string, agentId: string, by: string, reason?: string): Promise<ReleaseRow> {
    const r = await this.requireActive(workspaceId, agentId);
    const ended = await this.end(r, "rolled_back", by, reason ?? "Rolled back by a builder.");
    await this.audit({ workspaceId, agentId, kind: "rolled_back", version: r.canary, from: r.stable, by, detail: `Canary of v${r.canary} rolled back; v${r.stable} serves every live run.${reason ? ` ${reason}` : ""}` });
    return ended;
  }

  /** Ends the running canary because something else took its place (a direct save, a version rollback). */
  async replace(workspaceId: string, agentId: string, by: string, reason: string): Promise<ReleaseRow | null> {
    const r = await this.active(workspaceId, agentId);
    return r ? this.end(r, "replaced", by, reason) : null;
  }

  /**
   * The automatic stop: when both sides have enough runs and the canary is
   * clearly worse on any rule, it is stopped and the stable version serves
   * everyone. Logged with the numbers. Safe to call often.
   */
  async check(workspaceId: string, agentId: string): Promise<{ stopped: boolean; release: ReleaseRow | null; comparison: ArmComparison | null }> {
    const key = `${workspaceId}\u0000${agentId}`;
    const before = this.checking.get(key) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(() => this.checkNow(workspaceId, agentId));
    this.checking.set(key, mine);
    try {
      return await mine;
    } finally {
      if (this.checking.get(key) === mine) this.checking.delete(key);
    }
  }

  private async checkNow(workspaceId: string, agentId: string) {
    const r = await this.active(workspaceId, agentId);
    if (!r || r.share === 0) return { stopped: false, release: r, comparison: null };
    const arms = await this.arms(workspaceId, agentId, r);
    if (!arms.comparison.worse) return { stopped: false, release: r, comparison: arms.comparison };
    const reason = `Stopped automatically: ${arms.comparison.reasons.join(" ")}`;
    const ended = await this.o.store.releases.updateIf(r.id, { status: "canary" }, { status: "stopped", endedAt: this.iso(), endedBy: "system", reason, updatedAt: this.iso() });
    if (!ended) return { stopped: false, release: await this.active(workspaceId, agentId), comparison: arms.comparison };
    await this.audit({
      workspaceId,
      agentId,
      kind: "auto_stopped",
      version: r.canary,
      from: r.stable,
      by: "system",
      detail: `Canary of v${r.canary} stopped automatically; v${r.stable} serves every live run. ${arms.comparison.reasons.join(" ")}`,
      data: armsData(arms),
    });
    return { stopped: true, release: ended, comparison: arms.comparison };
  }

  /* ---------- The numbers behind a release ---------- */

  /** Both sides of a release: the runs that took part in it, counted like the public numbers, side by side. */
  async arms(workspaceId: string, agentId: string, release?: ReleaseRow | null): Promise<ArmsView> {
    const r = release ?? (await this.requireActive(workspaceId, agentId));
    const { runs, feedback } = await this.o.stats.realRuns(workspaceId, agentId);
    const of = (arm: "stable" | "canary") => runs.filter((x) => x.release?.id === r.id && x.release.arm === arm);
    const min = r.thresholds.minRuns;
    const stable = computeStats(of("stable"), feedback, min);
    const canary = computeStats(of("canary"), feedback, min);
    return { release: r, stable, canary, comparison: compareArms(stable, canary, r.thresholds) };
  }

  /** The gold samples of an agent: what "Run the gold set" runs. */
  async goldSamples(workspaceId: string, agentId: string): Promise<Sample[]> {
    return (await this.o.samples.find({ workspaceId, agentId })).filter((s) => s.label === "gold");
  }

  /** The regression gate for a release, or for any two versions (candidate against stable). */
  async gate(workspaceId: string, agentId: string, release?: ReleaseRow | null, versions?: { stable: string; candidate: string }): Promise<GateResult> {
    const r = release ?? (versions ? null : await this.requireActive(workspaceId, agentId));
    const stableV = versions?.stable ?? r!.stable;
    const candV = versions?.candidate ?? r!.canary;
    const gold = await this.goldSamples(workspaceId, agentId);
    const goldIds = new Set(gold.map((s) => s.id));
    const benches = await this.o.benches.find({ workspaceId, agentId });
    const items = benches.flatMap((b) => b.items).filter((i): i is typeof i & { sampleId: string; runId: string } => Boolean(i.sampleId && i.runId && goldIds.has(i.sampleId)));
    const { all } = await this.o.stats.realRuns(workspaceId, agentId);
    const byId = new Map<string, Run>(all.map((x) => [x.id, x]));
    let live: ArmComparison | null = null;
    if (r && r.share > 0) live = (await this.arms(workspaceId, agentId, r)).comparison;
    return regressionGate({
      goldSamples: gold.length,
      stable: { version: stableV, scores: latestGoldScores(stableV, items, byId) },
      candidate: { version: candV, scores: latestGoldScores(candV, items, byId) },
      live,
    });
  }

  /* ---------- The audit log ---------- */

  async audit(entry: Omit<AuditRow, "id" | "at">): Promise<AuditRow> {
    const row: AuditRow = { ...entry, id: this.newId("aud"), at: this.iso() };
    await this.o.store.audit.insert(row);
    return row;
  }

  /** Logs a version or listing change made elsewhere (a save, a publish, a version rollback). */
  async log(workspaceId: string, agentId: string, kind: AuditKind, by: string, detail: string, version: string | null = null, from: string | null = null): Promise<AuditRow> {
    return this.audit({ workspaceId, agentId, kind, version, from, by, detail });
  }

  /* ---------- helpers ---------- */

  private requireFit(stable: AgentSpec, canary: AgentSpec) {
    const problems = formFits(stable, canary);
    if (problems.length) {
      throw new ReleaseError(
        "invalid_request",
        `v${canary.version} cannot run beside v${stable.version}: people would see one form and get another. Keep it at 0% for the bench and publish it to everyone once the gold set passes.`,
        problems,
      );
    }
  }

  private async requireActive(workspaceId: string, agentId: string): Promise<ReleaseRow> {
    const r = await this.active(workspaceId, agentId);
    if (!r) throw new ReleaseError("not_found", "No canary is running for this agent.");
    return r;
  }

  private async end(r: ReleaseRow, status: ReleaseRow["status"], by: string, reason: string): Promise<ReleaseRow> {
    const at = this.iso();
    const next = await this.o.store.releases.updateIf(r.id, { status: "canary" }, { status, endedAt: at, endedBy: by, reason, updatedAt: at });
    if (!next) throw new ReleaseError("conflict", "The canary ended in the meantime.");
    return next;
  }
}

function gateData(g: GateResult): Record<string, number | string | null> {
  return { gate: g.status, goldStable: g.stable.score, goldCandidate: g.candidate.score, compared: g.compared };
}

function armsData(a: ArmsView): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = { stableRuns: a.stable.runs, canaryRuns: a.canary.runs };
  for (const c of a.comparison.checks) {
    out[`${c.id}Stable`] = c.stable === null ? null : Math.round(c.stable * (c.id === "quality" ? 1 : 1000)) / (c.id === "quality" ? 1 : 1000);
    out[`${c.id}Canary`] = c.canary === null ? null : Math.round(c.canary * (c.id === "quality" ? 1 : 1000)) / (c.id === "quality" ? 1 : 1000);
  }
  return out;
}
