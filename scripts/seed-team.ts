/**
 * A small agency to look at, for the phase 11 screenshots: the owner's
 * workspace becomes "Loop Studio" with an admin, two editors and a viewer,
 * the example Brand Brains, two clients with their brands, two approvals per
 * item, and a handful of results in every review state with comments,
 * assignments, decisions and a re-run. Local only, on the FAKE provider: no
 * key, no network, no money. Mail goes to the dev mailer's folder.
 *
 *   WOVI_DATA_DIR=/tmp/wovi-team-screens npx tsx scripts/seed-team.ts maya@example.com
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
import { LAUNCH_SAMPLES } from "@/lib/launch/samples";
import { localPipelines } from "@/lib/pipelines/local";
import { localEngine } from "@/lib/runs/engine";
import { jsonFileTeamStore } from "@/lib/team/store";
import { Team } from "@/lib/team/team";

const as = (userId: string): Principal => ({ kind: "user", userId });

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: seed-team.ts <owner email>");
  const dir = dataDirFromEnv();
  const accounts = localAccounts(dir);
  const owner = await accounts.findUserByEmail(email);
  if (!owner) throw new Error(`No account for ${email}. Sign in once first.`);
  const ws = owner.personalWorkspaceId;

  // The agency and its people.
  const row = (await accounts.store.workspaces.get(ws))!;
  await accounts.store.workspaces.update({ ...row, name: "Loop Studio", updatedAt: accounts.iso() });
  await accounts.store.users.update({ ...owner, name: "Maya Lind", updatedAt: accounts.iso() });
  const people: [string, string, "admin" | "editor" | "viewer"][] = [
    ["al@loop.studio", "Al Okafor", "admin"],
    ["ed@loop.studio", "Ed Marsh", "editor"],
    ["edna@loop.studio", "Edna Park", "editor"],
    ["vi@loop.studio", "Vi Santos", "viewer"],
  ];
  const ids: Record<string, string> = {};
  for (const [mail, name, role] of people) {
    const { user } = await accounts.ensureUser(mail);
    await accounts.store.users.update({ ...user, name, updatedAt: accounts.iso() });
    if (!(await accounts.roleIn(as(user.id), ws))) await accounts.addMember(ws, user.id, role, owner.id);
    ids[name.split(" ")[0].toLowerCase()] = user.id;
  }
  const maya = owner.id;
  const { al, ed, edna } = ids;

  // Brands, clients, the rules.
  await seedBrains(jsonFileBrandStore(join(dir, "brand-brains.json")), localFileStorage(join(dir, "files")), ws, { images: exampleImages() });
  const brands = localBrands(accounts, dir);
  const brains = await brands.list(as(maya), ws);
  const brain = (name: string) => brains.find((b) => b.name === name)!;
  const engine = localEngine({ dataDir: dir, brandBrains: localBrandBrains(dir), fake: true });
  const pipelines = localPipelines(accounts, engine, dir).engine;
  const team = new Team({ accounts, runs: engine, pipelines, registry: localRegistry(dir), brands, app: jsonFileAppStore(join(dir, "app.json")), store: jsonFileTeamStore(join(dir, "team.json")) });
  if (!(await team.clients(as(maya), ws)).length) {
    await team.createClient(as(maya), ws, { name: "Northside Bakery", brandBrainIds: [brain("Crumb and Co").id] });
    await team.createClient(as(maya), ws, { name: "Night Owl", brandBrainIds: [brain("Night Owl Coffee").id] });
  }
  await team.saveSettings(as(maya), ws, { approvalsNeeded: 2, approvers: "editors" });

  const run = async (who: string, agentId: string, brainName: string, extra: Record<string, unknown> = {}) => {
    const gold = LAUNCH_SAMPLES[agentId].filter((s) => s.label === "gold");
    const sample = gold.find((s) => s.brain === brainName) ?? gold[0];
    const inputs = { ...sample.inputs, ...extra };
    const r = await engine.submitRun({ workspaceId: ws, agentId, agentWorkspaceId: PLATFORM_WORKSPACE_ID, inputs, brandBrainId: brain(brainName).id });
    await team.recordMade(as(who), ws, r.id, "run");
    await engine.waitForRun(ws, r.id);
    return r.id;
  };

  // In house, rejected.
  const tags = await run(edna, "hashtag-picker", "Desk Stretch");
  await team.decide(as(al), ws, tags, "reject", "Too broad. We want tags people at desks search for.");
  // Night Owl: a caption for Ed to look at.
  const caption = await run(edna, "caption-writer", "Night Owl Coffee");
  await team.assign(as(al), ws, caption, ed);
  await team.comment(as(edna), ws, caption, { body: "Second variant is closest to their menu board voice." });
  // Northside: a script, approved by two people.
  const script = await run(ed, "script-writer", "Crumb and Co");
  await team.decide(as(edna), ws, script, "approve", "");
  await team.decide(as(al), ws, script, "approve", "Shoot it Thursday.");
  // Northside: ideas sent back with changes, and the new draft waiting.
  const ideas = await run(ed, "idea-generator", "Crumb and Co");
  const back = await team.decide(as(al), ws, ideas, "request_changes", "Fewer how-tos, more of the people in the shop.");
  if (back.reRun) await engine.waitForRun(ws, back.reRun);
  // Maya's own work: one approved, one sent back to her.
  const mine = await run(maya, "caption-writer", "Crumb and Co");
  await team.decide(as(al), ws, mine, "approve", "");
  await team.decide(as(ed), ws, mine, "approve", "Lovely.");
  const mine2 = await run(maya, "hook-writer", "Night Owl Coffee", { idea: "We now do decaf after midnight, same beans, same price, for the night shift crowd", who_for: "night shift workers and students up late" });
  const back2 = await team.decide(as(al), ws, mine2, "request_changes", "Open on the 2 a.m. crowd, not the beans.");
  if (back2.reRun) await engine.waitForRun(ws, back2.reRun);
  // The one to look at: Northside hooks, assigned to Maya, with a thread that mentions her.
  const hooks = await run(ed, "hook-writer", "Crumb and Co", { idea: "Gerald the sourdough starter turns nine on Saturday and gets his own cake", who_for: "neighbours who buy bread on the way to work" });
  await team.assign(as(al), ws, hooks, maya);
  const handles = (await team.item(as(al), ws, hooks))!.members;
  const h = (id: string) => handles.find((m) => m.userId === id)!.handle;
  const first = await team.comment(as(al), ws, hooks, { body: `@${h(maya)} the third hook is my pick. Could the first line name Gerald?` });
  await team.comment(as(ed), ws, hooks, { body: "Agreed on three. I can cut the first one if we keep it.", parentId: first.id });
  await team.comment(as(edna), ws, hooks, { body: "Northside asked for no exclamation marks, worth a check before it goes to them.", internal: true });
  await team.decide(as(edna), ws, hooks, "approve", "");
  // A pipeline run for Night Owl, waiting.
  const p = await pipelines.submit({ workspaceId: ws, pipelineId: "repurpose-post", pipelineWorkspaceId: PLATFORM_WORKSPACE_ID, inputs: { post: "Our 2 a.m. regulars voted: the oat flat white stays on the night menu. Thank you, night owls.", posted_on: "x", to: "tiktok", brand: brain("Night Owl Coffee").id }, confirmations: { rights: true }, createdBy: edna });
  await pipelines.waitUntilSettled(ws, p.id);
  await team.recordMade(as(edna), ws, p.id, "pipeline");

  // Night Owl already has a link out, opened once.
  const clients = await team.clients(as(maya), ws);
  const owl = clients.find((c) => c.name === "Night Owl")!;
  if (!owl.links.length) {
    const { token } = await team.createShareLink(as(al), ws, owl.id, { label: "Sam at Night Owl", days: 30 });
    await team.openLink(token);
  }

  console.log(JSON.stringify({ workspace: ws, hooks, caption, ideas, rerun: back.reRun, pipeline: p.id }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
