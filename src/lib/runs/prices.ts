/**
 * What each model costs, as data in one file. Prices are US dollars per
 * million tokens, copied from OpenRouter's public model list on 2026-10-21.
 * Check them again before real runs; they change.
 *
 * Money is counted in whole micro-dollars (millionths of a dollar), never in
 * floating dollars, so totals add up exactly. Each call is rounded up.
 */
import { MODEL_ROUTES } from "@/lib/agents/catalog";

export type ModelPrice = { inputPerMTok: number; outputPerMTok: number };

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "openai/gpt-6-luna": { inputPerMTok: 0.1, outputPerMTok: 0.5 },
  "anthropic/claude-sonnet-5.5": { inputPerMTok: 2, outputPerMTok: 10 },
  "anthropic/claude-opus-5.5": { inputPerMTok: 4, outputPerMTok: 20 },
  // Not run in phase 3. Image output is also billed per image on top of tokens.
  "google/gemini-3.1-flash-image": { inputPerMTok: 0.5, outputPerMTok: 3 },
  "openai/gpt-audio-mini": { inputPerMTok: 0.6, outputPerMTok: 2.4 },
};

/** Output tokens assumed for an estimate when the spec sets no maxOutputTokens. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

export const MICRO_PER_USD = 1_000_000;

export function priceOf(model: string): ModelPrice | null {
  return MODEL_PRICES[model] ?? null;
}

/** Price per token in nano-dollars, an integer for every price with up to 3 decimals per million. */
const nanoPerToken = (perMTok: number) => Math.round(perMTok * 1000);

/** The cost of one call in micro-dollars, rounded up. Throws for a model with no price. */
export function costMicroUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price = priceOf(model);
  if (!price) throw new Error(`No price for model "${model}". Add it to MODEL_PRICES.`);
  const nano = tokensIn * nanoPerToken(price.inputPerMTok) + tokensOut * nanoPerToken(price.outputPerMTok);
  return Math.ceil(nano / 1000);
}

/** A rough token count for text: about four characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The most one call can cost: its prompt as sent, plus every output token it may use. */
export function estimateCallMicroUsd(model: string, promptText: string, maxOutputTokens: number): number {
  return costMicroUsd(model, estimateTokens(promptText), maxOutputTokens);
}

export function toUsd(micro: number): number {
  return micro / MICRO_PER_USD;
}

export function toMicroUsd(usd: number): number {
  return Math.round(usd * MICRO_PER_USD);
}

/** Routes whose model has no price. Should always be empty; a test checks it. */
export function routesWithoutPrice(): string[] {
  return MODEL_ROUTES.filter((r) => r.model && !priceOf(r.model)).map((r) => r.id);
}
