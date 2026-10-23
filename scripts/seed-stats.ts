/**
 * Sample data for the live stats and canary screenshots, on a LOCAL data dir
 * only: forty-odd sample shops (accounts named "Sample shop NN") run the
 * launch agents and use, edit, run again and rate the results with a fixed
 * pseudo-random spread; Hook Writer gets a canary on a quarter of live runs
 * with its gold set run on the bench; Caption Writer has an earlier canary
 * that stopped on its own; Script Writer has one the gate refused and that
 * was rolled back. Everything on the FAKE provider: no key, no network, no
 * money. Never run it against a real data dir.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-stats-screens npx tsx scripts/seed-stats.ts maya@example.com
 *
 * Needs the launch set (npm run agents:launch), the owner signed in once, and
 * a builder account named Funkai (the screenshot script joins one first).
 * Prints the ids the screenshot script opens, as one line of JSON.
 */
import { join } from "node:path";
import type { Principal } from "@/lib/accounts/accounts";
import { dataDirFromEnv, localAccounts } from "@/lib/accounts/local";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { copyAll } from "@/lib/app/results";
import type { Builder } from "@/lib/builder/builder";
import { localBrandBrains, localBuilder } from "@/lib/builder/local";
import { jsonFileBuilderStore } from "@/lib/builder/store";
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import { sampleReferences } from "@/lib/quality/service";
import { localEngine } from "@/lib/runs/engine";
import type { Run } from "@/lib/runs/run";
import { localPrivacy } from "@/lib/safety/local";
import { localRouter, localStats } from "@/lib/stats/local";

if (process.env.OPENROUTER_API_KEY) throw new Error("Run this with OPENROUTER_API_KEY empty: sample data is made on the fake provider only.");
const dir = dataDirFromEnv();
if (!/wovi-stats-screens|tmp|scratch/.test(dir)) throw new Error(`Refusing to seed sample data into ${dir}. Use a throwaway data dir like /tmp/wovi-stats-screens.`);

const as = (userId: string): Principal => ({ kind: "user", userId });

