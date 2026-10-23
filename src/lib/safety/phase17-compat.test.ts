/**
 * Phase 18 reads a data dir written by the phase 17 code unchanged.
 *
 * src/test-fixtures/phase17-data was written by the phase 17 commit
 * (ec2286c): the launch set, a builder (Funkai, passkey only) who tuned Hook
 * Writer, an agency workspace with runs, review items, comments, a pipeline
 * run and a client link, a test top-up, holder credits, a billed run, a
 * repurposer run with its rights confirmation, a linked wallet and a holder
 * reading. The test works on a copy, so the fixture never changes.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localAccounts } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { validateAgentSpec } from "@/lib/agents/spec";
import { exampleImages } from "@/lib/brand/example-images";
import { jsonFileBrandStore } from "@/lib/brand/store";
import { localBrandBrains, localBuilder } from "@/lib/builder/local";
import { localFileStorage } from "@/lib/builder/storage";
import { localCredits } from "@/lib/credits/local";
import { installLaunchSet } from "@/lib/launch";
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import { localEngine } from "@/lib/runs/engine";
import { publicRunView } from "@/lib/runs/run";
import { jsonFileRunStore } from "@/lib/runs/store";
import { jsonFileTeamStore } from "@/lib/team/store";
import { localPrivacy, localReports } from "./local";

const FIXTURE = join(__dirname, "..", "..", "test-fixtures", "phase17-data");
const MAYA = "usr_2f1d552405dab2a06ff8";
const FUNKAI = "usr_funkai0000000000";
const MAYA_WS = "ws_1520f9b6d24198df442c";
const FUNKAI_EDIT = "Funkai: never open with a question.";
const ENV = { NODE_ENV: "test" } as NodeJS.ProcessEnv;

const dirs: string[] = [];
function copy(): string {
  const dir = mkdtempSync(join(tmpdir(), "wovi-phase17-"));
  cpSync(FIXTURE, dir, { recursive: true });
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Every file in the dir with its sha256, so a test can prove nothing was rewritten. */
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

