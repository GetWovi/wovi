/**
 * What the REST API and MCP return (phase 14), built field by field from the
 * public views below them. Nothing is spread from a spec or a run, so a field
 * added there later (a model, an instruction, a cost) never leaks here by
 * accident. The shapes are the zod schemas in schemas.ts.
 */
import type { PublicAgent, PublicRun } from "@/lib/accounts/guard";
import type { AgentInput } from "@/lib/agents/spec";
import type { ReviewRow } from "@/lib/app/types";
import type { BrainSummary } from "@/lib/brand/brains";
import type { PublicPipelineRun } from "@/lib/pipelines/run";
import type { PipelineSpec } from "@/lib/pipelines/spec";
import type { Candidate } from "@/lib/pipelines/run";
import { gateFor } from "@/lib/quality/data";
import type { PublicScorecard } from "@/lib/quality/scorecard";
import type { DeliveryAttempt, EndpointView, WebhookDelivery } from "@/lib/webhooks/types";
import type { ApiAgent, ApiBrandBrain, ApiDelivery, ApiInputField, ApiOption, ApiPipeline, ApiPipelineRun, ApiRun, ApiWebhook } from "./schemas";

type JsonSchema = Record<string, unknown>;

/* ---------- Inputs ---------- */

export function inputField(i: AgentInput): ApiInputField {
  const out: ApiInputField = { key: i.key, label: i.label, type: i.type, required: i.required };
  if (i.help) out.help = i.help;
  if ("limits" in i && i.limits) out.limits = { ...i.limits };
  if (i.type === "choice") {
    out.options = i.options.map((o) => ({ value: o.value, label: o.label }));
    out.multiple = i.multiple;
    if (i.default !== undefined) out.default = i.default;
  }
  if (i.type === "number" && i.default !== undefined) out.default = i.default;
  return out;
}

const describe = (i: AgentInput) => [i.label + ".", i.help].filter(Boolean).join(" ");

/** One input as JSON Schema, from its typed spec. */
export function inputJsonSchema(i: AgentInput): JsonSchema {
  const description = describe(i);
  switch (i.type) {
    case "text":
    case "long_text":
      return { type: "string", description, ...(i.limits.minLength ? { minLength: i.limits.minLength } : {}), maxLength: i.limits.maxLength };
    case "url":
      return { type: "string", format: "uri", description: `${description} A full https:// link.` };
    case "choice": {
      const values = i.options.map((o) => o.value);
      const labels = i.options.map((o) => `${o.value} (${o.label})`).join(", ");
      const d = `${description} Options: ${labels}.`;
      return i.multiple
        ? { type: "array", items: { type: "string", enum: values }, uniqueItems: true, description: d, ...(i.default !== undefined ? { default: i.default } : {}) }
        : { type: "string", enum: values, description: d, ...(i.default !== undefined ? { default: i.default } : {}) };
    }
    case "number":
      return { type: "number", minimum: i.limits.min, maximum: i.limits.max, description, ...(i.limits.step ? { multipleOf: i.limits.step } : {}), ...(i.default !== undefined ? { default: i.default } : {}) };
    case "profile":
      return { type: "string", description: `${description} A Brand Brain id from GET /brand-brains. Leave it out for the default.` };
    case "file":
    case "image":
    case "video":
      return {
        type: "array",
        maxItems: i.limits.maxFiles,
        description: `${description} Files already uploaded to WOVI. Uploads through the API come later.`,
        items: { type: "object", required: ["assetId", "name", "mimeType", "sizeMb"], properties: { assetId: { type: "string" }, name: { type: "string" }, mimeType: { type: "string" }, sizeMb: { type: "number" } } },
      };
  }
}

/** A whole form as JSON Schema: what `inputs` must look like. */
export function inputsJsonSchema(inputs: AgentInput[]): JsonSchema {
  return {
    type: "object",
    properties: Object.fromEntries(inputs.map((i) => [i.key, inputJsonSchema(i)])),
    required: inputs.filter((i) => i.required && !((i.type === "choice" || i.type === "number") && i.default !== undefined)).map((i) => i.key),
    additionalProperties: false,
  };
}

