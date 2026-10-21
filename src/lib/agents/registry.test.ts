import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRegistry, RegistryError } from "./registry";
import { jsonFileStore, memoryStore } from "./store";
import { goodSpec } from "./test-helpers";

const WS = "ws_one";
const OTHER = "ws_two";

function registry() {
  let tick = 0;
  return new AgentRegistry(memoryStore(), () => new Date(Date.UTC(2026, 9, 21, 12, 0, tick++)).toISOString());
}

async function rejects(p: Promise<unknown>, code: string): Promise<RegistryError> {
  const err = await p.then(
    () => {
      throw new Error(`expected a ${code} error`);
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(RegistryError);
  expect((err as RegistryError).code).toBe(code);
  return err as RegistryError;
}

describe("agent registry", () => {
  it("creates and reads back an agent", async () => {
    const reg = registry();
    const created = await reg.create(WS, goodSpec());
    expect(created.version).toBe("1.0.0");
    expect(await reg.get(WS, "test-agent")).toEqual(created);
    expect(await reg.get(WS, "nope")).toBeNull();
  });

  it("rejects an invalid spec before saving, with the reasons", async () => {
    const reg = registry();
    const err = await rejects(reg.create(WS, goodSpec({ tools: ["web_scrape"] })), "invalid_spec");
    expect(err.issues[0]).toMatch(/Unknown tool "web_scrape"/);
    expect(err.message).toContain("Unknown tool");
    expect(await reg.list(WS)).toEqual([]);
  });

  it("rejects a duplicate id in the same workspace", async () => {
    const reg = registry();
    await reg.create(WS, goodSpec());
    await rejects(reg.create(WS, goodSpec()), "already_exists");
  });

  it("ignores a quality score passed in on create", async () => {
    const reg = registry();
    const input = { ...goodSpec(), quality: { score: 99, runs: 1000, lastScoredAt: null } };
    const created = await reg.create(WS, input);
    expect(created.quality).toEqual({ score: null, runs: 0, lastScoredAt: null });
  });

  describe("versions", () => {
    it("makes a new immutable version on every save", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec());
      const v2 = await reg.update(WS, "test-agent", { name: "Test Agent Two" });
      expect(v2.version).toBe("1.0.1");
      const v3 = await reg.update(WS, "test-agent", { output: { kind: "list", count: 5 } }, { bump: "major", note: "Five lines" });
      expect(v3.version).toBe("2.0.0");

      expect((await reg.get(WS, "test-agent"))?.version).toBe("2.0.0");
      expect((await reg.get(WS, "test-agent", "1.0.0"))?.name).toBe("Test Agent");
      expect((await reg.get(WS, "test-agent", "1.0.1"))?.name).toBe("Test Agent Two");
      expect(await reg.get(WS, "test-agent", "9.9.9")).toBeNull();

      const list = await reg.versions(WS, "test-agent");
      expect(list.map((v) => [v.version, v.current, v.note])).toEqual([
        ["1.0.0", false, null],
        ["1.0.1", false, null],
        ["2.0.0", true, "Five lines"],
      ]);
    });

    it("takes an explicit version only when it is higher than every existing one", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec());
      expect((await reg.update(WS, "test-agent", { version: "1.3.0", name: "Three" })).version).toBe("1.3.0");
      await rejects(reg.update(WS, "test-agent", { version: "1.2.0", name: "Back" }), "version_conflict");
      await rejects(reg.update(WS, "test-agent", { version: "1.3.0", name: "Same" }), "version_conflict");
      await rejects(reg.update(WS, "test-agent", { version: "two", name: "Bad" }), "invalid_spec");
    });

    it("rejects an invalid update and keeps the current version", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec());
      const err = await rejects(reg.update(WS, "test-agent", { instructions: "Write about {{subject}} please, three lines." }), "invalid_spec");
      expect(err.issues).toContain("instructions: Placeholder {{subject}} has no input with that key.");
      expect((await reg.versions(WS, "test-agent")).length).toBe(1);
    });

    it("refuses a save that changes nothing, and an id change", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec());
      await rejects(reg.update(WS, "test-agent", { name: "Test Agent" }), "no_change");
      await rejects(reg.update(WS, "test-agent", { id: "other" } as never), "invalid_spec");
    });

    it("rolls back to an earlier version without deleting later ones", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec());
      await reg.update(WS, "test-agent", { name: "Worse" });
      const back = await reg.rollback(WS, "test-agent", "1.0.0");
      expect(back.name).toBe("Test Agent");
      expect((await reg.get(WS, "test-agent"))?.version).toBe("1.0.0");
      expect((await reg.versions(WS, "test-agent")).map((v) => v.version)).toEqual(["1.0.0", "1.0.1"]);

      // The next save still goes above the highest version and becomes current.
      const next = await reg.update(WS, "test-agent", { name: "Better" });
      expect(next.version).toBe("1.0.2");
      expect(next.job).toBe("Writes one test line.");
      await rejects(reg.rollback(WS, "test-agent", "5.0.0"), "not_found");
    });
  });

  describe("listing", () => {
    it("filters by owner, status and category", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec({ id: "a-writer", status: "live" }));
      await reg.create(WS, goodSpec({ id: "b-scout", category: "research", status: "live", owner: { kind: "creator", creatorId: "creator_other" } }));
      await reg.create(WS, goodSpec({ id: "c-draft" }));

      const ids = async (f: Parameters<AgentRegistry["list"]>[1]) => (await reg.list(WS, f)).map((a) => a.id);
      expect(await ids({})).toEqual(["a-writer", "b-scout", "c-draft"]);
      expect(await ids({ owner: "creator_other" })).toEqual(["b-scout"]);
      expect(await ids({ status: "live" })).toEqual(["a-writer", "b-scout"]);
      expect(await ids({ status: ["draft", "hidden"] })).toEqual(["c-draft"]);
      expect(await ids({ category: "research" })).toEqual(["b-scout"]);
      expect(await ids({ category: "writing", status: "live" })).toEqual(["a-writer"]);
    });

    it("lists current versions", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec());
      await reg.update(WS, "test-agent", { name: "Renamed" });
      expect((await reg.list(WS)).map((a) => [a.name, a.version])).toEqual([["Renamed", "1.0.1"]]);
    });
  });

  describe("hide and status", () => {
    it("hides and unhides without making a version", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec({ status: "live" }));
      expect((await reg.hide(WS, "test-agent")).status).toBe("hidden");
      expect(await reg.list(WS, { status: "live" })).toEqual([]);
      expect((await reg.unhide(WS, "test-agent")).status).toBe("live");
      expect((await reg.versions(WS, "test-agent")).length).toBe(1);
    });

    it("unhides back to draft when it was a draft, and to live when created hidden", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec({ id: "was-draft" }));
      await reg.hide(WS, "was-draft");
      expect((await reg.unhide(WS, "was-draft")).status).toBe("draft");

      await reg.create(WS, goodSpec({ id: "born-hidden", status: "hidden" }));
      expect((await reg.unhide(WS, "born-hidden")).status).toBe("live");
    });

    it("keeps status across new versions and moves draft to live", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec());
      await reg.setStatus(WS, "test-agent", "live");
      await reg.hide(WS, "test-agent");
      expect((await reg.update(WS, "test-agent", { name: "New" })).status).toBe("hidden");
    });
  });

  describe("workspaces", () => {
    it("keeps every workspace's agents apart", async () => {
      const reg = registry();
      await reg.create(WS, goodSpec({ name: "Mine" }));
      await reg.create(OTHER, goodSpec({ name: "Theirs" }));

      expect((await reg.get(WS, "test-agent"))?.name).toBe("Mine");
      expect((await reg.get(OTHER, "test-agent"))?.name).toBe("Theirs");

      await reg.update(WS, "test-agent", { name: "Mine Two" });
      await reg.hide(WS, "test-agent");
      expect((await reg.get(OTHER, "test-agent"))?.version).toBe("1.0.0");
      expect((await reg.get(OTHER, "test-agent"))?.status).toBe("draft");
      expect(await reg.get("ws_three", "test-agent")).toBeNull();
      expect(await reg.list("ws_three")).toEqual([]);
      await rejects(reg.update("ws_three", "test-agent", { name: "X" }), "not_found");
    });

    it("rejects a missing or malformed workspace id", async () => {
      const reg = registry();
      await rejects(reg.create("", goodSpec()), "invalid_workspace");
      await rejects(reg.list("Has Spaces"), "invalid_workspace");
    });
  });

  describe("JSON file store", () => {
    const dirs: string[] = [];
    afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

    it("persists across registry instances", async () => {
      const dir = mkdtempSync(join(tmpdir(), "wovi-agents-"));
      dirs.push(dir);
      const file = join(dir, "agents.json");

      const first = new AgentRegistry(jsonFileStore(file));
      await first.create(WS, goodSpec());
      await first.update(WS, "test-agent", { name: "Saved" });

      const second = new AgentRegistry(jsonFileStore(file));
      expect((await second.get(WS, "test-agent"))?.name).toBe("Saved");
      expect((await second.get(WS, "test-agent", "1.0.0"))?.name).toBe("Test Agent");
    });

    it("never overwrites an existing version row", async () => {
      const dir = mkdtempSync(join(tmpdir(), "wovi-agents-"));
      dirs.push(dir);
      const store = jsonFileStore(join(dir, "agents.json"));
      const reg = new AgentRegistry(store);
      await reg.create(WS, goodSpec());
      const row = (await store.getAgent(WS, "test-agent"))!;
      const v = (await store.getVersion(WS, "test-agent", "1.0.0"))!;
      await expect(store.save(row, v)).rejects.toThrow(/already exists/);
    });
  });
});
