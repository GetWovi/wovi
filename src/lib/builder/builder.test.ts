import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { stubBrandBrains } from "@/lib/runs/brand-brain";
import { RunEngine } from "@/lib/runs/engine";
import { fakeProvider } from "@/lib/runs/providers/fake";
import { memoryRunStore } from "@/lib/runs/store";
import { boardBrandBrains } from "./board-brain";
import { BUILDER_LIMITS } from "./types";
import { as, testBuilder } from "./test-helpers";

const png = (bytes = 100) => ({ name: "ref.png", mimeType: "image/png", bytes: new Uint8Array(bytes) });

describe("who may use the builder", () => {
  it("opens for a builder who joined with a code, and for nobody else", async () => {
    const t = await testBuilder();
    const { user, me } = await t.joinBuilder();
    expect((await t.builder.builderFor(me))?.id).toBe(user.id);
    const list = await t.builder.listAgents(me);
    expect(list.map((a) => a.id).sort()).toEqual(["caption-writer", "hashtag-picker", "hook-writer", "repurposer", "script-writer", "storyboarder", "trend-scout", "voice-and-cut"]);

    const ada = await t.signUp("ada@example.com");
    expect(await t.builder.builderFor(as(ada.user.id))).toBeNull();
    const err = await rejectsCode(t.builder.listAgents(as(ada.user.id)), "not_found");
    expect(err.message).not.toMatch(/builder/i);
    await rejectsCode(t.builder.draft(as(ada.user.id), "writes hooks"), "not_found");
    await rejectsCode(t.builder.getAgent(as(ada.user.id), "hook-writer"), "not_found");
    await rejectsCode(t.builder.addSample(as(ada.user.id), "hook-writer", { inputs: {}, idealOutput: "x" }), "not_found");
    await rejectsCode(t.builder.listBoard(as(ada.user.id), "hook-writer"), "not_found");
    await rejectsCode(t.builder.putFile(as(ada.user.id), "image", png()), "not_found");
    expect(await t.builder.builderFor({ kind: "api_key", keyId: "k", userId: ada.user.id, workspaceId: PLATFORM_WORKSPACE_ID, role: "admin" })).toBeNull();
    expect(await t.builder.builderFor(as("usr_missing"))).toBeNull();
  });
});

describe("drafting and saving agents", () => {
  it("drafts a valid spec from a description and saves it as a draft in ws_wovi", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    const draft = await t.builder.draft(me, "writes 10 scroll-stopping hooks for TikTok from a product idea, punchy, no clickbait");
    expect(draft.source).toBe("fake");
    // hook-writer is a seed, so the draft takes the next free id.
    expect(draft.spec.id).toBe("hook-writer-2");
    const created = await t.builder.createAgent(me, draft.spec);
    expect(created.status).toBe("draft");
    expect(created.owner.creatorId).toBe("creator_wovi");
    expect(await t.registry.get(PLATFORM_WORKSPACE_ID, "hook-writer-2")).not.toBeNull();
    expect(await t.registry.get("ws_other", "hook-writer-2")).toBeNull();
    expect((await t.builder.listAgents(me))[0]).toMatchObject({ id: "hook-writer-2", status: "draft", version: "1.0.0", versions: 1 });
    await rejectsCode(t.builder.draft(me, "  "), "invalid_request");
  });

  it("saves edits as a new version through the guarded registry", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    const before = await t.builder.getAgent(me, "hook-writer");
    expect(before?.versions).toHaveLength(1);
    const saved = await t.builder.saveAgent(me, "hook-writer", { name: "Hook Writer Pro" }, { note: "Rename" });
    expect(saved.version).toBe("1.0.1");
    const after = await t.builder.getAgent(me, "hook-writer");
    expect(after?.versions.map((v) => [v.version, v.current])).toEqual([
      ["1.0.0", false],
      ["1.0.1", true],
    ]);
    expect(after!.row.updatedAt > before!.row.updatedAt).toBe(true);
    await rejectsCode(t.builder.saveAgent(me, "hook-writer", { name: "Hook Writer Pro" }), "no_change");
    const bad = await rejectsCode(t.builder.saveAgent(me, "hook-writer", { tools: ["web_scrape"] }), "invalid_spec");
    expect(bad.message).toContain("Unknown tool");
    const minor = await t.builder.saveAgent(me, "hook-writer", { job: "Opens with one line." }, { bump: "minor" });
    expect(minor.version).toBe("1.1.0");
  });

  it("publishes, takes back and hides", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    expect((await t.builder.unpublish(me, "hook-writer")).status).toBe("draft");
    expect((await t.builder.publish(me, "hook-writer")).status).toBe("live");
    expect((await t.builder.hide(me, "hook-writer")).status).toBe("hidden");
    expect((await t.builder.unhide(me, "hook-writer")).status).toBe("live");
    await rejectsCode(t.builder.publish(me, "nope"), "not_found");
  });
});