/** One line per input, for an assistant: "idea (required, long text, 10 to 600 characters): Your idea. ..." */
export function inputLines(inputs: AgentInput[]): string[] {
  return inputs.map((i) => {
    const bits: string[] = [i.required ? "required" : "optional", i.type.replace("_", " ")];
    if (i.type === "text" || i.type === "long_text") bits.push(i.limits.minLength ? `${i.limits.minLength} to ${i.limits.maxLength} characters` : `up to ${i.limits.maxLength} characters`);
    if (i.type === "choice") bits.push(`${i.multiple ? "any of" : "one of"} ${i.options.map((o) => o.value).join(", ")}${i.default !== undefined ? `, default ${Array.isArray(i.default) ? i.default.join(", ") : i.default}` : ""}`);
    if (i.type === "number") bits.push(`${i.limits.min} to ${i.limits.max}`);
    if (i.type === "profile") bits.push("a Brand Brain id, or leave out for the default");
    return `${i.key} (${bits.join(", ")}): ${describe(i)}`;
  });
}

/* ---------- Agents ---------- */

export function apiAgent(spec: PublicAgent, extra: { scorecard: PublicScorecard | null; estimate: number | null }): ApiAgent {
  const card = extra.scorecard;
  return {
    id: spec.id,
    version: spec.version,
    name: spec.name,
    job: spec.job,
    category: spec.category,
    platforms: [...spec.platforms],
    inputs: spec.inputs.map(inputField),
    inputSchema: inputsJsonSchema(spec.inputs),
    output: { ...spec.output },
    brandBrainParts: [...spec.brandBrain],
    confirmations: { rights: spec.guardrails.includes("rights_confirmed"), voiceConsent: spec.guardrails.includes("voice_consent") },
    quality: {
      bar: gateFor(spec).minScore,
      scorecard: {
        runs: card?.runs ?? 0,
        passRate: card?.passRate ?? null,
        averageScore: card?.avgScore ?? null,
        approvalRate: card?.approvalRate ?? null,
        changesAskedRate: card?.changesRate ?? null,
        isNew: !(card?.enough ?? false),
        summary: card?.words.headline ?? "New agent.",
      },
    },
    estimate: { credits: extra.estimate },
  };
}

/* ---------- Runs ---------- */

export function apiRun(run: PublicRun, agentName: string | null, review: ReviewRow | null): ApiRun {
  const q = run.quality;
  return {
    id: run.id,
    status: run.status,
    agent: { id: run.agent.id, version: run.agent.version, name: agentName },
    inputs: { ...run.inputs },
    brandBrain: run.brandBrain ? { id: run.brandBrain.id, name: run.brandBrain.name ?? null } : null,
    output: run.output ? (structuredClone(run.output) as ApiRun["output"]) : null,
    ready: run.status === "succeeded" && !run.needsReview,
    needsReview: run.needsReview,
    quality: q
      ? {
          score: q.score,
          bar: q.threshold,
          verdict: q.verdict,
          reasons: [...q.reasons],
          rewrites: q.rewrites,
          checks: q.checks.map((c) => ({ id: c.id, label: c.label, status: c.status, score: c.score, reasons: [...c.reasons] })),
        }
      : null,
    flags: run.checks.filter((c) => c.status === "fail").map((c) => ({ check: c.check, message: c.message, findings: [...(c.findings ?? [])] })),
    error: run.error ? { code: run.error.code, message: run.error.message } : null,
    charge: run.charge ? { estimate: run.charge.estimate, charged: run.charge.charged, back: run.charge.back, state: run.charge.state } : null,
    decision: review ? { decision: review.decision, note: review.note, at: review.at } : null,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
  };
}

/* ---------- Pipelines ---------- */

