/** A small valid spec for tests to start from and break on purpose. */
import type { CreateInput } from "./registry";

export function goodSpec(overrides: Partial<CreateInput> = {}): CreateInput {
  return {
    id: "test-agent",
    version: "1.0.0",
    name: "Test Agent",
    job: "Writes one test line.",
    category: "writing",
    platforms: ["x"],
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true, limits: { maxLength: 200 } },
      { key: "tone", label: "Tone", type: "choice", required: false, options: [{ value: "calm", label: "Calm" }, { value: "loud", label: "Loud" }] },
    ],
    output: { kind: "list", count: 3 },
    brandBrain: ["voice"],
    tools: ["trend_lookup"],
    guardrails: ["no_misleading_claims"],
    routing: { model: "text-standard", fallback: "text-fast", maxCostUsd: 0.05 },
    instructions: "Write three lines about {{topic}} in this voice: {{brand.voice}}",
    owner: { kind: "creator", creatorId: "creator_test" },
    status: "draft",
    visibility: "public",
    ...overrides,
  };
}