describe("samples", () => {
  it("stores golden samples whose inputs fit the agent's form, with the spec version", async () => {
    const t = await testBuilder();
    const { user, me } = await t.joinBuilder();
    const s = await t.builder.addSample(me, "hook-writer", {
      inputs: { idea: "Gerald the sourdough starter turns nine", platform: "tiktok" },
      idealOutput: "1. Gerald is nine. He has never missed a bake.\n2. ...",
      note: "Specific, names the thing.",
      links: ["https://example.com/post/1"],
    });
    expect(s).toMatchObject({ workspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", version: "1.0.0", label: "gold", title: "Sample 1", createdBy: user.id });
    expect(s.inputs).toEqual({ idea: "Gerald the sourdough starter turns nine", platform: "tiktok" });
    expect((await t.builder.listSamples(me, "hook-writer")).map((x) => x.id)).toEqual([s.id]);
    expect((await t.builder.getAgent(me, "hook-writer"))?.samples).toBe(1);

    // After a save, new samples carry the new version; old ones keep theirs.
    await t.builder.saveAgent(me, "hook-writer", { name: "Hook Writer 2" });
    const s2 = await t.builder.addSample(me, "hook-writer", { label: "bad", title: "Generic", inputs: { idea: "A post about our new product launch", platform: "x" }, idealOutput: "Are you ready to level up?" });
    expect(s2.version).toBe("1.0.1");
    expect((await t.store.samples.get(s.id))?.version).toBe("1.0.0");

    await t.builder.removeSample(me, "hook-writer", s.id);
    expect(await t.builder.listSamples(me, "hook-writer")).toHaveLength(1);
    await rejectsCode(t.builder.removeSample(me, "caption-writer", s2.id), "not_found");
  });

  it("refuses inputs that do not fit, bad links, missing output and too many samples", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    const err = await rejectsCode(t.builder.addSample(me, "hook-writer", { inputs: { idea: "short", platform: "tiktok" }, idealOutput: "x" }), "invalid_request");
    expect(err.message).toMatch(/idea: Must be at least 10 characters/);
    await rejectsCode(t.builder.addSample(me, "hook-writer", { inputs: { idea: "Gerald the sourdough starter turns nine", platform: "tiktok" }, idealOutput: "  " }), "invalid_request");
    await rejectsCode(t.builder.addSample(me, "hook-writer", { inputs: { idea: "Gerald the sourdough starter turns nine", platform: "tiktok" }, idealOutput: "x", links: ["ftp://nope"] }), "invalid_request");
    await rejectsCode(t.builder.addSample(me, "hook-writer", { inputs: { idea: "Gerald the sourdough starter turns nine", platform: "tiktok" }, idealOutput: "x".repeat(BUILDER_LIMITS.sampleOutput + 1) }), "invalid_request");
    await rejectsCode(t.builder.addSample(me, "hook-writer", { inputs: { idea: "Gerald the sourdough starter turns nine", platform: "tiktok" }, idealOutput: "x", fileIds: ["fil_missing"] }), "invalid_request");
    await rejectsCode(t.builder.addSample(me, "nope", { inputs: {}, idealOutput: "x" }), "not_found");

    for (let i = 0; i < BUILDER_LIMITS.samplesPerAgent; i++) {
      await t.builder.addSample(me, "hashtag-picker", { inputs: { caption: `Caption number ${i}`, platform: "x" }, idealOutput: "#one #two" });
    }
    const full = await rejectsCode(t.builder.addSample(me, "hashtag-picker", { inputs: { caption: "One more caption", platform: "x" }, idealOutput: "#x" }), "invalid_request");
    expect(full.message).toMatch(/at most 50 samples/);
  });

  it("attaches uploaded text files and image files where an input is an image", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    const txt = await t.builder.putFile(me, "text", { name: "../../gold.txt", mimeType: "text/plain", bytes: new TextEncoder().encode("the ideal output") });
    expect(txt.name).toBe("gold.txt");
    expect(txt.workspaceId).toBe(PLATFORM_WORKSPACE_ID);
    const frame = await t.builder.putFile(me, "image", png(500));
    const s = await t.builder.addSample(me, "voice-and-cut", {
      inputs: { script: "A short script with enough words in it.", frames: [{ assetId: frame.id, name: frame.name, mimeType: frame.mimeType, sizeMb: 0.001 }], voice: "warm" },
      idealOutput: "A calm first cut.",
      fileIds: [txt.id],
    });
    expect(s.files.map((f) => f.id)).toEqual([txt.id]);
    expect((await t.builder.getFile(me, txt.id))?.meta.name).toBe("gold.txt");
    await t.builder.removeSample(me, "voice-and-cut", s.id);
    expect(await t.builder.getFile(me, txt.id)).toBeNull();
  });

  it("keeps file limits: size and type", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    const big = await rejectsCode(t.builder.putFile(me, "image", { name: "big.png", mimeType: "image/png", bytes: new Uint8Array(8 * 1024 * 1024 + 1) }), "invalid_request");
    expect(big.message).toMatch(/limit for image files is 8 MB/);
    const wrong = await rejectsCode(t.builder.putFile(me, "image", { name: "notes.txt", mimeType: "text/plain", bytes: new Uint8Array(10) }), "invalid_request");
    expect(wrong.message).toMatch(/not an accepted image file/);
    await rejectsCode(t.builder.putFile(me, "text", { name: "app.exe", mimeType: "application/octet-stream", bytes: new Uint8Array(10) }), "invalid_request");
    await rejectsCode(t.builder.putFile(me, "text", { name: "empty.txt", mimeType: "text/plain", bytes: new Uint8Array(0) }), "invalid_request");
    // An extension is enough when the browser sends no useful type.
    const ok = await t.builder.putFile(me, "text", { name: "notes.md", mimeType: "application/octet-stream", bytes: new Uint8Array(10) });
    expect(ok.name).toBe("notes.md");
  });
});

