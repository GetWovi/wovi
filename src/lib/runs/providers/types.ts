/**
 * The one small interface every model provider sits behind. The engine never
 * talks to a vendor SDK directly, so adding or swapping a provider is one file.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompletionRequest = {
  /** The provider's model id, from the route in the catalog. */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Reasoning and the answer together. */
  maxOutputTokens: number;
  /** How hard a reasoning model thinks first (the route's setting). Left out: the model's default. */
  reasoning?: { effort: string };
  /** Aborted on cancel or timeout. Providers must stop and throw when it fires. */
  signal: AbortSignal;
};

export type CompletionResult = {
  text: string;
  tokensIn: number;
  tokensOut: number;
  /** What the provider says it charged, in micro-dollars, when it says (OpenRouter's usage.cost). Prompt caching can make it lower than the price table. */
  costMicroUsd?: number;
};

export interface ModelProvider {
  readonly id: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export type ProviderErrorKind =
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "bad_response"
  | "bad_request"
  | "auth"
  | "aborted";

const RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set(["timeout", "rate_limited", "unavailable", "bad_response"]);

export class ProviderError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    /**
     * What the failed call was still billed for, when the provider says: a
     * model that spent its whole output limit reasoning, or an answer that
     * could not be read. The engine adds it to the run's cost.
     */
    readonly billed?: { tokensIn: number; tokensOut: number; costMicroUsd?: number },
  ) {
    super(message);
    this.name = "ProviderError";
    this.retryable = RETRYABLE.has(kind);
  }
}

/** Any thrown value as a ProviderError. Unknown errors count as the provider being unavailable. */
export function asProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderError("unavailable", message);
}
