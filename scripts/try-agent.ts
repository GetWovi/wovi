/**
 * Runs one launch agent end to end on the FAKE provider and prints the run.
 * Never calls a real model. Local only.
 *
 *   npm run agents:try -- hook-writer
 *   npm run agents:try -- hook-writer '{"idea":"...","platform":"x"}'
 */
import { PLATFORM_WORKSPACE_ID, localRegistry, seedPlatformAgents } from "@/lib/agents";
import { LAUNCH_SAMPLES } from "@/lib/launch";
import { SAMPLE_RUNS, localEngine } from "@/lib/runs";
import { validateRunInputs } from "@/lib/runs/inputs";

const WORKSPACE = "ws_dev";

async function main() {
  const [agentId, json] = process.argv.slice(2);
  if (!agentId) {
    console.error(`Usage: npm run agents:try -- <agent-id> ['{"input":"value"}']\nAgents with sample inputs: ${[...new Set([...Object.keys(SAMPLE_RUNS), ...Object.keys(LAUNCH_SAMPLES)])].join(", ")}`);
    process.exit(1);
  }
  const registry = localRegistry();
  await seedPlatformAgents(registry);

  // The phase 3 example inputs fit the seed versions; once npm run agents:launch has saved newer
  // versions, the first golden launch sample that fits the current form is used instead.
  const spec = await registry.get(PLATFORM_WORKSPACE_ID, agentId);
  const launch = (LAUNCH_SAMPLES[agentId] ?? []).filter((s) => s.label === "gold").map((s) => s.inputs);
  const fits = (inputs: Record<string, unknown>) => Boolean(spec && validateRunInputs(spec, inputs).ok);
  const sample = SAMPLE_RUNS[agentId];
  const inputs = json ? JSON.parse(json) : [sample?.inputs, ...launch].find((i) => i && fits(i));
  if (!inputs) throw new Error(`No sample inputs for "${agentId}". Pass them as JSON after the id.`);

  const engine = localEngine({ fake: true });
  const submitted = await engine.submitRun({
    workspaceId: WORKSPACE,
    agentWorkspaceId: PLATFORM_WORKSPACE_ID,
    agentId,
    inputs,
    confirmations: sample?.confirmations,
  });
  const run = await engine.waitForRun(WORKSPACE, submitted.id);

  console.log(JSON.stringify(run, null, 2));
  const failed = run.checks.filter((c) => c.status === "fail").map((c) => c.check);
  console.log(
    [
      "",
      `${run.agent.id}@${run.agent.version}: ${run.status}${run.error ? ` (${run.error.code}: ${run.error.message})` : ""}`,
      `model: ${run.model ? `${run.model.route} -> ${run.model.provider} standing in for ${run.model.model}` : "none"}`,
      `tokens: ${run.tokensIn} in, ${run.tokensOut} out; cost at the real model's price: $${run.costUsd.toFixed(6)} (cap $${run.capMicroUsd / 1e6})`,
      `checks: ${failed.length ? `failed ${failed.join(", ")}; needs review` : "all passed"}`,
      `saved in .data/runs.json as ${run.id}`,
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
