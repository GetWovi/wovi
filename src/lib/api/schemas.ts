/**
 * The shapes of the REST API and MCP (phase 14), as zod schemas. One source:
 * request bodies are checked with them, responses are built to fit them (the
 * tests parse real responses with them), and the OpenAPI document at
 * /api/v1/openapi.json is generated from them.
 */
import { z } from "zod";
import { API_ERROR_CODES } from "./errors";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/types";

/* ---------- Requests ---------- */

const id = z.string().min(1).max(100);

export const ConfirmationsSchema = z
  .strictObject({
    rights: z.boolean().optional().describe("You own the material or have the right to use it. Agents that rework posts ask for it."),
    voiceConsent: z.boolean().optional().describe("You have the person's consent to use their voice."),
  })
  .describe("Confirmations some agents ask for before they run.");

export const StartRunBody = z
  .strictObject({
    inputs: z.record(z.string(), z.unknown()).describe("The agent's form values by input key. See the agent's inputSchema."),
    brandBrainId: id.optional().describe("The Brand Brain to write for. Leave it out to use the workspace's default."),
    idea: z.string().max(1000).optional().describe("An idea for this run only. It steers agents that read the Brand Brain's idea."),
    confirmations: ConfirmationsSchema.optional(),
    maxCredits: z.number().int().min(1).max(1_000_000).optional().describe("The most this run may hold, in credits. The run never costs more than this or its estimate."),
  })
  .describe("Starts a run of one agent.");

export const StartPipelineBody = z
  .strictObject({
    inputs: z.record(z.string(), z.unknown()).describe("The pipeline's form values by input key. See the pipeline's inputSchema."),
    brandBrainId: id.optional().describe("The Brand Brain every step writes for. Leave it out to use the workspace's default."),
    confirmations: ConfirmationsSchema.optional(),
    maxCredits: z.number().int().min(1).max(1_000_000).optional().describe("The most the whole pipeline may hold, in credits."),
  })
  .describe("Starts a pipeline run.");

export const PickBody = z
  .strictObject({
    step: z.string().min(1).max(40).optional().describe("The step that waits. Leave it out to answer whichever step waits now."),
    index: z.number().int().min(0).describe("The option to pick, counting from 0, as listed in waiting.options."),
  })
  .describe("Answers a pipeline step that waits for a person to pick.");

export const CreateWebhookBody = z
  .strictObject({
    url: z.string().min(1).max(2048).describe("Where to POST. https:// only; http://localhost works while the app runs on your machine."),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).describe("Which events to send."),
    description: z.string().max(120).optional(),
  })
  .describe("Registers a URL for webhook events.");

/* ---------- Responses ---------- */

export const IssueSchema = z.object({ path: z.string().describe('The field, like "inputs.idea".'), message: z.string() });

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.enum(API_ERROR_CODES),
      message: z.string(),
      issues: z.array(IssueSchema).optional(),
      retryAfter: z.number().int().optional().describe("For rate_limited: seconds to wait."),
    }),
  })
  .describe("Every error has this shape.");

export const InputFieldSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    type: z.enum(["text", "long_text", "url", "file", "image", "video", "choice", "number", "profile"]),
    required: z.boolean(),
    help: z.string().optional(),
    limits: z.record(z.string(), z.unknown()).optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    multiple: z.boolean().optional(),
    default: z.unknown().optional(),
  })
  .describe("One field of an agent's or pipeline's form.");

export const OutputShapeSchema = z.looseObject({ kind: z.enum(["text", "list", "script", "caption_set", "post_set", "image", "storyboard", "video"]) }).describe("What one run returns: the kind and its limits.");

export const RunOutputSchema = z
  .looseObject({ kind: z.enum(["text", "list", "script", "caption_set", "post_set"]) })
  .describe("The result in its typed shape: text {text}, list {items}, script {sections}, caption_set {captions}, post_set {posts}.");

export const ScorecardSchema = z.object({
  runs: z.number().int(),
  passRate: z.number().nullable().describe("Share of runs that passed the quality bar, 0 to 1."),
  averageScore: z.number().nullable(),
  approvalRate: z.number().nullable(),
  changesAskedRate: z.number().nullable(),
  isNew: z.boolean().describe("Fewer than 5 runs so far."),
  summary: z.string(),
});

