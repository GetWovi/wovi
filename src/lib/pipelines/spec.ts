/**
 * The pipeline spec: a saved chain of agents. Each step names an agent (an
 * exact version or "current"), says where each of its inputs comes from (the
 * pipeline's own inputs, an earlier step's typed output, a fixed value or a
 * small template), how to pick one item from its output, and what to do when
 * its checks fail. The run ends in a human approve step.
 *
 * Like an agent spec it has a body, where every change is a new immutable
 * version, and a listing (owner, status, visibility) beside it. This file is
 * the shape only; validate.ts checks the references and the types.
 * No storage here, so client code (the builder's editor) can import it.
 */
import { z } from "zod";
import { agentInputSchema, formatIssues, ownerSchema, STATUSES, VISIBILITIES, type AgentInput, type Validation } from "@/lib/agents/spec";
import { isSemver } from "@/lib/agents/semver";

const slug = z
  .string()
  .min(3, "Id must be at least 3 characters.")
  .max(48, "Id must be at most 48 characters.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Id must be lowercase words joined by hyphens, like idea-to-post.");

const key = z
  .string()
  .max(40, "Key must be at most 40 characters.")
  .regex(/^[a-z][a-z0-9_]*$/, "Key must be snake_case, like hooks.");

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Must not be empty.")
    .max(max, `Must be at most ${max} characters.`)
    .refine((s) => !/[\r\n]/.test(s), "Must be one line.");

const version = z.string().refine(isSemver, { error: (iss) => `Version ${JSON.stringify(iss.input)} is not a semver version like 1.0.0.` });
const agentVersion = z.string().refine((v) => v === "current" || isSemver(v), { error: (iss) => `Agent version ${JSON.stringify(iss.input)} must be "current" or an exact version like 1.1.0.` });

/** The highest total spend cap a pipeline run may have, in USD. */
export const MAX_PIPELINE_CAP_USD = 20;
export const MAX_STEPS = 8;

/* ---------- Where a step input comes from ---------- */

export const TAKES = ["all", "picked"] as const;
export type Take = (typeof TAKES)[number];

export const mappingSchema = z.discriminatedUnion(
  "from",
  [
    /** One of the pipeline's own inputs. */
    z.strictObject({ from: z.literal("input"), key }),
    /** An earlier step's output: all of it as text, or the item the step picked (or one field of it). */
    z.strictObject({ from: z.literal("step"), step: key, take: z.enum(TAKES), field: key.optional() }),
    /** A fixed value, checked against the agent's input like a form value. */
    z.strictObject({ from: z.literal("value"), value: z.union([z.string().max(2000), z.number(), z.array(z.string().max(60)).max(20)]) }),
    /** Text with {{inputs.idea}}, {{steps.hooks.picked}}, {{steps.ideas.picked.idea|inputs.idea}} in it. */
    z.strictObject({ from: z.literal("template"), text: z.string().min(1, "A template must not be empty.").max(2000, "A template must be at most 2000 characters.") }),
  ],
  { error: () => 'A mapping needs "from": input, step, value or template.' },
);
export type Mapping = z.output<typeof mappingSchema>;

/* ---------- How a step picks one item ---------- */

export const chooseSchema = z.discriminatedUnion(
  "kind",
  [
    /** Item N, counting from 0. */
    z.strictObject({ kind: z.literal("item"), index: z.number().int().min(0).max(49) }),
    /** The item that reads closest to the Brand Brain. */
    z.strictObject({ kind: z.literal("best_brand_fit") }),
    /** Stop and ask the person, with the best fit suggested. */
    z.strictObject({ kind: z.literal("ask"), label: oneLine(80) }),
  ],
  { error: () => 'A choice needs "kind": item, best_brand_fit or ask.' },
);
export type Choose = z.output<typeof chooseSchema>;

/* ---------- When checks fail ---------- */

export const FAIL_WHEN = ["checks", "brand"] as const;
export const FAIL_THEN = ["review", "stop"] as const;

