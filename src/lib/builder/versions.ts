/**
 * Versions as the builder sees them: the history with who saved each one and
 * its scorecard, a readable comparison of any two, and rollback (the phase 2
 * registry call) with the quality fields refreshed for the version that is
 * current again.
 */
import type { Principal } from "@/lib/accounts/accounts";
import { AccountError } from "@/lib/accounts/errors";
import type { VersionInfo } from "@/lib/agents/registry";
import type { AgentSpec } from "@/lib/agents/spec";
import type { Builder } from "./builder";
import { specDiff, type SpecDiff } from "./diff";
import type { Scorecard } from "./scoring";

export type VersionEntry = VersionInfo & {
  /** The display name of who saved it, or null for seeds and scripts. */
  byName: string | null;
  scorecard: Scorecard;
};

export type VersionCompare = {
  a: { spec: AgentSpec; info: VersionEntry };
  b: { spec: AgentSpec; info: VersionEntry };
  diff: SpecDiff;
};

export class AgentVersions {
  constructor(private readonly b: Builder) {}

  /** Every version, oldest first, with its author and scorecard. */
  async history(caller: Principal, agentId: string): Promise<VersionEntry[]> {
    await this.b.requireBuilder(caller);
    await this.b.requireAgent(caller, agentId);
    const versions = await this.b.deps.agents.versions(caller, this.b.workspaceId, agentId);
    const cards = await this.b.bench.scorecards(caller, agentId, versions.map((v) => v.version));
    const names = new Map<string, string | null>();
    const out: VersionEntry[] = [];
    for (const v of versions) {
      let byName: string | null = null;
      if (v.by) {
        if (!names.has(v.by)) {
          const user = v.by.startsWith("key:") ? null : await this.b.deps.accounts.getUser(v.by);
          names.set(v.by, v.by.startsWith("key:") ? "API key" : (user?.name ?? user?.email ?? "A builder"));
        }
        byName = names.get(v.by) ?? null;
      }
      out.push({ ...v, byName, scorecard: cards[v.version] });
    }
    return out;
  }

  /** Two versions side by side: both specs, both scorecards, and the field diff of a against b. */
  async compare(caller: Principal, agentId: string, a: string, b: string): Promise<VersionCompare> {
    await this.b.requireBuilder(caller);
    const history = await this.history(caller, agentId);
    const infoA = history.find((v) => v.version === a);
    const infoB = history.find((v) => v.version === b);
    if (!infoA || !infoB) throw new AccountError("not_found", "That version does not exist.");
    const specA = await this.b.requireAgent(caller, agentId, a);
    const specB = await this.b.requireAgent(caller, agentId, b);
    return { a: { spec: specA, info: infoA }, b: { spec: specB, info: infoB }, diff: specDiff(specA, specB) };
  }

  /** Serves an earlier version again, and writes that version's scorecard into the spec. */
  async rollback(caller: Principal, agentId: string, version: string): Promise<AgentSpec> {
    const user = await this.b.requireBuilder(caller);
    const before = await this.b.requireAgent(caller, agentId);
    await this.b.deps.agents.rollback(caller, this.b.workspaceId, agentId, version);
    // Canary releases: serving another version for everyone ends a running canary, and the audit log keeps it.
    const rel = this.b.deps.releases;
    if (rel) {
      const ended = await rel.replace(this.b.workspaceId, agentId, user.id, `Replaced by a rollback to v${version}.`);
      await rel.log(this.b.workspaceId, agentId, "version_rollback", user.id, `v${version} serves everyone again in place of v${before.version}.${ended ? ` The canary of v${ended.canary} ended.` : ""}`, version, before.version);
    }
    return this.b.bench.refreshQuality(caller, agentId);
  }
}
