/**
 * Work to look at for the phase 12 screenshots: a workspace with every launch
 * Brand Brain and a few dozen runs of every live agent, most of them ready,
 * some rewritten by the quality gate, a few still under the bar; people's
 * decisions with change requests; and bench runs with ratings in the
 * builder's workspace. Local only, on the FAKE provider with scripted
 * answers: no key, no network, no money.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-quality-screens npx tsx scripts/seed-quality.ts maya@example.com
 *
 * Prints the ids the screenshot script opens, as one line of JSON.
 */
import { join } from "node:path";
import type { Principal } from "@/lib/accounts/accounts";
import { dataDirFromEnv, localAccounts } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { jsonFileAppStore } from "@/lib/app/store";
import { exampleImages } from "@/lib/brand/example-images";
import { localBrands } from "@/lib/brand/local";
import { seedBrains } from "@/lib/brand/seeds";
import { jsonFileBrandStore } from "@/lib/brand/store";
import { localBrandBrains } from "@/lib/builder/local";
import { localFileStorage } from "@/lib/builder/storage";
import { jsonFileBuilderStore } from "@/lib/builder/store";
import { LAUNCH_BRAINS } from "@/lib/launch/brains";
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { localPipelines } from "@/lib/pipelines/local";
import { sampleReferences } from "@/lib/quality/service";
import { RunEngine } from "@/lib/runs/engine";
import { defaultAnswer, fakeProvider, type FakeOptions } from "@/lib/runs/providers/fake";
import type { CompletionRequest } from "@/lib/runs/providers/types";
import { jsonFileRunStore } from "@/lib/runs/store";
import { jsonFileTeamStore } from "@/lib/team/store";
import { Team } from "@/lib/team/team";

const as = (userId: string): Principal => ({ kind: "user", userId });
const lastUser = (req: CompletionRequest) => req.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
const SKIP = new Set(["type", "platform", "section", "format", "where", "seconds"]);

