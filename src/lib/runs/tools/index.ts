/**
 * The tool layer. Product doc, section 5: "Tools are declared. An agent can
 * only call tools listed in its spec, which keeps permissions and cost under
 * control."
 *
 * How it works:
 * - The engine runs a run's tools itself, before the model writes. The model
 *   is never handed a tool, so it can never call one, declared or not.
 * - Only tools the spec declares, the catalog knows (assertDeclaredTool) and
 *   this code implements run. Today that is `trend_lookup`. Declared tools
 *   that are not built yet (transcription, video cut, ...) are skipped as
 *   before; a built tool that is not set up makes the agent not runnable.
 * - Every call has a timeout, a cap per run, a check against the run's spend
 *   cap, and its cost added to the run's cost, so credits charge for it.
 *   Answers are cached per arguments for a few hours.
 * - What a tool returns reaches the model as a `tool` data block: material,
 *   never instructions. Text in it that reads like instructions is noted on
 *   the run, as for inputs.
 */
import type { AgentSpec } from "@/lib/agents/spec";
import { isLocalApp } from "@/lib/runtime";
import { assertDeclaredTool, injectionSignals, toolsForRun } from "@/lib/safety/injection";
import type { CheckResult } from "../guardrails";
import type { RunInputs } from "../inputs";
import type { RunOutput } from "../output";
import { toUsd } from "../prices";
import { untrustedBlock } from "../prompt";
import { ProviderError, asProviderError } from "../providers/types";
import type { ModelCall, Run } from "../run";
import { toolCacheKey, type ToolCache } from "./cache";
import { TREND_LOOKUP, TREND_LOOKUP_ID, fakeTrendLookup, normUrl, openRouterTrendLookup, renderTrendFindings, trendArgs, trendConfigFromEnv, type TrendConfig } from "./trend-lookup";
import type { AgentTool, ToolSet, ToolUse } from "./types";

export * from "./types";
export * from "./cache";
export * from "./trend-lookup";

/** The tools this code can run. Other catalog tools are declared for later phases and skipped. */
export const IMPLEMENTED_TOOLS: readonly string[] = [TREND_LOOKUP_ID];

/** The built tools a spec declares: the ones a run of it must have. */
export function requiredTools(spec: Pick<AgentSpec, "tools">): string[] {
  return toolsForRun(spec).filter((t) => IMPLEMENTED_TOOLS.includes(t));
}

/** Calls per run, cache time and timeout, per tool. */
export type ToolLimits = { maxCallsPerRun: number; cacheTtlMs: number; timeoutMs: number };

export const DEFAULT_TOOL_LIMITS: ToolLimits = { maxCallsPerRun: TREND_LOOKUP.maxCallsPerRun, cacheTtlMs: TREND_LOOKUP.cacheHours * 3_600_000, timeoutMs: TREND_LOOKUP.timeoutMs };

/** The most a run's tools may cost, in micro-dollars, for the spend cap and the credit estimate. */
export function toolEstimateMicroUsd(spec: Pick<AgentSpec, "tools">, tools: ToolSet | null, limits: Pick<ToolLimits, "maxCallsPerRun"> = DEFAULT_TOOL_LIMITS): number {
  let sum = 0;
  for (const id of requiredTools(spec)) {
    // Without the tool set at hand (a page's estimate), count the real lookup's estimate.
    const one = tools?.[id]?.estimateMicroUsd() ?? openRouterTrendLookup({ apiKey: "estimate-only" }).estimateMicroUsd();
    sum += one * limits.maxCallsPerRun;
  }
  return sum;
}

/**
 * The tools for this process: the real trend lookup with OPENROUTER_API_KEY;
 * the fake one only for a local app with no key (local work, screenshots);
 * none on a server in production without a key, so Trend Scout refuses to
 * run instead of writing trends from memory.
 */
export function toolsFromEnv(env: Record<string, string | undefined> = process.env, opts: { fake?: boolean } = {}): { tools: ToolSet; limits: ToolLimits; config: TrendConfig } {
  const config = trendConfigFromEnv(env);
  const limits: ToolLimits = { maxCallsPerRun: config.maxCallsPerRun, cacheTtlMs: config.cacheHours * 3_600_000, timeoutMs: config.timeoutMs };
  const key = env.OPENROUTER_API_KEY?.trim();
  if (opts.fake || !key) return { tools: isLocalApp(env as NodeJS.ProcessEnv) || opts.fake ? { [TREND_LOOKUP_ID]: fakeTrendLookup() } : {}, limits, config };
  return { tools: { [TREND_LOOKUP_ID]: openRouterTrendLookup({ apiKey: key, config }) }, limits, config };
}

