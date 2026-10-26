/**
 * BrandBrains: every call names its caller and a workspace, and the phase 4
 * policy decides. Members read (view); editors and up edit
 * (edit_brand_brain). Someone outside the workspace gets not_found.
 *
 * Every edit saves a new immutable version with who saved it and which
 * fields changed; nothing is ever overwritten, so the history shows who
 * changed what and any version can be restored (as a new version).
 *
 * The profile flow: `propose` reads 3 to 5 past posts into a proposal (on
 * the fake provider by default) and keeps it as an open job; `accept` takes
 * the person's reviewed and edited version of it and only then saves a Brand
 * Brain, or a new version of one.
 */
import type { Accounts, Principal } from "@/lib/accounts/accounts";
import { newId } from "@/lib/accounts/crypto";
import { savedBy } from "@/lib/accounts/guard";
import type { BrandBrainSource } from "@/lib/runs/brand-brain";
import { lineDiff, type DiffLine } from "@/lib/builder/diff";
import { checkFile, type FileStorage, type StoredFile } from "@/lib/builder/storage";
import { PLATFORMS, type Platform } from "@/lib/agents/catalog";
import type { LinkFetcher, ProfileProposer } from "./profile";
import { defaultBrain, storeBrainSource } from "./source";
import type { BrandStore } from "./store";
import { BODY_FIELDS, BRAND_LIMITS, FIELD_LABELS, emptyBody, type BodyField, type Brain, type BrainBody, type BrainVersion, type PastPost, type ProfileProposal, type Proposal } from "./types";
import { checkBody, cleanLink, cleanText } from "./validate";
import type { RunCredits } from "@/lib/credits/types";
import { BillingRefusal } from "@/lib/runs/billing";

export type BrandErrorCode = "invalid_body" | "invalid_request" | "not_found" | "no_change" | "version_conflict" | "limit";

export class BrandError extends Error {
  constructor(
    readonly code: BrandErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "BrandError";
  }
}

export type BrainSummary = Brain & {
  niche: string;
  platforms: Platform[];
  /** The voice in its own words. */
  voice: string;
  tone: string[];
  references: number;
  moodItems: number;
  rules: number;
  /** The first image or swatches of the mood board, for the list's thumbnails. */
  swatches: string[];
  /** Who saved the current version. */
  by: string;
};

export type BrainView = { brain: Brain; body: BrainBody; version: BrainVersion; by: string };

export type FieldDiff = { field: BodyField; label: string; lines: DiffLine[] };

export type HistoryEntry = {
  version: number;
  note: string;
  by: string;
  at: string;
  current: boolean;
  changed: BodyField[];
  /** The changed fields against the version before, line by line. */
  diff: FieldDiff[];
};

export type ProposeInput = {
  name?: string;
  niche?: string;
  platforms?: string[];
  /** Each is a pasted post, or a link on its own. */
  posts: string[];
  /** Rebuild this Brand Brain instead of making a new one. */
  brainId?: string;
  /**
   * Have the AI model read the posts, for credits (shown first with
   * `readQuote`). Left out or false where reads are charged: plain counts
   * only, free.
   */
  useModel?: boolean;
  /** The estimate the person was shown. The read never holds or costs more. */
  quotedCredits?: number;
};

/** How a Brand Brain bills the AI read of past posts. The credits service implements it. */
export interface ReadBilling {
  estimateJob(typicalMicroUsd: number, capMicroUsd: number): number;
  reserveJob(input: { workspaceId: string; jobId: string; estimate: number; userId: string | null; label: string }): Promise<RunCredits>;
  settleJob(workspaceId: string, c: RunCredits, result: { done: boolean; costMicroUsd: number }): Promise<RunCredits>;
  balance(workspaceId: string): Promise<{ paid: number }>;
}

/** What reading past posts with the AI costs here, before anything runs. */
export type ReadQuote =
  /** Reads are charged: about this many credits at most, from the workspace's paid credits. */
  | { mode: "credits"; credits: number; available: number }
  /** A local app with no billing: the model reads for free, as in development. */
  | { mode: "free" }
  /** No model can read here: plain counts only. */
  | { mode: "off" };