export function apiPipeline(spec: PipelineSpec, steps: { id: string; label: string; agentId: string; agentName: string }[], confirmations: { rights: boolean; voice: boolean }, estimate: number | null): ApiPipeline {
  return {
    id: spec.id,
    version: spec.version,
    name: spec.name,
    job: spec.job,
    inputs: spec.inputs.map(inputField),
    inputSchema: inputsJsonSchema(spec.inputs),
    steps: steps.map((s) => ({ id: s.id, label: s.label, agent: { id: s.agentId, name: s.agentName } })),
    confirmations: { rights: confirmations.rights, voiceConsent: confirmations.voice },
    estimate: { credits: estimate },
  };
}

const option = (c: Candidate, index: number): ApiOption => ({ index, label: c.label, text: c.text, fields: c.fields ? { ...c.fields } : null, brandFit: c.brandFit, flags: [...c.flags] });

export function apiPipelineRun(run: PublicPipelineRun): ApiPipelineRun {
  const waitingStep = run.status === "waiting" ? run.steps.find((s) => s.status === "waiting") : undefined;
  const def = waitingStep ? run.spec.steps.find((s) => s.id === waitingStep.id) : undefined;
  return {
    id: run.id,
    status: run.status,
    pipeline: { id: run.pipeline.id, version: run.pipeline.version, name: run.pipeline.name },
    inputs: { ...run.inputs },
    brandBrain: run.brandBrain ? { id: run.brandBrain.id, name: run.brandBrain.name } : null,
    needsReview: run.needsReview,
    waiting: waitingStep
      ? {
          step: waitingStep.id,
          label: waitingStep.label,
          prompt: def?.choose?.kind === "ask" ? def.choose.label : "Pick one",
          options: waitingStep.candidates.map(option),
          suggested: waitingStep.suggested,
        }
      : null,
    steps: run.steps.map((s) => ({
      id: s.id,
      label: s.label,
      status: s.status,
      agent: { id: s.agent.id, version: s.agent.version, name: s.agent.name },
      output: s.output ? (structuredClone(s.output) as ApiRun["output"]) : null,
      picked: s.picked ? { index: s.picked.index, by: s.picked.by } : null,
      quality: s.quality ? { score: s.quality.score, bar: s.quality.threshold, verdict: s.quality.verdict, reasons: [...s.quality.reasons] } : null,
      error: s.error ? { code: s.error.code, message: s.error.message } : null,
    })),
    package: run.package
      ? run.package.map((p) => ({
          step: p.step,
          label: p.label,
          item: p.item ? { label: p.item.label, text: p.item.text, fields: p.item.fields ? { ...p.item.fields } : null, brandFit: p.item.brandFit, flags: [...p.item.flags] } : null,
          output: p.output ? (structuredClone(p.output) as ApiRun["output"]) : null,
          brandFit: p.brandFit,
          flags: [...p.flags],
        }))
      : null,
    decision: run.decision ? { decision: run.decision.decision, note: run.decision.note, at: run.decision.at } : null,
    error: run.error ? { code: run.error.code, message: run.error.message, step: run.error.step } : null,
    charge: run.charge ? { estimate: run.charge.estimate, charged: run.charge.charged, back: run.charge.back, state: run.charge.state } : null,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
  };
}

/* ---------- The rest ---------- */

export function apiBrain(b: BrainSummary): ApiBrandBrain {
  return { id: b.id, name: b.name, isDefault: b.isDefault, niche: b.niche, platforms: [...b.platforms], voice: b.voice, tone: [...b.tone], updatedAt: b.updatedAt };
}

export function apiWebhook(e: EndpointView): ApiWebhook {
  return { id: e.id, url: e.url, events: [...e.events], description: e.description, secretHint: e.secretHint, paused: e.pausedAt !== null, createdAt: e.createdAt };
}

const attempt = (a: DeliveryAttempt) => ({ n: a.n, at: a.at, status: a.status, ms: a.ms, ...(a.error ? { error: a.error } : {}), sender: a.sender });

export function apiDelivery(d: WebhookDelivery): ApiDelivery {
  return { id: d.id, eventId: d.eventId, type: d.type, status: d.status, attempts: d.attempts.map(attempt), nextAttemptAt: d.nextAttemptAt, createdAt: d.createdAt };
}
