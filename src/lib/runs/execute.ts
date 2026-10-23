/**
 * One attempt at a run: fill the prompt, call the model through its route with
 * the fallback, parse the answer into the typed output (one repair retry), and
 * run the guardrails. Every model call, failed or skipped, is recorded on the
 * run with its tokens and cost.
 *
 * Spend cap: before each call the engine estimates its cost (prompt tokens
 * plus every output token it may use) and skips a route that would pass the
 * cap. After each call the real cost is added, and a run over its cap fails.
 *
 * The quality gate (phase 12): every parsed draft is scored. Below the
 * agent's bar, or with a check that failed outright, the model is asked to
 * rewrite it with the reasons as notes, at most `gate.maxRewrites` times and
 * only while the run's budget covers the next call. The best draft is kept;
 * if it is still below the bar the run goes to review with the reasons.
 */
import { findModelRoute, type ModelRoute } from "@/lib/agents/catalog";
import type { AgentBody } from "@/lib/agents/spec";
import { NO_REFERENCES, runDeterministicChecks, type QualityInput, type QualityReferences } from "@/lib/quality/checks";
import { gateFor, judgeCheck, readQuality, type QualityJudge, type QualityReading } from "@/lib/quality/evaluate";
import { beats, gateReport, rewriteInstruction, type GateDraft } from "@/lib/quality/gate";
import type { GateStop, QualityReport } from "@/lib/quality/types";
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
  /** The agent's golden and bad samples, for reference anchoring. */
  references?: QualityReferences;
  /** The optional model judge. Null or left out: off. */
  judge?: QualityJudge | null;
};

export type ExecResult =
  | { ok: true; output: RunOutput; checks: CheckResult[]; model: NonNullable<Run["model"]>; quality: QualityReport }
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

  return gateLoop(ctx, messages, { output: parsed.value, answer });
}

type Scored = GateDraft & { output: RunOutput; reading: QualityReading; guards: CheckResult[]; answer: Answer };

/** Scores the first draft, rewrites below the bar while the cap and the budget allow, and keeps the best draft. */
async function gateLoop(ctx: ExecContext, messages: ChatMessage[], first: { output: RunOutput; answer: Answer }): Promise<ExecResult> {
  const { spec, run } = ctx;
  const gate = gateFor(spec);
  const drafts: GateDraft[] = [await score(ctx, first.output, first.answer, gate.minScore)];
  let best = drafts[0] as Scored;
  let last = best;
  let stopped: GateStop | null = null;

  while (!best.reading.ready) {
    const rewrites = drafts.length - 1;
    if (rewrites >= gate.maxRewrites) {
      stopped = gate.maxRewrites === 0 ? "off" : "cap";
      break;
    }
    const ask: ChatMessage[] = [...messages, { role: "assistant", content: last.answer.text }, { role: "user", content: rewriteInstruction(last.reading.reasons) }];
    const order = [last.answer.route.id, last.answer.route.id === spec.routing.model ? spec.routing.fallback : spec.routing.model];
    const maxOut = spec.routing.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const cheapest = Math.min(...order.map((id) => estimateCallMicroUsd(findModelRoute(id)!.model!, promptText(ask), maxOut)));
    if (run.costMicroUsd + cheapest > run.capMicroUsd) {
      stopped = "budget";
      break;
    }
    const answer = await callRouted(ctx, ask, "rewrite", order);
    if (!answer.ok) {
      stopped = answer.code === "spend_cap" ? "budget" : "error";
      drafts.push({ output: null, reading: null, error: answer.code === "spend_cap" ? "The budget ran out." : "The model did not answer." });
      break;
    }
    const parsed = parseOutput(spec.output, answer.text);
    if (!parsed.ok) {
      drafts.push({ output: null, reading: null, error: "The rewrite did not fit the output format." });
      continue;
    }
    const next = await score(ctx, parsed.value, answer, gate.minScore);
    drafts.push(next);
    last = next;
    if (beats(next.reading, best.reading)) best = next;
  }

  // A rewrite that came back broken never counts as the used draft; its reading stays empty in the report.
  const scoredDrafts = drafts.map((d) => (d.reading ? d : { ...d, reading: { score: 0, checks: [], ready: false, failing: [], failed: [], reasons: [d.error ?? "No usable answer."] } }));
  const used = drafts.indexOf(best);
  // Phase 18: a draft that still breaks a hard content rule after the rewrites is withheld. The run fails, so nothing is charged.
  const unsafe = best.guards.find((g) => g.check === "content_safety" && g.status === "fail");
  if (unsafe) {
    return {
      ok: false,
      code: "blocked",
      message: `Every draft broke WOVI's content rules (${(unsafe.findings ?? []).map((f) => f.split(":")[0]).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "content rules"}), so nothing is shown and nothing is charged.`,
      retryable: false,
    };
  }
  return {
    ok: true,
    output: best.output,
    checks: best.guards,
    model: { route: best.answer.route.id, provider: best.answer.provider, model: best.answer.route.model! },
    quality: gateReport(scoredDrafts, used, gate, stopped, Boolean(ctx.judge)),
  };
}

/** One draft through the guardrails, the quality checks and, when one is set, the judge. */
async function score(ctx: ExecContext, output: RunOutput, answer: Answer, bar: number): Promise<Scored> {
  const { spec, run, brain } = ctx;
  const guards = runAfterChecks({ spec, inputs: run.inputs, output, brain });
  const input: QualityInput = { spec, inputs: run.inputs, output, brain, references: ctx.references ?? NO_REFERENCES };
  const checks = runDeterministicChecks(input);
  if (ctx.judge) {
    const estimate = ctx.judge.estimateMicroUsd(input);
    if (run.costMicroUsd + estimate <= run.capMicroUsd) {
      const started = Date.now();
      try {
        const j = await ctx.judge.judge(input, ctx.signal);
        run.calls.push(record(ctx, { purpose: "judge", route: "judge", provider: ctx.judge.id, model: ctx.judge.id }, { ok: true, costMicroUsd: j.costMicroUsd, ms: Date.now() - started }));
        run.costMicroUsd += j.costMicroUsd;
        run.costUsd = toUsd(run.costMicroUsd);
        checks.push(judgeCheck(j.score, j.reasons));
      } catch (err) {
        if (ctx.signal.aborted) throw new RunAborted();
        run.calls.push(record(ctx, { purpose: "judge", route: "judge", provider: ctx.judge.id, model: ctx.judge.id }, { ok: false, error: String((err as Error)?.message ?? err), ms: Date.now() - started }));
      }
    }
  }
  return { output, guards, answer, reading: readQuality(checks, bar, guards) };
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
