import { fakeProvider } from "./fake";
import { openRouterProvider } from "./openrouter";
import type { ModelProvider } from "./types";
import { isLocalApp } from "@/lib/runtime";

export * from "./types";
export { defaultAnswer, fakeProvider, type FakeOptions, type FakeProvider, type FakeReply } from "./fake";
export { OPENROUTER_BASE_URL, kindForStatus, openRouterProvider, type OpenRouterOptions } from "./openrouter";

/**
 * The providers this process may use. The fake is there on a local app only:
 * a production server never answers with filler. OpenRouter is only added
 * when OPENROUTER_API_KEY is set, so without a key no real model can be
 * called. WOVI_FAKE_LATENCY_MS makes the fake take its time, so a running
 * state can be seen on a screen.
 */
export function providersFromEnv(env: Record<string, string | undefined> = process.env): Record<string, ModelProvider> {
  const latencyMs = Math.max(0, Number(env.WOVI_FAKE_LATENCY_MS) || 0);
  const providers: Record<string, ModelProvider> = isLocalApp(env) ? { fake: fakeProvider(latencyMs ? { latencyMs } : {}) } : {};
  if (env.OPENROUTER_API_KEY) providers.openrouter = openRouterProvider({ apiKey: env.OPENROUTER_API_KEY });
  return providers;
}