export type ToolRunContext = {
  spec: Pick<AgentSpec, "tools" | "inputs" | "platforms">;
  /** Updated in place: calls, cost, tools. */
  run: Run;
  inputs: RunInputs;
  tools: ToolSet;
  cache: ToolCache | null;
  limits: ToolLimits;
  signal: AbortSignal;
  now: () => Date;
};

export type ToolRunResult =
  | { ok: true; material: string[]; checks: CheckResult[] }
  | { ok: false; code: "tool_error" | "spend_cap"; message: string; retryable: boolean };

/** Thrown when the run's own signal fires during a tool call. */
export class ToolAborted extends Error {}

/** Runs every built tool the spec declares, records each call on the run, and returns the material for the prompt. */
export async function runDeclaredTools(ctx: ToolRunContext): Promise<ToolRunResult> {
  const { spec, run } = ctx;
  const material: string[] = [];
  const checks: CheckResult[] = [];
  const ids = requiredTools(spec);
  if (!ids.length) return { ok: true, material, checks };
  // Each attempt starts its own list; the calls of earlier attempts stay in run.calls with their cost.
  run.tools = [];
  for (const id of ids) {
    assertDeclaredTool(spec, id);
    const tool = ctx.tools[id];
    if (!tool) return { ok: false, code: "tool_error", message: `The ${id} tool is not set up on this server.`, retryable: false };
    const uses: ToolUse[] = [];
    const plan = id === TREND_LOOKUP_ID ? trendArgs(spec, ctx.inputs) : [];
    for (const args of plan.slice(0, ctx.limits.maxCallsPerRun)) {
      // The wider lookup only runs when the first one came back thin.
      if (uses.length && uses.reduce((n, u) => n + u.findings.length, 0) >= 5) break;
      const use = await callOne(ctx, tool, args);
      if ("fail" in use) {
        if (!uses.some((u) => u.ok)) return use.fail;
        break;
      }
      uses.push(use);
      run.tools.push(use);
    }
    const ok = uses.filter((u) => u.ok);
    if (!ok.length) return { ok: false, code: "tool_error", message: `The ${id} tool did not answer.`, retryable: true };
    // Nothing found: the model is not asked to write from nothing (it could only invent, or say there is nothing). The run fails and costs no credits.
    if (!ok.some((u) => u.findings.length)) {
      return { ok: false, code: "tool_error", message: "The trend search found nothing current for this niche on this platform. Nothing was charged. Try a wider niche, or another platform.", retryable: false };
    }
    const text = renderTrendFindings(ok);
    material.push(untrustedBlock("tool", text, id));
    const signals = injectionSignals({ [id]: ok.flatMap((u) => u.findings.map((f) => `${f.trend}. ${f.detail}`)).join("\n") });
    if (signals.length) {
      checks.push({ guardrail: "prompt_injection", check: "prompt_injection", status: "note", message: "Some of what the trend lookup found reads like instructions to the AI. It was passed to the agent as material only.", findings: signals.map((g) => `${g.field}: "${g.match}"`) });
    }
  }
  return { ok: true, material, checks };
}

