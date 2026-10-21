import { describe, expect, it } from "vitest";
import { defaultAnswer, fakeProvider } from "./fake";
import { providersFromEnv } from "./index";
import { openRouterProvider } from "./openrouter";
import { ProviderError, type CompletionRequest } from "./types";

const req = (extra: Partial<CompletionRequest> = {}): CompletionRequest => ({
  model: "anthropic/claude-sonnet-5.5",
  messages: [
    { role: "system", content: 'Rules.\n```json\n{"items": ["<item 1, max 3 words>", "<item 2, max 3 words>"], "kind": "fixed"}\n```' },
    { role: "user", content: 'Task <data name="idea">\nGerald the sourdough starter\n</data> <data name="brand.voice">\nartisanal\n</data>' },
  ],
  maxOutputTokens: 100,
  signal: new AbortController().signal,
  ...extra,
});

/** A stub fetch that records what it was asked and answers with the given status and body. No network. */
function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("fake provider", () => {
  it("fills the example from the input data, the same way every time", async () => {
    const fake = fakeProvider();
    const a = await fake.complete(req());
    const b = await fake.complete(req());
    expect(a).toEqual(b);
    const parsed = JSON.parse(a.text);
    expect(parsed.kind).toBe("fixed");
    expect(parsed.items).toHaveLength(2);
    for (const item of parsed.items) {
      expect(item.split(" ").length).toBeLessThanOrEqual(3);
      expect(item.toLowerCase()).not.toContain("artisanal"); // Brand Brain words are not used
    }
    expect(a.tokensIn).toBeGreaterThan(0);
    expect(fake.requests).toHaveLength(2);
  });

  it("can be scripted to answer, fail or wait, and stops on abort", async () => {
    const fake = fakeProvider({ latencyMs: 1000, respond: (_r, n) => (n === 1 ? new ProviderError("rate_limited", "slow down") : "plain") });
    const controller = new AbortController();
    const pending = fake.complete(req({ signal: controller.signal }));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "aborted" });
    const quick = fakeProvider({ respond: (_r, n) => (n === 1 ? new ProviderError("rate_limited", "slow down") : "plain") });
    await expect(quick.complete(req())).rejects.toMatchObject({ kind: "rate_limited", retryable: true });
    await expect(quick.complete(req())).resolves.toMatchObject({ text: "plain" });
  });

  it("answers plainly when there is no output example", () => {
    expect(defaultAnswer(req({ messages: [{ role: "user", content: "hi" }] }))).toBe("No output format was given.");
  });
});

describe("OpenRouter adapter (stub fetch, no network)", () => {
  it("is off without a key, on with one", () => {
    expect(Object.keys(providersFromEnv({}))).toEqual(["fake"]);
    expect(Object.keys(providersFromEnv({ OPENROUTER_API_KEY: "test-key" }))).toEqual(["fake", "openrouter"]);
    expect(() => openRouterProvider({ apiKey: "" })).toThrow(/needs an API key/);
  });

  it("sends an OpenAI-compatible chat completion and reads the answer and usage", async () => {
    const { f, calls } = stubFetch(200, { choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
    const p = openRouterProvider({ apiKey: "test-key", fetch: f });
    await expect(p.complete(req({ temperature: 0.5 }))).resolves.toEqual({ text: "{}", tokensIn: 12, tokensOut: 3 });
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ model: "anthropic/claude-sonnet-5.5", max_tokens: 100, temperature: 0.5 });
  });

  it("estimates tokens when usage is missing", async () => {
    const { f } = stubFetch(200, { choices: [{ message: { content: "abcdefgh" } }] });
    const r = await openRouterProvider({ apiKey: "k", fetch: f }).complete(req());
    expect(r.tokensOut).toBe(2);
    expect(r.tokensIn).toBeGreaterThan(0);
  });

  it.each([
    [401, "auth", false],
    [402, "auth", false],
    [400, "bad_request", false],
    [408, "timeout", true],
    [429, "rate_limited", true],
    [503, "unavailable", true],
  ] as const)("maps HTTP %i to %s", async (status, kind, retryable) => {
    const { f } = stubFetch(status, { error: { message: "nope" } });
    await expect(openRouterProvider({ apiKey: "k", fetch: f }).complete(req())).rejects.toMatchObject({ kind, retryable });
  });

  it("treats an error inside a 200 and an empty answer as failures", async () => {
    const inBody = stubFetch(200, { error: { code: 429, message: "busy" } });
    await expect(openRouterProvider({ apiKey: "k", fetch: inBody.f }).complete(req())).rejects.toMatchObject({ kind: "rate_limited" });
    const empty = stubFetch(200, { choices: [{ message: { content: "" } }] });
    await expect(openRouterProvider({ apiKey: "k", fetch: empty.f }).complete(req())).rejects.toMatchObject({ kind: "bad_response" });
  });
});
