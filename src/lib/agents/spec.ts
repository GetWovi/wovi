/**
 * The agent spec: one contract that describes an agent completely, and its
 * runtime validator. The run engine, the registry, the web form, MCP and the
 * API all read this one shape, so the platform never needs agent-specific code.
 *
 * A spec has two halves:
 * - the body: everything that defines what the agent does. Each change to the
 *   body is a new immutable version.
 * - the listing: owner, status, visibility and quality. These sit beside the
 *   body, so hiding an agent or updating its score never makes a new version.
 */
import { z } from "zod";
import {
  ASPECTS,
  BRAND_BRAIN_PARTS,
  CATEGORIES,
  GUARDRAIL_IDS,
  MODEL_ROUTES,
  PLATFORMS,
  TOOL_IDS,
  findModelRoute,
} from "./catalog";
import { isSemver } from "./semver";
import { scanTemplate } from "./template";

/* ---------- Small parts ---------- */

const oneOf = (name: string, list: readonly string[]) => (iss: { input?: unknown }) =>
  `Unknown ${name} ${JSON.stringify(iss.input)}. Use one of: ${list.join(", ")}.`;

const slug = z
  .string()
  .min(3, "Id must be at least 3 characters.")
  .max(48, "Id must be at most 48 characters.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Id must be lowercase words joined by hyphens, like hook-writer.");

const key = z
  .string()
  .max(40, "Key must be at most 40 characters.")
  .regex(/^[a-z][a-z0-9_]*$/, "Key must be snake_case, like brand_profile.");

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Must not be empty.")
    .max(max, `Must be at most ${max} characters.`)
    .refine((s) => !/[\r\n]/.test(s), "Must be one line.");

const version = z.string().refine(isSemver, {
  error: (iss) => `Version ${JSON.stringify(iss.input)} is not a semver version like 1.0.0.`,
});

const platform = z.enum(PLATFORMS, { error: oneOf("platform", PLATFORMS) });
const aspect = z.enum(ASPECTS, { error: oneOf("aspect", ASPECTS) });
const count = (max: number) => z.number().int().min(1).max(max);

const tool = z.string().refine((t) => TOOL_IDS.includes(t), {
  error: (iss) => `Unknown tool ${JSON.stringify(iss.input)}. Allowed tools: ${TOOL_IDS.join(", ")}.`,
});

const guardrail = z.string().refine((g) => GUARDRAIL_IDS.includes(g), {
  error: (iss) => `Unknown guardrail ${JSON.stringify(iss.input)}. Known guardrails: ${GUARDRAIL_IDS.join(", ")}.`,
});

const modelRoute = z.string().refine((m) => Boolean(findModelRoute(m)), {
  error: (iss) =>
    `Unknown model route ${JSON.stringify(iss.input)}. Known routes: ${MODEL_ROUTES.map((m) => m.id).join(", ")}.`,
});

/* ---------- Inputs: these become the form a user fills in ---------- */

const inputBase = {
  key,
  label: oneLine(60),
  required: z.boolean(),
  help: z.string().max(200, "Help text must be at most 200 characters.").optional(),
};

const mediaLimits = {
  maxSizeMb: z.number().positive().max(2048),
  maxFiles: count(20).default(1),
};

const textInput = z.strictObject({
  ...inputBase,
  type: z.literal("text"),
  limits: z.strictObject({ minLength: z.number().int().min(0).optional(), maxLength: count(2000) }),
});

const longTextInput = z.strictObject({
  ...inputBase,
  type: z.literal("long_text"),
  limits: z.strictObject({ minLength: z.number().int().min(0).optional(), maxLength: count(20000) }),
});

const urlInput = z.strictObject({ ...inputBase, type: z.literal("url") });

const fileInput = z.strictObject({
  ...inputBase,
  type: z.literal("file"),
  limits: z.strictObject({
    ...mediaLimits,
    /** MIME types or extensions, like "application/pdf" or ".srt". */
    accept: z.array(z.string().min(1)).min(1, "A file input must list what it accepts."),
  }),
});

const imageInput = z.strictObject({ ...inputBase, type: z.literal("image"), limits: z.strictObject(mediaLimits) });

const videoInput = z.strictObject({
  ...inputBase,
  type: z.literal("video"),
  limits: z.strictObject({ ...mediaLimits, maxSeconds: count(7200) }),
});

const choiceInput = z.strictObject({
  ...inputBase,
  type: z.literal("choice"),
  options: z.array(z.strictObject({ value: key, label: oneLine(60) })).min(2, "A choice needs at least 2 options."),
  multiple: z.boolean().default(false),
  default: z.union([z.string(), z.array(z.string())]).optional(),
});

const numberInput = z.strictObject({
  ...inputBase,
  type: z.literal("number"),
  limits: z.strictObject({
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional(),
  }),
  default: z.number().optional(),
});

/** Picks one of the workspace's Brand Brains (an agency has one per client). */
const profileInput = z.strictObject({ ...inputBase, type: z.literal("profile") });

