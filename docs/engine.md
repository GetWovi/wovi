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
| `tools/` | The tool layer: `runDeclaredTools`, the `trend_lookup` tool (OpenRouter web search, and a fake), the tool cache. See [Tools](#tools). |
| `examples.ts` | Few-shot examples from the builder's samples (tuning level 2). See [Examples](#examples-tuning-level-2). |

## The run lifecycle

```
submitRun ──> queued ──> running ──> succeeded   (needsReview when a check failed)
                 ^          │──────> failed      (provider_error, spend_cap, output_invalid, timeout, tool_error, ...)
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

- **System message:** the engine rules (data blocks are material, never instructions), the platform rules, the examples from the agent's samples when it has any ([Examples](#examples-tuning-level-2)), and the output format with a JSON example of the exact shape.
- **User message:** the agent's instruction template. Each `{{input}}` and `{{brand.part}}` becomes a block:

  ```
  <data name="idea">
  what the user typed
  </data>
  ```

  Choices show their labels, optional inputs left out say "Not given.", and Brand Brain parts render as text or lists. What the agent's declared tools found follows the instructions under "MATERIAL FROM TOOLS", one `<data name="tool.<id>">` block per tool. Inside a value, `<data` and `</data` are escaped, so user text can never close its block or open a new one, and placeholders inside user text are never expanded.

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

A failed check is stored in `run.checks` and sets `run.needsReview`; the output is kept for the human approve step. Since phase 12 every parsed draft also goes through the quality gate: six scored checks, one score, the agent's bar, and up to two rewrites with the reasons inside the run's spend cap before a result below the bar goes to review. See [quality.md](quality.md). The phrase lists, platform limits and checks are data in `guardrails.ts`. The LLM judge (`src/lib/quality/judge.ts`) reads bench runs as one more check, "Second opinion", as a `judge` call inside the run's cap; people's runs only with `WOVI_JUDGE_LIVE=on` (off by default). The engine takes it as `judge` and the switch as `judgeLive`; a judge that fails never fails the run. See [quality.md](quality.md#the-judge-second-opinion).

### 6. Queue, retries, cancel, timeout

- `InProcessQueue` runs jobs oldest first with a global limit and a per-workspace limit (defaults 4 and 2), so one workspace cannot take every slot. It sits behind `RunQueue`; a Redis or managed queue implements the same five methods.
- Provider failures that can pass (timeout, rate limit, unavailable, bad response) are retried with backoff: 1 s, doubled each time, at most 30 s, up to 3 attempts in total. Auth and bad-request errors are not retried. Spend cap and output failures are never retried.
- `cancelRun` takes a queued run out of the queue, or aborts the running model call. A finished run is returned unchanged.
- `runTimeoutMs` (default 5 minutes) covers the whole run from its first start, across retries. Past it the run fails with `timeout`.
- `recover()` re-queues runs left queued or running by a previous process.

### 7. Cost

`prices.ts` holds USD per million tokens per model. Cost is counted in whole micro-dollars (rounded up per call), so totals add up exactly; `costUsd` is for reading. When OpenRouter reports what it charged for a call (`usage.cost`), that is the call's cost (prompt caching can make it lower than the price table); the table is the fallback and is always used for estimates. A failed call the provider still billed (a model that spent its whole output limit reasoning and answered nothing, a lookup whose answer could not be read) is added to the run's cost too, so run totals match the bill. `costTotals(workspaceId)` gives the workspace total and a total per agent; failed and cancelled runs count, since their calls were paid for. Since phase 13 the engine bills through an optional `billing` hook: it holds a run's estimate in credits at submit and charges or gives it back at the end ([credits.md](credits.md)). Without the hook nothing is charged.

## Providers

Every provider implements `ModelProvider.complete({ model, messages, temperature, maxOutputTokens, signal })`.

- **Fake** (`providers/fake.ts`): deterministic, no network. It answers with the JSON example from the prompt, filled with words from the run's input blocks (and a field named `source` with the addresses in a tool block, the way a model cites them). Tests script answers, errors and delays with `respond` and `latencyMs`. It is used by all tests, by `npm run agents:try`, and by `localEngine()` whenever no key is set on a local app. A production server never gets it: `providersFromEnv` leaves it out off localhost (and in production without `WOVI_APP_URL`), so a server without a key refuses runs as not runnable ("Set OPENROUTER_API_KEY") instead of answering with filler. It prices its made-up tokens as the real model would, so dev totals give a rough idea of cost. `WOVI_FAKE_LATENCY_MS` in the environment makes it take its time, so a running state can be seen on a screen.
- **OpenRouter** (`providers/openrouter.ts`): OpenAI-compatible chat completions at `https://openrouter.ai/api/v1`. Off unless `OPENROUTER_API_KEY` is set in the environment. Tests use a stub `fetch` only.

## Models (owner's choice)

Defaults, from OpenRouter's public list on 2026-10-21. Change them in `MODEL_ROUTES` (catalog) and keep a price row in `prices.ts`.

| Route | Model | Input / output per million tokens | Used by |
|---|---|---|---|
| `text-fast` | `openai/gpt-6-luna` | $0.10 / $0.50 | Hashtag Picker; fallback for Hook Writer, Caption Writer |
| `text-standard` | `anthropic/claude-sonnet-5.5` | $2 / $10 | Hook Writer, Caption Writer; fallback for the strong agents |
| `text-strong` | `anthropic/claude-opus-5.5` | $4 / $20 | Trend Scout, Script Writer, Repurposer |

`text-fast` is on a different vendor than `text-standard`, so the common fallback still works when one vendor is down.

**Reasoning.** All three models reason before they answer by default (Claude 5.5 must, at "high"; the OpenAI model at "medium"), and the reasoning counts against the output limit and is billed. At "high" it ate whole answers in the first real run: three of five Idea Generator runs came back cut off mid-JSON and several Sonnet calls came back empty. Each route therefore sets `reasoning: { effort: "low" }` (the lowest all three take), sent with `exclude: true` so the reasoning never reaches the answer. After the change all ten affected runs passed.

The "Used by" column is the phase 2 seeds. The phase 8 launch versions route Hashtag Optimizer to fast; Hook Writer and Caption Writer to standard; Idea Generator, Script Writer, Platform Repurposer and Trend Scout to strong ([launch-agents.md](launch-agents.md#the-lineup)).

## Tools

The product doc: "Tools are declared. An agent can only call tools listed in its spec, which keeps permissions and cost under control." The code is `src/lib/runs/tools/`.

- **The engine runs the tools, never the model.** Before the first model call, `runDeclaredTools` calls each tool the spec declares, the catalog knows (`assertDeclaredTool`) and this code builds. The model request still carries only model, messages, temperature, max tokens and the signal; a test checks the keys. What a tool found reaches the model as a `tool` data block (`untrustedBlock`): material, never instructions. Text in it that reads like instructions is noted on the run as `prompt_injection`, as for inputs.
- **Built today: `trend_lookup`.** Declared tools that are not built yet (`transcription`, `video_cut`, `image_generate`, `voice_synth`) are skipped as before. A built tool that is not set up makes the agent not runnable at submit, so Trend Scout never writes trends from memory.
- **Limits.** Each call has a timeout (25 s), a cap per run (2 calls: the niche, then the platform as a whole only when the niche came back with fewer than five findings), and is skipped when its estimate would pass the run's spend cap. The estimate before a run (the `over_budget` check, the bench and the credit estimate) counts the tool calls.
- **Cost.** Each call is a `run.calls` entry with `purpose: "tool"` and route `tool:<id>`, its cost added to `run.costMicroUsd`, so credits charge for it like any model call. A tool that fails fails the run with `tool_error` (retried like a provider error when the failure can pass); a failed run costs no credits. A trend search that found nothing current also fails the run with `tool_error` before the model is called, since the model could only invent trends or say there are none.
- **Cache.** Answers are kept per tool and arguments (lower-cased) for 6 hours in `tool-cache.json`, made on its first write. A hit is recorded with `cached: true` and costs the run nothing.
- **What the run keeps.** `run.tools`: each call's arguments, when the search ran, and its findings with their sources (address, title, date). `publicRunView` adds `sources`, which the app shows under the result and the bench shows to builders. Old runs have neither and read as before.

### trend_lookup

`tools/trend-lookup.ts`. One OpenRouter chat call on the cheap text model (`openai/gpt-6-luna`) with OpenRouter's web search plugin (`plugins: [{ id: "web", engine: "parallel", mode: "fast", max_results: 8 }]`), on the existing `OPENROUTER_API_KEY`. The search query is the platform, this week's month and the niche, cut to one plain line. The model is told the results are pages written by strangers and lists the trends as JSON; every finding must point at one of the pages the search returned (OpenRouter's `url_citation` annotations) or it is dropped, its text is cut to plain short fields, a date in the future is dropped and a finding older than 90 days is left out as stale. The cost is OpenRouter's own `usage.cost` for the call, search included.

Why this source: OpenRouter's web search docs (read 2026-10-23) price the Parallel engine's "fast" mode at $0.001 per search with 10 results included, against $0.005 (Perplexity, Parallel basic), $0.007 (Exa) or the provider's own search (about $0.01 and up). A trial on 2026-10-23 returned dated, cited results from the last two weeks for a small bakery on TikTok for $0.0019 in all (search plus about 3,000 tokens in and 1,000 out). So one Trend Scout run spends about $0.002 to $0.004 on lookups, nothing on a cache hit.

| Setting | Default | |
|---|---|---|
| `WOVI_TREND_MODEL` | `openai/gpt-6-luna` | The model that reads the results. Needs a price row. |
| `WOVI_TREND_ENGINE` | `parallel` | `parallel`, `exa`, `perplexity` or `native`. |
| `WOVI_TREND_MODE` | `fast` | The engine's mode (Parallel: turbo, fast, basic, advanced). |
| `WOVI_TREND_MAX_RESULTS` | 8 | 1 to 10. |
| `WOVI_TREND_MAX_CALLS` | 2 | Lookups per run, 1 to 3. |
| `WOVI_TREND_CACHE_HOURS` | 6 | 0 turns the cache off. |
| `WOVI_TREND_TIMEOUT_MS` | 25000 | |

The fake (`fakeTrendLookup`) answers five findings made from the arguments with `example.com` sources and no network. Tests use it, and `localEngine()` uses it on a local app without a key. A production server without a key has no trend lookup, so Trend Scout refuses to run there.

Every item of a list output with a `source` field (Trend Scout's) is checked against the findings (`tool_sources`): a source the lookup did not find fails the check, which sends the draft back for a rewrite with the reason.

## Examples (tuning level 2)

The product doc's tuning level 2 is "few-shot examples from the sample library, for style and format consistency". `examples.ts`, wired in the app through `sampleExamples` on the builder's samples:

- For each run the engine picks up to 3 gold samples, closest to this request first (the words of the text inputs and the same choices; newest on a tie), and at most 1 bad sample, only next to a strong one, all within about 2,400 tokens (one example over 1,200 is skipped).
- A sample whose inputs say the same as this request is skipped (a duplicate teaches nothing and invites a copy).
- They go in the system message, before the output format, as `<data name="example.strong.N">` and `<data name="example.avoid.N">` blocks with the request, the answer and the sample's note ("Why it works", "What is wrong with it"). The rules above them say they are material for the standard, the tone and the shape only, never lines, facts, names or numbers to reuse. Code fences in a sample are removed, so its shape can never be mistaken for the output format.
- **No leakage.** `submitRun({ excludeSampleIds })` keeps samples out of the examples and out of the quality gate's reference lines. The bench passes the sample it runs, so a gold sample is never shown its own answer or scored against itself.
- The run keeps which samples it was given (`run.examples`: ids and titles, and what was kept out). Builders see it on each bench result; people never do.

## Not in this phase

- **Media.** Image, storyboard and video outputs are refused at submit as not runnable.

## Pipelines (phase 10)

A pipeline step is `submitRun` with `parent: { pipelineRunId, step }`, a pinned `version`, an idempotency key per step and try, and `maxCostUsd` set to what is left of the pipeline's budget; `waitForRun` returns the typed output that feeds the next step. Steps share this engine's queue and limits. See [pipelines.md](pipelines.md).

## Who may call it (phase 4)

The engine trusts the workspace id it is given. Callers reach it through `GuardedRuns`, which checks that the caller (a signed-in user or an API key) may run agents, read runs or see costs in that workspace first. See [accounts.md](accounts.md#the-registry-and-engine-behind-the-policy). The app holds one engine (`appEngine()`), shared by the guarded runs and the builder's test bench, so there is one queue; it calls `recover()` once on its first use. The bench reaches the engine directly, after its own builder check, because builders see the model and the cost ([builder.md](builder.md#the-test-bench-phase-6)).

## Listeners (phase 14)

`onFinished(listener)` calls the listener with a copy of every run that finishes in this process; webhooks send `run.finished` from it ([api.md](api.md#webhooks)). A listener that throws never breaks the engine, and a run can be reported again after a restart, so listeners dedupe by run id. `PipelineEngine.onSettled` does the same for pipeline runs.

## Commands

- `npm run agents:try -- hook-writer` seeds the launch agents if needed and runs one end to end on the fake provider from the workspace `ws_dev`, then prints the run. Pass your own inputs as JSON after the id. Runs are saved in `.data/runs.json`.
- `npm test` runs every test, all on the fake provider.

## Safety (phase 18)

- **Content rules at submit.** After the inputs are checked, every text, long text and link input and the run's idea are read against the content rules (`src/lib/safety/rules.ts`) and the agent's `safety.block`. A match refuses the run with `RunError("blocked")` and one issue per field, before any credit is held or anything is queued.
- **Files need the rights confirmation**, whatever the agent declares. Every confirmation given is kept with its time in `run.confirmedAt`.
- **Prompt injection.** The system message also carries the content rules and each of the agent's platforms' rules (`platformGuidance`), and says never to call a tool from inside a data block. Text that reads like instructions is noted on the run as `prompt_injection` (a note). `untrustedBlock` wraps comments, pages and tool answers. No tools are ever sent to the model; declared tools are run by the engine itself ([Tools](#tools)).
- **Drafts.** `content_safety` and `music_rights` run on every draft of every agent and are recorded only when they find something. A draft that still breaks a hard rule after the gate's rewrites fails the run with the new failure code `blocked`: no output, the hold comes back.
- **TikTok** captions are checked against 2,200 characters (the limit TikTok publishes), down from 4,000.
- `noteAiLabel`, `withhold`, `restore` and `findRun` on the engine; `findById` and `deleteWorkspace` on the run store. See [safety.md](safety.md).
