/**
 * The Agent Builder: where WOVI's own agents are made. Everything here is
 * scoped to the platform workspace ws_wovi and open only to builders. Anyone
 * else gets not_found from every call, so the builder does not exist for them.
 *
 * The registry work goes through GuardedAgents (phase 4), so every save is a
 * new immutable version made under the same policy as any workspace edit.
 * Drafting goes through the SpecDrafter on the phase 3 provider layer.
 * Samples and the mood board are the builder's own rows, with files behind
 * the FileStorage interface. Part 2 (phase 6) adds the test bench, scoring,
 * tuning and batches in `bench`, and the version tools in `versions`.
 */
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import { newId } from "@/lib/accounts/crypto";
import { AccountError } from "@/lib/accounts/errors";
import type { GuardedAgents } from "@/lib/accounts/guard";
import type { User } from "@/lib/accounts/types";
import type { CreateInput, UpdateInput, VersionInfo } from "@/lib/agents/registry";
import { PLATFORM_CREATOR_ID, PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { Bump } from "@/lib/agents/semver";
import type { AgentSpec, AgentStatus } from "@/lib/agents/spec";
import type { AgentRow } from "@/lib/agents/store";
import type { RunEngine } from "@/lib/runs/engine";
import { validateRunInputs } from "@/lib/runs/inputs";
import { AgentBench } from "./bench";
import type { BoardSource } from "./board-brain";
import { DESCRIPTION_MAX, type DraftResult, type SpecDrafter } from "./drafter";
import { checkFile, type FileKind, type FileStorage, type StoredFile } from "./storage";
import type { BuilderStore } from "./store";
import { BOARD_KINDS, BUILDER_LIMITS, SAMPLE_LABELS, type BoardItem, type BoardKind, type Sample, type SampleLabel } from "./types";
import { AgentVersions } from "./versions";
import { formFits, type Releases } from "@/lib/stats/releases";
import { AgentReleases } from "./releases";
import { SHARE_LIMITS, type CanaryThresholds } from "@/lib/stats/types";

/** One row of the builder home. */
export type BuilderAgentRow = {
  id: string;
  name: string;
  job: string;
  category: AgentSpec["category"];
  platforms: AgentSpec["platforms"];
  status: AgentStatus;
  visibility: AgentSpec["visibility"];
  version: string;
  versions: number;
  createdAt: string;
  updatedAt: string;
};

export type BuilderAgent = { spec: AgentSpec; row: AgentRow; versions: VersionInfo[]; samples: number; board: number };

/** Drafts per builder: each one is up to two calls on the strong model, so they are counted (about $0.30 at most each). */
export const DRAFT_LIMITS = { perHour: { max: 15, windowMs: 3_600_000 }, perDay: { max: 40, windowMs: 86_400_000 } } as const;

export type SampleInput = {
  label?: SampleLabel;
  title?: string;
  inputs: Record<string, unknown>;
  idealOutput: string;
  note?: string;
  links?: string[];
  fileIds?: string[];
  /** The clip a sample was made from (the clip library). */
  clip?: { id: string; name: string; posterId: string | null };
};

export type BoardInput = {
  kind: BoardKind;
  note?: string;
  url?: string;
  text?: string;
  color?: string;
  fileId?: string;
};

export type BuilderOptions = {
  accounts: Accounts;
  agents: GuardedAgents;
  store: BuilderStore;
  files: FileStorage;
  drafter: SpecDrafter;
  /** The run engine itself, not the guarded view: builders see the model, tokens and cost of a bench run. */
  engine: RunEngine;
  /**
   * Canary releases and the audit log (docs/stats.md). Left out, a save makes
   * the new version current at once, as before.
   */
  releases?: Releases | null;
  /**
   * Canary releases on (WOVI_CANARY=on). Off, a save reaches everyone at once
   * as before, with no canary and no gate, while the audit log still records.
   * Defaults to on when releases are given, so callers that pass releases
   * without saying get the full flow (tests); the app passes the switch.
   */
  canary?: boolean;
  now?: () => Date;
};

/** How a saved version goes out: to everyone at once (drafts), or as a canary on a share of live runs. */
export type SaveRelease = { mode: "everyone" } | { mode: "canary"; share: number; thresholds?: Partial<CanaryThresholds> };

const NOT_FOUND = "Not found.";
const HEX = /^#[0-9a-f]{6}$/i;

function cleanText(v: unknown, max: number): string {
  return (typeof v === "string" ? v : "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function cleanLink(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 2048) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export class Builder implements BoardSource {
  readonly workspaceId = PLATFORM_WORKSPACE_ID;
  /** The test bench, scoring, tuning and batches (phase 6). */
  readonly bench: AgentBench;
  /** Version history, compare and rollback (phase 6). */
  readonly versions: AgentVersions;
  /** Canary releases, the regression gate, live stats per version and the audit log. */
  readonly release: AgentReleases;
  private readonly now: () => Date;

  constructor(private readonly opts: BuilderOptions) {
    this.now = opts.now ?? (() => new Date());
    this.bench = new AgentBench(this);
    this.versions = new AgentVersions(this);
    this.release = new AgentReleases(this);
  }

  /** The stores and services, for the bench and version tools. */
  get deps(): BuilderOptions {
    return this.opts;
  }

  iso(): string {
    return this.now().toISOString();
  }

  /* ---------- Access ---------- */

  /** The builder behind a principal, or null. Only signed-in builders who own ws_wovi pass. */
  async builderFor(caller: Principal): Promise<User | null> {
    if (caller.kind !== "user") return null;
    const user = await this.opts.accounts.getUser(caller.userId);
    if (!user || !this.opts.accounts.isBuilder(user)) return null;
    const role = await this.opts.accounts.roleIn(caller, this.workspaceId);
    return role === "owner" ? user : null;
  }

  /** Throws not_found for anyone who is not a builder. */
  async requireBuilder(caller: Principal): Promise<User> {
    const user = await this.builderFor(caller);
    if (!user) throw new AccountError("not_found", NOT_FOUND);
    return user;
  }

  /* ---------- Agents ---------- */

  async listAgents(caller: Principal): Promise<BuilderAgentRow[]> {
    await this.requireBuilder(caller);
    const rows = await this.opts.agents.rows(caller, this.workspaceId);
    const out: BuilderAgentRow[] = [];
    for (const row of rows) {
      const spec = await this.opts.agents.getForEdit(caller, this.workspaceId, row.id);
      if (!spec) continue;
      const versions = await this.opts.agents.versions(caller, this.workspaceId, row.id);
      out.push({
        id: row.id,
        name: spec.name,
        job: spec.job,
        category: spec.category,
        platforms: spec.platforms,
        status: row.status,
        visibility: row.visibility,
        version: row.currentVersion,
        versions: versions.length,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async getAgent(caller: Principal, id: string): Promise<BuilderAgent | null> {
    await this.requireBuilder(caller);
    const spec = await this.opts.agents.getForEdit(caller, this.workspaceId, id);
    if (!spec) return null;
    const row = (await this.opts.agents.rows(caller, this.workspaceId)).find((r) => r.id === id);
    if (!row) return null;
    const versions = await this.opts.agents.versions(caller, this.workspaceId, id);
    const samples = (await this.opts.store.samples.find({ workspaceId: this.workspaceId, agentId: id })).length;
    const board = (await this.opts.store.boardItems.find({ workspaceId: this.workspaceId, agentId: id })).length;
    // While a canary runs the builder works on it: the editor, the bench and tuning start from the canary version.
    const head = await this.headVersion(id);
    const shown = head && head !== spec.version ? ((await this.opts.agents.getForEdit(caller, this.workspaceId, id, head)) ?? spec) : spec;
    return { spec: shown, row, versions, samples, board };
  }

  /** A full spec drafted from a plain description. Nothing is saved. Limited per builder, since a real model drafts it. */
  async draft(caller: Principal, description: string): Promise<DraftResult> {
    const user = await this.requireBuilder(caller);
    const text = cleanText(description, DESCRIPTION_MAX);
    if (text.length < 3) throw new AccountError("invalid_request", "Describe the agent in a sentence or two first.");
    await this.opts.accounts.limiter.hit(`draft:hour:${user.id}`, DRAFT_LIMITS.perHour, "You drafted many agents this hour. Wait a little and try again.");
    await this.opts.accounts.limiter.hit(`draft:day:${user.id}`, DRAFT_LIMITS.perDay, "You drafted many agents today. Try again tomorrow.");
    const existingIds = (await this.opts.agents.rows(caller, this.workspaceId)).map((r) => r.id);
    return this.opts.drafter.draft({ description: text, existingIds });
  }

  /** Saves a draft (or any spec) as a new agent in ws_wovi, owned by the platform, as a draft. */
  async createAgent(caller: Principal, input: CreateInput, note = "Drafted in the builder"): Promise<AgentSpec> {
    await this.requireBuilder(caller);
    const spec: CreateInput = { ...input, owner: { kind: "platform", creatorId: PLATFORM_CREATOR_ID }, status: "draft" };
    return this.opts.agents.create(caller, this.workspaceId, spec, { note });
  }

  /**
   * Saves changes as a new version and refuses a save that changes nothing.
   *
   * Without canary releases (or for an agent that is not live) the new
   * version is current at once and starts unscored, as it always was. With
   * releases, a live agent's new version goes out as a canary: it is written
   * beside the current version, which keeps serving everyone, and serves
   * `share` percent of live runs (0 keeps it to the bench). Publishing it to
   * everyone goes through the regression gate (`releases`).
   */
  async saveAgent(caller: Principal, id: string, changes: UpdateInput, opts: { bump?: Bump; note?: string; release?: SaveRelease } = {}): Promise<AgentSpec> {
    const user = await this.requireBuilder(caller);
    const rel = this.opts.releases;
    if (!rel) {
      await this.opts.agents.update(caller, this.workspaceId, id, changes, opts);
      return this.bench.refreshQuality(caller, id);
    }
    const row = (await this.opts.agents.rows(caller, this.workspaceId)).find((r) => r.id === id);
    if (!row) throw new AccountError("not_found", NOT_FOUND);
    // Canaries off (WOVI_CANARY): every save reaches everyone at once, as before, and is logged.
    // A canary left from when the switch was on is ended by a save for everyone, so it never comes back stale.
    const active = await rel.active(this.workspaceId, id);
    const live = row.status === "live";
    const mode = !this.canary ? "everyone" : (opts.release?.mode ?? (active && live ? "canary" : "everyone"));
    if (mode === "everyone" || !live) {
      if (this.canary && live && opts.release?.mode === "everyone") {
        throw new AccountError("invalid_request", "A live agent's new version goes out as a canary first. Publish it to everyone from Stats once the gold set passes.");
      }
      const saved = await this.opts.agents.update(caller, this.workspaceId, id, changes, { bump: opts.bump, note: opts.note });
      if (active) await rel.replace(this.workspaceId, id, user.id, `Replaced by v${saved.version}, saved for everyone.`);
      await rel.log(this.workspaceId, id, "saved", user.id, live ? `Saved v${saved.version}; it serves everyone.` : `Saved v${saved.version}.`, saved.version, row.currentVersion);
      return this.bench.refreshQuality(caller, id);
    }
    const share = opts.release?.mode === "canary" ? opts.release.share : (active?.share ?? SHARE_LIMITS.default);
    if (!Number.isInteger(share) || share < SHARE_LIMITS.min || share > SHARE_LIMITS.max) throw new AccountError("invalid_request", `The canary share is a whole percent from ${SHARE_LIMITS.min} to ${SHARE_LIMITS.max}.`);
    const base = active?.canary ?? row.currentVersion;
    if (share > 0) {
      const [stable, head] = await Promise.all([this.requireAgent(caller, id, row.currentVersion), this.requireAgent(caller, id, base)]);
      const problems = formFits(stable, { inputs: changes.inputs ?? head.inputs, output: changes.output ?? head.output } as Pick<AgentSpec, "inputs" | "output">);
      if (problems.length) throw new AccountError("invalid_request", `This version changes the form or the output, so it cannot run beside v${stable.version}. Save it at 0% (bench only) and publish it to everyone once the gold set passes. ${problems.join(" ")}`);
    }
    const saved = await this.opts.agents.update(caller, this.workspaceId, id, changes, { bump: opts.bump, note: opts.note, base, keepCurrent: true });
    await rel.log(this.workspaceId, id, "saved", user.id, `Saved v${saved.version} on top of v${base}.`, saved.version, base);
    await rel.start({ workspaceId: this.workspaceId, agentId: id, stable: row.currentVersion, canary: saved.version, share, thresholds: opts.release?.mode === "canary" ? opts.release.thresholds ?? active?.thresholds : active?.thresholds, by: user.id });
    return saved;
  }

  /** Whether canary releases are on: releases are set up and WOVI_CANARY is on. */
  get canary(): boolean {
    return Boolean(this.opts.releases) && this.opts.canary !== false;
  }

  /** The version the builder works on: the running canary, or the current version. With canaries off, always the current one. */
  async headVersion(id: string): Promise<string | undefined> {
    if (!this.canary) return undefined;
    return (await this.opts.releases?.head(this.workspaceId, id)) ?? undefined;
  }

  async publish(caller: Principal, id: string): Promise<AgentSpec> {
    const user = await this.requireBuilder(caller);
    const spec = await this.opts.agents.setStatus(caller, this.workspaceId, id, "live");
    await this.opts.releases?.log(this.workspaceId, id, "published", user.id, `Published: v${spec.version} is live for everyone.`, spec.version);
    return spec;
  }

  async unpublish(caller: Principal, id: string): Promise<AgentSpec> {
    const user = await this.requireBuilder(caller);
    const spec = await this.opts.agents.setStatus(caller, this.workspaceId, id, "draft");
    await this.endReleaseFor(user.id, id, "The agent went back to draft.");
    await this.opts.releases?.log(this.workspaceId, id, "unpublished", user.id, "Back to draft: nobody outside the builder can run it.", spec.version);
    return spec;
  }

  async hide(caller: Principal, id: string): Promise<AgentSpec> {
    const user = await this.requireBuilder(caller);
    const spec = await this.opts.agents.hide(caller, this.workspaceId, id);
    await this.endReleaseFor(user.id, id, "The agent was hidden.");
    await this.opts.releases?.log(this.workspaceId, id, "hidden", user.id, "Hidden from every list people see.", spec.version);
    return spec;
  }

  async unhide(caller: Principal, id: string): Promise<AgentSpec> {
    const user = await this.requireBuilder(caller);
    const spec = await this.opts.agents.unhide(caller, this.workspaceId, id);
    await this.opts.releases?.log(this.workspaceId, id, "unhidden", user.id, `Shown again as ${spec.status}.`, spec.version);
    return spec;
  }

  /** A canary has no live traffic once its agent is off the gallery, so it ends. */
  private async endReleaseFor(by: string, id: string, reason: string) {
    const r = await this.opts.releases?.replace(this.workspaceId, id, by, reason);
    if (r) await this.opts.releases?.log(this.workspaceId, id, "rolled_back", by, `Canary of v${r.canary} ended: ${reason} v${r.stable} stays current.`, r.canary, r.stable);
  }

  /* ---------- Files ---------- */

  async putFile(caller: Principal, kind: FileKind, file: { name: string; mimeType: string; bytes: Uint8Array }): Promise<StoredFile> {
    await this.requireBuilder(caller);
    if (kind === "video") throw new AccountError("invalid_request", "Clips go through the clip library, which streams them to disk.");
    const problem = checkFile(kind, { name: file.name, mimeType: file.mimeType, sizeBytes: file.bytes.byteLength });
    if (problem) throw new AccountError("invalid_request", problem);
    return this.opts.files.put(this.workspaceId, file);
  }

  async getFile(caller: Principal, id: string): Promise<{ meta: StoredFile; bytes: Uint8Array } | null> {
    await this.requireBuilder(caller);
    // A clip is streamed back by its own route with ranges; it is never read whole into memory here.
    const head = this.opts.files.head ? await this.opts.files.head(this.workspaceId, id) : null;
    if (head?.mimeType.startsWith("video/")) return null;
    return this.opts.files.get(this.workspaceId, id);
  }

  private async fileMeta(id: unknown): Promise<StoredFile> {
    const f = typeof id === "string" ? await this.opts.files.get(this.workspaceId, id) : null;
    if (!f) throw new AccountError("invalid_request", "That upload is missing. Upload the file again.");
    return f.meta;
  }

  /* ---------- Samples ---------- */

  /** The full spec of an agent in ws_wovi (a given version, or the current one), or not_found. */
  async requireAgent(caller: Principal, agentId: string, version?: string): Promise<AgentSpec> {
    const spec = await this.opts.agents.getForEdit(caller, this.workspaceId, agentId, version);
    if (!spec) throw new AccountError("not_found", NOT_FOUND);
    return spec;
  }

  async listSamples(caller: Principal, agentId: string): Promise<Sample[]> {
    await this.requireBuilder(caller);
    return (await this.opts.store.samples.find({ workspaceId: this.workspaceId, agentId })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** A golden (or bad) sample. Its inputs must fit the agent's current form, so the test bench can run it. */
  async addSample(caller: Principal, agentId: string, input: SampleInput): Promise<Sample> {
    const user = await this.requireBuilder(caller);
    const spec = await this.requireAgent(caller, agentId);
    const existing = await this.opts.store.samples.find({ workspaceId: this.workspaceId, agentId });
    if (existing.length >= BUILDER_LIMITS.samplesPerAgent) {
      throw new AccountError("invalid_request", `An agent keeps at most ${BUILDER_LIMITS.samplesPerAgent} samples. Remove one first.`);
    }
    const sample: Sample = { ...(await this.checkSample(spec, input, existing.length)), id: newId("smp"), createdBy: user.id, createdAt: this.iso() };
    await this.opts.store.samples.insert(sample);
    return sample;
  }

  /**
   * Rewrites a sample made from a clip with the clip's current text, against
   * the agent's current form. The id, the author and the creation time stay,
   * so benches that ran it still point at it. Hand-made samples are left to
   * the builder (remove and add again).
   */
  async updateClipSample(caller: Principal, agentId: string, sampleId: string, input: SampleInput): Promise<Sample> {
    await this.requireBuilder(caller);
    const s = await this.opts.store.samples.get(sampleId);
    if (!s || s.workspaceId !== this.workspaceId || s.agentId !== agentId || !s.clip) throw new AccountError("not_found", NOT_FOUND);
    const spec = await this.requireAgent(caller, agentId);
    const next: Sample = { ...s, ...(await this.checkSample(spec, { ...input, clip: input.clip ?? s.clip }, 0)), updatedAt: this.iso() };
    await this.opts.store.samples.update(next);
    return next;
  }

  /**
   * Rewrites a hand-made sample in place (the launch installer refreshes its
   * own samples when a launch version changes their shape). The id, the
   * author and the creation time stay; `updatedAt` is set. Clip samples
   * follow their clip instead.
   */
  async rewriteSample(caller: Principal, agentId: string, sampleId: string, input: SampleInput): Promise<Sample> {
    await this.requireBuilder(caller);
    const s = await this.opts.store.samples.get(sampleId);
    if (!s || s.workspaceId !== this.workspaceId || s.agentId !== agentId || s.clip) throw new AccountError("not_found", NOT_FOUND);
    const spec = await this.requireAgent(caller, agentId);
    const next: Sample = { ...s, ...(await this.checkSample(spec, input, 0)), updatedAt: this.iso() };
    await this.opts.store.samples.update(next);
    return next;
  }

  private async checkSample(spec: AgentSpec, input: SampleInput, count: number): Promise<Omit<Sample, "id" | "createdBy" | "createdAt">> {
    const agentId = spec.id;
    const label = input.label ?? "gold";
    if (!SAMPLE_LABELS.includes(label)) throw new AccountError("invalid_request", "A sample is gold or bad.");
    const checked = validateRunInputs(spec, input.inputs ?? {});
    if (!checked.ok) throw new AccountError("invalid_request", `The sample's inputs do not fit the agent's form: ${checked.errors.join(" ")}`);
    const idealOutput = cleanText(input.idealOutput, BUILDER_LIMITS.sampleOutput + 1);
    if (!idealOutput) throw new AccountError("invalid_request", label === "gold" ? "Add the ideal output." : "Add the output to avoid.");
    if (idealOutput.length > BUILDER_LIMITS.sampleOutput) throw new AccountError("invalid_request", `The output is longer than ${BUILDER_LIMITS.sampleOutput} characters.`);
    const links = (input.links ?? []).map(cleanLink);
    if (links.some((l) => l === null)) throw new AccountError("invalid_request", "Every link must be a full http or https address.");
    if (links.length > BUILDER_LIMITS.sampleLinks) throw new AccountError("invalid_request", `At most ${BUILDER_LIMITS.sampleLinks} links per sample.`);
    const fileIds = input.fileIds ?? [];
    if (fileIds.length > BUILDER_LIMITS.sampleFiles) throw new AccountError("invalid_request", `At most ${BUILDER_LIMITS.sampleFiles} files per sample.`);
    const files: StoredFile[] = [];
    for (const id of fileIds) files.push(await this.fileMeta(id));

    return {
      workspaceId: this.workspaceId,
      agentId,
      version: spec.version,
      label,
      title: cleanText(input.title, BUILDER_LIMITS.sampleTitle) || `Sample ${count + 1}`,
      inputs: checked.value,
      idealOutput,
      note: cleanText(input.note, BUILDER_LIMITS.sampleNote),
      links: links as string[],
      files,
      ...(input.clip ? { clip: { id: String(input.clip.id), name: cleanText(input.clip.name, 120), posterId: input.clip.posterId ?? null } } : {}),
    };
  }

  async removeSample(caller: Principal, agentId: string, sampleId: string): Promise<void> {
    await this.requireBuilder(caller);
    const s = await this.opts.store.samples.get(sampleId);
    if (!s || s.workspaceId !== this.workspaceId || s.agentId !== agentId) throw new AccountError("not_found", NOT_FOUND);
    await this.opts.store.samples.delete(sampleId);
    for (const f of s.files) await this.opts.files.delete(this.workspaceId, f.id);
  }

  /* ---------- Mood board ---------- */

  async listForAgent(workspaceId: string, agentId: string): Promise<BoardItem[]> {
    if (workspaceId !== this.workspaceId) return [];
    return (await this.opts.store.boardItems.find({ workspaceId, agentId })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listBoard(caller: Principal, agentId: string): Promise<BoardItem[]> {
    await this.requireBuilder(caller);
    return this.listForAgent(this.workspaceId, agentId);
  }

  async addBoardItem(caller: Principal, agentId: string, input: BoardInput): Promise<BoardItem> {
    const user = await this.requireBuilder(caller);
    await this.requireAgent(caller, agentId);
    const existing = await this.opts.store.boardItems.find({ workspaceId: this.workspaceId, agentId });
    if (existing.length >= BUILDER_LIMITS.boardItemsPerAgent) {
      throw new AccountError("invalid_request", `A board keeps at most ${BUILDER_LIMITS.boardItemsPerAgent} items. Remove one first.`);
    }
    if (!BOARD_KINDS.includes(input.kind)) throw new AccountError("invalid_request", "A board item is an image, a link, a text snippet or a colour swatch.");
    const item: BoardItem = {
      id: newId("brd"),
      workspaceId: this.workspaceId,
      agentId,
      kind: input.kind,
      note: cleanText(input.note, BUILDER_LIMITS.boardNote),
      url: null,
      text: null,
      color: null,
      file: null,
      createdBy: user.id,
      createdAt: this.iso(),
    };
    switch (input.kind) {
      case "link": {
        item.url = cleanLink(input.url);
        if (!item.url) throw new AccountError("invalid_request", "Add a full http or https link.");
        break;
      }
      case "text": {
        item.text = cleanText(input.text, BUILDER_LIMITS.boardText + 1);
        if (!item.text) throw new AccountError("invalid_request", "Add the text.");
        if (item.text.length > BUILDER_LIMITS.boardText) throw new AccountError("invalid_request", `A snippet is at most ${BUILDER_LIMITS.boardText} characters.`);
        break;
      }
      case "swatch": {
        const c = typeof input.color === "string" ? input.color.trim() : "";
        if (!HEX.test(c)) throw new AccountError("invalid_request", "A swatch is a colour like #FF5A1F.");
        item.color = c.toUpperCase();
        break;
      }
      case "image": {
        const meta = await this.fileMeta(input.fileId);
        if (checkFile("image", meta)) throw new AccountError("invalid_request", "A board image must be a PNG, JPEG, WebP or GIF.");
        item.file = meta;
        break;
      }
    }
    await this.opts.store.boardItems.insert(item);
    return item;
  }

  async removeBoardItem(caller: Principal, agentId: string, itemId: string): Promise<void> {
    await this.requireBuilder(caller);
    const item = await this.opts.store.boardItems.get(itemId);
    if (!item || item.workspaceId !== this.workspaceId || item.agentId !== agentId) throw new AccountError("not_found", NOT_FOUND);
    await this.opts.store.boardItems.delete(itemId);
    if (item.file) await this.opts.files.delete(this.workspaceId, item.file.id);
  }
}