describe("mood boards", () => {
  it("keeps images, links, text and swatches with a note each, per agent", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    const img = await t.builder.putFile(me, "image", png());
    const a = await t.builder.addBoardItem(me, "hook-writer", { kind: "image", fileId: img.id, note: "Flour dust in morning light" });
    const b = await t.builder.addBoardItem(me, "hook-writer", { kind: "link", url: "https://example.com/post/9", note: "The pacing" });
    const c = await t.builder.addBoardItem(me, "hook-writer", { kind: "text", text: "Short. Dry. Names the thing.", note: "" });
    const d = await t.builder.addBoardItem(me, "hook-writer", { kind: "swatch", color: "#ff5a1f", note: "Blaze" });
    expect(a.file?.id).toBe(img.id);
    expect(d.color).toBe("#FF5A1F");
    const list = await t.builder.listBoard(me, "hook-writer");
    expect(list.map((i) => i.kind)).toEqual(["image", "link", "text", "swatch"]);
    expect(list.every((i) => i.workspaceId === PLATFORM_WORKSPACE_ID && i.agentId === "hook-writer")).toBe(true);
    expect(await t.builder.listBoard(me, "caption-writer")).toEqual([]);

    await t.builder.removeBoardItem(me, "hook-writer", a.id);
    expect(await t.builder.getFile(me, img.id)).toBeNull();
    await rejectsCode(t.builder.removeBoardItem(me, "caption-writer", b.id), "not_found");
    expect((await t.builder.listBoard(me, "hook-writer")).map((i) => i.id)).toEqual([b.id, c.id, d.id]);
  });

  it("checks each kind and the board size", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    await rejectsCode(t.builder.addBoardItem(me, "hook-writer", { kind: "link", url: "not a link" }), "invalid_request");
    await rejectsCode(t.builder.addBoardItem(me, "hook-writer", { kind: "text", text: "" }), "invalid_request");
    await rejectsCode(t.builder.addBoardItem(me, "hook-writer", { kind: "text", text: "x".repeat(BUILDER_LIMITS.boardText + 1) }), "invalid_request");
    await rejectsCode(t.builder.addBoardItem(me, "hook-writer", { kind: "swatch", color: "orange" }), "invalid_request");
    await rejectsCode(t.builder.addBoardItem(me, "hook-writer", { kind: "image", fileId: "fil_nope" }), "invalid_request");
    const txt = await t.builder.putFile(me, "text", { name: "a.txt", mimeType: "text/plain", bytes: new Uint8Array(5) });
    await rejectsCode(t.builder.addBoardItem(me, "hook-writer", { kind: "image", fileId: txt.id }), "invalid_request");
    await rejectsCode(t.builder.addBoardItem(me, "hook-writer", { kind: "poster" as never }), "invalid_request");
    await rejectsCode(t.builder.addBoardItem(me, "nope", { kind: "text", text: "x" }), "not_found");
    for (let i = 0; i < BUILDER_LIMITS.boardItemsPerAgent; i++) await t.builder.addBoardItem(me, "trend-scout", { kind: "text", text: `note ${i}` });
    await rejectsCode(t.builder.addBoardItem(me, "trend-scout", { kind: "text", text: "one more" }), "invalid_request");
  });

  it("reaches the engine as extra Brand Brain material for that agent only", async () => {
    const t = await testBuilder();
    const { me } = await t.joinBuilder();
    await t.builder.addBoardItem(me, "hook-writer", { kind: "swatch", color: "#1F4DFF", note: "Cobalt for the key moments" });
    await t.builder.addBoardItem(me, "hook-writer", { kind: "link", url: "https://example.com/post/9", note: "the pacing" });
    const fake = fakeProvider();
    const engine = new RunEngine({ registry: t.registry, store: memoryRunStore(), brandBrains: boardBrandBrains(stubBrandBrains(), t.builder), providers: { fake }, providerOverride: "fake" });
    const run = await engine.submitRun({ workspaceId: "ws_user", agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", inputs: { idea: "Gerald the sourdough starter turns nine", platform: "tiktok" } });
    await engine.waitForRun("ws_user", run.id);
    const prompt = fake.requests[0].messages[1].content;
    expect(prompt).toContain("https://example.com/post/9 (the pacing)");
    expect(prompt).toContain("We burned 40 croissants");
    // The swatch sits in mood_board, which Hook Writer does not read; its references do carry the link.
    expect(prompt).not.toContain("Colour #1F4DFF");

    const other = await engine.submitRun({ workspaceId: "ws_user", agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "caption-writer", inputs: { post: "Gerald the sourdough starter turns nine today", platforms: ["x"] } });
    await engine.waitForRun("ws_user", other.id);
    expect(fake.requests[1].messages[1].content).not.toContain("example.com/post/9");

    // With no user Brand Brain at all, the board still reaches the prompt.
    const none = boardBrandBrains({ async get() { return null; } }, t.builder);
    const brain = await none.get("ws_user", undefined, { workspaceId: PLATFORM_WORKSPACE_ID, id: "hook-writer" });
    expect(brain?.mood_board).toEqual(["Colour #1F4DFF (Cobalt for the key moments)"]);
    expect(await none.get("ws_user", undefined, { workspaceId: PLATFORM_WORKSPACE_ID, id: "caption-writer" })).toBeNull();
  });
});
