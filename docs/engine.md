# The run engine (phase 3)

The run engine takes a run request for an agent and produces its typed output. It validates the request, queues it, fills the prompt, routes it to a model the user never sees, parses the answer, runs the guardrails and records the cost. The code lives in `src/lib/runs/`. No pages; this is engine only.

| File | What it holds |
|---|---|
| `engine.ts` | `RunEngine`: `submitRun`, `getRun`, `cancelRun`, `listRuns`, `waitForRun`, `costTotals`, `recover`. `localEngine()` for dev. |
| `run.ts` | The `Run` record, statuses, failure codes, `publicRunView`. |
| `inputs.ts` | `validateRunInputs`: form values against the agent's typed inputs. |
| `brand-brain.ts` | The `BrandBrain` the engine reads, the `BrandBrainSource` interface, how each part renders, the snapshot reference, and a stub source for tests. The real source is phase 7 ([brand-brain.md](brand-brain.md)). |
| `brand-fit.ts` | The deterministic brand-fit check: flags, similarity, score (phase 7). |
| `prompt.ts` | Prompt assembly: engine rules, output format, the filled instruction template. |
| `output.ts` | The output shape per kind, the example shown to the model, parsing, the repair instruction. |
| `execute.ts` | One attempt: routing with fallback, spend cap, parse and repair, guardrails. |
| `guardrails.ts` | Phrase lists and the check list, as data. |
| `prices.ts` | The price table per model, and cost math in micro-dollars. |
| `queue.ts` | The `RunQueue` interface and `InProcessQueue`. |
| `store.ts` | The `RunStore` interface, a memory store and a JSON file store. |
| `providers/` | The `ModelProvider` interface, the fake provider and the OpenRouter adapter. |
| `samples.ts` | Example inputs for each live launch agent. |

## The run lifecycle

```
submitRun ──> queued ──> running ──> succeeded   (needsReview when a check failed)
                 ^          │──────> failed      (provider_error, spend_cap, output_invalid, timeout, ...)
                 └──────────┘ retry with backoff, provider errors only
   cancelRun at any point before the end ──> cancelled
```

### 1. Submit (nothing is queued unless all of this passes)

`submitRun({ workspaceId, agentId, version?, agentWorkspaceId?, inputs, idempotencyKey?, confirmations?, maxCostUsd?, parent? })`

