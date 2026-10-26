# Live stats and canary releases

From the product doc: "Measured, not claimed. Every agent shows live stats (acceptance rate, edit rate, engagement lift)"; the builder's "Stats dashboard. Live metrics per agent and per version: acceptance rate, edit distance, regenerate rate, latency, cost per run" and "Versioning and rollback ... Publish, canary to 10% of traffic, or roll back in one click"; section 6's metrics table, "Regression gate: a new version cannot publish if it scores below the current version on the gold set" and "Canary release: new versions serve 10% of live traffic first, compared on acceptance and edit rate"; "Run screen ... results as cards with Use, Edit, Regenerate and rating"; "Agent gallery ... with live stats on each card"; and "Audit: log every run, version and publish approval".

This builds on the run engine (3), the builder (5, 6), the app (9), pipelines (10), review (11), the quality gate (12), the API and MCP (14) and the consent rule (18). Nothing here calls a real model or spends money: tests, the seed script and the screenshots run on the fake provider.

The code lives in `src/lib/stats/`.

| File | What it holds |
|---|---|
| `types.ts` | Feedback events, the numbers, releases, stop rules, the audit log. Client-safe. |
| `store.ts` | Three tables on the shared `Collection` interface in `stats.json`: `feedback`, `releases`, `audit`. |
| `distance.ts` | The normalized edit distance. |
| `metrics.ts` | Every number, the minimum count, and the canary comparison. Pure. |
| `feedback.ts` | `Feedback`: Use, Edit, Regenerate and the rating, one per action per run; decisions as feedback. |
| `service.ts` | `StatsService`: which runs count, the public numbers per agent, the builder's numbers per version. |
| `routing.ts` | The stable hash that picks a side of a canary. |
| `gate.ts` | The regression gate on the gold set. |
| `releases.ts` | `Releases`: start, change, publish to everyone, roll back, the automatic stop, the router, the audit log. |
| `words.ts` | The numbers in plain words, "New" below the minimum. Client-safe. |
| `local.ts`, `server.ts` | The local wiring and one of each per server process. |

The builder's side is `src/lib/builder/releases.ts` (`builder.release`); the screens are `src/components/stats/` and `src/components/builder/ReleasePanel.tsx` and `StatsParts.tsx`.

## Feedback events

| Action | What happened | Where it is recorded |
|---|---|---|
| `use` | The result was used without another try: copied (any item or Copy everything), Use it, picked in a pipeline, approved. | The run screen, the review queue (a final approval), the client view, a pipeline pick, a copied package part, a package approval (each step run it used), `POST /runs/{id}/feedback`, `give_feedback`. |
| `edit` | The person changed the result and kept their version. Stores the normalized edit distance between the draft and what they kept. | Edit and "Keep my version" on the run screen, the API and MCP. |
| `regenerate` | The person asked for another try. | Try again, the quick edits (Shorter, Punchier, More like my brand), asking for changes in review (also from a client link), the API and MCP. |
| `rating` | Thumbs up or down, with an optional note (300 characters). | The run screen, the API and MCP. |

**One event per action per run.** The id is `${runId}:${action}`. A second use or regenerate changes nothing (three clicks at once are one event); a second edit or rating replaces the first and keeps when it first happened. An edit that changes nothing is recorded as a use. Only a finished result that was not taken down can get feedback. Copying and rating need to see the workspace (viewers can); editing and regenerating need to run its agents. API keys can send all four; nobody can act on another workspace's run.

**Edit distance.** The Levenshtein distance on characters, after folding runs of spaces and line breaks, divided by the longer text: 0 is unchanged, 1 is nothing of the draft left. The draft is the result as Copy everything gives it. Texts are compared on their first 4,000 characters, with any length difference beyond that counted as edits.

**Consent (phase 18).** The text a person kept is stored only when they had turned on "Use my edits to improve agents", and builders see an edit or a rating note only while it is still on. The distance and every count are kept for everyone. Turning consent off hides what was stored; deleting the account swaps the person's id for an anonymous one and drops their kept text and notes, in shared workspaces too, and the feedback in a deleted workspace goes with it. The privacy copy has a `feedbackGiven` section.

