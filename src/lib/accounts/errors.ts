export type AccountErrorCode =
  | "invalid_request"
  | "invalid_email"
  | "rate_limited"
  | "invalid_code"
  | "invalid_link"
  | "invalid_invite"
  | "invalid_signature"
  | "unauthenticated"
  | "not_found"
  | "forbidden"
  | "already_member"
  | "last_owner"
  | "conflict"
  /** The call is allowed but needs the person's explicit yes first (a batch over the cost threshold). */
  | "confirmation_required";

export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
    /** For rate_limited: seconds until the next try is allowed. */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "AccountError";
  }
}
