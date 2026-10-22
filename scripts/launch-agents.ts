/**
 * Installs the launch set into a data dir: the phase 2 seeds as the base,
 * seven Brand Brains, the seven launch agents as new versions, and their
 * golden samples. Local only, safe to run again. See docs/launch-agents.md.
 *
 *   npm run agents:launch
 *   npm run agents:launch -- --bench          then runs every sample once on the FAKE provider
 *   WOVI_DATA_DIR=/path npm run agents:launch to install somewhere else, like a copy for the test site
 *
 * The bench always uses the fake provider, even when OPENROUTER_API_KEY is
 * set: it proves the plumbing (shapes, guardrails, brand fit) and spends
 * nothing. Judge quality on the builder's bench with a real model.
 */
import { join } from "node:path";
import { dataDirFromEnv, localAccounts } from "@/lib/accounts/local";
import { localRegistry } from "@/lib/agents/registry";
import { exampleImages } from "@/lib/brand/example-images";
import { jsonFileBrandStore } from "@/lib/brand/store";
import { localBrandBrains, localBuilder } from "@/lib/builder/local";
import { localFileStorage } from "@/lib/builder/storage";
import { LAUNCH_AGENTS, LAUNCH_AUTHOR_ID, installLaunchSet } from "@/lib/launch";
import { localEngine } from "@/lib/runs/engine";
import { toUsd } from "@/lib/runs/prices";

async function main() {
  const bench = process.argv.includes("--bench");
  const dataDir = dataDirFromEnv();
  const accounts = localAccounts(dataDir);
  // The fake provider, always: this command never calls a real model.
  const engine = localEngine({ dataDir, fake: true, brandBrains: localBrandBrains(dataDir) });
  const builder = localBuilder(accounts, dataDir, engine);

  const report = await installLaunchSet({
    accounts,
    registry: localRegistry(dataDir),
    builder,
    brands: jsonFileBrandStore(join(dataDir, "brand-brains.json")),
    files: localFileStorage(join(dataDir, "files")),
    images: exampleImages(),
  });

  console.log(`Data dir: ${dataDir}`);
  console.log(`Base seeds created: ${report.base.created.join(", ") || "none"}`);
  console.log(`Brand Brains added: ${report.brains.added.join(", ") || "none"}${report.brains.existing.length ? ` (already there: ${report.brains.existing.length})` : ""}`);
  console.log("Launch agents:");
  for (const a of report.agents) {
    console.log(`  ${a.name.padEnd(20)} ${a.id.padEnd(15)} ${a.version.padEnd(7)} ${a.status.padEnd(6)} ${a.action}${a.reason ? `: ${a.reason}` : ""}`);
  }
  console.log(`Samples added: ${report.samples.added}, already there: ${report.samples.existing}`);
  for (const u of report.samples.unfit) console.log(`  not added, ${u.agentId} / ${u.title}: ${u.reason}`);

  if (!bench) return;
  const me = { kind: "user" as const, userId: LAUNCH_AUTHOR_ID };
  const ids = LAUNCH_AGENTS.map((a) => a.id);
  // Confirmed on purpose: the estimate is what a real model would cost, and the fake provider spends nothing.
  let batch = await builder.bench.runBatch(me, ids, { confirmed: true });
  console.log(`\nBatch ${batch.id} on the fake provider: ${batch.runs} runs (a real model would cost about $${toUsd(batch.estimateMicroUsd).toFixed(2)}, capped at $${toUsd(batch.capMicroUsd).toFixed(2)})`);
  const started = Date.now();
  while (batch.status === "running") {
    if (Date.now() - started > 120_000) throw new Error("The batch did not finish in two minutes.");
    await new Promise((r) => setTimeout(r, 200));
    batch = await builder.bench.getBatch(me, batch.id);
  }
  console.log(`  ${"Agent".padEnd(20)} ${"runs".padEnd(5)} ${"done".padEnd(5)} ${"clean".padEnd(6)} ${"fails".padEnd(6)} refused`);
  for (const a of batch.agents) {
    console.log(`  ${a.name.padEnd(20)} ${String(a.total).padEnd(5)} ${String(a.done).padEnd(5)} ${String(a.passed).padEnd(6)} ${String(a.failedChecks).padEnd(6)} ${a.refused}`);
  }
  console.log(`Batch ${batch.status}. The fake provider writes filler from the inputs, so guardrail fails here say nothing about quality; open /builder/batch to look closer.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