## Which runs count

Only real use: a run counts unless it ran in the agent's own workspace (the builder's bench and tries), was a free bench run, was made by a builder anywhere, or ran in a test workspace listed in `WOVI_STATS_EXCLUDE_WORKSPACES` (comma separated). Pipeline step runs count like any run. A run's maker is the user its credits name, else the maker of its review item (or of its pipeline run's).

## The numbers

Per agent (every version together) and per version, from the counting runs and their feedback:

| Number | How | Out of |
|---|---|---|
| Runs | Finished runs that gave a result, not taken down | |
| Used as is (acceptance) | Results used or edited and kept, with no regenerate | results |
| Edited | Accepted results that were edited | accepted results |
| How much changed | Mean edit distance of those edits | edits |
| Run again (regenerate rate) | Results someone asked another try for | results |
| Thumbs up | Up ratings | ratings |
| Fits the format (spec compliance) | Results that parsed and broke no hard platform limit (the quality gate's platform check and the `platform_policy` guardrail) | results plus runs that failed `output_invalid` |
| Quality | Mean quality gate score | scored results |
| Typical time | Median and 90th percentile of the run's own time | results |
| Cost per run | Mean cost of finished runs. Builders only. | finished runs |

**The minimum count.** A number shows only when at least 20 (`MIN_COUNT`) are behind its own denominator; until then it is `null` and every screen says "New". An agent with fewer than 20 results is New on its card. Nothing is estimated or filled in.

## Where people see them

| Where | What |
|---|---|
| Gallery cards (`/app/make`, the app home) | Used as is, Edited, Thumbs up, or "Live stats: New" with how many real runs it has. Beside the quality score. |
| The agent page (`/app/make/[agent]#live-stats`) | Live stats: the headline, eight tiles with what each was counted from, and how counting works. A chip in the head links to it. |
| Under every result | Did it work for you? Use it, Edit, Try again, thumbs up and down with a note, what was already done, and the consent note with a link to it. |
| `/builder/agents/[id]/stats` | Live stats per version (with cost and bench runs), what people changed (only from people who allowed it, the changed lines only), the release panel (with `WOVI_CANARY=on`) and the audit log. |
| `/builder/audit` | Every agent's audit log. |

## Canary releases

**Off by default.** Canary releases only apply with `WOVI_CANARY=on`. Off (the default, and the way to run before launch while agents are being tuned with no real traffic): saving a live agent in the editor or in Tuning reaches everyone at once, exactly as before, with no canary choice, no gold-set gate in the way and nothing routed; the release panel is hidden and the canary calls refuse. Live stats, feedback, the Stats page's numbers per version and the audit log (every save, "it serves everyone") record either way. A canary left from when the switch was on never routes while it is off, and the next save ends it. Everything below is the behaviour with `WOVI_CANARY=on`.

The registry's current version is the **stable** one: what forms, the API and MCP show, and what every run that follows "latest stable" gets. A **release** names a newer version (the canary) and a share of live runs.

**Starting one.** Saving a live agent in the editor or in Tuning offers how the new version goes out: a canary on 10% of live runs by default, 5, 25 or 50%, or bench only (0%). The version is written beside the current one (`AgentRegistry.update` with `keepCurrent`) and the release starts; the editor, the bench and Tuning then work on the canary, and a further save builds on it and replaces the release (the stable version stays). On Stats a saved version can also be started as a canary. Drafts and hidden agents have no live runs: a save is current at once, as before. Scripts and seeds that save without a release choice keep the old behaviour.

**Same form.** A canary with a share above 0 must take the stable version's form: every input with the same key, type and required flag, no new required input, choices keeping their options, the same kind of output. Otherwise it is refused with the reasons; it can stay at 0% for the bench and go to everyone through the gate. As a safety net the engine runs a canary-side request on the stable version if its inputs do not fit the canary.

**Routing.** `bucket = sha256(releaseId + workspaceId) mod 10,000`; buckets below `share x 100` get the canary. One workspace sees one version for the whole release; raising the share only moves more workspaces onto the canary. The engine asks the router (`EngineOptions.router`) only for runs with no pinned version, and never for runs in the agent's own workspace. Pipelines: a step that follows `"current"` is routed the same way at submit and then pinned for the run; a step pinned to a version is never routed; if the chain does not fit the routed versions, every routed step goes back to stable. The REST API and MCP go through the same engine, so they follow the same rule. Each routed run carries `run.release = { id, arm }` (never shown to people), so the two sides are compared on exactly the runs of that release.

**Side by side.** The release panel shows both sides from the release's own runs, counted like the public numbers: runs, used as is, edited, how much changed, run again, thumbs up, fits the format, quality, time and cost per run, the canary's worse numbers marked.

**The automatic stop.** After every finished run of a release, every feedback event on one and every time the panel opens, the canary is compared with the stable side. It is stopped when any rule says it is clearly worse, each rule counting only once both sides have the minimum behind that number:

| Stop rule | Default | Limits |
|---|---|---|
| Runs a side | 20 | 5 to 500 |
| Used as is lower by more than | 15 points | 1 to 90 |
| Edited higher by more than | 15 points | 1 to 90 |
| Run again higher by more than | 15 points | 1 to 90 |
| Quality lower by more than | 10 points | 1 to 50 |

The rules are set per release on the panel. A stop ends the release ("stopped", by "system", with the numbers), the stable version serves everyone at once, and the audit log keeps it.

**Publish to everyone** goes through the regression gate (below); when it passes the canary becomes the current version for everyone and the release ends "promoted". **Roll back** ends it "rolled_back" and the stable version serves everyone; the canary version stays saved. A version rollback on the Versions page, back to draft, or hide also ends a running release.

## The regression gate

A version cannot go to everyone if it scores below the current one on the gold set. The gold set is the agent's gold samples run on the test bench: a version's gold score is the mean quality gate score of its latest bench run on each gold sample (a failed run scores 0; runs from before phase 12 use the bench's auto score), compared on the samples both versions ran. That score is the combined one with the model judge's second opinion when the bench run had it; a sample where only one of the two versions had it is compared on both scores without it, and the gate says how many ([quality.md](quality.md#the-judge-second-opinion)). When the canary has had live runs, it must also not be clearly worse by the stop rules. "Run the gold set" on the panel runs the gold samples on the bench for whichever version lacks a score (or both again), inside the bench's usual spend caps. A refusal is logged in the audit log with the scores. An agent with no gold samples has nothing to compare on the gold set; the gate says so and still checks the live numbers.

## The audit log

Every entry has the agent, the kind, the version and the one it replaced, who (a builder, or "system"), when, the words and the numbers behind it. Entries are only ever added.

| Kind | When |
|---|---|
| `saved` | A new version was saved (where it went: everyone for a draft, or a canary). |
| `published`, `unpublished`, `hidden`, `unhidden` | The agent's status changed. |
| `canary_started` | A release started, with its share. |
| `canary_share` | Its share or stop rules changed. |
| `promoted` | Published to everyone, with the gate's numbers. |
| `rolled_back` | A builder rolled the canary back, or it ended with the agent leaving the gallery. |
| `auto_stopped` | Stopped automatically, with both sides' numbers. |
| `gate_refused` | Publishing to everyone was refused, with the reasons. |
| `version_rollback` | Another version serves everyone from the Versions page. |

## Data

Nothing stored before is migrated or rewritten. `stats.json` is created on the first feedback event, release or audit entry. New fields are optional: `Run.release`, `StepRun.release`, the registry save options `base` and `keepCurrent`, and `TeamOptions.onDecided`. `src/lib/stats/phase17-stats.test.ts` loads the phase 17 data dir and checks that reading it (every agent's numbers, the builder's Stats, the audit log, the router, the privacy copy) changes no file and creates no `stats.json`; that feedback on an old run, a canary of Funkai's edited Hook Writer, routing and a rollback leave every earlier run and every other data file byte for byte the same; that a restart reads the same state back; and that deleting an account keeps the counts and drops the person's words.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `WOVI_CANARY` | off | `on` turns on canary releases: a live agent's save goes out as a canary, runs are routed, the release panel shows, and publishing to everyone goes through the regression gate. Off, a save reaches everyone at once as before. Stats, feedback and the audit log record either way. |
| `WOVI_STATS_EXCLUDE_WORKSPACES` | (none) | Test workspaces whose runs never count, comma separated. |

The minimum count (20), the default share (10%), the share limits (0 to 50%) and the default stop rules are in `types.ts`; the gate's tolerance (0 points) is in `gate.ts`.

## Commands

```
npm test                           # everything, on the fake provider
```

Screenshots, on SAMPLE data in a throwaway local data dir (never a real one; the seed refuses other paths), at 1440x900 and 390x844:

```
export WOVI_DATA_DIR=/tmp/wovi-stats-screens
OPENROUTER_API_KEY= npm run agents:launch
npm run build
WOVI_CANARY=on WOVI_APP_URL=http://localhost:3900 OPENROUTER_API_KEY= npm start
OPENROUTER_API_KEY= node scripts/stats-screens.mjs ~/WOVI-stats-screens
```

The script signs in through the email flow, skips onboarding, joins the builder as Funkai with Chrome's virtual authenticator, and runs `scripts/seed-stats.ts`: ninety sample shop accounts ("Sample shop NN") run the launch agents and use, edit, run again and rate the results from a fixed spread; Hook Writer gets a canary on 25% with its gold set run; Caption Writer has a canary that stopped on its own; Script Writer one the gate refused and that was rolled back. Then it shoots the gallery cards, an agent page's live stats, the feedback bar under a result, the builder's stats per version, the release panel and the audit log.

## Tests

- `metrics.test.ts`: the edit distance (same, nothing in common, whitespace, long texts); every number's math from runs and events; New below the minimum and no cost in the public view; failed, cancelled and taken-down runs, and format failures against compliance; one run's outcome; the canary comparison by each rule, never below the minimum, configurable rules; routing (about the share by hash, one side per workspace, a growing share only adds, another release another cohort); the gate (pass, a lower score, a missing gold run, worse live numbers, no gold samples) and the latest gold run per sample.
- `feedback.test.ts`: one event per action per run (concurrent uses, edits and ratings replacing, the first time kept), an unchanged edit as a use, Try again and quick edits as regenerates; who may act (viewers copy and rate, editors also edit and regenerate, outsiders and other workspaces get nothing, unfinished runs refused, bad input refused); consent (edit text kept and shown only with it, hidden when turned off, counts kept); builders only; approvals and change requests in review, the phase 9 button, a client link's yes, a first yes of two; a pipeline pick, a copied part and a package approval; which runs count; `POST /runs/{id}/feedback` and MCP's `give_feedback`.
- `releases.test.ts`: a live agent's save as a canary (the current version stays, the builder works on the canary, a further save builds on it and replaces the release); the form rule and bench only; drafts as before; routing by hash with release marks, one side per workspace, pinned and builder runs never routed, rollback; pipelines routing "current" steps and never pinned ones, with the release kept inside; the gate needing the gold set, refusing a worse version with its scores and publishing a good one; the automatic stop with its numbers and routing back, never below the minimum, the rules changed; the audit log for every kind, builders only.
- `releases.test.ts`, with `WOVI_CANARY` off: the switch reads off unless it says on; a live agent's save (from the editor and from Tuning with a re-run) reaches everyone at once with no canary, no gate and nothing routed, whatever release choice is sent; runs carry no release; feedback, the numbers per version and the audit log still record; every canary call refuses; a canary left from when it was on never routes and the next save ends it.
- `phase17-stats.test.ts`: the old data dir, above.

## Later

- Engagement lift after posting (the doc's third layer) once analytics are connected; the feedback table has room for it as another action.
- A weekly digest of the weakest agents by these numbers (the doc's "Weekly: review the stats dashboard, pick the weakest agents").
- The public homepage cards still show the launch lineup without numbers; they can read the same public stats once there is real traffic.
- The REST agent view could carry the public numbers beside its scorecard.
