/**
 * What the builder's pipeline pages read: the platform's pipelines with
 * their listing rows, and every platform agent with every version's shape,
 * so the editor can validate a chain on each change. Server only.
 */
import type { Principal } from "@/lib/accounts/accounts";
import { appAgents } from "@/lib/accounts/server";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { appPipelines } from "./server";
import type { AgentShape } from "./validate";

export type BuilderAgentOption = { id: string; name: string; current: string; status: string; versions: AgentShape[] };

export async function builderAgentOptions(me: Principal): Promise<BuilderAgentOption[]> {
  const agents = appAgents();
  const out: BuilderAgentOption[] = [];
  for (const a of await agents.list(me, PLATFORM_WORKSPACE_ID)) {
    if (a.status === "hidden") continue;
    const versions: AgentShape[] = [];
    for (const v of await agents.versions(me, PLATFORM_WORKSPACE_ID, a.id)) {
      const s = await agents.get(me, PLATFORM_WORKSPACE_ID, a.id, v.version);
      if (s) versions.push({ id: s.id, version: s.version, name: s.name, inputs: s.inputs, output: s.output, guardrails: s.guardrails, brandBrain: s.brandBrain });
    }
    out.push({ id: a.id, name: a.name, current: a.version, status: a.status, versions });
  }
  return out;
}

export async function builderPipelines(me: Principal) {
  const pipelines = appPipelines();
  const [specs, rows] = await Promise.all([pipelines.list(me, PLATFORM_WORKSPACE_ID), pipelines.rows(me, PLATFORM_WORKSPACE_ID)]);
  const out = [];
  for (const spec of specs) {
    const row = rows.find((r) => r.pipelineId === spec.id);
    const versions = await pipelines.versions(me, PLATFORM_WORKSPACE_ID, spec.id);
    out.push({ spec, updatedAt: row?.updatedAt ?? "", versions });
  }
  return out;
}
