# The quality system (phase 12)

From the product doc: "Anti-slop is a system. Reference anchoring, banned generic phrases, a specificity check, a brand-fit score, a human approve step, and per-agent quality scores shown to users", and for "Output still feels like slop": "Brand Brain anchoring, quality gates, publish only above a score, human approve".

This phase builds that on the run engine (3), the builder (5, 6), the Brand Brain (7), the launch agents and their golden samples (8), the app (9), pipelines (10) and review (11). Every result is scored after the model answers. Below the agent's bar it is sent back for a rewrite with the reasons, at most twice and inside the run's spend cap; if it is still below, it goes to a person with the reasons and is never marked "ready". People see each agent's record; builders see what fails most.

The six checks are deterministic and free. The one model call is the judge's second opinion ([below](#the-judge-second-opinion)), on bench runs, and only when `OPENROUTER_API_KEY` is set. Tests, the seed script and the screenshots run on the fake provider, and vitest blanks `OPENROUTER_API_KEY`.

The code lives in `src/lib/quality/`.

| File | What it holds |
|---|---|
| `types.ts` | The `QualityReport` a run keeps, its checks and drafts, and the public view. Client-safe. |
| `data.ts` | The data: banned generic phrases and filler words per language, platform rules, check names and weights, the default bar per category, `gateFor(spec)`. Client-safe. |
| `checks.ts` | The six checks. |
| `evaluate.ts` | The combined score, the ready rule, and the `QualityJudge` slot. |
| `judge.ts` | The model judge: the rubric, the strict answer parser, `modelJudge`, and the `WOVI_JUDGE_LIVE` switch. |
| `gate.ts` | The rewrite message, which draft wins, the report. The loop itself is in `src/lib/runs/execute.ts`. |
| `scorecard.ts` | The public scorecard math, with the numbers in plain words. |
| `rollup.ts` | The builder's roll-up per version. |
| `service.ts` | `QualityService`: gathers runs, decisions and ratings for the two above. `sampleReferences`: the engine's source of golden and bad samples. |
| `server.ts` | One service per server process. |
| `quality.test.ts`, `judge.test.ts` | The tests (below). |

## The checks

Every run, and every pipeline step, goes through all six. Each gives a score from 0 to 100, a status and its reasons in plain words.

| Check | Name on screen | What it reads | Fails outright when |
|---|---|---|---|
| `specificity` | Specific to you | Each line, beat or caption should name a real detail: a word from the person's text inputs or the Brand Brain (name, niche, topics, idea), a number, or a name. Filler words ("amazing", "stuff", "everyone") and repeated lines cost points. | Nothing names anything from the person's input, or lines repeat. |
| `generic_phrases` | No generic phrases | The banned list in `data.ts` (the phase 3 anti-slop list plus phrases like "stop scrolling", "this changes everything", "has never been easier"). | Any one is found. |
| `brand_fit` | Brand fit | The phase 7 reading: words to avoid, the don'ts, closeness to the voice's sample lines. Skipped without a Brand Brain. | A brand rule is broken. Weak when it reads unlike the sample lines. |
| `reference_anchoring` | Like your best posts | Style and wording against the Brand Brain's posts that worked and the agent's golden samples; closer to a bad sample than to the good ones costs points. A bench run of a sample is never compared with that sample. Skipped with nothing to compare. | Never; weak below 60. |
| `claims` | No misleading claims | The phase 3 lists for result, money and health claims, invented reviews, impersonation and unsafe advice. | Any one is found. These always go to a person. |
| `platform_rules` | Fits the platform | Per platform, as data: caption length, hashtags per caption or per tag list, the Shorts title (100 characters), X thread posts (280). The Reels first line past 125 characters is a soft point. | A hard limit is broken. |

The lists are data. A new phrase is one line in `GENERIC_PHRASES.en`; another language is a new key (`fr: [...]`) once runs carry a language. The platform hashtag counts and the Reels first line are house rules set to match the launch agents' instructions (X 2, TikTok 5, Shorts 15, Reels 5); check them against the platforms before launch.

## The combined score and the gate