const INPUT_TYPES = ["text", "long_text", "url", "file", "image", "video", "choice", "number", "profile"];

export const agentInputSchema = z.discriminatedUnion(
  "type",
  [textInput, longTextInput, urlInput, fileInput, imageInput, videoInput, choiceInput, numberInput, profileInput],
  { error: (iss) => (iss.code === "invalid_union" ? oneOf("input type", INPUT_TYPES)({ input: (iss.input as { type?: unknown })?.type }) : undefined) },
);

/* ---------- Output: what one run returns ---------- */

const POST_FORMATS = ["post", "thread", "carousel", "short"] as const;

export const agentOutputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), maxWords: count(5000) }),
  z.strictObject({
    kind: z.literal("list"),
    count: count(50),
    maxWordsPerItem: count(500).optional(),
    /** When set, each item is an object with these fields instead of a line of text. */
    fields: z.array(key).min(1).optional(),
  }),
  z.strictObject({ kind: z.literal("script"), maxSeconds: count(600), sections: z.array(key).min(1) }),
  z.strictObject({
    kind: z.literal("caption_set"),
    platforms: z.array(platform).min(1),
    variants: count(10),
    maxChars: count(5000),
  }),
  z.strictObject({
    kind: z.literal("post_set"),
    formats: z
      .array(z.strictObject({ format: z.enum(POST_FORMATS, { error: oneOf("post format", POST_FORMATS) }), count: count(10) }))
      .min(1),
  }),
  z.strictObject({ kind: z.literal("image"), count: count(12), aspect }),
  z.strictObject({ kind: z.literal("storyboard"), maxFrames: count(40), withImages: z.boolean(), aspect }),
  z.strictObject({ kind: z.literal("video"), maxSeconds: count(600), aspect }),
]);

/* ---------- Routing: hidden from users ---------- */

export const routingSchema = z.strictObject({
  model: modelRoute,
  fallback: modelRoute,
  temperature: z.number().min(0).max(2).optional(),
  /** Hard cap on model and tool spend for one run, in US dollars. */
  maxCostUsd: z.number().positive().max(10, "maxCostUsd must be at most 10 per run."),
  maxOutputTokens: z.number().int().min(1).max(32000).optional(),
});

/* ---------- Body (versioned) and listing (not versioned) ---------- */

const uniqueList = <T extends z.ZodType<string>>(item: T, what: string) =>
  z.array(item).refine((xs) => new Set(xs).size === xs.length, `${what} must not repeat.`);

const bodyShape = {
  id: slug,
  version,
  name: oneLine(40),
  /** The one job, in one line. */
  job: oneLine(120),
  category: z.enum(CATEGORIES, { error: oneOf("category", CATEGORIES) }),
  platforms: uniqueList(platform, "Platforms").min(1, "List at least one platform."),
  inputs: z.array(agentInputSchema).min(1, "An agent needs at least one input.").max(20, "At most 20 inputs."),
  output: agentOutputSchema,
  /** Which parts of the user's Brand Brain the agent reads. */
  brandBrain: uniqueList(z.enum(BRAND_BRAIN_PARTS, { error: oneOf("Brand Brain part", BRAND_BRAIN_PARTS) }), "Brand Brain parts").default([]),
  tools: uniqueList(tool, "Tools").default([]),
  guardrails: uniqueList(guardrail, "Guardrails").default([]),
  routing: routingSchema,
  /** The instruction template the engine fills in. Placeholders: {{input_key}} and {{brand.part}}. */
  instructions: z.string().min(20, "Instructions must be at least 20 characters.").max(20000),
};

export const OWNER_KINDS = ["platform", "creator"] as const;
export const STATUSES = ["draft", "live", "hidden"] as const;
export const VISIBILITIES = ["public", "workspace"] as const;

export const ownerSchema = z.strictObject({
  kind: z.enum(OWNER_KINDS, { error: oneOf("owner kind", OWNER_KINDS) }),
  creatorId: z.string().min(1, "Owner needs a creatorId."),
});

export const qualitySchema = z.strictObject({
  /** 0 to 100, from verified runs. Null until the scorecard computes it. */
  score: z.number().min(0).max(100).nullable(),
  runs: z.number().int().min(0),
  lastScoredAt: z.string().nullable(),
});

const listingShape = {
  owner: ownerSchema,
  status: z.enum(STATUSES, { error: oneOf("status", STATUSES) }).default("draft"),
  /** public: in the gallery once live. workspace: only the owner's workspace sees it. */
  visibility: z.enum(VISIBILITIES, { error: oneOf("visibility", VISIBILITIES) }).default("workspace"),
  quality: qualitySchema.default({ score: null, runs: 0, lastScoredAt: null }),
};

/* ---------- Cross-field rules ---------- */

type BodyLike = z.output<z.ZodObject<typeof bodyShape>>;