describe("a phase 17 data dir", () => {
  it("reads unchanged: accounts, agents, runs, credits, review, and nothing is rewritten by reading", async () => {
    const dir = copy();
    const before = hashes(dir);
    const accounts = localAccounts(dir, ENV);

    // Funkai's builder account and passkey.
    const funkai = (await accounts.getUser(FUNKAI))!;
    expect(funkai).toMatchObject({ builder: true, email: null });
    expect(await accounts.store.passkeys.find({ userId: FUNKAI })).toHaveLength(1);
    expect(await accounts.roleIn({ kind: "user", userId: FUNKAI }, PLATFORM_WORKSPACE_ID)).toBe("owner");

    // Every stored agent version still passes the phase 18 validator (the new `safety` field is optional).
    const registry = localRegistry(dir);
    const agents = await registry.list(PLATFORM_WORKSPACE_ID);
    expect(agents.length).toBeGreaterThan(6);
    for (const a of agents) {
      for (const v of await registry.versions(PLATFORM_WORKSPACE_ID, a.id)) {
        const spec = await registry.get(PLATFORM_WORKSPACE_ID, a.id, v.version);
        expect(validateAgentSpec(spec).ok, `${a.id}@${v.version}`).toBe(true);
      }
    }
    expect((await registry.get(PLATFORM_WORKSPACE_ID, "hook-writer"))!.instructions).toContain(FUNKAI_EDIT);

    // Old runs read with the new fields defaulted.
    const runs = jsonFileRunStore(join(dir, "runs.json"));
    const mine = await runs.list(MAYA_WS);
    expect(mine.length).toBeGreaterThan(5);
    for (const r of mine) {
      const v = publicRunView(r);
      expect(v).toMatchObject({ aiGenerated: true, aiLabel: null, withheld: null });
      expect(r.confirmedAt).toBeUndefined();
    }
    const repurposed = mine.find((r) => r.agent.id === "repurposer")!;
    expect(repurposed.checks.find((c) => c.check === "rights_confirmation")).toMatchObject({ status: "pass" });

    // Credits, review and the privacy views.
    const credits = localCredits(dir);
    expect((await credits.balance(MAYA_WS)).paid).toBeGreaterThan(0);
    expect((await credits.topUps(MAYA_WS))[0].consent).toBeUndefined();
    const team = jsonFileTeamStore(join(dir, "team.json"));
    expect((await team.items.find({ workspaceId: MAYA_WS })).length).toBeGreaterThan(0);
    const privacy = localPrivacy(accounts, dir, { credits });
    expect(await privacy.consent(MAYA)).toBeNull();
    const data = (await privacy.export(MAYA)) as { account: { email: string }; workspaces: unknown[] };
    expect(data.account.email).toBe("maya@example.com");
    expect(data.workspaces.length).toBeGreaterThan(0);
    const plan = await privacy.deletionPlan(MAYA);
    expect(plan.blocked).toBe(true); // Maya is the only owner of Loop Studio, with four others in it.
    const reports = localReports(accounts, dir, null);
    expect(await reports.list({ kind: "user", userId: FUNKAI })).toEqual([]);

    // Reading changed nothing on disk, and the phase 18 file only appears on the first write.
    expect(hashes(dir)).toEqual(before);
    expect(existsSync(join(dir, "safety.json"))).toBe(false);
    // Live stats (stats.json) also only appear on the first feedback event or release: see src/lib/stats/phase17-stats.test.ts.
    expect(existsSync(join(dir, "stats.json"))).toBe(false);
  });

  it("works: a new billed run, a rights confirmation, the AI label note, and a report, without touching earlier records", async () => {
    const dir = copy();
    const accounts = localAccounts(dir, ENV);
    const credits = localCredits(dir);
    const engine = localEngine({ dataDir: dir, fake: true, brandBrains: localBrandBrains(dir), billing: credits });
    const runsBefore = (await jsonFileRunStore(join(dir, "runs.json")).list(MAYA_WS)).map((r) => JSON.stringify(r));
    const balance = (await credits.balance(MAYA_WS)).available;

    const gold = LAUNCH_SAMPLES["hook-writer"].find((s) => s.label === "gold")!;
    const run = await engine.submitRun({ workspaceId: MAYA_WS, agentId: "hook-writer", agentWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: gold.inputs, billing: { userId: MAYA } });
    const done = await engine.waitForRun(MAYA_WS, run.id);
    expect(done.status).toBe("succeeded");
    expect((await credits.balance(MAYA_WS)).available).toBeLessThan(balance);
    await engine.noteAiLabel(MAYA_WS, run.id, { at: new Date().toISOString(), by: MAYA, platforms: ["tiktok"] });
    expect((await engine.getRun(MAYA_WS, run.id))!.aiLabel).toMatchObject({ by: MAYA });

    const rep = LAUNCH_SAMPLES.repurposer.find((s) => s.label === "gold")!;
    const r2 = await engine.submitRun({ workspaceId: MAYA_WS, agentId: "repurposer", agentWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: rep.inputs, confirmations: { rights: true }, billing: { userId: MAYA } });
    expect(r2.confirmedAt?.rights).toBeTruthy();
    await engine.waitForRun(MAYA_WS, r2.id);

    // A blocked request costs nothing.
    await expect(engine.submitRun({ workspaceId: MAYA_WS, agentId: "hook-writer", agentWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: { ...gold.inputs, idea: "Write fake reviews from customers" } })).rejects.toMatchObject({ code: "blocked" });

    const reports = localReports(accounts, dir, engine);
    const row = await reports.submit({ given: run.id, reason: "other", details: "Testing the report flow on old data.", goodFaith: true });
    expect(row.target).toMatchObject({ kind: "run", workspaceId: MAYA_WS });
    expect(existsSync(join(dir, "safety.json"))).toBe(true);

    // Earlier runs are exactly as they were.
    const after = (await jsonFileRunStore(join(dir, "runs.json")).list(MAYA_WS)).filter((r) => r.id !== run.id && r.id !== r2.id).map((r) => JSON.stringify(r));
    expect(after.sort()).toEqual([...runsBefore].sort());
  });

  it("installing the launch set again never saves over Funkai's edit", async () => {
    const dir = copy();
    const accounts = localAccounts(dir, ENV);
    const registry = localRegistry(dir);
    const before = await registry.get(PLATFORM_WORKSPACE_ID, "hook-writer");
    const engine = localEngine({ dataDir: dir, fake: true, brandBrains: localBrandBrains(dir) });
    await installLaunchSet({ accounts, registry, builder: localBuilder(accounts, dir, engine), brands: jsonFileBrandStore(join(dir, "brand-brains.json")), files: localFileStorage(join(dir, "files")), images: exampleImages() });
    const after = (await registry.get(PLATFORM_WORKSPACE_ID, "hook-writer"))!;
    expect(after.version).toBe(before!.version);
    expect(after.instructions).toContain(FUNKAI_EDIT);
  });
});