/**
 * when: "checks" for any failed guardrail, "brand" for the brand checks only
 * (words to avoid and brand fit). rewrite: run the step once more with the
 * failure as a note. then: what happens when it still fails: mark it for
 * review and go on, or stop the pipeline there.
 */
export const onFailSchema = z.strictObject({
  when: z.enum(FAIL_WHEN),
  rewrite: z.boolean(),
  then: z.enum(FAIL_THEN),
});
export type OnFail = z.output<typeof onFailSchema>;

/* ---------- Steps ---------- */

export const stepSchema = z.strictObject({
  id: key,
  label: oneLine(60),
  agent: z.strictObject({ id: slug, version: agentVersion }),
  /** Agent input key to where its value comes from. */
  inputs: z.record(key, mappingSchema),
  choose: chooseSchema.optional(),
  onFail: onFailSchema.optional(),
  /** Run this step only when a choice input of the pipeline has this value. */
  runIf: z.strictObject({ input: key, equals: key }).optional(),
  /** A cap for this step, below the agent's own. */
  maxCostUsd: z.number().positive().max(10).optional(),
});
export type PipelineStep = z.output<typeof stepSchema>;

export const packagePartSchema = z.strictObject({
  step: key,
  label: oneLine(40),
  take: z.enum(TAKES),
});
export type PackagePart = z.output<typeof packagePartSchema>;

/* ---------- The whole spec ---------- */

const bodyShape = {
  id: slug,
  version,
  name: oneLine(48),
  job: oneLine(160),
  /** The form the person fills in, in the same shape as an agent's inputs. */
  inputs: z.array(agentInputSchema).min(1, "A pipeline needs at least one input.").max(12),
  /** Which inputs steer every step: a profile input picks the Brand Brain, a text input is the run's idea. */
  brand: z.strictObject({ input: key.optional(), idea: key.optional() }).default({}),
  steps: z.array(stepSchema).min(1, "A pipeline needs at least one step.").max(MAX_STEPS, `At most ${MAX_STEPS} steps.`),
  /** What the final package shows, in order. */
  package: z.array(packagePartSchema).min(1, "The package needs at least one part.").max(MAX_STEPS),
  /** The human approve step at the end. Every pipeline has one. */
  approve: z.strictObject({ label: oneLine(80) }),
  /** The total cap for one run of the pipeline, every step and rewrite together. */
  maxCostUsd: z.number().positive().max(MAX_PIPELINE_CAP_USD),
};

const listingShape = {
  owner: ownerSchema,
  status: z.enum(STATUSES).default("draft"),
  visibility: z.enum(VISIBILITIES).default("workspace"),
};

export const pipelineBodySchema = z.strictObject(bodyShape);
export const pipelineSpecSchema = z.strictObject({ ...bodyShape, ...listingShape });

export type PipelineSpec = z.output<typeof pipelineSpecSchema>;
export type PipelineSpecInput = z.input<typeof pipelineSpecSchema>;
export type PipelineBody = z.output<typeof pipelineBodySchema>;
export type PipelineBodyInput = z.input<typeof pipelineBodySchema>;
export const PIPELINE_BODY_KEYS = Object.keys(bodyShape) as (keyof PipelineBody)[];

export function parsePipelineSpec(input: unknown): Validation<PipelineSpec> {
  const r = pipelineSpecSchema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: formatIssues(r.error) };
}

export function parsePipelineBody(input: unknown): Validation<PipelineBody> {
  const r = pipelineBodySchema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: formatIssues(r.error) };
}

export function bodyOfPipeline(spec: PipelineSpec | PipelineBody): PipelineBody {
  return Object.fromEntries(PIPELINE_BODY_KEYS.map((k) => [k, spec[k]])) as PipelineBody;
}

/** One of the pipeline's own inputs by key. */
export function pipelineInputByKey(spec: Pick<PipelineBody, "inputs">, k: string): AgentInput | undefined {
  return spec.inputs.find((i) => i.key === k);
}
