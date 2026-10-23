/**
 * Installs the launch set into a workspace store: the phase 2 seeds as the
 * base, the launch Brand Brains, the seven launch specs as new versions, and
 * their golden samples. Safe to run again, and safe on a store where builders
 * have already tuned agents:
 *
 * - Brand Brains are skipped by name.
 * - An agent is created when missing. It is updated to the launch version
 *   only when that version is newer than every saved version and nobody but
 *   the seeds and the launch set has ever saved it. A version saved by a
 *   person in the builder always wins.
 * - The launch status (live or draft) is applied only when the launch
 *   version is saved, never over a later choice.
 * - Samples are skipped by title per agent; a sample that no longer fits an
 *   agent's form (after a builder changed it) is reported, not forced in.
 * - A launch sample whose shape a newer launch version changed (Trend
 *   Scout's samples gained a source in 3.0.0) is rewritten in place, but only
 *   while the agent is on that launch version and the sample still holds
 *   exactly the text the launch set wrote. A sample anyone edited stays.
 *
 * Every agent write goes through the Builder, so through GuardedAgents and
 * the phase 4 policy, as the launch author: a builder account with no email
 * and no passkey, so nobody can sign in as it. Versions show it as their
 * author.
 */
import { createHash } from "node:crypto";
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import type { AgentRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID, seedPlatformAgents } from "@/lib/agents/seeds";
import { compareSemver, highestSemver } from "@/lib/agents/semver";
import type { AgentStatus } from "@/lib/agents/spec";
import { seedBrains } from "@/lib/brand/seeds";
import type { BrandStore } from "@/lib/brand/store";
import type { Builder } from "@/lib/builder/builder";
import type { FileStorage } from "@/lib/builder/storage";
import { validateRunInputs } from "@/lib/runs/inputs";
import { LAUNCH_BRAINS } from "./brains";
import { formatOutput } from "./format";
import { LAUNCH_SAMPLES } from "./samples";
import { LAUNCH_AGENTS, LAUNCH_NOTES } from "./specs";

export const LAUNCH_AUTHOR_ID = "usr_wovi_launch";
export const LAUNCH_AUTHOR_NAME = "WOVI launch set";

export type LaunchAgentAction = "created" | "updated" | "unchanged" | "kept";

/**
 * Launch samples a later launch version rewrote, by agent id and title: the
 * first 16 hex characters of the sha256 of the ideal output the launch set
 * stored before. Only a stored sample with exactly that text is refreshed.
 */
export const SUPERSEDED_SAMPLES: Record<string, Record<string, string[]>> = {
  // Trend Scout 2.0.0, before the source field and the real lookup (3.0.0).
  "trend-scout": {
    "Beginner strength gym on TikTok": ["b3d1d525ec40e4cb"],
    "Local plumber on Reels": ["adbbe3644de5b86e"],
    "Budget cooking creator on TikTok": ["0554dd38017da0dd"],
    "Invoicing app on X": ["108f1782860e8716"],
    "Generic advice with no evidence": ["95d0b958f086ffbc"],
  },
};

const textHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export type InstallReport = {
  base: { created: string[]; updated: string[]; unchanged: string[] };
  brains: { added: string[]; existing: string[] };
  agents: { id: string; name: string; action: LaunchAgentAction; version: string; status: AgentStatus; reason: string | null }[];
  samples: { added: number; existing: number; refreshed: number; unfit: { agentId: string; title: string; reason: string }[] };
};

export type InstallDeps = {
  accounts: Accounts;
  /** The raw registry, for the phase 2 base seeds only. */
  registry: AgentRegistry;
  builder: Builder;
  brands: BrandStore;
  files: FileStorage;
  /** Images the example Brand Brains name on their mood boards. */
  images?: Record<string, Uint8Array>;
};

/** The launch author as a caller: a builder that owns ws_wovi. Made once, safe to call again. */
export async function ensureLaunchAuthor(accounts: Accounts): Promise<Principal> {
  await accounts.ensurePlatform();
  const user = (await accounts.getUser(LAUNCH_AUTHOR_ID)) ?? (await accounts.createPasskeyOnlyUserWithId(LAUNCH_AUTHOR_ID, LAUNCH_AUTHOR_NAME, true));
  await accounts.syncPlatform(user);
  return { kind: "user", userId: user.id };
}