The combined score is the weighted mean of the checks that ran: specific 25, generic phrases 20, brand fit 20, like your best posts 15, claims 10, platform 10. Skipped checks drop out and the rest are scaled up. A check that fails outright caps the score at 55, so a score never reads fine over a hard problem.

**Ready** means both: the score is at or above the agent's bar, and no check failed outright (a guardrail the agent declares that failed counts too). Anything else needs review.

The bar is per agent, in the spec (`gate`, beside the body, so it is versioned):

```json
"gate": { "minScore": 75, "maxRewrites": 1 }
```

Both are optional. `minScore` is 40 to 95, `maxRewrites` 0, 1 or 2. Left out, the defaults for the category apply: research 60, ideation 65, writing 70, production 65, optimization 65, publish 70, and 2 rewrites. Builders change both on the bench, in Tuning, as a new version.

**The loop** (inside the engine's attempt, `src/lib/runs/execute.ts`):

1. The first draft is parsed (with the usual one repair) and scored.
2. Not ready, and rewrites left: the model gets its own last answer and a rewrite message. The reasons sit in a `quality.notes` data block, so text quoted from a draft is material, never an instruction.
3. Before each rewrite the engine estimates its cost, like every call. If the run's cap would not cover it, rewriting stops ("budget"). A rewrite that does not come back, or does not fit the format, is recorded and the best draft so far is kept.
4. The best draft wins: ready beats not ready, then the higher score; a rewrite wins a tie.
5. The run keeps the used draft's output and checks, its score, the bar, the verdict, every draft's score and reasons (earlier drafts with their output, for builders), and why rewriting stopped (`cap`, `budget`, `error`, or `off` when the agent rewrites 0 times).

`run.needsReview` is true when a guardrail failed or the verdict is not ready, so the phase 9 and 11 review flow picks it up as before. Rewrites are model calls with `purpose: "rewrite"`; their tokens and cost are on the run like any other call.

The engine reads golden and bad samples through `references` (`ReferenceSource`); the app's engine reads the builder's samples for the agent. Bench runs go through the gate too, so the bench shows what people would get.

### The judge (second opinion)

From the product doc: "LLM judge plus human spot checks: an automatic judge scores outputs against a rubric". `modelJudge` in `judge.ts` implements `QualityJudge` from `evaluate.ts`.

**What it reads.** One draft, against a rubric built for this run, every piece in its own data block so nothing in it reads as an instruction:

- the agent's name and job, its output contract (counts, sections, platforms and the shape), and the lines under QUALITY RULES in its instructions;
- the run's inputs, as the engine renders them;
- the Brand Brain parts the agent reads (`spec.brandBrain`), nothing else of the Brand Brain;
- up to 12 of the agent's gold sample lines as the reference of good (a bench run of a sample never sees its own, as with reference anchoring);
- the draft itself.

The rubric asks for a score from 0 to 100 on the job, the quality rules, specificity, facts, brand and, when given, the gold lines, with plain bands (90 ready to post, 70 good, 50 usable after edits, under 50 misses).

**What it answers.** One JSON object with exactly `score` (a whole number from 0 to 100) and `reasons` (one to five short strings; the prompt asks for one to three). A JSON code fence around it is allowed; anything else, extra keys included, is not read.

**Where it runs.** On the `text-fast` route (`openai/gpt-6-luna`, the cheapest text tier) through the OpenRouter provider, with low reasoning like every route, temperature 0, and at most 800 output tokens. The app's engine gets it when `OPENROUTER_API_KEY` is set; on the fake provider there is no judge. No new provider and no new required setting.

**Which runs.** Bench runs, ad-hoc bench runs and batches: the gold set. The engine marks a run for the judge at submit when it is a bench run (`billing.free: "bench"`, which only the bench sets) and keeps that on the run (`run.judge`). People's runs and pipeline steps are not judged unless `WOVI_JUDGE_LIVE=on` (off by default, see Settings).

**In the gate.** Every draft of a judged run, the first and each rewrite, gets the judge's reading as one more check, "Second opinion" (weight 25, weak under 60, never a hard fail). It joins the combined score like any check, and its reasons join the rewrite notes. The report keeps `judge: true` when the used draft has a second opinion, and `withoutJudge`, the same score without it.

**Cost and the cap.** Before each judgement the engine estimates it (the judge's prompt plus all 800 output tokens) and skips it when the run's cap would not cover it; the skip is recorded as a `judge` call with the reason. A judgement is a `judge` call on the run with its tokens and cost, added to the run's totals like any call. A judge prompt is about 1,400 to 2,100 tokens for the launch agents, so one judgement is about $0.0003 (at most about $0.0006 by the estimate); a judged run with two rewrites is three of them.

**When it fails.** No answer, a timeout or an answer that cannot be read never fails or holds up the run: the draft has no second opinion and is scored on the six checks alone. The failed call is recorded, and whatever it was billed (an unreadable answer is still paid for) is counted.

**On the bench.** Each result carries `judge`: the score and reasons, shown beside the checks as "Second opinion 82" with the reasons under them; or "No second opinion" with why (the cap, no answer, an answer that could not be read). Null when the engine has no judge.

**The regression gate** compares the combined score, with the second opinion, on the gold set ([stats.md](stats.md#the-regression-gate)). A gold sample where only one of the two versions had a second opinion (the older one ran before the judge, or its judgement failed) is compared on both scores without it, and the gate says how many.

## Pipelines

Every step is an engine run, so every step goes through the same gate and its rewrites. A step whose run is not ready is **flagged**, and its package part says why ("Quality 61, under the bar of 95"). The step keeps the gate's score, bar, verdict and rewrites. The phase 10 step rewrite (`onFail`) still runs on failed checks, as a new run with the failure as a note, after the gate's own rewrites.

## What people see

| Where | What |
|---|---|
| A result (`/app/runs/[id]`, the agent page) | Quality as one number beside brand fit, with "Passed the bar of 70" or "Under the bar of 70". When the gate rewrote it: "Rewritten once by the quality gate", each draft's score and what the first one got wrong. When it is not ready: "Waiting for a person: under the quality bar" with every reason. Under the result, the breakdown: each check, its score and its reason. The heading says "for review" instead of "ready". |
| A review item (`/app/review/[id]`) | The same, for the team. Clients see none of it. |
| Agent cards (home, Make) | Average quality, how many runs pass the bar, how many results were approved, and the number of runs. "New agent" until there are scored runs. |
| The agent page | "How it scores": the numbers in words, six tiles (pass the bar, average quality, approved, changes asked, runs, first try), the agent's bar and what happens under it, and what every result is checked for. A chip in the head links to it. |

**The public scorecard** counts runs of the agent across every workspace that used it, and returns only counts and averages, never another workspace's runs. Bench runs in the builder's workspace are left out. Builder-only details (cost, models, routes) are not in it.

- Pass rate: runs that reached ready at the gate, out of the runs the gate read.
- Average quality: the mean gate score of those runs.
- Approval rate: results people approved, out of the results they decided (the phase 11 item's latest decision, else the phase 9 decision; a phase 9 rejection noted "Changes asked:" counts as a change request).
- Changes asked: decided results where someone asked for changes at least once.
- Runs: finished runs that gave a result. Under 5, the card says it is new.

## What builders see

`/builder/agents/[id]/quality`, linked from the editor, the bench and the versions page. Builders only; everyone else gets a 404, like every builder page.

Per version, newest first (people's runs and bench runs together):

- the bar and rewrites, with a link to Tuning;
- pass rate, average quality next to the first drafts' average, how many runs the gate rewrote and how many of those then passed, decisions, bench ratings and runs;
- **checks that fail most**, across first drafts and rewrites, with the share of drafts and failed or weak counts;
- **what the bench said**: ratings and their notes;
- **the most common change requests**, grouped ("Make it shorter." and "make it shorter" are one), the words that keep coming up, and what people decided;
- **drafts that failed**: one per run, the first draft the gate sent back or the result that still went to review, with its score, its reasons and its text;
- earlier versions as a table.

It reads and counts. It never changes an agent's instructions.

## Commands

```
npm test                           # everything, on the fake provider
```

Screenshots of this phase (keep `OPENROUTER_API_KEY` empty):

```
WOVI_DATA_DIR=/tmp/wovi-quality-screens OPENROUTER_API_KEY= npm run agents:launch
WOVI_DATA_DIR=/tmp/wovi-quality-screens OPENROUTER_API_KEY= npm start
WOVI_DATA_DIR=/tmp/wovi-quality-screens OPENROUTER_API_KEY= node scripts/quality-screens.mjs
```

It signs in through the email flow, skips onboarding, then runs `scripts/seed-quality.ts`: every launch Brand Brain, a few dozen runs of every live agent with scripted fake answers (clean ones, ones whose first draft has stock lines and gets rewritten, ones with a claim that stay under the bar), decisions with change requests, and bench runs with ratings. Then it shoots a result's breakdown, a rewritten run, a needs-review item, the agent cards, an agent page's scorecard, two phone views, and the builder roll-up. Output goes to `~/WOVI-quality-screens/`.

## Tests

`src/lib/quality/quality.test.ts` (24 tests) and `src/lib/quality/judge.test.ts` (10 tests):

- each check: generic phrases from the list; specificity from names, numbers and input words, minus filler and repeats, failing with nothing from the input; reference anchoring against the brand's posts and golden samples and away from bad ones; brand fit, skipped without a Brand Brain; claims; platform rules for X length, Reels hashtags, Shorts titles, the Reels first line, thread posts and tag lists;
- the combined score: weights with skipped checks dropped, the cap on a failed check, ready only at the bar with nothing failed, a declared guardrail said once; every golden launch sample above its agent's bar and every bad one below; the bar and rewrites from the spec and the category, and their limits;
- the gate: a clean draft ready with its breakdown on the public view; a rewrite with the reasons in a data block that then passes; still under after the capped rewrites, marked for review with the reasons; the agent's own bar and cap (0, 1, a high bar); the spend cap stopping a rewrite; a rewrite that does not parse; references read from the source; the judge off on people's runs by default and counted inside the cap when it reads them; fake-provider runs of every live launch agent's golden inputs come back ready with no rewrite;
- the judge: the rubric's content (job, output contract, QUALITY RULES lines of every launch agent, inputs, only the Brand Brain parts the agent reads, gold lines, the draft escaped); good and bad answers parsed strictly; the fast route with low reasoning and an estimate that covers the call; people's runs not judged by default, bench runs judged, every run with the setting on; no answer, an unreadable answer or a throwing judge never failing the run, with what was billed counted; the cap skipping it; bench results carrying the second opinion (or why there is none); the regression gate on the combined score and without the second opinion where only one version had it;
- pipelines: a step under its bar flagged with the reason in the package;
- the public scorecard math and its words; decisions from review items and phase 9 reviews, the bench left out;
- the builder roll-up: tallies, one failing draft per run, grouped change requests and words, decisions, ratings, per version; read from real engine runs; builders only.

Two phase 6 and phase 10 tests script a bad first answer; their fake responders now keep it bad through the gate's rewrites too, so they still test what they were written for. Their assertions did not change.

## Later

- The weekly human spot check of judged results, so the judge does not drift, as the product doc says. The judge's score sits beside the builder's bench rating on every result, which is where that check would read.
- More languages for the phrase lists once runs carry a language.
- Engagement after posting (the doc's third layer) when analytics are connected.
- The regression gate is built: a new version cannot go to everyone if it scores below the current one on the gold set, or is clearly worse on live runs as a canary. See [stats.md](stats.md#the-regression-gate).

## Phase 18

The TikTok caption limit is 2,200 characters. The builder roll-up shows a draft's text and a change request's words only from the bench and from people who turned on "Use my edits to improve agents"; counts and scores still include everyone. See [safety.md](safety.md).

## Settings

| Variable | Default | What it does |
|---|---|---|
| `WOVI_JUDGE_LIVE` | off | `on` also asks the judge on people's runs and pipeline steps, inside each run's spend cap. Each judged draft is one more call on the fast route (about $0.0003), charged with the run. Bench runs are judged either way when `OPENROUTER_API_KEY` is set. |