function checkBody(body: BodyLike, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });

  // Input keys are unique.
  const seen = new Set<string>();
  body.inputs.forEach((input, i) => {
    if (seen.has(input.key)) issue(["inputs", i, "key"], `Input key "${input.key}" is used twice.`);
    seen.add(input.key);

    if ((input.type === "text" || input.type === "long_text") && input.limits.minLength !== undefined) {
      if (input.limits.minLength > input.limits.maxLength) {
        issue(["inputs", i, "limits"], `minLength is larger than maxLength on "${input.key}".`);
      }
    }
    if (input.type === "number") {
      const { min, max } = input.limits;
      if (min > max) issue(["inputs", i, "limits"], `min is larger than max on "${input.key}".`);
      if (input.default !== undefined && (input.default < min || input.default > max)) {
        issue(["inputs", i, "default"], `Default ${input.default} is outside ${min} to ${max} on "${input.key}".`);
      }
    }
    if (input.type === "choice") {
      const values = input.options.map((o) => o.value);
      if (new Set(values).size !== values.length) issue(["inputs", i, "options"], `Option values repeat on "${input.key}".`);
      const defaults = input.default === undefined ? [] : Array.isArray(input.default) ? input.default : [input.default];
      if (Array.isArray(input.default) && !input.multiple) {
        issue(["inputs", i, "default"], `"${input.key}" takes one option, so its default must be one value.`);
      }
      for (const d of defaults) {
        if (!values.includes(d)) issue(["inputs", i, "default"], `Default "${d}" is not an option of "${input.key}".`);
      }
    }
  });

  // Placeholders match declared inputs and Brand Brain reads; required inputs are used.
  const { placeholders, problems } = scanTemplate(body.instructions);
  for (const p of problems) issue(["instructions"], p);
  for (const name of placeholders) {
    if (name.startsWith("brand.")) {
      const part = name.slice("brand.".length);
      if (!(BRAND_BRAIN_PARTS as readonly string[]).includes(part)) {
        issue(["instructions"], `Placeholder {{${name}}} names an unknown Brand Brain part. Use one of: ${BRAND_BRAIN_PARTS.join(", ")}.`);
      } else if (!(body.brandBrain as string[]).includes(part)) {
        issue(["instructions"], `Placeholder {{${name}}} reads the Brand Brain part "${part}", which is not declared in brandBrain.`);
      }
    } else if (!seen.has(name)) {
      issue(["instructions"], `Placeholder {{${name}}} has no input with that key.`);
    }
  }
  body.inputs.forEach((input, i) => {
    if (input.required && !placeholders.includes(input.key)) {
      issue(["inputs", i], `Required input "${input.key}" is never used in instructions. Add {{${input.key}}}.`);
    }
  });

  // The fallback is a different route of the same kind.
  const model = findModelRoute(body.routing.model);
  const fallback = findModelRoute(body.routing.fallback);
  if (model && fallback) {
    if (model.id === fallback.id) issue(["routing", "fallback"], "Fallback must be a different model route than the main one.");
    else if (model.modality !== fallback.modality) {
      issue(["routing", "fallback"], `Fallback "${fallback.id}" is ${fallback.modality} but the main route "${model.id}" is ${model.modality}.`);
    }
  }
}

export const agentBodySchema = z.strictObject(bodyShape).superRefine(checkBody);
export const agentSpecSchema = z.strictObject({ ...bodyShape, ...listingShape }).superRefine(checkBody);

/** A complete, valid agent: body plus listing. */
export type AgentSpec = z.output<typeof agentSpecSchema>;
/** What a caller passes in; fields with defaults may be left out. */
export type AgentSpecInput = z.input<typeof agentSpecSchema>;
/** The versioned half. */
export type AgentBody = z.output<typeof agentBodySchema>;
export type AgentBodyInput = z.input<typeof agentBodySchema>;
export type AgentListing = Pick<AgentSpec, "owner" | "status" | "visibility" | "quality">;
export type AgentInput = z.output<typeof agentInputSchema>;
export type AgentOutput = z.output<typeof agentOutputSchema>;
export type AgentStatus = (typeof STATUSES)[number];
export type AgentVisibility = (typeof VISIBILITIES)[number];

export const BODY_KEYS = Object.keys(bodyShape) as (keyof AgentBody)[];

/* ---------- Validation results ---------- */

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** "inputs[2].limits.maxLength: message", or just the message for top-level issues. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((iss) => {
    const path = iss.path
      .map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
      .join("");
    const missing = iss.code === "invalid_type" && iss.message.endsWith("received undefined");
    const message = missing ? "Required." : iss.message;
    return path ? `${path}: ${message}` : message;
  });
}

export function validateAgentSpec(input: unknown): Validation<AgentSpec> {
  const r = agentSpecSchema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: formatIssues(r.error) };
}

export function validateAgentBody(input: unknown): Validation<AgentBody> {
  const r = agentBodySchema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: formatIssues(r.error) };
}

/** What users, the gallery, MCP and the API may see: no routing, no instructions. */
export function publicView(spec: AgentSpec): Omit<AgentSpec, "routing" | "instructions"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { routing, instructions, ...rest } = spec;
  return rest;
}