export const AgentSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    name: z.string(),
    job: z.string(),
    category: z.string(),
    platforms: z.array(z.string()),
    inputs: z.array(InputFieldSchema),
    inputSchema: z.record(z.string(), z.unknown()).describe("The inputs as JSON Schema."),
    output: OutputShapeSchema,
    brandBrainParts: z.array(z.string()).describe("The parts of the Brand Brain it reads."),
    confirmations: z.object({ rights: z.boolean(), voiceConsent: z.boolean() }).describe("Confirmations it needs before it runs."),
    quality: z.object({ bar: z.number().int().describe("The score a result needs to be ready, 0 to 100."), scorecard: ScorecardSchema }),
    estimate: z.object({ credits: z.number().int().nullable().describe("About what one run costs, in credits. It never costs more.") }),
  })
  .describe("An agent you can run. Never its instructions or models.");

export const QualitySchema = z.object({
  score: z.number().int(),
  bar: z.number().int(),
  verdict: z.enum(["ready", "needs_review"]),
  reasons: z.array(z.string()),
  rewrites: z.number().int(),
  checks: z.array(z.object({ id: z.string(), label: z.string(), status: z.enum(["pass", "weak", "fail", "skipped"]), score: z.number().nullable(), reasons: z.array(z.string()) })),
});

export const ChargeSchema = z
  .object({ estimate: z.number().int(), charged: z.number().int().nullable(), back: z.number().int().nullable(), state: z.string() })
  .describe("Credits held and charged. Only for keys that may see costs (admin keys); null otherwise.");

export const DecisionSchema = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string(), at: z.string() });

export const RunSchema = z
  .object({
    id: z.string(),
    status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
    agent: z.object({ id: z.string(), version: z.string(), name: z.string().nullable() }),
    inputs: z.record(z.string(), z.unknown()),
    brandBrain: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
    output: RunOutputSchema.nullable(),
    ready: z.boolean().describe("Succeeded, passed the quality bar and every check."),
    needsReview: z.boolean(),
    quality: QualitySchema.nullable(),
    flags: z.array(z.object({ check: z.string(), message: z.string(), findings: z.array(z.string()) })).describe("Checks that failed."),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
    charge: ChargeSchema.nullable(),
    decision: DecisionSchema.nullable().describe("A person's decision on it. Keys cannot decide."),
    createdAt: z.string(),
    finishedAt: z.string().nullable(),
    aiGenerated: z.literal(true).describe("Always true: an AI model wrote the output (EU AI Act Art. 50). Label it where a platform asks."),
  })
  .describe("One run of one agent.");

export const OptionSchema = z.object({
  index: z.number().int(),
  label: z.string(),
  text: z.string(),
  fields: z.record(z.string(), z.string()).nullable(),
  brandFit: z.number().nullable(),
  flags: z.array(z.string()),
});

export const PipelineSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    name: z.string(),
    job: z.string(),
    inputs: z.array(InputFieldSchema),
    inputSchema: z.record(z.string(), z.unknown()),
    steps: z.array(z.object({ id: z.string(), label: z.string(), agent: z.object({ id: z.string(), name: z.string() }) })),
    confirmations: z.object({ rights: z.boolean(), voiceConsent: z.boolean() }),
    estimate: z.object({ credits: z.number().int().nullable() }),
  })
  .describe("A saved chain of agents.");

