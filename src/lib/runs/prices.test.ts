import { describe, expect, it } from "vitest";
import { MODEL_ROUTES } from "@/lib/agents/catalog";
import { costMicroUsd, estimateCallMicroUsd, estimateTokens, routesWithoutPrice, toMicroUsd, toUsd } from "./prices";

describe("cost math", () => {
  it("every routed model has a price", () => {
    expect(routesWithoutPrice()).toEqual([]);
    const text = MODEL_ROUTES.filter((r) => r.modality === "text");
    expect(text.every((r) => r.provider === "openrouter" && r.model)).toBe(true);
  });

  it("turns tokens into whole micro-dollars, exactly", () => {
    // Sonnet: $2 in, $10 out per million tokens.
    expect(costMicroUsd("anthropic/claude-sonnet-5.5", 1_000_000, 0)).toBe(2_000_000);
    expect(costMicroUsd("anthropic/claude-sonnet-5.5", 500, 122)).toBe(500 * 2 + 122 * 10);
    // $0.10 per million: 3 tokens are 0.3 micro-dollars, rounded up to 1. No float drift.
    expect(costMicroUsd("openai/gpt-6-luna", 3, 0)).toBe(1);
    expect(costMicroUsd("openai/gpt-6-luna", 10_000, 0)).toBe(1000);
    expect(costMicroUsd("openai/gpt-6-luna", 0, 0)).toBe(0);
    expect(() => costMicroUsd("nobody/model", 1, 1)).toThrow(/No price/);
  });

  it("estimates a call as its prompt plus every output token it may use", () => {
    expect(estimateTokens("abcd".repeat(10))).toBe(10);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateCallMicroUsd("anthropic/claude-opus-5.5", "x".repeat(4000), 800)).toBe(1000 * 4 + 800 * 20);
  });

  it("converts between dollars and micro-dollars", () => {
    expect(toMicroUsd(0.05)).toBe(50_000);
    expect(toUsd(2220)).toBe(0.00222);
    expect(toMicroUsd(0.1) + toMicroUsd(0.2)).toBe(toMicroUsd(0.3));
  });
});
