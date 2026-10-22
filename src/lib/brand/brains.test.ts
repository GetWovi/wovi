import { describe, expect, it } from "vitest";
import { rejectsCode } from "@/lib/accounts/test-helpers";
import { BRAND_LIMITS } from "./types";
import { as, bakery, testBrands } from "./test-helpers";

const png = (bytes = 64) => ({ name: "crust.png", mimeType: "image/png", bytes: new Uint8Array(bytes).fill(1) });

describe("Brand Brains: store and versions", () => {
  it("creates version 1 with every field, cleaned, and makes the first one the default", async () => {
    const { brands, ada, team } = await testBrands();
    const a = await brands.create(as(ada.id), team.id, bakery({ topics: ["  sourdough ", "Sourdough", ""] }));
    expect(a.brain).toMatchObject({ workspaceId: team.id, name: "Crumb and Co", isDefault: true, currentVersion: 1 });
    expect(a.version.changed).toHaveLength(10);
    expect(a.body.topics).toEqual(["sourdough"]);
    expect(a.body.references[0].id).toMatch(/^ref_/);
    expect(a.body.moodBoard.map((m) => m.id)).toEqual([expect.stringMatching(/^mood_/), expect.stringMatching(/^mood_/)]);
    expect(a.body.moodBoard[1].color).toBe("#8A4B2A");
    const b = await brands.create(as(ada.id), team.id, { name: "Second brand" });
    expect(b.brain.isDefault).toBe(false);
    expect((await brands.list(as(ada.id), team.id)).map((x) => x.name)).toEqual(["Crumb and Co", "Second brand"]);
  });

  it("saves every edit as a new version, keeps the old ones, and records who changed which fields", async () => {
    const { brands, ada, team, join } = await testBrands();
    const ed = await join("ed@example.com", "editor");
    const { brain } = await brands.create(as(ada.id), team.id, bakery());
    const v2 = await brands.save(as(ed.id), team.id, brain.id, { donts: ["No hashtags", "No emoji"], idea: "Bread for night owls" }, { note: "Night shift" });
    expect(v2.version).toMatchObject({ version: 2, changed: ["donts", "idea"], note: "Night shift", by: ed.id });
    expect(v2.brain.currentVersion).toBe(2);
    expect((await brands.get(as(ada.id), team.id, brain.id, 1)).body.idea).toBe("Honest baking: show the mess behind every good loaf.");

    const history = await brands.history(as(ada.id), team.id, brain.id);
    expect(history.map((h) => [h.version, h.by, h.current])).toEqual([
      [2, "ed@example.com", true],
      [1, "ada@example.com", false],
    ]);
    const donts = history[0].diff.find((d) => d.field === "donts")!;
    expect(donts.lines).toEqual(
      expect.arrayContaining([
        { type: "same", text: "No hashtags" },
        { type: "remove", text: "Never call anything artisanal" },
        { type: "add", text: "No emoji" },
      ]),
    );
  });

  it("refuses a save that changes nothing, and a save on top of an older version", async () => {
    const { brands, ada, team } = await testBrands();
    const { brain } = await brands.create(as(ada.id), team.id, bakery());
    await rejectsCode(brands.save(as(ada.id), team.id, brain.id, { name: "Crumb and Co" }), "no_change");
    await brands.save(as(ada.id), team.id, brain.id, { niche: "Bakery" }, { baseVersion: 1 });
    await rejectsCode(brands.save(as(ada.id), team.id, brain.id, { niche: "Old tab" }, { baseVersion: 1 }), "version_conflict");
  });

  it("lists every problem at once and saves nothing", async () => {
    const { brands, ada, team } = await testBrands();
    const err = (await brands
      .create(as(ada.id), team.id, { name: "", platforms: ["fax" as never], moodBoard: [{ id: "", kind: "swatch", note: "", url: null, text: null, color: "orange", file: null }], voice: { description: "x".repeat(BRAND_LIMITS.voiceDescription + 1), tone: [], use: [], avoid: [], samples: [] } })
      .catch((e) => e)) as { code: string; issues: string[] };
    expect(err.code).toBe("invalid_body");
    expect(err.issues).toEqual([
      expect.stringContaining("platforms"),
      expect.stringContaining("name: Add this first"),
      expect.stringContaining("voice.description: At most"),
      expect.stringContaining("moodBoard[0].color"),
    ]);
    expect(await brands.list(as(ada.id), team.id)).toEqual([]);
  });

  it("restores an old version as a new one on top", async () => {
    const { brands, ada, team } = await testBrands();
    const { brain } = await brands.create(as(ada.id), team.id, bakery());
    await brands.save(as(ada.id), team.id, brain.id, { idea: "Something else" });
    const back = await brands.restore(as(ada.id), team.id, brain.id, 1);
    expect(back.version).toMatchObject({ version: 3, note: "Restored version 1", changed: ["idea"] });
    expect(back.body.idea).toBe("Honest baking: show the mess behind every good loaf.");
  });

  it("moves the default, and hands it on when the default is deleted", async () => {
    const { brands, ada, team } = await testBrands();
    const a = await brands.create(as(ada.id), team.id, { name: "A" });
    const b = await brands.create(as(ada.id), team.id, { name: "B" });
    await brands.setDefault(as(ada.id), team.id, b.brain.id);
    expect((await brands.list(as(ada.id), team.id)).map((x) => [x.name, x.isDefault])).toEqual([
      ["B", true],
      ["A", false],
    ]);
    await brands.remove(as(ada.id), team.id, b.brain.id);
    expect((await brands.list(as(ada.id), team.id)).map((x) => [x.name, x.isDefault])).toEqual([["A", true]]);
    await rejectsCode(brands.get(as(ada.id), team.id, b.brain.id), "not_found");
    expect(a.brain.id).not.toBe(b.brain.id);
  });
});