/** Model reads per person and per workspace, so nobody can run up a bill by clicking. */
export const READ_LIMITS = { perUserHour: { max: 10, windowMs: 3_600_000 }, perWorkspaceDay: { max: 40, windowMs: 86_400_000 } } as const;

/** What the person may change before a proposal is saved. */
export type ProposalEdits = Partial<Pick<BrainBody, "name" | "niche" | "platforms" | "voice" | "topics" | "dos" | "donts" | "idea">>;

export type BrandBrainsOptions = {
  accounts: Accounts;
  store: BrandStore;
  files: FileStorage;
  proposer: ProfileProposer;
  /** Reads links in past posts. Left out, links are kept as references and not read. */
  fetcher?: LinkFetcher;
  now?: () => Date;
  /**
   * Charges the AI read of past posts in credits, like a run (product doc:
   * "no general free trial"). Left out, the model reads only on a local app
   * (`freeModelReads`); a server without billing reads with plain counts.
   */
  billing?: ReadBilling | null;
  /** Without billing: may the model read for free? Only on a local app. Defaults to false. */
  freeModelReads?: boolean;
};

const NOT_FOUND = "No such Brand Brain in this workspace.";
/** Who the example Brand Brains from `npm run brains:seed` name as their author. */
export const SEED_AUTHOR = "seed";
const PLATFORM_LABELS: Record<Platform, string> = { x: "X", tiktok: "TikTok", shorts: "YouTube Shorts", reels: "Instagram Reels" };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A body field as lines of plain text, for the history's diff. */
export function fieldLines(body: BrainBody, field: BodyField): string {
  const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);
  switch (field) {
    case "name":
    case "niche":
    case "idea":
      return body[field];
    case "platforms":
      return body.platforms.map((p) => PLATFORM_LABELS[p]).join(", ");
    case "voice": {
      const v = body.voice;
      return [`Description: ${v.description}`, `Tone: ${v.tone.join(", ")}`, `Use: ${v.use.join(", ")}`, `Avoid: ${v.avoid.join(", ")}`, ...v.samples.map((s) => `Sample: ${s}`)].join("\n");
    }
    case "topics":
    case "dos":
    case "donts":
      return body[field].join("\n");
    case "references":
      return body.references.map((r) => [r.text ? `"${short(r.text.replace(/\s+/g, " "))}"` : null, r.url, r.note ? `why: ${r.note}` : null].filter(Boolean).join(" · ")).join("\n");
    case "moodBoard":
      return body.moodBoard.map((m) => `${m.kind}: ${m.kind === "image" ? (m.file?.name ?? "") : m.kind === "swatch" ? m.color : m.kind === "link" ? m.url : short(m.text ?? "")}${m.note ? ` (${m.note})` : ""}`).join("\n");
  }
}

export function changedFields(a: BrainBody | null, b: BrainBody): BodyField[] {
  return BODY_FIELDS.filter((f) => !a || !same(a[f], b[f]));
}

/** What the person sees of a proposal: no model, tokens or cost, as with runs. */
export type PublicProposal = Omit<Proposal, "model" | "tokensIn" | "tokensOut" | "costMicroUsd" | "createdBy">;

export function publicProposal(p: Proposal): PublicProposal {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { model, tokensIn, tokensOut, costMicroUsd, createdBy, ...rest } = p;
  return rest;
}

export class BrandBrains {
  private readonly now: () => Date;

  constructor(private readonly opts: BrandBrainsOptions) {
    this.now = opts.now ?? (() => new Date());
  }

  /** The source the run engine reads. */
  source(): BrandBrainSource {
    return storeBrainSource(this.opts.store);
  }

  private iso() {
    return this.now().toISOString();
  }

