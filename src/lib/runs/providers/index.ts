import { fakeProvider } from "./fake";
import { openRouterProvider } from "./openrouter";
import type { ModelProvider } from "./types";

export * from "./types";
export { defaultAnswer, fakeProvider, type FakeOptions, type FakeProvider, type FakeReply } from "./fake";
export { OPENROUTER_BASE_URL, kindForStatus, openRouterProvider, type OpenRouterOptions } from "./openrouter";

/**
 * The providers this process may use. The fake is always there. OpenRouter is
 * only added when OPENROUTER_API_KEY is set, so without a key no real model
 * can be called.
 */
export function providersFromEnv(env: Record<string, string | undefined> = process.env): Record<string, ModelProvider> {
  const providers: Record<string, ModelProvider> = { fake: fakeProvider() };
  if (env.OPENROUTER_API_KEY) providers.openrouter = openRouterProvider({ apiKey: env.OPENROUTER_API_KEY });
  return providers;
}