describe("Brand Brains: workspaces and the policy", () => {
  it("keeps each workspace's Brand Brains to itself", async () => {
    const { brands, ada, eve, team, store } = await testBrands();
    const { brain } = await brands.create(as(ada.id), team.id, bakery());
    const eveWs = (await brands.create(as(eve.id), eve.personalWorkspaceId, { name: "Eve's" })).brain;
    await rejectsCode(brands.list(as(eve.id), team.id), "not_found");
    await rejectsCode(brands.get(as(eve.id), team.id, brain.id), "not_found");
    await rejectsCode(brands.save(as(eve.id), team.id, brain.id, { name: "Mine" }), "not_found");
    // Eve's own workspace cannot reach the team's Brand Brain by id either.
    await rejectsCode(brands.get(as(eve.id), eveWs.workspaceId, brain.id), "not_found");
    expect((await brands.source().get(eveWs.workspaceId, brain.id))).toBeNull();
    expect((await store.brains.find({})).map((b) => b.workspaceId).sort()).toEqual([eveWs.workspaceId, team.id].sort());
  });

  it("lets viewers read and editors edit, and API keys follow their role", async () => {
    const { brands, ada, team, join, accounts } = await testBrands();
    const viewer = await join("val@example.com", "viewer");
    const editor = await join("ed@example.com", "editor");
    const { brain } = await brands.create(as(ada.id), team.id, bakery());
    expect((await brands.get(as(viewer.id), team.id, brain.id)).body.name).toBe("Crumb and Co");
    expect(await brands.history(as(viewer.id), team.id, brain.id)).toHaveLength(1);
    await rejectsCode(brands.save(as(viewer.id), team.id, brain.id, { name: "No" }), "forbidden");
    await rejectsCode(brands.create(as(viewer.id), team.id, { name: "No" }), "forbidden");
    await rejectsCode(brands.propose(as(viewer.id), team.id, { posts: ["a post", "b post", "c post"] }), "forbidden");
    await rejectsCode(brands.putImage(as(viewer.id), team.id, png()), "forbidden");
    await brands.save(as(editor.id), team.id, brain.id, { name: "Crumb" });

    const viewKey = await accounts.apiKeys.authenticate((await accounts.apiKeys.create(as(ada.id), team.id, { name: "read", role: "viewer" })).key);
    const editKey = await accounts.apiKeys.authenticate((await accounts.apiKeys.create(as(ada.id), team.id, { name: "edit", role: "editor" })).key);
    await rejectsCode(brands.save(viewKey!, team.id, brain.id, { name: "Key" }), "forbidden");
    const saved = await brands.save(editKey!, team.id, brain.id, { name: "By key" });
    expect(saved.by).toBe("An API key");
  });

  it("caps the number of Brand Brains per workspace", async () => {
    const { brands, ada, team } = await testBrands();
    for (let i = 0; i < BRAND_LIMITS.brainsPerWorkspace; i++) await brands.create(as(ada.id), team.id, { name: `B${i}` });
    await rejectsCode(brands.create(as(ada.id), team.id, { name: "One more" }), "limit");
  });
});