  private async who(by: string): Promise<string> {
    if (by.startsWith("key:")) return "An API key";
    if (by === SEED_AUTHOR) return "WOVI";
    const u = await this.opts.accounts.getUser(by);
    return u?.name ?? u?.email ?? "Someone";
  }

  private async row(workspaceId: string, id: string): Promise<Brain> {
    const brain = typeof id === "string" ? await this.opts.store.brains.get(id) : null;
    if (!brain || brain.workspaceId !== workspaceId) throw new BrandError("not_found", NOT_FOUND);
    return brain;
  }

  private async version(brain: Brain, version = brain.currentVersion): Promise<BrainVersion> {
    const v = await this.opts.store.brainVersions.get(`${brain.id}@${version}`);
    if (!v || v.workspaceId !== brain.workspaceId) throw new BrandError("not_found", `No version ${version} of this Brand Brain.`);
    return v;
  }

  /* ---------- Reading ---------- */

  async list(caller: Principal, workspaceId: string): Promise<BrainSummary[]> {
    await this.opts.accounts.authorize(caller, workspaceId, "view");
    const rows = await this.opts.store.brains.find({ workspaceId });
    const out: BrainSummary[] = [];
    for (const b of rows) {
      const v = await this.version(b);
      out.push({
        ...b,
        niche: v.body.niche,
        platforms: v.body.platforms,
        voice: v.body.voice.description,
        tone: v.body.voice.tone,
        references: v.body.references.length,
        moodItems: v.body.moodBoard.length,
        rules: v.body.dos.length + v.body.donts.length,
        swatches: v.body.moodBoard.filter((m) => m.kind === "swatch").map((m) => m.color!).slice(0, 5),
        by: await this.who(v.by),
      });
    }
    return out.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  }

  async get(caller: Principal, workspaceId: string, id: string, version?: number): Promise<BrainView> {
    await this.opts.accounts.authorize(caller, workspaceId, "view");
    const brain = await this.row(workspaceId, id);
    const v = await this.version(brain, version);
    return { brain, body: v.body, version: v, by: await this.who(v.by) };
  }

  /** Every version, newest first, with who saved it and what changed. */
  async history(caller: Principal, workspaceId: string, id: string): Promise<HistoryEntry[]> {
    await this.opts.accounts.authorize(caller, workspaceId, "view");
    const brain = await this.row(workspaceId, id);
    const versions = (await this.opts.store.brainVersions.find({ workspaceId, brainId: id })).sort((a, b) => a.version - b.version);
    const out: HistoryEntry[] = [];
    versions.forEach((v, i) => {
      const prev = i > 0 ? versions[i - 1].body : null;
      out.push({
        version: v.version,
        note: v.note,
        by: v.by,
        at: v.at,
        current: v.version === brain.currentVersion,
        changed: v.changed,
        diff: prev ? v.changed.map((f) => ({ field: f, label: FIELD_LABELS[f], lines: lineDiff(fieldLines(prev, f), fieldLines(v.body, f)) })) : [],
      });
    });
    for (const e of out) e.by = await this.who(e.by);
    return out.reverse();
  }

  /* ---------- Writing ---------- */

  /** A new Brand Brain at version 1. The workspace's first one becomes its default. */
  async create(caller: Principal, workspaceId: string, body: Partial<BrainBody>, opts: { note?: string } = {}): Promise<BrainView> {
    await this.opts.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const existing = await this.opts.store.brains.find({ workspaceId });
    if (existing.length >= BRAND_LIMITS.brainsPerWorkspace) throw new BrandError("limit", `A workspace keeps at most ${BRAND_LIMITS.brainsPerWorkspace} Brand Brains.`);
    const value = await this.checked(workspaceId, { ...emptyBody(), ...body }, null);
    const at = this.iso();
    const brain: Brain = { id: newId("bb"), workspaceId, name: value.name, isDefault: existing.length === 0, currentVersion: 1, createdBy: savedBy(caller), createdAt: at, updatedAt: at };
    const v: BrainVersion = { id: `${brain.id}@1`, workspaceId, brainId: brain.id, version: 1, body: value, note: cleanText(opts.note).slice(0, BRAND_LIMITS.versionNote) || "Created", changed: [...BODY_FIELDS], by: savedBy(caller), at };
    await this.opts.store.brainVersions.insert(v);
    await this.opts.store.brains.insert(brain);
    return { brain, body: value, version: v, by: await this.who(v.by) };
  }

