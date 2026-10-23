/** One error type for pipelines, with a code and the list of problems. */
export type PipelineErrorCode =
  | "invalid_pipeline"
  | "invalid_workspace"
  | "invalid_request"
  | "invalid_input"
  | "not_found"
  | "already_exists"
  | "version_conflict"
  | "no_change"
  | "confirmation_required"
  | "idempotency_conflict"
  | "not_ready"
  /** Credits (phase 13): the balance does not cover the estimate. */
  | "not_enough_credits"
  /** Credits (phase 13): a monthly limit would be passed. */
  | "over_limit"
  /** Phase 18: the inputs ask for something WOVI does not write. */
  | "blocked";

export class PipelineError extends Error {
  constructor(
    readonly code: PipelineErrorCode,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(issues.length ? `${message}\n- ${issues.join("\n- ")}` : message);
    this.name = "PipelineError";
  }
}