/** Puts stock lines (and, when asked, a claim) into the first text of a default answer. */
function dirty(req: CompletionRequest, claim: boolean): string {
  const answer = JSON.parse(defaultAnswer(req)) as unknown;
  const lines = ["You won't believe this game-changing", claim ? "Guaranteed results, every time:" : "Unlock your"];
  let n = 0;
  const walk = (v: unknown, key = ""): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if (typeof v === "string" && !SKIP.has(key) && n < lines.length) return `${lines[n++]} ${v.charAt(0).toLowerCase()}${v.slice(1)}`;
    return v;
  };
  return JSON.stringify(walk(answer));
}

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: seed-quality.ts <owner email>");
  const dir = dataDirFromEnv();
  const accounts = localAccounts(dir);
  const owner = await accounts.findUserByEmail(email);
  if (!owner) throw new Error(`No account for ${email}. Sign in once first.`);
  const ws = owner.personalWorkspaceId;
  const row = (await accounts.store.workspaces.get(ws))!;
  await accounts.store.workspaces.update({ ...row, name: "Loop Studio", updatedAt: accounts.iso() });
  await accounts.store.users.update({ ...owner, name: "Maya Lind", updatedAt: accounts.iso() });
  const maya = owner.id;
  const { user: al } = await accounts.ensureUser("al@loop.studio");
  await accounts.store.users.update({ ...al, name: "Al Okafor", updatedAt: accounts.iso() });
  if (!(await accounts.roleIn(as(al.id), ws))) await accounts.addMember(ws, al.id, "editor", maya);

  await seedBrains(jsonFileBrandStore(join(dir, "brand-brains.json")), localFileStorage(join(dir, "files")), ws, { images: exampleImages(), examples: LAUNCH_BRAINS });
  const brands = localBrands(accounts, dir);
  const brains = await brands.list(as(maya), ws);
  const brainId = (name: string) => brains.find((b) => b.name === name)?.id;
  const builderStore = jsonFileBuilderStore(join(dir, "builder.json"));

  const engine = (fake: FakeOptions = {}) =>
    new RunEngine({
      registry: localRegistry(dir),
      store: jsonFileRunStore(join(dir, "runs.json")),
      brandBrains: localBrandBrains(dir),
      references: sampleReferences(builderStore.samples),
      providers: { fake: fakeProvider(fake) },
      providerOverride: "fake",
    });
  const clean = engine();
  // The first answer has stock lines; the gate's rewrite comes back clean.
  const rewrites = engine({ respond: (req) => (lastUser(req).startsWith("Rewrite your last answer") ? undefined : dirty(req, false)) });
  // Stock lines and a claim, every time: it stays under the bar.
  const stuck = engine({ respond: (req) => dirty(req, true) });

  const pipelines = localPipelines(accounts, clean, dir).engine;
  const team = new Team({ accounts, runs: clean, pipelines, registry: localRegistry(dir), brands, app: jsonFileAppStore(join(dir, "app.json")), store: jsonFileTeamStore(join(dir, "team.json")) });

  const run = async (e: RunEngine, agentId: string, brain: string, inputs: Record<string, unknown>, home = ws, who = maya) => {
    const id = home === ws ? brainId(brain) : undefined;
    const r = await e.submitRun({ workspaceId: home, agentId, agentWorkspaceId: PLATFORM_WORKSPACE_ID, inputs, ...(id ? { brandBrainId: id } : {}), confirmations: { rights: true } });
    if (home === ws) await team.recordMade(as(who), ws, r.id, "run");
    await e.waitForRun(home, r.id);
    return r.id;
  };

  const live = LAUNCH_AGENTS.filter((a) => a.status === "live");
  const notes: Record<string, string[]> = {
    "hook-writer": ["Name the person in the first line.", "Shorter, under ten words.", "Name the person in the first line", "Less salesy, more like the shop talks."],
    "caption-writer": ["Put the price in the first line.", "Too long for X."],
    "script-writer": ["Open on the hands, not the face."],
    "idea-generator": ["Fewer how-tos, more of the people in the shop."],
    "hashtag-picker": ["Make one tag local.", "Make one tag local"],
    repurposer: ["Keep the 61p exactly."],
  };
  // Every live agent: its golden inputs, clean; one or two rewritten by the gate; a few under the bar; decisions on most.
  for (const [k, a] of live.entries()) {
    const gold = (LAUNCH_SAMPLES[a.id] ?? []).filter((s) => s.label === "gold");
    const ids: string[] = [];
    // Hook Writer gets twice the runs, so the builder roll-up has more to group.
    for (let round = 0; round < (a.id === "hook-writer" ? 2 : 1); round++) for (const s of gold) ids.push(await run(clean, a.id, s.brain, s.inputs));
    for (const s of gold.slice(0, 1 + (k % 2))) ids.push(await run(rewrites, a.id, s.brain, s.inputs));
    if (k % 3 !== 1) ids.push(await run(stuck, a.id, gold[0].brain, gold[0].inputs));
    const asks = notes[a.id] ?? [];
    let asked = 0;
    for (const [i, id] of ids.slice(0, ids.length - 1).entries()) {
      if (i % 3 === 1 && asked < asks.length) await team.decide(as(maya), ws, id, "request_changes", asks[asked++]);
      else if (i === ids.length - 2 && k % 2 === 0) await team.decide(as(maya), ws, id, "reject", "Not for us this week.");
      else await team.decide(as(maya), ws, id, "approve", "");
    }
  }
  await clean.idle();

  // The ones the screenshots open.
  const ready = await run(clean, "hook-writer", "Crumb and Co", { idea: "Gerald the sourdough starter turns nine on Saturday and gets his own cake", platform: "tiktok", who_for: "neighbours who buy bread on the way to work" }, ws, al.id);
  const rewritten = await run(rewrites, "hook-writer", "Night Owl Coffee", { idea: "We now do decaf after midnight, same beans, same price, for the night shift crowd", platform: "x", who_for: "night shift workers and students up late" }, ws, al.id);
  const review = await run(stuck, "caption-writer", "Twelve Quid Kitchen", { post: "Me cooking a chickpea curry that cost 61p a portion, receipt on screen", platforms: ["tiktok", "reels"], length: "short" }, ws, al.id);

  // Bench runs in the builder's workspace, with ratings, for the roll-up.
  const benchIds: string[] = [];
  for (const s of (LAUNCH_SAMPLES["hook-writer"] ?? []).filter((x) => x.label === "gold")) benchIds.push(await run(clean, "hook-writer", s.brain, s.inputs, PLATFORM_WORKSPACE_ID));
  benchIds.push(await run(rewrites, "hook-writer", "", LAUNCH_SAMPLES["hook-writer"][1].inputs, PLATFORM_WORKSPACE_ID));
  benchIds.push(await run(stuck, "hook-writer", "", LAUNCH_SAMPLES["hook-writer"][2].inputs, PLATFORM_WORKSPACE_ID));
  const version = (await localRegistry(dir).get(PLATFORM_WORKSPACE_ID, "hook-writer"))!.version;
  const rated: [string, "good" | "ok" | "bad", string][] = [
    [benchIds[0], "good", "Names Margaret and the weight in every line."],
    [benchIds[1], "good", ""],
    [benchIds[2], "ok", "Fine, but three lines start the same way."],
    [benchIds[4], "ok", "Rewrite fixed the stock line."],
    [benchIds[5], "bad", "A guarantee slipped in. Never for a gym."],
  ];
  const have = new Set((await builderStore.ratings.find({ agentId: "hook-writer" })).map((r) => r.runId));
  for (const [i, [runId, rating, note]] of rated.entries()) {
    if (!runId || have.has(runId)) continue;
    await builderStore.ratings.insert({ id: `rat_seed_${Date.now()}_${i}`, workspaceId: PLATFORM_WORKSPACE_ID, agentId: "hook-writer", version, runId, rating, note, createdBy: "seed", createdAt: new Date().toISOString() });
  }

  console.log(JSON.stringify({ workspace: ws, ready, rewritten, review }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
