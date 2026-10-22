/**
 * One error shape for the REST API and MCP (phase 14):
 *
 *   { "error": { "code": "invalid_input", "message": "...", "issues": [{ "path": "inputs.idea", "message": "..." }] } }
 *
 * Every error from the layers below (accounts, the engine, pipelines, Brand
 * Brains, review, credits, webhooks) is turned into one of these codes, each
 * with one HTTP status. Messages are plain words and never carry a key.
 */
import type { AccountError } from "@/lib/accounts/errors";
import type { AppError } from "@/lib/app/api";
import type { PipelineError } from "@/lib/pipelines/errors";
import type { RunError } from "@/lib/runs/engine";
import type { WebhookInputError } from "@/lib/webhooks/webhooks";

export const API_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "invalid_input",
  "invalid_request",
  "not_enough_credits",
  "over_limit",
  "idempotency_conflict",
  "not_ready",
  "rate_limited",
  "payload_too_large",
  "method_not_allowed",
  "internal_error",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 422,
  invalid_request: 400,
  not_enough_credits: 402,
  over_limit: 402,
  idempotency_conflict: 409,
  not_ready: 409,
  rate_limited: 429,
  payload_too_large: 413,
  method_not_allowed: 405,
  internal_error: 500,
};

/** What each code means, for the OpenAPI document and the docs page. */
export const CODE_WORDS: Record<ApiErrorCode, string> = {
  unauthenticated: "No API key, or a key that is revoked or unknown.",
  forbidden: "The key is real but its role may not do this. Approving, rejecting, topping up and changing limits are never for keys.",
  not_found: "Nothing with that id in the key's workspace. Other workspaces always answer this.",
  invalid_input: "Some fields need a look. Each issue has the field's path.",
  invalid_request: "The request cannot be done as asked, like a pipeline step that is not waiting.",
  not_enough_credits: "The balance does not cover the run's estimate. Nothing was started.",
  over_limit: "The run would pass a monthly limit. Nothing was started.",
  idempotency_conflict: "That Idempotency-Key was already used for a different request.",
  not_ready: "Not possible yet in the run's current state.",
  rate_limited: "Too many requests. Wait the seconds in Retry-After.",
  payload_too_large: "The body is larger than the API takes.",
  method_not_allowed: "That path does not take this method.",
  internal_error: "Something went wrong on our side. Nothing secret is in the message.",
};

export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly issues: ApiIssue[] = [],
    /** For rate_limited: seconds until a try is allowed again. */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get status(): number {
    return STATUS[this.code];
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.issues.length ? { issues: this.issues } : {}),
        ...(this.retryAfterSec !== undefined ? { retryAfter: this.retryAfterSec } : {}),
      },
    };
  }
}

/**
 * "idea: Must be at least 10 characters." from the engine's input check
 * becomes { path: "inputs.idea", message: "Must be at least 10 characters." }.
 */
export function inputIssues(lines: string[], prefix = "inputs"): ApiIssue[] {
  return lines.map((line) => {
    const m = /^([a-zA-Z][a-zA-Z0-9_]*): ([^]*)$/.exec(line);
    if (!m) return { path: prefix, message: line };
    // The Brand Brain named on the request is a field of the body, not an input.
    return { path: m[1] === "brandBrainId" ? "brandBrainId" : `${prefix}.${m[1]}`, message: m[2] };
  });
}

function fromRunError(err: RunError): ApiError {
  switch (err.code) {
    case "not_found":
      return new ApiError("not_found", "No such agent for this workspace.");
    case "invalid_input":
      return new ApiError("invalid_input", "Some inputs need a look.", inputIssues(err.issues));
    case "confirmation_required":
      return new ApiError("invalid_input", "This agent needs a confirmation first.", err.issues.map((m) => ({ path: "confirmations", message: m })));
    case "over_budget":
      return new ApiError("invalid_input", "The inputs are too long for this agent's spend cap.", [{ path: "inputs", message: err.message }]);
    case "idempotency_conflict":
      return new ApiError("idempotency_conflict", "That Idempotency-Key was already used for a different request.");
    case "not_enough_credits":
    case "over_limit":
      return new ApiError(err.code, err.message);
    default:
      return new ApiError("invalid_request", err.message.split("\n")[0]);
  }
}

function fromPipelineError(err: PipelineError): ApiError {
  switch (err.code) {
    case "not_found":
      return new ApiError("not_found", err.message.split("\n")[0]);
    case "invalid_input":
      return new ApiError("invalid_input", "Some inputs need a look.", inputIssues(err.issues));
    case "confirmation_required":
      return new ApiError("invalid_input", "This pipeline needs a confirmation first.", (err.issues.length ? err.issues : [err.message]).map((m) => ({ path: "confirmations", message: m })));
    case "idempotency_conflict":
      return new ApiError("idempotency_conflict", "That Idempotency-Key was already used for a different request.");
    case "not_ready":
      return new ApiError("not_ready", err.message.split("\n")[0]);
    case "not_enough_credits":
    case "over_limit":
      return new ApiError(err.code, err.message);
    default:
      return new ApiError("invalid_request", err.message.split("\n")[0]);
  }
}

/**
 * Whether `err` is one of our error classes, by name. Not instanceof: Next.js
 * bundles each route on its own, while the services are shared per process,
 * so an error made by a service another bundle created is a different class
 * object with the same name.
 */
function named<T>(err: unknown, name: string): err is T {
  return err instanceof Error && err.name === name && typeof (err as { code?: unknown }).code === "string";
}

type Coded = Error & { code: string; issues: string[] };

/** Any error from the layers below, as an ApiError. Unknown errors become internal_error with no detail. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (named<ApiError>(err, "ApiError")) return new ApiError(err.code, err.message, err.issues, err.retryAfterSec);
  const cause = (err as { cause?: unknown } | null)?.cause;
  if (named<AppError>(err, "AppError") && named<RunError>(cause, "RunError")) return fromRunError(cause);
  if (named<AppError>(err, "AppError") && named<PipelineError>(cause, "PipelineError")) return fromPipelineError(cause);
  if (named<RunError>(err, "RunError")) return fromRunError(err);
  if (named<PipelineError>(err, "PipelineError")) return fromPipelineError(err);
  if (named<WebhookInputError>(err, "WebhookInputError")) return new ApiError("invalid_input", "Some fields need a look.", err.issues);
  if (named<AccountError>(err, "AccountError")) {
    if (err.code === "rate_limited") return new ApiError("rate_limited", err.message, [], err.retryAfterSec);
    if (err.code === "not_found" || err.code === "forbidden" || err.code === "unauthenticated") return new ApiError(err.code, err.message);
    return new ApiError("invalid_request", err.message);
  }
  if (named<AppError>(err, "AppError")) {
    if (err.code === "not_found" || err.code === "forbidden" || err.code === "not_ready" || err.code === "not_enough_credits" || err.code === "over_limit") return new ApiError(err.code, err.message);
    return err.issues.length ? new ApiError("invalid_input", err.message, inputIssues(err.issues)) : new ApiError("invalid_request", err.message);
  }
  if (named<Coded>(err, "BrandError") || named<Coded>(err, "TeamError")) {
    if (err.code === "not_found") return new ApiError("not_found", err.message);
    if (err.code === "forbidden") return new ApiError("forbidden", err.message);
    if (err.code === "not_ready") return new ApiError("not_ready", err.message);
    return new ApiError("invalid_request", err.message);
  }
  return new ApiError("internal_error", "Something went wrong on our side. Try again in a moment.");
}