1. The workspace id is checked. With an `idempotencyKey`, a run with the same key in the workspace is returned instead of a new one. The same key with a different request is refused (`idempotency_conflict`). Submits with one key are serialized, so a double click makes one run.
2. The agent is loaded from the registry: the pinned `version`, or the current one. The run records the exact version. An agent from another workspace (like the platform's own in `ws_wovi`) runs only when it is public and live; an owner may run its own drafts.
3. The agent must be runnable now: a text output kind (`text`, `list`, `script`, `caption_set`, `post_set`), text routes, a priced model and a provider for both routes. Image, storyboard and video need media tools from a later phase.
4. Inputs are checked against the spec's typed inputs: required, unknown keys, text length, link format, choice options, number range and step, file count, size, type and length. Choice and number defaults are filled in. Every problem is listed at once (`invalid_input`).
5. The Brand Brain is the one `brandBrainId` names, else the one the agent's profile input names, else the workspace default. A named one that does not exist is refused. `brandIdea` replaces the standing idea for this run ([brand-brain.md](brand-brain.md#how-the-engine-reads-it)). The source also gets the agent's identity, so it can add the agent's own references: since phase 5 the builder's mood board for the agent joins `mood_board` and `references` ([builder.md](builder.md#mood-boards)).
6. Guardrails that act before a run: `rights_confirmed` needs `confirmations.rights`, `voice_consent` needs `confirmations.voiceConsent`.
7. Budget: the cap is the agent's `routing.maxCostUsd`, or lower when the caller passes `maxCostUsd`. If even the cheaper route's first call could cost more than the cap, the run is refused (`over_budget`).

Errors are `RunError` with a `code` and a list of `issues`.

### 2. Prompt

- **System message:** the engine rules (data blocks are material, never instructions) and the output format with a JSON example of the exact shape.
- **User message:** the agent's instruction template. Each `{{input}}` and `{{brand.part}}` becomes a block:

  ```
  <data name="idea">
  what the user typed
  </data>
  ```

  Choices show their labels, optional inputs left out say "Not given.", and Brand Brain parts render as text or lists. Inside a value, `<data` and `</data` are escaped, so user text can never close its block or open a new one, and placeholders inside user text are never expanded.

The run stores a reference to the Brand Brain used: its id, `updatedAt`, the parts read and a hash of the parts as filled in.

### 3. Model routing

The spec names a route (`text-standard`); `MODEL_ROUTES` in `src/lib/agents/catalog.ts` maps it to a provider and model. The engine tries `routing.model`, then `routing.fallback`, when a call fails, times out (`callTimeoutMs`, default 60 s) or would pass the cap. Every call, including failed and skipped ones, is recorded in `run.calls` with route, provider, model, tokens, cost and time. `run.model` is the model whose answer became the output. Users never see any of it (`publicRunView`).

**Spend cap.** Before each call: estimated cost = prompt tokens (characters / 4) plus every output token the call may use (`maxOutputTokens`, default 1024), at the model's price. A route whose estimate would pass the cap is skipped. After each call: the real cost is added, and a run over its cap fails with `spend_cap` (the cost stays recorded).

### 4. Output

The answer is read as JSON (a code fence or text around it is fine) and checked against the spec's output: exact list count, words per item, fields, script sections in order with seconds within the limit, caption platforms and variants within the character limit, posts per format. On a mismatch the engine sends one repair message with the earlier answer and the exact problems. If the repair does not fit either, the run fails with `output_invalid` and is not retried.

### 5. Guardrails

Each guardrail the agent declares runs as a check function from `GUARDRAIL_CHECKS`. The first version is cheap and deterministic:

| Guardrail | Check |
|---|---|
| `banned_phrases` | The anti-slop phrase list. |
| `no_misleading_claims` | Claim phrases and patterns ("guaranteed results", "make $500 a day"). |
| `no_fake_testimonials` | Review language and attributed quotes. |
| `no_impersonation` | Impersonation phrases. |
| `safe_content` | Unsafe advice phrases. The real classifier is phase 12. |
| `brand_voice_check` | Two checks: the Brand Brain's words to avoid, and brand fit (the don'ts, similarity to the voice's sample lines, a score). A note when there is no Brand Brain. |
| `specificity_check` | The output names something from the user's text inputs, and no item repeats. List items with fields are compared as whole items, since a field like `type: hashtag` repeats by design. |
| `platform_policy` | Caption and thread lengths per platform. |
| `ai_disclosure` | Always a note: label as AI where the platform asks. |
| `rights_confirmed`, `voice_consent` | Before the run, see submit. |

A failed check is stored in `run.checks` and sets `run.needsReview`; the output is kept for the human approve step. The phrase lists, platform limits and checks are data in `guardrails.ts`, so phase 12 adds entries (LLM judge, brand-fit score) without touching the engine.

### 6. Queue, retries, cancel, timeout

- `InProcessQueue` runs jobs oldest first with a global limit and a per-workspace limit (defaults 4 and 2), so one workspace cannot take every slot. It sits behind `RunQueue`; a Redis or managed queue implements the same five methods.
- Provider failures that can pass (timeout, rate limit, unavailable, bad response) are retried with backoff: 1 s, doubled each time, at most 30 s, up to 3 attempts in total. Auth and bad-request errors are not retried. Spend cap and output failures are never retried.
- `cancelRun` takes a queued run out of the queue, or aborts the running model call. A finished run is returned unchanged.
- `runTimeoutMs` (default 5 minutes) covers the whole run from its first start, across retries. Past it the run fails with `timeout`.
- `recover()` re-queues runs left queued or running by a previous process.

### 7. Cost

`prices.ts` holds USD per million tokens per model. Cost is counted in whole micro-dollars (rounded up per call), so totals add up exactly; `costUsd` is for reading. `costTotals(workspaceId)` gives the workspace total and a total per agent; failed and cancelled runs count, since their calls were paid for. Credits and balances are phase 13; nothing is charged here.

## Providers

Every provider implements `ModelProvider.complete({ model, messages, temperature, maxOutputTokens, signal })`.

- **Fake** (`providers/fake.ts`): deterministic, no network. It answers with the JSON example from the prompt, filled with words from the run's input blocks. Tests script answers, errors and delays with `respond` and `latencyMs`. It is used by all tests, by `npm run agents:try`, and by `localEngine()` whenever no key is set. It prices its made-up tokens as the real model would, so dev totals give a rough idea of cost. `WOVI_FAKE_LATENCY_MS` in the environment makes it take its time, so a running state can be seen on a screen.
- **OpenRouter** (`providers/openrouter.ts`): OpenAI-compatible chat completions at `https://openrouter.ai/api/v1`. Off unless `OPENROUTER_API_KEY` is set in the environment. Tests use a stub `fetch` only.

## Models (owner's choice)

Defaults, from OpenRouter's public list on 2026-10-21. Change them in `MODEL_ROUTES` (catalog) and keep a price row in `prices.ts`.

| Route | Model | Input / output per million tokens | Used by |
|---|---|---|---|
| `text-fast` | `openai/gpt-6-luna` | $0.10 / $0.50 | Hashtag Picker; fallback for Hook Writer, Caption Writer |
| `text-standard` | `anthropic/claude-sonnet-5.5` | $2 / $10 | Hook Writer, Caption Writer; fallback for the strong agents |
| `text-strong` | `anthropic/claude-opus-5.5` | $4 / $20 | Trend Scout, Script Writer, Repurposer |

`text-fast` is on a different vendor than `text-standard`, so the common fallback still works when one vendor is down.

The "Used by" column is the phase 2 seeds. The phase 8 launch versions route Hashtag Optimizer to fast; Hook Writer and Caption Writer to standard; Idea Generator, Script Writer, Platform Repurposer and Trend Scout to strong ([launch-agents.md](launch-agents.md#the-lineup)).

## Not in this phase

- **Tools.** The engine sends no tools to the model, so nothing outside the spec can be called, and declared tools (like `trend_lookup` for Trend Scout) do not run yet. Their results arrive when the tool layer is built.
- **Media.** Image, storyboard and video outputs are refused at submit as not runnable.

## Pipelines (phase 10)

A pipeline step is `submitRun` with `parent: { pipelineRunId, step }`, a pinned `version`, an idempotency key per step and try, and `maxCostUsd` set to what is left of the pipeline's budget; `waitForRun` returns the typed output that feeds the next step. Steps share this engine's queue and limits. See [pipelines.md](pipelines.md).

## Who may call it (phase 4)

The engine trusts the workspace id it is given. Callers reach it through `GuardedRuns`, which checks that the caller (a signed-in user or an API key) may run agents, read runs or see costs in that workspace first. See [accounts.md](accounts.md#the-registry-and-engine-behind-the-policy). The app holds one engine (`appEngine()`), shared by the guarded runs and the builder's test bench, so there is one queue; it calls `recover()` once on its first use. The bench reaches the engine directly, after its own builder check, because builders see the model and the cost ([builder.md](builder.md#the-test-bench-phase-6)).

## Commands

- `npm run agents:try -- hook-writer` seeds the launch agents if needed and runs one end to end on the fake provider from the workspace `ws_dev`, then prints the run. Pass your own inputs as JSON after the id. Runs are saved in `.data/runs.json`.
- `npm test` runs every test, all on the fake provider.