  /**
   * Merges the changed fields onto the current version and saves the next
   * version. With `baseVersion`, a save on top of an older version than the
   * current one is refused, so two editors never overwrite each other.
   */
  async save(caller: Principal, workspaceId: string, id: string, changes: Partial<BrainBody>, opts: { note?: string; baseVersion?: number } = {}): Promise<BrainView> {
    await this.opts.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const brain = await this.row(workspaceId, id);
    if (opts.baseVersion !== undefined && opts.baseVersion !== brain.currentVersion) {
      throw new BrandError("version_conflict", `Someone saved version ${brain.currentVersion} since you opened this. Reload to see it, then make your change again.`);
    }
    const current = await this.version(brain);
    const picked = Object.fromEntries(Object.entries(changes ?? {}).filter(([k]) => (BODY_FIELDS as readonly string[]).includes(k)));
    const value = await this.checked(workspaceId, { ...current.body, ...picked }, current.body);
    const changed = changedFields(current.body, value);
    if (!changed.length) throw new BrandError("no_change", "Nothing changed, so no new version was saved.");
    return this.write(caller, brain, value, changed, cleanText(opts.note) || `Edited ${changed.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")}`);
  }

  /** Makes an old version current again, as a new version on top. */
  async restore(caller: Principal, workspaceId: string, id: string, version: number): Promise<BrainView> {
    await this.opts.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const brain = await this.row(workspaceId, id);
    const old = await this.version(brain, version);
    const current = await this.version(brain);
    const changed = changedFields(current.body, old.body);
    if (!changed.length) throw new BrandError("no_change", `Version ${version} is the same as the current one.`);
    return this.write(caller, brain, old.body, changed, `Restored version ${version}`);
  }

  private async write(caller: Principal, brain: Brain, body: BrainBody, changed: BodyField[], note: string): Promise<BrainView> {
    const at = this.iso();
    const next = brain.currentVersion + 1;
    const v: BrainVersion = { id: `${brain.id}@${next}`, workspaceId: brain.workspaceId, brainId: brain.id, version: next, body, note: note.slice(0, BRAND_LIMITS.versionNote), changed, by: savedBy(caller), at };
    // The version goes in first; the row moves only if nobody moved it meanwhile.
    await this.opts.store.brainVersions.insert(v);
    const moved = await this.opts.store.brains.updateIf(brain.id, { currentVersion: brain.currentVersion }, { currentVersion: next, name: body.name, updatedAt: at });
    if (!moved) {
      await this.opts.store.brainVersions.delete(v.id);
      throw new BrandError("version_conflict", "Someone saved a newer version at the same moment. Reload and try again.");
    }
    return { brain: moved, body, version: v, by: await this.who(v.by) };
  }

  async setDefault(caller: Principal, workspaceId: string, id: string): Promise<Brain> {
    await this.opts.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const brain = await this.row(workspaceId, id);
    for (const b of await this.opts.store.brains.find({ workspaceId, isDefault: true })) {
      if (b.id !== id) await this.opts.store.brains.updateIf(b.id, {}, { isDefault: false });
    }
    return (await this.opts.store.brains.updateIf(brain.id, {}, { isDefault: true }))!;
  }

  /** Deletes a Brand Brain and its versions. Runs keep their reference. The next oldest becomes the default. */
  async remove(caller: Principal, workspaceId: string, id: string): Promise<void> {
    await this.opts.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const brain = await this.row(workspaceId, id);
    for (const v of await this.opts.store.brainVersions.find({ workspaceId, brainId: id })) await this.opts.store.brainVersions.delete(v.id);
    await this.opts.store.brains.delete(id);
    if (brain.isDefault) {
      const next = await defaultBrain(this.opts.store, workspaceId);
      if (next) await this.opts.store.brains.updateIf(next.id, {}, { isDefault: true });
    }
  }