/** A fixed pseudo-random sequence, so the numbers are the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a person kept after editing: their own first line, sometimes a line of their own at the end. */
function keptVersion(draft: string, n: number): string {
  const lines = draft.split("\n");
  const own = ["Gerald turns nine and still beats us out of bed.", "Our oven, our rules, our six a.m.", "Forty croissants later, the layers hold.", "Ask Margaret about the Saturday loaf.", "Same beans, same price, after midnight."];
  const first = lines.findIndex((l) => l.trim().length > 12);
  if (first >= 0) lines[first] = lines[first].replace(/[^.]*$/, ` ${own[n % own.length]}`).trim();
  if (n % 3 === 0) lines.push("Come by before nine.");
  return lines.join("\n");
}

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: seed-stats.ts <owner email>");
  const accounts = localAccounts(dir);
  const owner = await accounts.findUserByEmail(email);
  if (!owner) throw new Error(`No account for ${email}. Sign in once first.`);
  const funkai = (await accounts.store.users.find({})).find((u) => u.builder && u.name === "Funkai");
  if (!funkai) throw new Error("No builder named Funkai. Join the builder once first.");
  const me = as(funkai.id);

  const builderStore = jsonFileBuilderStore(join(dir, "builder.json"));
  const engine = localEngine({ dataDir: dir, fake: true, brandBrains: localBrandBrains(dir), references: sampleReferences(builderStore.samples), router: localRouter(dir) });
  const late: { builder?: Builder } = {};
  const s = localStats(dir, { accounts, engine, requireBuilder: (c) => late.builder!.requireBuilder(c) });
  // Sample data shows the canary flow, so the builder here has it on; the server shows the panel with WOVI_CANARY=on.
  const builder = (late.builder = localBuilder(accounts, dir, engine, s.releases, true));
  const privacy = localPrivacy(accounts, dir);

  // The sample shops: real accounts on this local dir, each with its own workspace. Half allow their edits to improve agents.
  const shops: { id: string; ws: string }[] = [];
  for (let i = 1; i <= 90; i++) {
    const { user } = await accounts.ensureUser(`sample-shop-${String(i).padStart(2, "0")}@example.com`);
    if (!user.name) await accounts.store.users.update({ ...user, name: `Sample shop ${String(i).padStart(2, "0")}`, updatedAt: accounts.iso() });
    if (i % 2 === 0 && !(await privacy.consent(user.id))?.improveAgents) await privacy.setConsent(user.id, true);
    shops.push({ id: user.id, ws: user.personalWorkspaceId });
  }

  const gold = (agentId: string) => (LAUNCH_SAMPLES[agentId] ?? []).filter((x) => x.label === "gold");
  const run = async (agentId: string, ws: string, i: number): Promise<Run> => {
    const samples = gold(agentId);
    const r = await engine.submitRun({ workspaceId: ws, agentId, agentWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: samples[i % samples.length].inputs, confirmations: { rights: true } });
    return engine.waitForRun(ws, r.id);
  };

  /** What a sample shop does with a result, from a fixed spread: use, edit, run again or nothing, and sometimes a rating. */
  const act = async (r: Run, by: string, p: { use: number; edit: number; again: number; rate: number; up: number }, roll: () => number, n: number) => {
    if (r.status !== "succeeded" || !r.output) return;
    const x = roll();
    if (x < p.use) await s.feedback.record({ workspaceId: r.workspaceId, runId: r.id, action: "use", by, source: n % 4 === 0 ? "review" : "app", how: n % 4 === 0 ? "approve" : "copy_all" });
    else if (x < p.use + p.edit) await s.feedback.record({ workspaceId: r.workspaceId, runId: r.id, action: "edit", by, source: "app", kept: keptVersion(copyAll(r.output), n) });
    else if (x < p.use + p.edit + p.again) await s.feedback.record({ workspaceId: r.workspaceId, runId: r.id, action: "regenerate", by, source: "app", how: n % 3 === 0 ? "quick_edit" : "regenerate" });
    if (roll() < p.rate) {
      const up = roll() < p.up;
      const notes = up ? ["Names the shop in every line.", "Exactly how we talk.", ""] : ["Too salesy for us.", "The hooks start the same way.", ""];
      await s.feedback.record({ workspaceId: r.workspaceId, runId: r.id, action: "rating", by, source: "app", rating: up ? "up" : "down", note: notes[n % notes.length] || null });
    }
  };

  // Ordinary live use of every launch agent.
  const plan: [string, number, { use: number; edit: number; again: number; rate: number; up: number }][] = [
    ["idea-generator", 26, { use: 0.6, edit: 0.1, again: 0.18, rate: 0.8, up: 0.86 }],
    ["caption-writer", 30, { use: 0.5, edit: 0.26, again: 0.14, rate: 0.8, up: 0.82 }],
    ["script-writer", 24, { use: 0.46, edit: 0.3, again: 0.18, rate: 0.85, up: 0.78 }],
    ["hashtag-picker", 28, { use: 0.7, edit: 0.08, again: 0.1, rate: 0.75, up: 0.9 }],
    ["repurposer", 9, { use: 0.6, edit: 0.2, again: 0.1, rate: 0.7, up: 0.8 }],
    ["hook-writer", 24, { use: 0.55, edit: 0.2, again: 0.16, rate: 0.85, up: 0.84 }],
  ];
  for (const [k, [agentId, count, p]] of plan.entries()) {
    const roll = rng(1000 + k);
    for (let i = 0; i < count; i++) {
      const shop = shops[(i * 7 + k * 11) % shops.length];
      await act(await run(agentId, shop.ws, i), shop.id, p, roll, i);
    }
  }

  // Caption Writer: an earlier canary that people kept asking another try for. It stops on its own (stop rules at 10 runs a side).
  const caption = (await builder.getAgent(me, "caption-writer"))!.spec;
  await builder.saveAgent(me, "caption-writer", { instructions: `${caption.instructions}\nLead with an offer in the first line.` }, { note: "Offer first", release: { mode: "canary", share: 50, thresholds: { minRuns: 10 } } });
  const capRoll = rng(77);
  for (let i = 0; i < 30; i++) {
    const shop = shops[(i * 13 + 5) % shops.length];
    const r = await run("caption-writer", shop.ws, i);
    await act(r, shop.id, r.release?.arm === "canary" ? { use: 0.25, edit: 0.15, again: 0.55, rate: 0.6, up: 0.4 } : { use: 0.55, edit: 0.25, again: 0.12, rate: 0.6, up: 0.85 }, capRoll, i);
  }
  await s.releases.check(PLATFORM_WORKSPACE_ID, "caption-writer");

  // Script Writer: a canary the gate refused (no gold set yet), then rolled back.
  const script = (await builder.getAgent(me, "script-writer"))!.spec;
  await builder.saveAgent(me, "script-writer", { instructions: `${script.instructions}\nEnd every script on a question.` }, { note: "Question at the end", release: { mode: "canary", share: 10 } });
  await builder.release.promote(me, "script-writer").catch(() => undefined);
  await builder.release.rollBack(me, "script-writer");

  // Hook Writer: a canary on a quarter of live runs, its gold set run on the bench for both versions.
  const hook = (await builder.getAgent(me, "hook-writer"))!.spec;
  await builder.saveAgent(me, "hook-writer", { instructions: `${hook.instructions}\nName the shop, the person or the thing in every hook.` }, { note: "Name something real in every hook", release: { mode: "canary", share: 25 } });
  await builder.release.runGoldSet(me, "hook-writer");
  await engine.idle();
  for (const b of await builderStore.benches.find({ agentId: "hook-writer" })) if (b.status === "running") await builder.bench.get(me, b.id);
  const hookRoll = rng(4242);
  for (let i = 0; i < 120; i++) {
    const shop = shops[i % shops.length];
    const r = await run("hook-writer", shop.ws, i);
    await act(r, shop.id, r.release?.arm === "canary" ? { use: 0.66, edit: 0.16, again: 0.08, rate: 0.85, up: 0.9 } : { use: 0.55, edit: 0.2, again: 0.16, rate: 0.85, up: 0.84 }, hookRoll, i);
  }
  await s.releases.check(PLATFORM_WORKSPACE_ID, "hook-writer");

  // A result in the owner's own workspace, used and rated, for the run screen.
  const mine = await run("hook-writer", owner.personalWorkspaceId, 0);
  await s.feedback.record({ workspaceId: mine.workspaceId, runId: mine.id, action: "use", by: owner.id, source: "app", how: "copy_all" });
  await s.feedback.record({ workspaceId: mine.workspaceId, runId: mine.id, action: "rating", by: owner.id, source: "app", rating: "up" });
  await engine.idle();

  console.log(JSON.stringify({ workspace: owner.personalWorkspaceId, run: mine.id, hookVersion: mine.agent.version }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