async function callOne(ctx: ToolRunContext, tool: AgentTool, args: Record<string, string>): Promise<ToolUse | { fail: Extract<ToolRunResult, { ok: false }> }> {
  const { run } = ctx;
  const at = ctx.now().toISOString();
  const key = toolCacheKey(tool.id, args);
  const hit = ctx.cache ? await ctx.cache.get(key).catch(() => null) : null;
  const base = { purpose: "tool" as const, route: `tool:${tool.id}`, provider: tool.provider, model: tool.model };
  if (hit) {
    run.calls.push({ ...base, ok: true, cached: true, tokensIn: 0, tokensOut: 0, costMicroUsd: 0, ms: 0, at });
    return { tool: tool.id, args, ok: true, cached: true, searchedAt: hit.searchedAt, findings: hit.findings, costMicroUsd: 0, ms: 0, at };
  }
  const estimate = tool.estimateMicroUsd();
  if (run.costMicroUsd + estimate > run.capMicroUsd) {
    run.calls.push(call(base, at, { ok: false, error: `skipped: estimate $${toUsd(estimate)} would pass the cap ($${toUsd(run.costMicroUsd)} of $${toUsd(run.capMicroUsd)} spent)` }));
    return { fail: { ok: false, code: "spend_cap", message: `The ${tool.id} tool would pass the run's cap of $${toUsd(run.capMicroUsd)}.`, retryable: false } };
  }
  const timeout = AbortSignal.timeout(ctx.limits.timeoutMs);
  const signal = AbortSignal.any([ctx.signal, timeout]);
  const started = Date.now();
  try {
    const a = await tool.call(args, { signal, now: ctx.now });
    const ms = Date.now() - started;
    run.calls.push(call(base, at, { ok: true, tokensIn: a.tokensIn, tokensOut: a.tokensOut, costMicroUsd: a.costMicroUsd, ms }));
    run.costMicroUsd += a.costMicroUsd;
    run.costUsd = toUsd(run.costMicroUsd);
    if (ctx.cache) await ctx.cache.set(key, { findings: a.findings, searchedAt: a.searchedAt }, ctx.limits.cacheTtlMs).catch((err) => console.error("Could not cache a tool answer:", (err as Error)?.message));
    return { tool: tool.id, args, ok: true, cached: false, searchedAt: a.searchedAt, findings: a.findings, costMicroUsd: a.costMicroUsd, ms, at };
  } catch (err) {
    if (ctx.signal.aborted) throw new ToolAborted("Run aborted.");
    const pe = timeout.aborted ? new ProviderError("timeout", `The ${tool.id} tool gave no answer within ${ctx.limits.timeoutMs} ms.`) : asProviderError(err);
    const ms = Date.now() - started;
    // A lookup that was paid for but could not be read still counts toward the run's cost.
    const billed = pe.billed?.costMicroUsd ?? 0;
    run.calls.push(call(base, at, { ok: false, error: `${pe.kind}: ${pe.message}`, ms, ...(billed ? { costMicroUsd: billed, tokensIn: pe.billed!.tokensIn, tokensOut: pe.billed!.tokensOut } : {}) }));
    if (billed) {
      run.costMicroUsd += billed;
      run.costUsd = toUsd(run.costMicroUsd);
    }
    run.tools?.push({ tool: tool.id, args, ok: false, error: pe.kind, cached: false, searchedAt: null, findings: [], costMicroUsd: billed, ms, at });
    return { fail: { ok: false, code: "tool_error", message: `The ${tool.id} tool did not answer (${pe.kind}).`, retryable: pe.retryable } };
  }
}

function call(base: Pick<ModelCall, "purpose" | "route" | "provider" | "model">, at: string, r: Partial<ModelCall> & { ok: boolean }): ModelCall {
  return { ...base, ok: r.ok, ...(r.error ? { error: r.error } : {}), tokensIn: r.tokensIn ?? 0, tokensOut: r.tokensOut ?? 0, costMicroUsd: r.costMicroUsd ?? 0, ms: r.ms ?? 0, at };
}

/**
 * Every item of a list output with a `source` field must point at a page
 * the run's lookup found. A source the model made up fails the check, which
 * sends the draft back for a rewrite with the reason.
 */
export function toolSourceChecks(output: RunOutput, uses: ToolUse[] | null | undefined): CheckResult[] {
  const ok = (uses ?? []).filter((u) => u.ok);
  if (!ok.length || output.kind !== "list") return [];
  const items = output.items.filter((it): it is Record<string, string> => typeof it === "object" && it !== null && "source" in it);
  if (!items.length) return [];
  const known = new Set(ok.flatMap((u) => u.findings.map((f) => normUrl(f.url))).filter(Boolean));
  const bad = items.filter((it) => !known.has(normUrl(String(it.source ?? "").trim().split(/\s+/)[0] ?? "")));
  if (!bad.length) return [{ guardrail: "trend_lookup", check: "tool_sources", status: "pass", message: "Every item points at a page the lookup found." }];
  return [
    {
      guardrail: "trend_lookup",
      check: "tool_sources",
      status: "fail",
      message: "Every item's source must be the exact address of one of the lookup's findings. Use only trends from the lookup.",
      findings: bad.slice(0, 5).map((it) => `"${String(it.source).slice(0, 80)}"`),
    },
  ];
}