  /** Validates a body and resolves mood board images against the workspace's files. */
  private async checked(workspaceId: string, input: unknown, before: BrainBody | null): Promise<BrainBody> {
    const r = checkBody(input);
    if (!r.ok) throw new BrandError("invalid_body", "Some fields need a fix.", r.errors);
    const known = new Map((before?.moodBoard ?? []).filter((m) => m.file).map((m) => [m.file!.id, m.file!]));
    for (const item of r.value.moodBoard) {
      if (item.kind !== "image" || !item.file) continue;
      const meta = known.get(item.file.id) ?? (await this.opts.files.get(workspaceId, item.file.id))?.meta;
      if (!meta) throw new BrandError("invalid_body", "Some fields need a fix.", ["moodBoard: An image is missing. Upload it again."]);
      if (checkFile("image", meta)) throw new BrandError("invalid_body", "Some fields need a fix.", ["moodBoard: A mood board image must be a PNG, JPEG, WebP or GIF."]);
      item.file = meta;
    }
    return r.value;
  }

  /* ---------- Files ---------- */

  /** An image for a mood board, kept under the workspace. Same limits as the builder's boards. */
  async putImage(caller: Principal, workspaceId: string, file: { name: string; mimeType: string; bytes: Uint8Array }): Promise<StoredFile> {
    await this.opts.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const problem = checkFile("image", { name: file.name, mimeType: file.mimeType, sizeBytes: file.bytes.byteLength });
    if (problem) throw new BrandError("invalid_request", problem);
    return this.opts.files.put(workspaceId, file);
  }

  async getFile(caller: Principal, workspaceId: string, fileId: string): Promise<{ meta: StoredFile; bytes: Uint8Array } | null> {
    await this.opts.accounts.authorize(caller, workspaceId, "view");
    return this.opts.files.get(workspaceId, fileId);
  }

  /* ---------- The profile from past posts ---------- */

  /** Reads 3 to 5 past posts into a proposal. Nothing is saved as a Brand Brain yet. */
  async propose(caller: Principal, workspaceId: string, input: ProposeInput): Promise<Proposal> {
    await this.opts.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    if (input.brainId) await this.row(workspaceId, input.brainId);
    const L = BRAND_LIMITS;
    const raw = (Array.isArray(input.posts) ? input.posts : []).map(cleanText).filter(Boolean);
    if (raw.length < L.postsMin || raw.length > L.postsMax) {
      throw new BrandError("invalid_request", `Paste ${L.postsMin} to ${L.postsMax} past posts or links (now ${raw.length}).`);
    }
    const long = raw.findIndex((p) => p.length > L.postText);
    if (long >= 0) throw new BrandError("invalid_request", `Post ${long + 1} is longer than ${L.postText} characters.`);
    const posts: PastPost[] = raw.map((p) => (/^\S+$/.test(p) && cleanLink(p) ? { text: "", url: cleanLink(p) } : { text: p, url: null }));
    const unread: string[] = [];
    for (const p of posts.filter((x) => x.url)) {
      if (!this.opts.fetcher) {
        unread.push(`${p.url}: links are not read yet, so it is kept as a reference only.`);
        continue;
      }
      try {
        const text = await this.opts.fetcher.fetchText(p.url!, AbortSignal.timeout(10_000));
        if (text?.trim()) p.text = text.trim().slice(0, L.postText);
        else unread.push(`${p.url}: no text could be read.`);
      } catch {
        unread.push(`${p.url}: could not be read.`);
      }
    }
    const texts = posts.map((p) => p.text).filter(Boolean);
    if (!texts.length) throw new BrandError("invalid_request", "Paste the text of at least one post. Links alone are not read yet.");

    const platforms = (input.platforms ?? []).filter((p): p is Platform => PLATFORMS.includes(p as Platform));
    const proposalId = newId("prp");
    const { result: r, charge } = await this.read(caller, workspaceId, proposalId, texts, input);
    const before = input.brainId ? (await this.get(caller, workspaceId, input.brainId)).body : null;
    const proposal: Proposal = {
      id: proposalId,
      workspaceId,
      brainId: input.brainId ?? null,
      name: cleanText(input.name).slice(0, L.name) || before?.name || "My brand",
      niche: cleanText(input.niche).slice(0, L.niche) || before?.niche || "",
      platforms: platforms.length ? platforms : (before?.platforms ?? []),
      posts,
      unread,
      signals: r.signals,
      profile: r.profile,
      source: r.source,
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costMicroUsd: r.costMicroUsd,
      notes: r.notes,
      status: "open",
      savedBrainId: null,
      createdBy: savedBy(caller),
      createdAt: this.iso(),
      ...(charge ? { charge } : {}),
    };
    await this.opts.store.proposals.insert(proposal);
    return proposal;
  }