describe("Brand Brains: mood board files", () => {
  it("keeps images under the workspace, with the builder's limits", async () => {
    const { brands, ada, eve, team } = await testBrands();
    const file = await brands.putImage(as(ada.id), team.id, png());
    const { brain, body } = await brands.create(as(ada.id), team.id, bakery({ moodBoard: [{ id: "", kind: "image", note: "Crust", url: null, text: null, color: null, file }] }));
    expect(body.moodBoard[0].file).toMatchObject({ id: file.id, workspaceId: team.id, mimeType: "image/png" });
    expect((await brands.getFile(as(ada.id), team.id, file.id))?.bytes.byteLength).toBe(64);
    await rejectsCode(brands.getFile(as(eve.id), team.id, file.id), "not_found");

    await rejectsCode(brands.putImage(as(ada.id), team.id, { name: "notes.txt", mimeType: "text/plain", bytes: new Uint8Array(5) }), "invalid_request");
    await rejectsCode(brands.putImage(as(ada.id), team.id, png(8 * 1024 * 1024 + 1)), "invalid_request");
    await rejectsCode(brands.putImage(as(ada.id), team.id, png(0)), "invalid_request");

    // An image id that is not in this workspace's storage is refused.
    const other = await brands.putImage(as(eve.id), eve.personalWorkspaceId, png());
    const err = (await brands.save(as(ada.id), team.id, brain.id, { moodBoard: [{ id: "", kind: "image", note: "", url: null, text: null, color: null, file: other }] }).catch((e) => e)) as { code: string; issues: string[] };
    expect(err.code).toBe("invalid_body");
    expect(err.issues).toEqual(["moodBoard: An image is missing. Upload it again."]);
  });

  it("holds the item limit on the board", async () => {
    const { brands, ada, team } = await testBrands();
    const items = Array.from({ length: BRAND_LIMITS.moodItems + 1 }, (_, i) => ({ id: "", kind: "text" as const, note: "", url: null, text: `line ${i}`, color: null, file: null }));
    await rejectsCode(brands.create(as(ada.id), team.id, { name: "Too much", moodBoard: items }), "invalid_body");
  });
});

describe("example Brand Brains", () => {
  it("are valid, land once, and the bakery becomes the default", async () => {
    const { brands, store, files, ada, team } = await testBrands();
    const { seedBrains } = await import("./seeds");
    expect(await seedBrains(store, files, team.id, { images: { "crust.png": png().bytes } })).toEqual(["Crumb and Co", "Desk Stretch", "Night Owl Coffee"]);
    expect(await seedBrains(store, files, team.id)).toEqual([]);
    const list = await brands.list(as(ada.id), team.id);
    expect(list.map((b) => [b.name, b.isDefault, b.by])).toEqual([
      ["Crumb and Co", true, "WOVI"],
      ["Desk Stretch", false, "WOVI"],
      ["Night Owl Coffee", false, "WOVI"],
    ]);
    const bakeryBody = (await brands.get(as(ada.id), team.id, list[0].id)).body;
    expect(bakeryBody.moodBoard.filter((m) => m.kind === "image").map((m) => m.file?.name)).toEqual(["crust.png"]);
  });
});
