/**
 * Live stats and canary releases on a data dir written before them (the
 * phase 17 fixture, src/test-fixtures/phase17-data: Funkai's builder account,
 * the launch set with his Hook Writer edit, Maya's agency with runs, review
 * items and a pipeline run). Reading changes no file and creates no
 * stats.json; the numbers read as "New"; the first feedback event or release
 * writes stats.json and leaves every earlier record alone. The test works on
 * a copy; the model is the fake provider.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Principal } from "@/lib/accounts/accounts";
import { localAccounts } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import type { Builder } from "@/lib/builder/builder";
import { localBrandBrains, localBuilder } from "@/lib/builder/local";
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import { localEngine } from "@/lib/runs/engine";
import { publicRunView } from "@/lib/runs/run";
import { jsonFileRunStore } from "@/lib/runs/store";
import { localPrivacy } from "@/lib/safety/local";
import { localRouter, localStats } from "./local";

const FIXTURE = join(__dirname, "..", "..", "test-fixtures", "phase17-data");
const MAYA = "usr_2f1d552405dab2a06ff8";
const FUNKAI = "usr_funkai0000000000";
const MAYA_WS = "ws_1520f9b6d24198df442c";
const ED = "usr_1b9ca13a1f40ae6e8d20";
const LAUNCH = ["idea-generator", "hook-writer", "script-writer", "caption-writer", "hashtag-picker", "repurposer"];
const ENV = { NODE_ENV: "test" } as NodeJS.ProcessEnv;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), "wovi-stats17-"));
  cpSync(FIXTURE, dir, { recursive: true });
  dirs.push(dir);
  return dir;
}
function hashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[p.slice(dir.length)] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

function open(dir: string) {
  const accounts = localAccounts(dir, ENV);
  const engine = localEngine({ dataDir: dir, fake: true, brandBrains: localBrandBrains(dir), router: localRouter(dir) });
  const late: { builder?: Builder } = {};
  const s = localStats(dir, { accounts, engine, requireBuilder: (c) => late.builder!.requireBuilder(c), env: ENV });
  const builder = (late.builder = localBuilder(accounts, dir, engine, s.releases));
  const funkai: Principal = { kind: "user", userId: FUNKAI };
  return { accounts, engine, builder, funkai, ...s };
}

describe("live stats on a phase 17 data dir", () => {
  it("reads it unchanged: every agent is New, the builder's pages read, no release, no file written", async () => {
    const dir = copy();
    const before = hashes(dir);
    const t = open(dir);
    const all = await t.stats.agentsStats(PLATFORM_WORKSPACE_ID, LAUNCH);
    for (const id of LAUNCH) {
      expect(all[id].isNew, id).toBe(true);
      expect(all[id].acceptance.value).toBeNull();
      expect(all[id].runs).toBeLessThan(20);
    }
    // Maya's runs from before count: her workspace is a real one, and Funkai's bench runs do not.
    const hook = await t.stats.realRuns(PLATFORM_WORKSPACE_ID, "hook-writer");
    expect(hook.runs.every((r) => r.workspaceId !== PLATFORM_WORKSPACE_ID)).toBe(true);
    expect(hook.runs.some((r) => r.workspaceId === MAYA_WS)).toBe(true);
    expect(hook.feedback).toEqual([]);

    for (const id of LAUNCH) {
      const view = await t.builder.release.view(t.funkai, id);
      expect(view.active).toBeNull();
      expect(view.history).toEqual([]);
      expect(view.stable).toBe((await localRegistry(dir).get(PLATFORM_WORKSPACE_ID, id))!.version);
      expect((await t.builder.release.stats(t.funkai, id, t.stats)).length).toBeGreaterThan(0);
      expect((await t.builder.getAgent(t.funkai, id))!.spec.version).toBe(view.stable);
    }
    expect(await t.builder.release.audit(t.funkai)).toEqual([]);
    expect(await t.engine.router!.route({ agentWorkspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", workspaceId: MAYA_WS })).toBeNull();

    // Old runs read with no release, and the public view is as it was.
    for (const r of await jsonFileRunStore(join(dir, "runs.json")).list(MAYA_WS)) {
      expect(r.release).toBeUndefined();
      expect(publicRunView(r)).not.toHaveProperty("release");
    }
    // The privacy copy has the new section, empty.
    expect(((await localPrivacy(t.accounts, dir).export(MAYA)) as { feedbackGiven: unknown[] }).feedbackGiven).toEqual([]);

    expect(hashes(dir)).toEqual(before);
    expect(existsSync(join(dir, "stats.json"))).toBe(false);
  });

  it("works on it: feedback on an old run, a canary of Funkai's Hook Writer, routing and rollback, leaving earlier records alone", async () => {
    const dir = copy();
    const t = open(dir);
    const runsBefore = (await jsonFileRunStore(join(dir, "runs.json")).list(MAYA_WS)).map((r) => JSON.stringify(r)).sort();
    const untouched = Object.entries(hashes(dir)).filter(([p]) => !["/agents.json", "/runs.json", "/builder.json"].includes(p) && !p.startsWith("/files/"));

    // Feedback on a result Maya got before stats existed.
    const old = (await jsonFileRunStore(join(dir, "runs.json")).list(MAYA_WS)).find((r) => r.status === "succeeded" && r.agent.id === "hook-writer" && !r.parent)!;
    await t.feedback.record({ workspaceId: MAYA_WS, runId: old.id, action: "use", by: MAYA, source: "app", how: "copy" });
    await t.feedback.record({ workspaceId: MAYA_WS, runId: old.id, action: "rating", by: MAYA, source: "app", rating: "up" });
    expect(existsSync(join(dir, "stats.json"))).toBe(true);
    expect((await t.stats.realRuns(PLATFORM_WORKSPACE_ID, "hook-writer")).feedback).toHaveLength(2);

    // Funkai saves Hook Writer as a canary on top of his edit.
    const current = (await localRegistry(dir).get(PLATFORM_WORKSPACE_ID, "hook-writer"))!;
    const saved = await t.builder.saveAgent(t.funkai, "hook-writer", { instructions: `${current.instructions}\nKeep it warm.` }, { release: { mode: "canary", share: 50 } });
    expect(saved.instructions).toContain("Funkai: never open with a question.");
    expect((await localRegistry(dir).get(PLATFORM_WORKSPACE_ID, "hook-writer"))!.version).toBe(current.version);

    const gold = LAUNCH_SAMPLES["hook-writer"].find((s) => s.label === "gold")!;
    const versions = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const r = await t.engine.submitRun({ workspaceId: `ws_shop_${i}`, agentId: "hook-writer", agentWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: gold.inputs });
      versions.add(r.agent.version);
      expect(r.release?.arm).toBe(r.agent.version === saved.version ? "canary" : "stable");
    }
    expect([...versions].sort()).toEqual([current.version, saved.version].sort());
    await t.engine.idle();

    await t.builder.release.rollBack(t.funkai, "hook-writer");
    expect((await t.engine.submitRun({ workspaceId: "ws_shop_1", agentId: "hook-writer", agentWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: gold.inputs })).agent.version).toBe(current.version);
    await t.engine.idle();
    expect((await t.builder.release.audit(t.funkai, "hook-writer")).map((a) => a.kind).reverse()).toEqual(["saved", "canary_started", "rolled_back"]);

    // Earlier runs are exactly as they were; no other data file changed.
    const after = (await jsonFileRunStore(join(dir, "runs.json")).list(MAYA_WS)).map((r) => JSON.stringify(r)).sort();
    expect(after).toEqual(runsBefore);
    const now = hashes(dir);
    for (const [p, h] of untouched) expect(now[p], p).toBe(h);

    // A restart reads the same state back.
    const again = open(dir);
    expect((await again.releases.history(PLATFORM_WORKSPACE_ID, "hook-writer")).map((r) => r.status)).toEqual(["rolled_back"]);
    expect(((await localPrivacy(again.accounts, dir).export(MAYA)) as { feedbackGiven: { action: string }[] }).feedbackGiven.map((f) => f.action).sort()).toEqual(["rating", "use"]);

    // Ed allows his edits to improve agents, edits a result, then deletes his account: the count stays, his words and name go.
    const privacy = localPrivacy(again.accounts, dir);
    await privacy.setConsent(ED, true);
    const edit = await again.feedback.record({ workspaceId: MAYA_WS, runId: old.id, action: "edit", by: ED, source: "app", kept: "Ed's own words about the bakery." });
    expect(edit.kept).toBe("Ed's own words about the bakery.");
    await privacy.deleteAccount(ED, "ed@loop.studio");
    const kept = (await again.store.feedback.get(`${old.id}:edit`))!;
    expect(kept.by).not.toBe(ED);
    expect(kept.kept).toBeNull();
    expect(kept.distance).toBe(edit.distance);
  });
});