  /** How reads are paid for here: charged in credits, free (a local app), or off (plain counts only). */
  private readMode(): ReadQuote["mode"] {
    const reads = this.opts.proposer.modelReads?.() ?? "real";
    if (reads === "none") return "off";
    if (reads === "fake") return "free";
    if (this.opts.billing) return "credits";
    return this.opts.freeModelReads ? "free" : "off";
  }

  /** What reading these posts (or typical ones) with the AI would cost, shown before the person asks for it. */
  async readQuote(caller: Principal, workspaceId: string, posts: string[] = []): Promise<ReadQuote> {
    await this.opts.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const mode = this.readMode();
    if (mode !== "credits") return { mode };
    const b = this.opts.billing!;
    return { mode, credits: b.estimateJob(this.opts.proposer.estimateMicroUsd(posts), this.opts.proposer.capMicroUsd()), available: (await b.balance(workspaceId)).paid };
  }

  /**
   * The read itself. Charged reads hold their estimate first and are charged
   * the real cost after (nothing when the model did not answer); without
   * enough credits the posts are read with plain counts instead. Model reads
   * are also limited per person and per workspace.
   */
  private async read(caller: Principal, workspaceId: string, jobId: string, texts: string[], input: ProposeInput) {
    const mode = this.readMode();
    const plain = (note?: string) => this.opts.proposer.propose(texts, { model: false }).then((result) => ({ result: note ? { ...result, notes: [note] } : result, charge: null }));
    if (mode === "off") return plain(this.opts.billing ? undefined : "Read with plain counts: no AI model reads posts on this server yet.");
    if (mode === "credits" && input.useModel !== true) return plain();
    if (this.opts.proposer.modelReads?.() === "real") {
      const userId = caller.kind === "user" ? caller.userId : null;
      try {
        if (userId) await this.opts.accounts.limiter.hit(`brand-read:user:${userId}`, READ_LIMITS.perUserHour, "You asked the AI to read posts many times this hour. Wait a little, or read with plain counts.");
        await this.opts.accounts.limiter.hit(`brand-read:ws:${workspaceId}`, READ_LIMITS.perWorkspaceDay, "This workspace asked the AI to read posts many times today. Try again tomorrow, or read with plain counts.");
      } catch (err) {
        if ((err as { code?: string })?.code === "rate_limited") throw new BrandError("limit", (err as Error).message);
        throw err;
      }
    }
    if (mode === "free") return { result: await this.opts.proposer.propose(texts), charge: null };

    const b = this.opts.billing!;
    let estimate = b.estimateJob(this.opts.proposer.estimateMicroUsd(texts), this.opts.proposer.capMicroUsd());
    if (input.quotedCredits !== undefined) {
      if (!Number.isInteger(input.quotedCredits) || input.quotedCredits < 1) throw new BrandError("invalid_request", "The quoted estimate must be a whole number of credits.");
      estimate = Math.min(estimate, input.quotedCredits);
    }
    let hold: RunCredits;
    try {
      hold = await b.reserveJob({ workspaceId, jobId, estimate, userId: caller.kind === "user" ? caller.userId : null, label: "Read past posts for a Brand Brain" });
    } catch (err) {
      if (!(err instanceof BillingRefusal)) throw err;
      return plain(`The AI read needs up to ${estimate} credit${estimate === 1 ? "" : "s"}: ${err.message} Read with plain counts instead, for free. Top up to have the AI read them.`);
    }
    let result;
    try {
      result = await this.opts.proposer.propose(texts);
    } catch (err) {
      await b.settleJob(workspaceId, hold, { done: false, costMicroUsd: 0 });
      throw err;
    }
    const settled = await b.settleJob(workspaceId, hold, { done: result.source === "model", costMicroUsd: result.costMicroUsd });
    const charged = settled.charged ?? 0;
    return { result, charge: { estimate, charged, state: charged > 0 ? ("charged" as const) : ("refunded" as const) } };
  }

