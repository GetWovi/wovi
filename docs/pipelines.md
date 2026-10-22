# Pipelines (phase 10)

From the product doc: "A pipeline is a saved chain of agents where each step's typed output becomes the next step's input, and the user's idea and Brand Brain steer every step." The example is the "idea to ready post" template: a failed brand check sends the draft back for a rewrite, and a person approves before publishing.

This phase builds that on the phases before it: the agent specs and registry (2), the run engine and its queue (3), accounts and the policy (4), the builder (5, 6), the Brand Brain (7), the launch agents (8) and the app screens (9). Every step is a normal run through the same engine, so the same queue, limits, guardrails and costs apply. Nothing here called a real model or spent money; tests and screenshots use the fake provider.

The code lives in `src/lib/pipelines/`.

| File | What it holds |
|---|---|
| `spec.ts` | The pipeline spec and its zod shape: inputs, steps, mappings, choices, conditions, the package and the approve step. Client-safe. |
| `values.ts` | Outputs as text and as items, templates, resolving a mapping, the rewrite note. Pure. |
| `validate.ts` | The validator: agents, required inputs, types that fit, no loops. Pure, with the agents passed in. |
| `registry.ts` | `PipelineRegistry`: versioned, workspace-scoped, validated on every save. |
| `run.ts` | The `PipelineRun` record and its public view. |
| `engine.ts` | `PipelineEngine`: submit, drive the steps, pick, cancel, retry, decide, recover. |
| `guard.ts` | `GuardedPipelines`: every call names its caller and the phase 4 policy decides. |
| `templates.ts` | The three templates. |
| `install.ts` | `installPipelineTemplates`: idempotent, run by `npm run agents:launch`. |
| `store.ts` | Three tables on the shared `Collection` interface: `pipelines`, `pipelineVersions`, `pipelineRuns` (`.data/pipelines.json`). |
| `local.ts`, `server.ts`, `builder-view.ts` | The local wiring, the one instance per server process (sharing the app's run engine), and what the builder pages read. |
| `pipelines.test.ts` | The tests (below). |

## The spec

Like an agent spec it has a **body**, where every change is a new immutable version (semver, patch by default), and a **listing** beside it: `owner`, `status` (draft, live, hidden) and `visibility` (public or workspace). Only the platform workspace `ws_wovi` holds platform pipelines.

| Field | Meaning |
|---|---|
| `id`, `version`, `name`, `job` | Like an agent's. |
| `inputs` | The form the person fills in, in exactly the shape of an agent's inputs, so the app's form generator and the engine's input check work unchanged. |
| `brand` | `input`: the profile input that picks the Brand Brain for every step. `idea`: an optional text input passed as the run's idea to steps whose agent reads `brand.idea`. |
| `steps` | 1 to 8, in order (below). |
| `package` | What the person approves at the end, in order: a step's picked item or all of its output, with a label. |
| `approve` | The human approve step. Every pipeline has one. |
| `maxCostUsd` | The total cap for one run, every step and rewrite together (at most $20). |

### A step

| Field | Meaning |
|---|---|
| `id`, `label` | snake_case id, unique in the pipeline; a short label for screens. |
| `agent` | `{ id, version }`, where version is an exact `1.1.0` or `"current"`. The agent lives in the pipeline's workspace, or is the platform's public live one. |
| `inputs` | Agent input key to a **mapping**. |
| `choose` | Optional: how the step picks one item from its output. `{ kind: "item", index }`, `{ kind: "best_brand_fit" }`, or `{ kind: "ask", label }` (the run waits for the person). |
| `onFail` | Optional: `{ when: "checks" or "brand", rewrite, then: "review" or "stop" }`. |
| `runIf` | Optional: run only when a choice input has one value (`{ input: "start", equals: "ideas" }`). |
| `maxCostUsd` | Optional cap for this step, below the agent's own. |

### Mappings

| From | Example | Gives |
|---|---|---|
| `input` | `{ from: "input", key: "platform" }` | The pipeline input as it is. |
| `step` | `{ from: "step", step: "hooks", take: "picked" }` | All of an earlier step's output as text (`all`), the item it picked (`picked`), or one field of it (`picked` with `field: "idea"`). |
| `value` | `{ from: "value", value: "s30" }` | A fixed value, checked like a form value. |
| `template` | `{ from: "template", text: "Open with this hook: {{steps.hooks.picked}}\n\nThe idea: {{steps.ideas.picked.idea\|inputs.idea}}" }` | Text with references. `a\|b` takes the first one that is not empty. A choice renders as its label. |

How outputs read: a list is its items (strings, or records with fields), a caption set is every variant ("TikTok, variant 2"), a post set is its posts, a script or a text is one item. As text, a script is its beats with seconds, what to say and what is on screen.

## The validator

`validatePipeline(spec, lookup)` checks the shape, then everything the shape cannot. It runs in three places: in the builder's editor on every change, in the registry on every save, and in the engine at submit with the agent versions it pinned, so an agent update that breaks a saved chain is refused before anything runs, with a clear message.

It refuses:

- an agent that does not exist at the version named, or one whose output needs media tools;
- a mapping to an input the agent does not have, or a required agent input with nothing mapped (choices and numbers with a default are fine);
- **types that do not fit**: a step's output (always text) into a choice, number, profile or file input; a text input into a choice; a choice with options the agent does not take; a list of options into a single choice; a text that can be longer than the agent allows (`"Your idea" can be 600 characters, and "What you do" takes at most 300.`) or shorter than it needs; numbers outside the range;
- an optional pipeline input mapped into a required agent input, a step that may be skipped mapped into a required input without a fallback, and a template whose every reference may be empty;
- **loops**: a step that reads itself or a later step (`Reads step "caption", which runs after it. A step only reads the steps before it, so a pipeline never loops.`);
- a picked item from a step that does not pick, a field the step's items do not have, a reference that is not one of the known shapes;
- a fixed value the agent input would refuse, a `runIf` on an input or option that does not exist, an item number past the end of a list, a brand condition on an agent that never checks brand fit, and package parts for missing steps.

Messages carry a path (`steps[4].inputs.caption: ...`), so the editor puts each one next to the step and the input it is about.

## Pipeline runs

`PipelineEngine.submit({ workspaceId, pipelineId, version?, pipelineWorkspaceId?, inputs, confirmations?, maxCostUsd?, idempotencyKey? })`

Before anything runs:

1. The pipeline is loaded (the workspace's own, or the platform's when public and live).
2. Every agent is resolved and **pinned**: `"current"` becomes the version current at this moment, for the whole run. The chain is validated against exactly those versions.
3. The person's inputs are checked with the engine's own `validateRunInputs`.
4. Confirmations: any agent's `rights_confirmed` or `voice_consent` must be confirmed once for the whole run.
5. The Brand Brain named by the brand input, else the workspace default, is resolved once and passed to every step, so a default changing mid-run changes nothing.
6. The cap is the pipeline's, or lower when the caller asks.
7. With an idempotency key, a second submit returns the first run; the same key with a different request is refused. Submits with one key are serialized, so a double click makes one run.

Then each step, in order:

- `runIf` false: the step is **skipped**.
- Its inputs are resolved from the mappings. Empty values are left out, so the agent's defaults apply.
- It is a `submitRun` through the same queue as every run, with the pinned version, `parent: { pipelineRunId, step }`, the Brand Brain, an idempotency key per step and try, and `maxCostUsd` set to what is left of the total cap (or the step's cap when lower). When the agent's input check refuses the handed-over value, the pipeline stops with `bad_handoff` and the engine's message, instead of passing bad data on.
- **The rewrite loop.** When the run's checks fail (any check, or only the brand checks: words to avoid and brand fit) and the step has `rewrite`, it runs once more with the failure as a note on its main text input ("Note for this run: Rewrite it. The last draft failed these checks: Uses words your brand avoids: artisanal. Fix them and keep everything else the same."). The draft with fewer failed checks is kept, the rewrite on a tie. Still failing: `then: "review"` marks the step **flagged** and goes on; `then: "stop"` stops the pipeline (`checks_failed`).
- **Choices.** Every item gets its own brand fit against the Brand Brain (the phase 7 check), with the rules it breaks. `item` takes item N; `best_brand_fit` takes the highest, the first on a tie; `ask` stops the run as **waiting** with the best fit suggested, until `pick(stepId, index)`.
- **Retries.** The engine already retries provider failures inside a run. A step whose run still fails on a provider error or a timeout is tried once more as a new run; then the pipeline stops (`step_failed`) with every step before it kept and the failed step marked. `retry()` picks it up again at that step.
- **Spend.** Costs are summed from the step runs (`costMicroUsd`). When nothing is left, or the next step could cost more than what is left, the pipeline stops before it (`spend_cap`). The total never passes the cap by more than the engine's own per-run check allows.

When every step is done the run builds the **package** (each part with its brand fit and its flags in words) and waits as **ready** for the approve step. `decide("approved" | "rejected", note)` records who decided; deciding again replaces it; `clearDecision` takes it back. A run needs review when a packaged part is flagged.

`cancel()` stops a running or waiting run and cancels the engine run that is going. The steps after it never run. `recover()` drives running pipeline runs again after a restart; step runs are found again by their idempotency keys.

Statuses: `running`, `waiting` (a pick), `ready` (the approve step), `approved`, `rejected`, `failed`, `cancelled`. Step statuses: `todo`, `running`, `rewriting`, `waiting`, `done`, `flagged`, `skipped`, `failed`, `cancelled`.

Every step records every run it made (`runIds`), the one it used (`runId`), its inputs, its output, its candidates and what it picked and why (`rule`, `brand_fit` or `person`). The public view drops the cap and the costs; `GuardedPipelines.costs` gives them to people who may see costs.

## Templates

Installed into `ws_wovi` by `npm run agents:launch`, after the launch agents, as the launch author, through `GuardedPipelines`. Running it again changes nothing; a template a builder has saved over is never replaced (the report says why). Agents are named at `"current"`, so Funkai's tuning reaches the templates, and each run pins what it used.

| Template | Chain | Picks | Cap |
|---|---|---|---|
| **Idea to ready post** (`idea-to-post`) | Idea Generator (only with "Give me ideas first") → Hook Writer → Script Writer → Caption Writer → Hashtag Optimizer → you approve | the idea and the hook by the person, the caption by best brand fit | $1.00 |
| **Repurpose a post that worked** (`repurpose-post`) | Platform Repurposer → Hashtag Optimizer → you approve | the new version (one per run) | $0.50 |
| **Caption and tags for a clip** (`caption-and-tags`) | Caption Writer → Hashtag Optimizer → you approve | the caption by the person | $0.30 |

In "Idea to ready post", the person's idea (or the picked idea) goes to Hook Writer; the picked hook and the idea go to Script Writer as "Open with this hook: ... The idea: ..."; the whole script to Caption Writer with the platform and the facts to include; the best caption to Hashtag Optimizer. Every writing step is brand-checked with the rewrite loop. The package is the idea (when there was one), the hook, the script, the caption and the tags.

The repurpose template asks for the rights confirmation, because Platform Repurposer does.

## In the app

| Path | What it is | Wovi |
|---|---|---|
| `/app/pipelines` | The templates as cards (the chain as icon tiles ending in the approve step) and the latest pipeline runs. Also on `/app/make` as "Or chain them". | waiting on each card |
| `/app/pipelines/[id]` | The pipeline's form, generated like an agent's, with "Fill with an example" from the agents' golden samples for the picked Brand Brain; the Brand Brain picker and the chain beside it. | waiting |
| `/app/pipelines/runs/[id]` | The run, live: a headline for where it is ("Step 3 of 5: Write the script"), a bar per step, Stop; the pick ("10 to choose from", brand fit beside each, the best fit picked to start with); the package with each part copyable and its brand fit; the approve step with a note; and every step as a card that fills in as it lands, with a link to its run. A failed run offers "Try again from here". | on the move per step, waving for a pick, celebrating when done |
| `/app/history` | Pipeline runs among the runs, newest first, with the steps as dots, search, the state filter and "Pipelines only". The step runs show inside their pipeline, not loose. Yes and No on ready ones. The History count includes pipeline runs waiting on the person. | the state's pose |
| `/app/runs/[id]` | A step run says which step of which pipeline it is, with a link to the whole chain. | |

The nav has Pipelines between Make and History; on a phone the tab bar has six tabs ("Brand" for Brand Brain).

## In the builder

| Path | What it is |
|---|---|
| `/builder/pipelines` | The platform's pipelines with their chain, status, version and last edit. |
| `/builder/pipelines/new` | Id, name and a starting point (a copy of a template, or one Caption Writer step). Starts as a draft. |
| `/builder/pipelines/[id]` | The editor: name, job, total cap, Brand Brain picker and approve label; the form as JSON; each step with its agent and version (current or pinned), where each agent input comes from (a form input, an earlier step's output, picked item or field, a fixed value or a template), the pick, what happens when a check fails and on which checks, when it runs and its cap; the package; the validator's messages next to each step and input and in a summary; save as a new version with a note and a bump; publish or back to draft; the versions. |

Customer-made pipelines come later: the registry, the validator and the guard already take any workspace, so it is a screen, not an engine change.

## Commands

```
npm run agents:launch              # the launch set, then the pipeline templates (idempotent)
npm test                           # everything, on the fake provider
```

Screenshots of this phase:

```
WOVI_DATA_DIR=/tmp/wovi-pipeline-screens npm run agents:launch
WOVI_DATA_DIR=/tmp/wovi-pipeline-screens WOVI_FAKE_LATENCY_MS=4000 npm start
WOVI_DATA_DIR=/tmp/wovi-pipeline-screens node scripts/pipeline-screens.mjs
```

It signs in through the email flow, skips onboarding, seeds the example Brand Brains into the new workspace, runs "Idea to ready post" through the pick to the package and approves it, starts "Caption and tags" and one Hook Writer run for history, shoots two phone views, then joins the builder with a fresh code and Chrome's virtual authenticator for the editor. Output goes to `~/WOVI-pipeline-screens/`.

## Tests

`src/lib/pipelines/pipelines.test.ts` (32 tests):

- the validator: the templates pass; types that do not fit (step output into a choice, choice into text, extra options, a list into one option, lengths); required inputs with nothing mapped, unknown inputs, optional sources; loops (reading itself or a later step); picked items from steps that do not pick, unknown fields, bad templates; skippable steps without a fallback; fixed values, missing agents, conditions and package parts; readable paths; the fit rules on their own;
- moving values: every output kind as items and as text, the picked hook, a picked field, a whole script, a template with a fallback and a choice label, the rewrite note inside the input's limit;
- runs: "Idea to ready post" end to end (wait for the hook pick, the hook into the script, the script into the caption, the best caption into the tags, the Brand Brain on every step, pinned versions, the package, costs summed and under the cap); ideas first with the picked idea carried on; the best brand fit; the rewrite loop (two runs, the note, the rewrite used); a rewrite that still fails marked for review, or stopping; picks out of range or when nothing waits; cancel mid-run; the total spend cap stopping before the script, and a cap too small for anything; idempotency with concurrent submits and a conflicting reuse; a failed step tried again, then stopped with earlier steps kept, then retried; an agent update that breaks the chain refused at submit; the rights confirmation; inputs and Brand Brain checked before anything runs; approve, reject with a note, take it back;
- in the app: history lists pipeline runs and keeps their step runs inside them, in order with their parent; search and the waiting filter; the templates listed with agent names and confirmations; viewers read but cannot start, pick or cancel, outsiders and other workspaces get nothing, only builders edit the platform's templates, a workspace cannot claim a platform pipeline and keeps its own to itself; the template install is idempotent and never saves over a builder's version; versions, no empty saves, version conflicts, rollback, and runs keeping the body they ran with.

## Later

- **Staged video** (the doc's video drop): script, then storyboard images, then approval and edits, then voiceover and render, each stage approved before the next one costs more. Pipelines already have what it needs: a step can ask the person, a run waits, and every step has its own cap. The video agents arrive with the media tools.
- **Fall back to an alternate agent** when a step fails (the doc's failure handling): the step shape has room for a second agent; not built.
- MCP tools and REST endpoints for pipelines (`POST /pipelines/{id}/run`, `GET /pipeline-runs/{id}`) with webhooks and an event stream are phase 14. Agents calling agents in a swarm need a depth limit beside the spending limit.
- Credits per pipeline run (phase 13), comments and team review on a package (phase 11).
