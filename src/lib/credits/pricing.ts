/**
 * Pricing math, in whole numbers only: costs in micro-dollars, credits as
 * integers. Pure, so the tests can pin every rounding rule.
 */
import { findModelRoute } from "@/lib/agents/catalog";
import type { AgentSpec } from "@/lib/agents/spec";
import { DEFAULT_MAX_OUTPUT_TOKENS, estimateCallMicroUsd, toMicroUsd } from "@/lib/runs/prices";
import { assemblePrompt, promptText } from "@/lib/runs/prompt";
import { toolEstimateMicroUsd } from "@/lib/runs/tools";
import { CREDITS } from "./config";

export type PricingConfig = Pick<typeof CREDITS, "microUsdPerCredit" | "marginMultiplier" | "minCreditsPerRun" | "estimateHeadroom">;

/** The margin as a whole number of thousandths, so 2.0 is 2000 and the math stays in integers. */
const milli = (x: number) => Math.round(x * 1000);

/**
 * The credits for a real cost: cost times the margin, rounded up to a whole
 * credit, at least the minimum. A cost of 0 still costs the minimum.
 */
export function creditsForCost(costMicroUsd: number, cfg: PricingConfig = CREDITS): number {
  if (!Number.isFinite(costMicroUsd) || costMicroUsd < 0) throw new Error("A cost must be zero or more micro-dollars.");
  const scaled = Math.ceil((Math.ceil(costMicroUsd) * milli(cfg.marginMultiplier)) / (cfg.microUsdPerCredit * 1000));
  return Math.max(cfg.minCreditsPerRun, scaled);
}

/** The middle value of a list of costs, rounded up. Null for none. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.ceil((s[mid - 1] + s[mid]) / 2);
}

/**
 * The cost of one first answer before anything is typed: the agent's prompt
 * with empty inputs, plus every output token it may use, at its main model.
 * Used as the typical cost until the agent has enough finished runs.
 */
export function staticRunMicroUsd(spec: AgentSpec): number {
  const cap = toMicroUsd(spec.routing.maxCostUsd);
  const model = findModelRoute(spec.routing.model)?.model;
  if (!model) return cap;
  const text = promptText(assemblePrompt(spec, {}, null));
  // A declared tool (the trend lookup) is part of the run's cost, so it is part of the estimate.
  return Math.min(cap, estimateCallMicroUsd(model, text, spec.routing.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS) + toolEstimateMicroUsd(spec, null));
}

/**
 * The estimate shown before a run, in credits: the typical cost times the
 * headroom, never above what the run's spend cap allows, and at least the
 * minimum. This is also the most the run can be charged.
 */
export function estimateCredits(typicalMicroUsd: number, capMicroUsd: number, cfg: PricingConfig = CREDITS): number {
  const headroom = Math.ceil((typicalMicroUsd * milli(cfg.estimateHeadroom)) / 1000);
  return creditsForCost(Math.min(capMicroUsd, headroom), cfg);
}

/** What the run is charged: its real price, never above what was held for it. */
export function chargeFor(costMicroUsd: number, held: number, cfg: PricingConfig = CREDITS): number {
  return Math.min(held, creditsForCost(costMicroUsd, cfg));
}

/** The calendar month a time falls in, in UTC: "2026-10". Monthly limits count per month. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** When a month ends (UTC): "2026-10" ends at 2026-11-01T00:00:00.000Z. Holder credits expire then. */
export function monthEnd(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString();
}