  async getProposal(caller: Principal, workspaceId: string, id: string): Promise<Proposal> {
    await this.opts.accounts.authorize(caller, workspaceId, "edit_brand_brain");
    const p = typeof id === "string" ? await this.opts.store.proposals.get(id) : null;
    if (!p || p.workspaceId !== workspaceId) throw new BrandError("not_found", "That proposal is gone. Paste the posts again.");
    return p;
  }

  /**
   * Saves a reviewed proposal: the person's edits win over the proposal. A
   * new Brand Brain gets the posts as its references; a rebuild saves a new
   * version and adds the posts it does not have yet. A proposal saves once.
   */
  async accept(caller: Principal, workspaceId: string, proposalId: string, edits: ProposalEdits = {}): Promise<BrainView> {
    const p = await this.getProposal(caller, workspaceId, proposalId);
    if (p.status !== "open") throw new BrandError("invalid_request", "This proposal was already saved.");
    const profile: ProfileProposal & Pick<BrainBody, "name" | "niche" | "platforms"> = { name: p.name, niche: p.niche, platforms: p.platforms, ...p.profile };
    const pick = <K extends keyof ProposalEdits>(k: K) => (edits[k] !== undefined ? edits[k] : (profile as Partial<BrainBody>)[k]);
    const refs = p.posts.map((x) => ({ text: x.text, url: x.url, note: "Past post" }));
    const fields: Partial<BrainBody> = { name: pick("name"), niche: pick("niche"), platforms: pick("platforms"), voice: pick("voice"), topics: pick("topics"), dos: pick("dos"), donts: pick("donts") };
    if (edits.idea !== undefined) fields.idea = edits.idea;

    // Checked before the proposal is taken, so a bad edit leaves it open to fix.
    const base = p.brainId ? (await this.get(caller, workspaceId, p.brainId)).body : emptyBody();
    const known = new Set(base.references.map((r) => `${r.text}|${r.url}`));
    const merged = { ...base, ...fields, references: [...base.references, ...refs.filter((r) => !known.has(`${r.text}|${r.url}`))] };
    const r = checkBody(merged);
    if (!r.ok) throw new BrandError("invalid_body", "Some fields need a fix.", r.errors);

    const taken = await this.opts.store.proposals.updateIf(p.id, { status: "open" }, { status: "saved" });
    if (!taken) throw new BrandError("invalid_request", "This proposal was already saved.");
    try {
      const note = `${p.brainId ? "Rebuilt" : "Built"} from ${p.posts.length} past posts`;
      const saved = p.brainId ? await this.save(caller, workspaceId, p.brainId, r.value, { note }) : await this.create(caller, workspaceId, r.value, { note });
      await this.opts.store.proposals.updateIf(p.id, {}, { savedBrainId: saved.brain.id });
      return saved;
    } catch (err) {
      await this.opts.store.proposals.updateIf(p.id, {}, { status: "open" });
      throw err;
    }
  }
}
