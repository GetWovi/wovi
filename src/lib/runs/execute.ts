/**
 * One attempt at a run: fill the prompt, call the model through its route with
 * the fallback, parse the answer into the typed output (one repair retry), and
 * run the guardrails. Every model call, failed or skipped, is recorded on the
 * run with its tokens and cost.
 *
 * Spend cap: before each call the engine estimates its cost (prompt tokens
 * plus every output token it may use) and skips a route that would pass the
 * cap. After each call the real cost is added, and a run over its cap fails.
 */
import { findModelRoute, type ModelRoute } from "@/lib/agents/catalog";
import type { AgentBody } from "@/lib/agents/spec";
import { brandBrainRef, type BrandBrain } from "./brand-brain";
import { runAfterChecks, type CheckResult } from "./guardrails";
import { parseOutput, repairInstruction, type RunOutput } from "./output";
import { DEFAULT_MAX_OUTPUT_TOKENS, costMicroUsd, estimateCallMicroUsd, toUsd } from "./prices";
import { assemblePrompt, promptText } from "./prompt";
import { ProviderError, asProviderError, type ChatMessage, type ModelProvider } from "./providers/types";
import type { ModelCall, Run, RunFailureCode } from "./run";

export type ExecContext = {
  spec: AgentBody;
  /** Updated in place: calls, tokens, cost, Brand Brain reference. */
  run: Run;
  brain: BrandBrain | null;
  providerFor: (route: ModelRoute) => ModelProvider | null;
  /** Fires on cancel or when the run's time is up. */
  signal: AbortSignal;
  callTimeoutMs: number;
  now: () => Date;
};

export type ExecResult =
  | { ok: true; output: RunOutput; checks: CheckResult[]; model: NonNullable<Run["model"]> }
  | { ok: false; code: RunFailureCode; message: string; retryable: boolean };

type Failure = Extract<ExecResult, { ok: false }>;
type Answer = { ok: true; text: string; route: ModelRoute; provider: string };

/** Thrown when the run's own signal fires; the engine decides between cancelled and timeout. */
export class RunAborted extends Error {
  constructor() {
    super("Run aborted.");
    this.name = "RunAborted";
  }
}

export async function executeRun(ctx: ExecContext): Promise<ExecResult> {
  const { spec, run, brain } = ctx;
  run.brandBrain = brain ? brandBrainRef(brain, spec.brandBrain) : null;
  const messages = assemblePrompt(spec, run.inputs, brain);

  const first = await callRouted(ctx, messages, "answer", [spec.routing.model, spec.routing.fallback]);
  if (!first.ok) return first;
  let answer = first;
  let parsed = parseOutput(spec.output, first.text);

  if (!parsed.ok) {
    const repair: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: first.text },
      { role: "user", content: repairInstruction(parsed.errors) },
    ];
    const order = [first.route.id, first.route.id === spec.routing.model ? spec.routing.fallback : spec.routing.model];
    const second = await callRouted(ctx, repair, "repair", order);
    if (!second.ok) return second;
    answer = second;
    parsed = parseOutput(spec.output, second.text);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "output_invalid",
        message: `The answer did not fit the output format, even after one repair: ${parsed.errors.slice(0, 3).join("; ")}`,
        retryable: false,
      };
    }
  }

  const checks = runAfterChecks({ spec, inputs: run.inputs, output: parsed.value, brain });
  return {
    ok: true,
    output: parsed.value,
    checks,
    model: { route: answer.route.id, provider: answer.provider, model: answer.route.model! },
  };
}

/** Tries each route in order until one answers. */
async function callRouted(ctx: ExecContext, messages: ChatMessage[], purpose: ModelCall["purpose"], routeIds: string[]): Promise<Answer | Failure> {
  const { run, spec } = ctx;
  const maxOut = spec.routing.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const errors: ProviderError[] = [];
  let overCap = 0;

  for (const routeId of routeIds) {
    const route = findModelRoute(routeId);
    const provider = route ? ctx.providerFor(route) : null;
    const base = { purpose, route: routeId, provider: provider?.id ?? route?.provider ?? "none", model: route?.model ?? "none" };
    if (!route?.model || !provider) {
      errors.push(new ProviderError("unavailable", `No provider serves route ${routeId}.`));
      run.calls.push(record(ctx, base, { ok: false, error: "skipped: no provider for this route" }));
      continue;
    }

    const estimate = estimateCallMicroUsd(route.model, promptText(messages), maxOut);
    if (run.costMicroUsd + estimate > run.capMicroUsd) {
      overCap++;
      run.calls.push(
        record(ctx, base, {
          ok: false,
          error: `skipped: estimate $${toUsd(estimate)} would pass the cap ($${toUsd(run.costMicroUsd)} of $${toUsd(run.capMicroUsd)} spent)`,
        }),
      );
      continue;
    }

    const timeout = AbortSignal.timeout(ctx.callTimeoutMs);
    const signal = AbortSignal.any([ctx.signal, timeout]);
    const started = Date.now();
    try {
      const r = await provider.complete({ model: route.model, messages, temperature: spec.routing.temperature, maxOutputTokens: maxOut, signal });
      const cost = costMicroUsd(route.model, r.tokensIn, r.tokensOut);
      run.calls.push(record(ctx, base, { ok: true, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costMicroUsd: cost, ms: Date.now() - started }));
      run.tokensIn += r.tokensIn;
      run.tokensOut += r.tokensOut;
      run.costMicroUsd += cost;
      run.costUsd = toUsd(run.costMicroUsd);
      if (run.costMicroUsd > run.capMicroUsd) {
        return { ok: false, code: "spend_cap", message: `The run cost $${run.costUsd}, over its cap of $${toUsd(run.capMicroUsd)}.`, retryable: false };
      }
      return { ok: true, text: r.text, route, provider: provider.id };
    } catch (err) {
      if (ctx.signal.aborted) throw new RunAborted();
      const pe = timeout.aborted ? new ProviderError("timeout", `No answer within ${ctx.callTimeoutMs} ms.`) : asProviderError(err);
      errors.push(pe);
      run.calls.push(record(ctx, base, { ok: false, error: `${pe.kind}: ${pe.message}`, ms: Date.now() - started }));
    }
  }

  if (overCap > 0 && errors.length === 0) {
    return { ok: false, code: "spend_cap", message: `The next model call would pass the run's cap of $${toUsd(run.capMicroUsd)}.`, retryable: false };
  }
  return {
    ok: false,
    code: "provider_error",
    message: "The model did not answer. It will be retried if attempts remain.",
    retryable: errors.some((e) => e.retryable),
  };
}

function record(
  ctx: ExecContext,
  base: Pick<ModelCall, "purpose" | "route" | "provider" | "model">,
  r: Partial<Pick<ModelCall, "tokensIn" | "tokensOut" | "costMicroUsd" | "ms" | "error">> & { ok: boolean },
): ModelCall {
  return {
    ...base,
    ok: r.ok,
    ...(r.error ? { error: r.error } : {}),
    tokensIn: r.tokensIn ?? 0,
    tokensOut: r.tokensOut ?? 0,
    costMicroUsd: r.costMicroUsd ?? 0,
    ms: r.ms ?? 0,
    at: ctx.now().toISOString(),
  };
}
