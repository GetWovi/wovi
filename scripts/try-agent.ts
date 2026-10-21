/**
 * Runs one launch agent end to end on the FAKE provider and prints the run.
 * Never calls a real model. Local only.
 *
 *   npm run agents:try -- hook-writer
 *   npm run agents:try -- hook-writer '{"idea":"...","platform":"x"}'
 */
import { PLATFORM_WORKSPACE_ID, localRegistry, seedPlatformAgents } from "@/lib/agents";
import { SAMPLE_RUNS, localEngine } from "@/lib/runs";

const WORKSPACE = "ws_dev";

async function main() {
  const [agentId, json] = process.argv.slice(2);
  if (!agentId) {
    console.error(`Usage: npm run agents:try -- <agent-id> ['{"input":"value"}']\nAgents with sample inputs: ${Object.keys(SAMPLE_RUNS).join(", ")}`);
    process.exit(1);
  }
  await seedPlatformAgents(localRegistry());

  const sample = SAMPLE_RUNS[agentId];
  const inputs = json ? JSON.parse(json) : sample?.inputs;
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
