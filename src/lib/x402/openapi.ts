/**
 * x402 in the OpenAPI document (phase 15): the 402 and the payment headers
 * on the two start endpoints, and the x402 paths (discovery and receipts).
 * Read by api/openapi.ts.
 */
import type { z } from "zod";
import { DEFAULT_X402, X402_SCHEME } from "./config";
import * as S from "./schemas";

type Json = Record<string, unknown>;

export const X402_NAMED: [string, z.ZodType][] = [
  ["PaymentRequired", S.PaymentRequiredSchema],
  ["PaymentRequirements", S.PaymentRequirementsSchema],
  ["PaymentPayload", S.PaymentPayloadSchema],
  ["SettleResponse", S.SettleResponseSchema],
  ["X402Payment", S.X402PaymentSchema],
  ["X402RunResult", S.X402RunResultSchema],
  ["X402PipelineRunResult", S.X402PipelineRunResultSchema],
  ["X402Discovery", S.X402DiscoverySchema],
];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const X402_EXTENSION = {
  version: 1,
  scheme: X402_SCHEME,
  network: DEFAULT_X402.network,
  price: "The call's estimate in credits, one credit = $0.01, quoted in the asset when the 402 is made. Never charged more.",
  paymentHeader: "X-PAYMENT",
  responseHeader: "X-PAYMENT-RESPONSE",
  discovery: "/api/v1/x402",
};

/** Adds x402 to a start operation: no key needed, the 402 and the headers of a paid answer. */
export function withX402(op: Json): Json {
  const responses = { ...(op.responses as Json) };
  const ok = responses["202"] as Json | undefined;
  if (ok) {
    responses["202"] = {
      ...ok,
      headers: {
        "X-PAYMENT-RESPONSE": { description: "Paid with x402 only: base64 JSON of SettleResponse.", schema: { type: "string" } },
        "X-Receipt-Token": { description: "Paid with x402 only: reads this run at /x402/runs/{id} or /x402/pipeline-runs/{id} as Authorization: Bearer wovi_rt_...", schema: { type: "string" } },
      },
    };
  }
  responses["402"] = {
    description:
      "Not enough credits (with a key, the Error shape), or, with no key and x402 on: payment required (the PaymentRequired shape). Pay one of `accepts`, then send the same request again with X-PAYMENT: base64 JSON of PaymentPayload.",
    content: { "application/json": { schema: { oneOf: [ref("Error"), ref("PaymentRequired")] } } },
  };
  return {
    ...op,
    description: `${op.description ? `${op.description} ` : ""}No key? Pay per call with x402: call it without Authorization to get a 402 with the price, pay, then send it again with X-PAYMENT. See /x402.`,
    security: [{ apiKey: [] }, {}],
    responses,
    "x-x402": X402_EXTENSION,
  };
}

const receiptSecurity = [{ receipt: [] }];
const err = (description: string) => ({ description, content: { "application/json": { schema: ref("Error") } } });
const idParam = [{ name: "id", in: "path", required: true, schema: { type: "string" } }];

function op(operationId: string, summary: string, description: string, response: string, extra: Json = {}): Json {
  return {
    operationId,
    tags: ["x402"],
    summary,
    description,
    security: receiptSecurity,
    parameters: idParam,
    responses: { "200": { description: "OK.", content: { "application/json": { schema: ref(response) } } }, "401": err("No receipt token, or one that ended."), "404": err("Another run, or nothing with that id."), "429": err("Too many reads.") },
    ...extra,
  };
}

/** The x402 paths, under /api/v1. `pickRef` is the PickBody component. */
export function x402Paths(pickRef: Json): Record<string, Json> {
  return {
    "/x402": {
      get: {
        operationId: "x402Discovery",
        tags: ["x402"],
        summary: "Which endpoints take x402, and the prices",
        description: "No key. Whether x402 is on, the network, the receiving address, the assets, and every agent and pipeline with its price in credits and USD. Also at /.well-known/x402.",
        security: [],
        responses: { "200": { description: "OK.", content: { "application/json": { schema: ref("X402Discovery") } } } },
      },
    },
    "/x402/runs/{id}": { get: op("x402GetRun", "A paid run, with its receipt", "Authorization: Bearer wovi_rt_... from X-Receipt-Token. The run, and the payment with what was charged and anything owed back.", "X402RunResult") },
    "/x402/runs/{id}/cancel": { post: op("x402CancelRun", "Stop a paid run", "Stops it. What it did not use is owed back to the payer.", "X402RunResult") },
    "/x402/pipeline-runs/{id}": { get: op("x402GetPipelineRun", "A paid pipeline run, with its receipt", "Every step, what waits, the package, and the payment.", "X402PipelineRunResult") },
    "/x402/pipeline-runs/{id}/pick": {
      post: op("x402PickOption", "Pick where a paid pipeline run waits", "The same as POST /pipeline-runs/{id}/pick, with the receipt token.", "X402PipelineRunResult", { requestBody: { required: true, content: { "application/json": { schema: pickRef } } } }),
    },
    "/x402/pipeline-runs/{id}/cancel": { post: op("x402CancelPipelineRun", "Stop a paid pipeline run", "What the finished steps did not use is owed back.", "X402PipelineRunResult") },
  };
}

export const RECEIPT_SCHEME = { type: "http", scheme: "bearer", bearerFormat: "wovi_rt_...", description: "A receipt token from a run paid with x402 (X-Receipt-Token). Reads that one run." };
