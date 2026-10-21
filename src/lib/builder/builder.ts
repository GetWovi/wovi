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

export type SampleInput = {
  label?: SampleLabel;
  title?: string;
  inputs: Record<string, unknown>;
  idealOutput: string;
  note?: string;
  links?: string[];
  fileIds?: string[];
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
  now?: () => Date;
};

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
  private readonly now: () => Date;

  constructor(private readonly opts: BuilderOptions) {
    this.now = opts.now ?? (() => new Date());
    this.bench = new AgentBench(this);
    this.versions = new AgentVersions(this);
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
    return { spec, row, versions, samples, board };
  }

  /** A full spec drafted from a plain description. Nothing is saved. */
  async draft(caller: Principal, description: string): Promise<DraftResult> {
    await this.requireBuilder(caller);
    const text = cleanText(description, DESCRIPTION_MAX);
    if (text.length < 3) throw new AccountError("invalid_request", "Describe the agent in a sentence or two first.");
    const existingIds = (await this.opts.agents.rows(caller, this.workspaceId)).map((r) => r.id);
    return this.opts.drafter.draft({ description: text, existingIds });
  }

  /** Saves a draft (or any spec) as a new agent in ws_wovi, owned by the platform, as a draft. */
  async createAgent(caller: Principal, input: CreateInput, note = "Drafted in the builder"): Promise<AgentSpec> {
    await this.requireBuilder(caller);
    const spec: CreateInput = { ...input, owner: { kind: "platform", creatorId: PLATFORM_CREATOR_ID }, status: "draft" };
    return this.opts.agents.create(caller, this.workspaceId, spec, { note });
  }

  /** Saves changes as a new version, which is then current and starts unscored. Refuses a save that changes nothing. */
  async saveAgent(caller: Principal, id: string, changes: UpdateInput, opts: { bump?: Bump; note?: string } = {}): Promise<AgentSpec> {
    await this.requireBuilder(caller);
    await this.opts.agents.update(caller, this.workspaceId, id, changes, opts);
    return this.bench.refreshQuality(caller, id);
  }

  async publish(caller: Principal, id: string): Promise<AgentSpec> {
    await this.requireBuilder(caller);
    return this.opts.agents.setStatus(caller, this.workspaceId, id, "live");
  }

  async unpublish(caller: Principal, id: string): Promise<AgentSpec> {
    await this.requireBuilder(caller);
    return this.opts.agents.setStatus(caller, this.workspaceId, id, "draft");
  }

  async hide(caller: Principal, id: string): Promise<AgentSpec> {
    await this.requireBuilder(caller);
    return this.opts.agents.hide(caller, this.workspaceId, id);
  }

  async unhide(caller: Principal, id: string): Promise<AgentSpec> {
    await this.requireBuilder(caller);
    return this.opts.agents.unhide(caller, this.workspaceId, id);
  }

  /* ---------- Files ---------- */

  async putFile(caller: Principal, kind: FileKind, file: { name: string; mimeType: string; bytes: Uint8Array }): Promise<StoredFile> {
    await this.requireBuilder(caller);
    const problem = checkFile(kind, { name: file.name, mimeType: file.mimeType, sizeBytes: file.bytes.byteLength });
    if (problem) throw new AccountError("invalid_request", problem);
    return this.opts.files.put(this.workspaceId, file);
  }

  async getFile(caller: Principal, id: string): Promise<{ meta: StoredFile; bytes: Uint8Array } | null> {
    await this.requireBuilder(caller);
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

    const sample: Sample = {
      id: newId("smp"),
      workspaceId: this.workspaceId,
      agentId,
      version: spec.version,
      label,
      title: cleanText(input.title, BUILDER_LIMITS.sampleTitle) || `Sample ${existing.length + 1}`,
      inputs: checked.value,
      idealOutput,
      note: cleanText(input.note, BUILDER_LIMITS.sampleNote),
      links: links as string[],
      files,
      createdBy: user.id,
      createdAt: this.iso(),
    };
    await this.opts.store.samples.insert(sample);
    return sample;
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