export async function installLaunchSet(deps: InstallDeps): Promise<InstallReport> {
  const { builder } = deps;
  const ws = PLATFORM_WORKSPACE_ID;
  const me = await ensureLaunchAuthor(deps.accounts);
  const agents = builder.deps.agents;

  const base = await seedPlatformAgents(deps.registry);

  const added = await seedBrains(deps.brands, deps.files, ws, { images: deps.images, examples: LAUNCH_BRAINS });
  const brains = { added, existing: LAUNCH_BRAINS.map((b) => b.name).filter((n) => !added.includes(n)) };
  const brainIds = new Map((await deps.brands.brains.find({ workspaceId: ws })).map((b) => [b.name, b.id]));

  const statusOf = async (id: string) => (await agents.rows(me, ws)).find((r) => r.id === id)?.status ?? "draft";
  const applyStatus = async (id: string, want: AgentStatus) => {
    if ((await statusOf(id)) === want) return;
    if (want === "hidden") return void (await builder.hide(me, id));
    if ((await statusOf(id)) === "hidden") await builder.unhide(me, id);
    if ((await statusOf(id)) !== want) await (want === "live" ? builder.publish(me, id) : builder.unpublish(me, id));
  };

  const report: InstallReport = { base, brains, agents: [], samples: { added: 0, existing: 0, refreshed: 0, unfit: [] } };

  for (const spec of LAUNCH_AGENTS) {
    const note = LAUNCH_NOTES[spec.id] ?? "Launch draft";
    const want = spec.status ?? "draft";
    const current = await agents.getForEdit(me, ws, spec.id);
    let action: LaunchAgentAction;
    let reason: string | null = null;
    if (!current) {
      await builder.createAgent(me, spec, note);
      await applyStatus(spec.id, want);
      action = "created";
    } else {
      const versions = await agents.versions(me, ws, spec.id);
      const highest = highestSemver(versions.map((v) => v.version)) ?? "0.0.0";
      const people = versions.filter((v) => v.by !== null && v.by !== LAUNCH_AUTHOR_ID);
      if (compareSemver(spec.version, highest) < 0) {
        action = "kept";
        reason = `version ${highest} is newer than the launch version ${spec.version}`;
      } else if (compareSemver(spec.version, highest) === 0) {
        action = "unchanged";
      } else if (people.length) {
        action = "kept";
        reason = `edited in the builder since (version ${people[people.length - 1].version}), so the launch version was not saved over it`;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, owner, status, visibility, ...body } = spec;
        await builder.saveAgent(me, spec.id, body, { note });
        await applyStatus(spec.id, want);
        action = "updated";
      }
    }
    const now = (await agents.getForEdit(me, ws, spec.id))!;
    report.agents.push({ id: spec.id, name: now.name, action, version: now.version, status: await statusOf(spec.id), reason });

    const stored = await builder.listSamples(me, spec.id);
    const onLaunchVersion = now.version === spec.version;
    for (const s of LAUNCH_SAMPLES[spec.id] ?? []) {
      const brainId = brainIds.get(s.brain);
      if (!brainId) throw new Error(`Sample "${s.title}" names the Brand Brain "${s.brain}", which the launch set does not have.`);
      const inputs = { ...s.inputs, brand: brainId };
      const have = stored.find((x) => x.title === s.title);
      if (have) {
        const old = SUPERSEDED_SAMPLES[spec.id]?.[s.title] ?? [];
        const ours = have.createdBy === LAUNCH_AUTHOR_ID && !have.clip && old.includes(textHash(have.idealOutput));
        if (ours && onLaunchVersion && validateRunInputs(now, have.inputs).ok) {
          await builder.rewriteSample(me, spec.id, have.id, { label: s.label, title: s.title, inputs: have.inputs, idealOutput: formatOutput(s.ideal), note: s.note });
          report.samples.refreshed++;
        } else report.samples.existing++;
        continue;
      }
      const fits = validateRunInputs(now, inputs);
      if (!fits.ok) {
        report.samples.unfit.push({ agentId: spec.id, title: s.title, reason: fits.errors.join(" ") });
        continue;
      }
      await builder.addSample(me, spec.id, { label: s.label, title: s.title, inputs, idealOutput: formatOutput(s.ideal), note: s.note });
      report.samples.added++;
    }
  }
  return report;
}