export const PipelineRunSchema = z
  .object({
    id: z.string(),
    status: z.enum(["running", "waiting", "ready", "approved", "rejected", "failed", "cancelled"]),
    pipeline: z.object({ id: z.string(), version: z.string(), name: z.string() }),
    inputs: z.record(z.string(), z.unknown()),
    brandBrain: z.object({ id: z.string(), name: z.string() }).nullable(),
    needsReview: z.boolean(),
    waiting: z
      .object({ step: z.string(), label: z.string(), prompt: z.string(), options: z.array(OptionSchema), suggested: z.number().int().nullable() })
      .nullable()
      .describe("Set while a step waits for a pick. Answer with POST /pipeline-runs/{id}/pick."),
    steps: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        status: z.string(),
        agent: z.object({ id: z.string(), version: z.string(), name: z.string() }),
        output: RunOutputSchema.nullable(),
        picked: z.object({ index: z.number().int(), by: z.string() }).nullable(),
        quality: z.object({ score: z.number(), bar: z.number(), verdict: z.string(), reasons: z.array(z.string()) }).nullable(),
        error: z.object({ code: z.string(), message: z.string() }).nullable(),
      }),
    ),
    package: z.array(z.object({ step: z.string(), label: z.string(), item: OptionSchema.omit({ index: true }).nullable(), output: RunOutputSchema.nullable(), brandFit: z.number().nullable(), flags: z.array(z.string()) })).nullable().describe("What a person approves at the end."),
    decision: DecisionSchema.nullable(),
    error: z.object({ code: z.string(), message: z.string(), step: z.string().nullable() }).nullable(),
    charge: ChargeSchema.nullable(),
    createdAt: z.string(),
    finishedAt: z.string().nullable(),
  })
  .describe("One run of a pipeline.");

export const BrandBrainSchema = z
  .object({ id: z.string(), name: z.string(), isDefault: z.boolean(), niche: z.string(), platforms: z.array(z.string()), voice: z.string(), tone: z.array(z.string()), updatedAt: z.string() })
  .describe("A brand or client the agents write for. Read only through the API.");

export const CreditsSchema = z
  .object({
    available: z.number().int(),
    held: z.number().int().describe("Held for runs in progress."),
    usedThisMonth: z.number().int().describe("Used this month by the person who made the key."),
    monthlyLimit: z.number().int().nullable().describe("That person's monthly limit, if one is set."),
    creditUsd: z.number().describe("What one credit is worth in US dollars."),
  })
  .describe("The workspace's balance. Read only: keys never top up or change limits.");

export const MeSchema = z.object({
  workspace: z.object({ id: z.string(), name: z.string() }),
  key: z.object({ id: z.string(), role: z.enum(["admin", "editor", "viewer"]) }),
  limits: z.object({ requestsPerMinute: z.number().int(), workspaceRequestsPerMinute: z.number().int(), startsPerMinute: z.number().int(), maxBodyBytes: z.number().int() }),
});

export const WebhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.enum(WEBHOOK_EVENTS)),
  description: z.string(),
  secretHint: z.string(),
  paused: z.boolean(),
  createdAt: z.string(),
});

export const WebhookCreatedSchema = WebhookSchema.extend({ secret: z.string().describe("The signing secret. Shown once; keep it safe.") });

export const DeliverySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  type: z.enum([...WEBHOOK_EVENTS, "ping"]),
  status: z.enum(["pending", "delivered", "failed"]),
  attempts: z.array(z.object({ n: z.number().int(), at: z.string(), status: z.number().int().nullable(), ms: z.number(), error: z.string().optional(), sender: z.string() })),
  nextAttemptAt: z.string().nullable(),
  createdAt: z.string(),
});

export const WebhookPayloadSchema = z
  .object({
    id: z.string().describe("The event id. The same event never comes twice to one URL, but a retry repeats it; dedupe on it."),
    type: z.enum([...WEBHOOK_EVENTS, "ping"]),
    createdAt: z.string(),
    workspaceId: z.string(),
    data: z.object({ run: RunSchema.optional(), pipelineRun: PipelineRunSchema.optional(), message: z.string().optional() }),
  })
  .describe("The body of every webhook delivery. Signed in the Wovi-Signature header.");

export const listOf = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item) });

export type ApiAgent = z.infer<typeof AgentSchema>;
export type ApiRun = z.infer<typeof RunSchema>;
export type ApiPipeline = z.infer<typeof PipelineSchema>;
export type ApiPipelineRun = z.infer<typeof PipelineRunSchema>;
export type ApiBrandBrain = z.infer<typeof BrandBrainSchema>;
export type ApiCredits = z.infer<typeof CreditsSchema>;
export type ApiMe = z.infer<typeof MeSchema>;
export type ApiWebhook = z.infer<typeof WebhookSchema>;
export type ApiDelivery = z.infer<typeof DeliverySchema>;
export type ApiInputField = z.infer<typeof InputFieldSchema>;
export type ApiOption = z.infer<typeof OptionSchema>;
