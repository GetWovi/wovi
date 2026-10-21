/**
 * OpenRouter: one key, many models, behind the OpenAI-compatible chat
 * completions API. OFF unless OPENROUTER_API_KEY is set (see providersFromEnv).
 * Tests only ever pass a stub fetch; nothing here runs without a key.
 */
import { estimateTokens } from "../prices";
import { ProviderError, type CompletionRequest, type CompletionResult, type ModelProvider } from "./types";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type OpenRouterOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

type ChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: number; message?: string };
};

export function openRouterProvider(opts: OpenRouterOptions): ModelProvider {
  if (!opts.apiKey) throw new Error("openRouterProvider needs an API key.");
  const baseUrl = (opts.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/$/, "");
  const doFetch = opts.fetch ?? fetch;

  return {
    id: "openrouter",
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "WOVI",
          },
          body: JSON.stringify({
            model: req.model,
            messages: req.messages,
            max_tokens: req.maxOutputTokens,
            ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
          }),
          signal: req.signal,
        });
      } catch (err) {
        if (req.signal.aborted) throw new ProviderError("aborted", "Request aborted.");
        throw new ProviderError("unavailable", `OpenRouter could not be reached: ${(err as Error).message}`);
      }

      const body = (await res.json().catch(() => null)) as ChatResponse | null;
      const status = res.ok && body?.error ? (body.error.code ?? 502) : res.status;
      if (status >= 400 || !res.ok) {
        throw new ProviderError(kindForStatus(status), `OpenRouter ${status}: ${body?.error?.message ?? res.statusText}`);
      }

      const text = body?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new ProviderError("bad_response", "OpenRouter returned no answer text.");
      // When usage is missing, count by estimate so a run's cost is never under-counted.
      return {
        text,
        tokensIn: body?.usage?.prompt_tokens ?? estimateTokens(req.messages.map((m) => m.content).join("\n")),
        tokensOut: body?.usage?.completion_tokens ?? estimateTokens(text),
      };
    },
  };
}

export function kindForStatus(status: number): ProviderError["kind"] {
  if (status === 401 || status === 402 || status === 403) return "auth";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "bad_request";
}
