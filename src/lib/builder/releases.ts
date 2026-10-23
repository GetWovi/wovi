/**
 * Releases as the builder works with them: the running canary beside the
 * stable version with both sides' live numbers, the regression gate, starting
 * a canary of any saved version, changing its share and stop rules, publishing
 * to everyone, rolling back, running the gold set, live stats per version and
 * the audit log. Builders only, like every builder call; the logic is in
 * src/lib/stats/releases.ts.
 */
import type { Principal } from "@/lib/accounts/accounts";
import { AccountError } from "@/lib/accounts/errors";
import type { VersionInfo } from "@/lib/agents/registry";
import type { AgentSpec } from "@/lib/agents/spec";
import type { GateResult } from "@/lib/stats/gate";
import { latestGoldScores } from "@/lib/stats/gate";
import type { ArmsView, Releases } from "@/lib/stats/releases";
import type { StatsService, VersionStats } from "@/lib/stats/service";
import type { AuditRow, CanaryThresholds, ReleaseRow } from "@/lib/stats/types";
import type { BenchView } from "./bench";
import type { Builder } from "./builder";

export type ReleaseView = {
  agentId: string;
  /** The version everyone gets. */
  stable: string;
  live: boolean;
  active: ReleaseRow | null;
  arms: ArmsView | null;
  gate: GateResult | null;
  history: ReleaseRow[];
  goldSamples: number;
  versions: VersionInfo[];
};

export type AuditEntry = AuditRow & { byName: string };

export class AgentReleases {
  constructor(private readonly b: Builder) {}

  private get rel(): Releases {
    const r = this.b.deps.releases;
    if (!r) throw new AccountError("not_found", "Releases are not set up here.");
    return r;
  }

  get enabled(): boolean {
    return Boolean(this.b.deps.releases);
  }

  /** The release screen. Looks at the running canary first, so one that is clearly worse is stopped before it is shown. */
  async view(caller: Principal, agentId: string): Promise<ReleaseView> {
    await this.b.requireBuilder(caller);
    const row = (await this.b.deps.agents.rows(caller, this.b.workspaceId)).find((r) => r.id === agentId);
    if (!row) throw new AccountError("not_found", "Not found.");
    await this.rel.check(this.b.workspaceId, agentId);
    const active = await this.rel.active(this.b.workspaceId, agentId);
    const [arms, gate, history, gold, versions] = await Promise.all([
      active ? this.rel.arms(this.b.workspaceId, agentId, active) : Promise.resolve(null),
      active ? this.rel.gate(this.b.workspaceId, agentId, active) : Promise.resolve(null),
      this.rel.history(this.b.workspaceId, agentId),
      this.rel.goldSamples(this.b.workspaceId, agentId),
      this.b.deps.agents.versions(caller, this.b.workspaceId, agentId),
    ]);
    return { agentId, stable: row.currentVersion, live: row.status === "live", active, arms, gate, history, goldSamples: gold.length, versions };
  }

  /** Starts a canary of a saved version beside the current one. */
  async start(caller: Principal, agentId: string, input: { version: string; share: number; thresholds?: Partial<CanaryThresholds> }): Promise<ReleaseRow> {
    const user = await this.b.requireBuilder(caller);
    const row = (await this.b.deps.agents.rows(caller, this.b.workspaceId)).find((r) => r.id === agentId);
    if (!row) throw new AccountError("not_found", "Not found.");
    if (row.status !== "live") throw new AccountError("invalid_request", "Only a live agent has live runs to share. Publish it first.");
    return this.rel.start({ workspaceId: this.b.workspaceId, agentId, stable: row.currentVersion, canary: input.version, share: input.share, thresholds: input.thresholds, by: user.id });
  }

  async update(caller: Principal, agentId: string, patch: { share?: number; thresholds?: Partial<CanaryThresholds> }): Promise<ReleaseRow> {
    const user = await this.b.requireBuilder(caller);
    return this.rel.update(this.b.workspaceId, agentId, patch, user.id);
  }

  /** Publishes the canary to everyone through the regression gate, then scores the version that is current now. */
  async promote(caller: Principal, agentId: string): Promise<{ release: ReleaseRow; gate: GateResult; spec: AgentSpec }> {
    const user = await this.b.requireBuilder(caller);
    const out = await this.rel.promote(this.b.workspaceId, agentId, user.id);
    const spec = await this.b.bench.refreshQuality(caller, agentId);
    return { ...out, spec };
  }

  async rollBack(caller: Principal, agentId: string): Promise<ReleaseRow> {
    const user = await this.b.requireBuilder(caller);
    return this.rel.rollBack(this.b.workspaceId, agentId, user.id);
  }

  /**
   * Runs the gold samples on the test bench for the canary and for the
   * stable version, each only when it has no gold score yet (or for both
   * when `again`). The bench's own estimate and spend cap apply.
   */
  async runGoldSet(caller: Principal, agentId: string, opts: { again?: boolean } = {}): Promise<BenchView[]> {
    await this.b.requireBuilder(caller);
    const active = await this.rel.active(this.b.workspaceId, agentId);
    if (!active) throw new AccountError("invalid_request", "Start a canary first; the gold set compares it with the stable version.");
    const gold = await this.rel.goldSamples(this.b.workspaceId, agentId);
    if (!gold.length) throw new AccountError("invalid_request", "This agent has no gold samples yet. Mark the samples that show the job done well as gold.");
    const benches = await this.b.deps.store.benches.find({ workspaceId: this.b.workspaceId, agentId });
    const ids = new Set(gold.map((s) => s.id));
    const items = benches.flatMap((b) => b.items).filter((i): i is typeof i & { sampleId: string; runId: string } => Boolean(i.sampleId && i.runId && ids.has(i.sampleId)));
    const runs = new Map((await this.b.deps.engine.listRuns(this.b.workspaceId, { agentId })).map((r) => [r.id, r]));
    const out: BenchView[] = [];
    for (const version of [active.canary, active.stable]) {
      if (!opts.again && latestGoldScores(version, items, runs).size >= gold.length) continue;
      out.push(await this.b.bench.run(caller, agentId, { version, sampleIds: [...ids] }));
    }
    return out;
  }

  /** Live stats per version, from people's runs, beside the existing quality roll-up. */
  async stats(caller: Principal, agentId: string, service: StatsService): Promise<VersionStats[]> {
    await this.b.requireBuilder(caller);
    const versions = await this.b.deps.agents.versions(caller, this.b.workspaceId, agentId);
    return service.versions(caller, this.b.workspaceId, agentId, versions.map((v) => v.version));
  }

  /** The audit log with who did each thing by name: one agent's, or every agent's. */
  async audit(caller: Principal, agentId?: string, limit = 200): Promise<AuditEntry[]> {
    await this.b.requireBuilder(caller);
    const rows = await this.rel.auditLog(this.b.workspaceId, agentId, limit);
    const names = new Map<string, string>();
    const out: AuditEntry[] = [];
    for (const r of rows) {
      if (!names.has(r.by)) {
        if (r.by === "system") names.set(r.by, "WOVI (automatic)");
        else {
          const u = r.by.startsWith("usr_") ? await this.b.deps.accounts.getUser(r.by) : null;
          names.set(r.by, u?.name ?? u?.email ?? (r.by.startsWith("usr_") ? "A builder" : r.by));
        }
      }
      out.push({ ...r, byName: names.get(r.by)! });
    }
    return out;
  }
}
