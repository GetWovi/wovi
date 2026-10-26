# The launch agents (phase 8)

The product doc's MVP is **Brand Brain + 7 text agents**: Trend Scout, Idea Generator, Hook Writer, Script Writer, Caption Writer, Hashtag Optimizer and Platform Repurposer. Together they take a business owner from an idea to text that is ready to post for short-form video (the doc's "idea to ready post" pipeline), and each one answers problems C1 to C7: the owner brings the idea (C1, C7), fills a form instead of a prompt (C3), never picks a model (C4), gets one narrow job done (C5), and gets output anchored to their Brand Brain and checked for slop (C6).

This phase turns that lineup into strong first drafts: complete specs, golden samples across seven kinds of business, a seed command, and tests. Funkai refines them in the builder once he has access, on a real model. Nothing here called a real model or spent money.

The code lives in `src/lib/launch/`.

| File | What it holds |
|---|---|
| `specs.ts` | The seven launch specs (`LAUNCH_AGENTS`), their change notes, and the shared instruction blocks. |
| `brains.ts` | The seven Brand Brains the samples run against: the three phase 7 examples plus four new ones. |
| `samples/` | Eleven samples per agent (ten gold, one bad), one file per agent, with typed ideal outputs. |
| `format.ts` | Turns a typed ideal output into the readable text the bench shows. |
| `install.ts` | `installLaunchSet`: the idempotent installer behind `npm run agents:launch`. |
| `launch.test.ts` | The tests (below). |

## The lineup

| # | Name | Id | Job | Status | Version | Model slot (fallback) | Cap per run |
|---|---|---|---|---|---|---|---|
| 1 | Trend Scout | `trend-scout` | Finds the formats rising in your niche this week and how you could use them. | live | 3.0.1 | strong (standard) | $0.20 |
| 2 | Idea Generator | `idea-generator` | Gives you a week of post ideas that only your business could post. | live | 1.0.1 | strong (standard) | $0.12 |
| 3 | Hook Writer | `hook-writer` | Opens a post or a short with one line people stop for. | live | 1.1.1 | standard (fast) | $0.05 |
| 4 | Script Writer | `script-writer` | Turns one idea into beats with a beginning, a turn and an end. | live | 2.0.1 | strong (standard) | $0.15 |
| 5 | Caption Writer | `caption-writer` | Writes the caption to match the clip, the format and your voice. | live | 1.1.1 | standard (fast) | $0.08 |
| 6 | Hashtag Optimizer | `hashtag-picker` | Picks the few tags and search words that help the right people find the post. | live | 2.0.1 | fast (standard) | $0.03 |
| 7 | Platform Repurposer | `repurposer` | Turns one post that worked into a native version for each of your other platforms. | live | 2.0.1 | strong (standard) | $0.20 |

Storyboarder and Voice and Cut are not text agents and are not part of this set. They stay hidden at 1.0.0 until their drop.

### What changed against the phase 2 seeds

- **Added: Idea Generator.** It is in the doc's MVP set and was missing from the seeds.
- **Renamed: Hashtag Picker is now Hashtag Optimizer**, and **Repurposer is now Platform Repurposer**, the doc's names. Their ids (`hashtag-picker`, `repurposer`) stay, because ids never change and pipelines pin them.
- **Changed job: Platform Repurposer.** The seed cut a long piece into a thread, a carousel and three shorts, with an optional video and transcription. The doc's Platform Repurposer takes one post and makes a version per platform; long video belongs to the Long-to-Short Clipper (P1) and threads and carousels to the Thread and Carousel Writer (P1). The video input and the transcription tool are gone.
- **Changed job: Hashtag Optimizer** now returns hashtags and search words with where each goes, as the doc's "tag and SEO set" asks, instead of five bare tags.
- **Back to draft: Trend Scout (2.0.0), then live (3.0.0).** It needs `trend_lookup`. Without live data it would invent trends, so it stayed a draft until the tool layer was built. Since 3.0.0 the engine runs a live web search before the model writes ([engine.md](engine.md#tools)), every trend cites the page it came from in a new `source` field, and Trend Scout is live.
- **Tools removed** from Hook Writer and Hashtag Picker (`trend_lookup`). The engine runs no tools yet, and telling a model to call a tool it does not have invites made-up results.
- The phase 2 seeds in `src/lib/agents/seeds.ts` are unchanged on purpose: a test ties them to the homepage cards. The launch specs are saved as new versions on top of them.

### The homepage and the seeds

The homepage agent cards (`src/components/home/demo-data.ts`) show this lineup since phase 9: Idea Generator, the two new names and jobs, Trend Scout as coming, the video agents as next. The seeds test ties the cards to the launch specs over the seeds, so the two cannot drift; a card may still say "coming" for an agent the launch set has made live (Trend Scout until the homepage reveals it), never "live" for a draft. In the app, Trend Scout shows as coming wherever it is not live (a data dir where a builder kept it a draft). `SEED_AGENTS` stays the phase 2 base on purpose: the launch specs are saved as new versions on top of it, and the install tests depend on that.

## How the instructions are written, and why

Every template follows the same order, so Funkai can compare agents side by side and a tuning change in one is easy to carry to the others:

1. **ROLE**: who the agent is and the one job, in plain words, including who it serves (a small business owner who did not write a prompt).
2. **The material**: each input in its own labelled line. The engine turns every `{{placeholder}}` into a `<data>` block, so user text is always material, never instructions.
3. **The Brand Brain**: only the parts the spec declares, each labelled.
4. **How to use the Brand Brain**: one rule per part, shared across agents:
   - Voice: match sentence length, punctuation, casing, emoji and the words it reaches for; never use its words to avoid.
   - Past posts: learn their shape (how they open, how long they run, how they end); do not copy their lines.
   - Dos and don'ts: every do applies where it fits; every don't is a hard rule.
   - Mood board (Script Writer): the look for what is on screen.
   - Brand idea: serve it, never contradict it.
   - A fallback when a part says "Not set yet.", so a run with no Brand Brain still reads well.
5. **Platform**: the conventions that change the writing on X, TikTok, YouTube Shorts and Instagram Reels (spoken hooks against first lines, what shows before "more", the Shorts title, the 280 characters on X).
6. **Quality rules**: concrete and checkable. Specific over generic ("if a line could be posted by any other business, rewrite it"), facts only from the inputs and the Brand Brain, no misleading claims or invented testimonials, and the stock phrases to never write. The phrase list mirrors `PHRASE_LISTS.anti_slop` in `src/lib/runs/guardrails.ts`, so the instruction and the check agree.
7. **What to return**: what goes in each field. The engine adds the exact JSON shape itself (`outputContract`), so templates describe content, never JSON.

Three choices run through all of them:

- **Facts are the main anti-slop rule.** Generic output is bad; invented output is worse, because the owner may post it. Every agent says "never invent numbers, prices, dates, results, customers, reviews, quotes, awards or opening hours", and the forms ask for the facts instead (Caption Writer's "Facts to include", Repurposer's "Must stay the same", Idea Generator's "Anything coming up", Script Writer's "What you can film").
- **Forms a non-writer can fill.** Every free-text input has help with an example; choices have plain labels and defaults; only one or two inputs are required per agent; the Brand Brain picker is always optional (the workspace default is used).
- **Variety is asked for by name.** Hook Writer names ten angles, Idea Generator caps any format at two of seven, Caption Writer asks for two different angles, not two wordings. Models drift to ten versions of the same line unless told otherwise.

## The seven, one by one

### 1. Trend Scout (live since 3.0.0)

- **Inputs:** What you do (text, 3 to 120), Platform, Brand Brain.
- **Output:** 5 items with `trend`, `what_it_looks_like`, `evidence`, `source`, `how_you_could_use_it` (at most 60 words each). `source` is the address of the lookup finding the trend comes from.
- **Brand Brain:** voice, references, dos and don'ts. **Tools:** `trend_lookup`, run by the engine before the model writes. **Guardrails:** no misleading claims, banned phrases, specificity, and the tool's own check that every source is a page the lookup found.
- **Why:** every trend comes from one numbered finding of a live web search, with its date; the instructions forbid trends from memory and numbers the finding does not give. "Format, not theme" is the core rule ("one ingredient, one close-up, one line of text", not "behind the scenes content"), and every trend ends in one post this business could shoot this week. A sound is described without naming music the business would need a licence for.
- **Tuning focus:** does it report only what the lookup shows, does it drop trends that break a don't or need a budget, is the evidence honest when the signal is weak or old, and is the cheap lookup model good enough at listing what the pages say.

### 2. Idea Generator (new)

- **Inputs:** What to post about (text, 3 to 300, required), What the posts should do (reach, trust, sell, talk; default trust), Platform, Anything coming up (optional, 500), Brand Brain.
- **Output:** 7 items with `idea`, `format`, `why_it_fits` (at most 45 words each). Seven is a week, which is the doc's "turn one idea into a week of posts".
- **Brand Brain:** voice (with the brand's topics), references, dos and don'ts, idea.
- **Why:** a good idea is a concrete moment, number, object, person or question, makeable this week with a phone. Each goal is spelled out (reach is shareable or searchable, trust shows the work, sell shows one product in use, talk starts a friendly disagreement). `why_it_fits` makes the model point at the topic, value or past post it builds on, which is the reference anchoring the doc asks for.
- **Tuning focus:** the "only this business could post it" bar; whether it invents facts beyond "Anything coming up"; format variety; temperature (0.9 now).

### 3. Hook Writer

- **Inputs:** Your idea (10 to 600, required), Platform, Who it is for (optional, 120, new), Brand Brain.
- **Output:** 10 lines, at most 12 words each (the doc's "10 scroll-stopping opening lines", `max_words: 12`).
- **Brand Brain:** voice, references, dos and don'ts.
- **Why:** ten named angles (a number, a confession, a contrast, a named thing, a bold statement, a question only this idea raises, the result first, a corrected belief, a moment in time, an instruction) so the owner gets a real choice. Spoken hooks for video, first lines for X. A banned list of hollow openers ("Did you know", "wait for it").
- **Tuning focus:** are the ten really different, do any overpromise, does the model add labels or quotation marks, and does it keep to 12 words.

### 4. Script Writer

- **Inputs:** Your idea (10 to 1000, required), Length (15, 30, 60 seconds), Who is on camera (me to camera, or a voiceover), What you can film (optional, 400), Mood (same as my Brand Brain, lighter, more serious, more energetic), Brand Brain.
- **Output:** a script in four beats, `hook`, `setup`, `turn`, `ending` (was three: opening, turn, ending), each with spoken lines, what is on screen and seconds; 60 seconds at most.
- **Brand Brain:** voice, references, dos and don'ts, mood board, idea.
- **Why:** the hook is its own beat because the first two or three seconds decide everything on short video. Timing is given as words per second (about 2.5), because models overwrite scripts. Shots stay inside "What you can film", so the owner never gets a script they cannot shoot, and the mood board sets the look. Endings avoid "like and subscribe". Safe content is on, for fitness and health topics.
- **Tuning focus:** word count against length (the most likely failure), shots inside the list, a turn that actually turns, endings without clichés.

### 5. Caption Writer

- **Inputs:** What the post shows (10 to 2000, required), Platforms (several), Length (short, medium, long), Facts to include (optional, 300, new), What should people do (whatever fits best, comment, save, visit or book, buy, nothing; new), Brand Brain.
- **Output:** a caption set, 2 variants per chosen platform, 2,200 characters at most (X held to 280 by the platform check).
- **Brand Brain:** voice, references, dos and don'ts.
- **Why:** per-platform rules (X stands alone under 280; TikTok's first line carries search words; the Shorts first line is a title under 100 characters; Reels front-load the first 125 characters). Facts go in word for word, and "link in bio", addresses or prices only when the facts give them. No hashtags; that is Hashtag Optimizer's job.
- **Tuning focus:** facts verbatim, X length, two angles not two wordings, and hashtags creeping in.

### 6. Hashtag Optimizer

- **Inputs:** Caption or post (5 to 2200, required), Platform, Where you are (optional, 80, new), Brand Brain.
- **Output:** 6 items with `type` (hashtag or keyword), `term`, `where`, `why`.
- **Brand Brain:** voice (for the niche and topics), dos and don'ts.
- **Why:** a fixed mix per platform (X 1 + 5, TikTok 4 + 2, Shorts 3 + 3, Reels 4 + 2, never more than 5 hashtags on Instagram), because search words now matter as much as tags. `where` tells the owner exactly where to put each one. A banned list of spam tags (#fyp, #viral...). Multi-word hashtags in CamelCase for screen readers. It never claims post counts, since it cannot see them. **A brand whose don'ts say "No hashtags" gets six search words**; that rule beats every mix (see the Crumb and Co sample).
- **Tuning focus:** invented or spammy tags, the exact mix, and local terms when a location is given. It is on the fast model; check that it is good enough.

### 7. Platform Repurposer

- **Inputs:** The post to repurpose (20 to 5000, required), Where it was posted (the four, or somewhere else), Make versions for (several), Must stay the same (optional, 300), Brand Brain.
- **Output:** a caption set with one version per chosen platform. X is one post under 280 characters; video platforms get a fixed layout, one label per line: `Hook:`, `Script:`, `On screen:`, `Caption:`.
- **Brand Brain:** voice, references, dos and don'ts. **Guardrails** include `rights_confirmed` (the doc requires it for the repurposer).
- **Why:** "first, find the point" before writing; same point, same facts, new shape. The biggest risk is added facts, so "add nothing the original does not say" is stated twice, and the must-stay lines are kept word for word. The labels are in title case on purpose: a brand that bans ALL CAPS would otherwise fail its own brand-fit check.
- **Tuning focus:** added claims or numbers, versions that are copies, the layout, and X versions that need the video to make sense.

## The Brand Brains behind the samples

`npm run agents:launch` installs seven Brand Brains into `ws_wovi` (skipped by name if there):

| Brand Brain | Kind of business | What makes it a good test |
|---|---|---|
| Crumb and Co | Bakery (phase 7 example) | No hashtags, no exclamation marks, never "artisanal" |
| Desk Stretch | Physio for desk workers (phase 7 example) | Health claims, no emoji, open with a number |
| Night Owl Coffee | Late-night coffee bar (phase 7 example) | All lowercase, no ALL CAPS, never hustle culture |
| Northside Strength | Beginner strength gym | Never promise weight loss, no before-and-after photos |
| Tallybook | Invoicing app for UK freelancers (SaaS) | Calm and nerdy, no fake urgency, no tax advice for a specific person |
| Fernhill Plumbing | Local plumber | Never scare people into booking, no prices, privacy rules |
| Twelve Quid Kitchen | Budget cooking creator | First person, prices to the penny, never "hack", no diet talk |

All seven are made up.

## The golden samples

35 samples: 5 per agent, 4 gold and 1 bad, each agent across at least four of the businesses above. Every sample carries its Brand Brain through the agent's profile input, so the bench runs it against the right business without picking one.

- **Gold** samples are written to the standard of a top social writer: every line names something real from the inputs, no fact appears that the inputs or the Brand Brain do not give, every brand rule is kept. The note on each says why it works.
- **Bad** samples show the common failures: generic advice, stock phrases, banned brand words, a guarantee, a made-up review, a hashtag wall, a copy-paste with added claims. The note says what is wrong, so the bench shows the contrast.
- Trend Scout's samples cite example addresses (`https://example.com/...`) to show the shape; a real run cites the pages its own lookup found, and the `tool_sources` check holds it to them.

Ideal outputs are written as typed outputs, so the tests parse them with the engine's own parser and run the agent's guardrails on them. With the deterministic checks of phases 3 and 7:

- every gold sample passes every guardrail of its agent, with brand fit between 77 and 90;
- every bad sample fails at least one check, with brand fit between 9 and 54 where it is read.

That is a check on the samples and the checks, not a quality score. Quality comes from the bench with a real model and Funkai's ratings.

## The seed command

```
npm run agents:launch              # install into .data/ (or WOVI_DATA_DIR)
npm run agents:launch -- --bench   # then run every sample once, on the FAKE provider
WOVI_DATA_DIR=/path/to/test-site-data npm run agents:launch
```

What it does, in order:

1. Makes sure `ws_wovi`, `creator_wovi` and the **launch author** exist. The launch author (`usr_wovi_launch`, "WOVI launch set") is a builder account with no email and no passkey, so nobody can sign in as it. It owns `ws_wovi` so that every save goes through the Builder and `GuardedAgents` like a person's would, and the versions name it as their author.
2. Seeds the phase 2 agents as the base (`seedPlatformAgents`), so history reads "1.0.0 Launch seed", then the launch version.
3. Adds the seven Brand Brains, skipping names already there.
4. For each launch agent: creates it if missing; saves the launch version if it is newer than every version and **nobody but the seeds and the launch author has ever saved the agent**; otherwise leaves it alone and says why. A version Funkai saved in the builder always wins (a Trend Scout he saved stays as he left it, a draft). Status is applied only when the launch version is saved.
5. Adds the samples, skipping titles the agent already has. A sample that no longer fits a changed form is reported, not forced in. A launch sample whose shape a newer launch version changed (Trend Scout's five gained a source in 3.0.0) is rewritten in place, keeping its id, but only while the agent is on that launch version and the stored sample still holds exactly the text the launch set wrote (`SUPERSEDED_SAMPLES` keeps a hash of it). A sample anyone edited stays as it is.

6. Installs the pipeline templates (phase 10, [pipelines.md](pipelines.md#templates)): "Idea to ready post", "Repurpose a post that worked" and "Caption and tags for a clip", skipping any a builder has saved over.

Running it again changes nothing. On a data dir from before the tool layer (the phase 17 fixture) it updates Trend Scout to 3.0.0 and live, refreshes its five samples, and leaves every other agent, version and sample byte for byte as it was (`src/lib/safety/phase17-compat.test.ts`). `--bench` always uses the fake provider, even with `OPENROUTER_API_KEY` set. On a fresh data dir it printed: 35 runs, 35 done, 35 clean, 0 refused (a real model would cost about $1.15 for the whole set, capped at $4.15). The fake provider writes filler from the inputs, so this proves the plumbing only: shapes parse first time, every declared guardrail runs, brand fit is read, each sample uses its own Brand Brain.

`npm run agents:try -- <id>` now falls back to the first golden launch sample when the old example inputs no longer fit the current version, and knows Idea Generator.

## The first real run (2026-10-23)

All 35 samples and four extra Trend Scout runs ran on the real models through OpenRouter, for $2.95 in all (OpenRouter's own counter, including a rerun). After the fixes it found (reasoning kept low on every route, billed failures counted, an empty trend search failing before the model, short niches in the specificity check), every agent parsed every sample and scored 83 to 97 on the quality gate. Trend Scout is the slowest (about a minute) and dearest (up to $0.20 on the strong model); web trend data for X is thin, so those runs now stop with "nothing current found" and cost nothing. Hook Writer often needs its repair call for the 12-word limit.

## Tuning round 1 (2026-10-26)

The doc's loop at levels 1 and 2 (instruction edits, checked against the samples): read every output of the 23 October run against the gold samples, change the instructions, rerun the same inputs on the real models, keep only what holds up. 30 runs plus two Hook Writer reruns, $0.99 on OpenRouter.

| Agent | What the outputs showed | The change | Result |
|---|---|---|---|
| All | Whole sentences copied from past posts and sample lines | Learn the shape, never reuse a whole sentence; at most one item may echo the best-known line, reworded | Copied sentences 26 to 12 across the same inputs (the rest are mostly Repurposer keeping the post it was given, which is its job) |
| Idea Generator | `why_it_fits` read like a brief ("as the dos ask") | Tell the owner why their audience will watch, share or act, in plain words | Scores 92 to 95, same as before; the reasons now read as advice |
| Hashtag Optimizer | Near-duplicate terms, ungrammatical search words, empty reasons | At most one broad tag, no two terms on the same main words, search words as people type them, each why names who searches | Clearer terms ("where is my stopcock"); the gate scores two posts lower (85, 89) because the words overlap the input less, still above the bar |
| Script Writer | A sales brief named the product in every line | Name it at most twice spoken, once on screen, show it in use | Same scores; the sales sample no longer reads as an ad |
| Hook Writer | Hooks ran past the 12-word check | Ask for at most 10 words; quoted phrases count in full | 4 of 5 samples pass; one sample full of quoted invoice wording still fails at times (format, not length), as it did on 23 October |

Versions: trend-scout 3.0.1, idea-generator 1.0.1, hook-writer 1.1.1, script-writer 2.0.1, caption-writer 1.1.1, hashtag-picker 2.0.1, repurposer 2.0.1. The installer saves them on the next start unless a person has edited that agent in the builder; an edit that took the same patch number now reports "kept" too.

## Tuning round 2 (2026-10-26): more examples

The doc asks for 10 to 30 sample works per agent; the launch set had 5. Each run sees the three gold samples closest to the request, so more samples across more kinds of business means closer examples for more owners (the doc's level 3, retrieval).

- Three new Brand Brains: Chair Nine (hair salon, Glasgow), Muddy Paws Grooming (dog groomer, Cornwall) and Kiln Street Ceramics (ceramics shop, online). The set now spans ten kinds of business.
- Six new gold samples per agent, 42 in all, so every agent has 11 (ten gold, one bad), each passing every guardrail with its Brand Brain and every rule of tuning round 1.
- Real run on all 77 samples, $1.83 on OpenRouter. On the 35 original inputs the scores held (each agent within a point or two, inside run-to-run noise); the 42 new inputs averaged 93 to 95. Hook Writer passed all 11, including the sample that failed before. Two Trend Scout runs stopped with "nothing current found" and cost nothing, as designed.

## One engine change

The specificity check (`specificity_check`) used to compare every piece of text for repeats, so list items with fields (Hashtag Optimizer's `type: hashtag`, Idea Generator's `format`) failed on values that repeat by design. Items with fields are now compared as whole items. A test covers it.

## Tests

`src/lib/launch/launch.test.ts`:

- the lineup is the doc's seven in the doc's order, keeps the seed ids, and is all live;
- every launch spec validates; versions go above the seeds, with a major bump wherever the output changed;
- every guardrail listed exists and has a check; only Trend Scout declares a tool and cites a source per trend; the voice-writing agents check brand fit;
- every free-text input has help, and every agent has an optional Brand Brain picker;
- no em dash anywhere in specs, notes, samples or Brand Brains;
- at least four samples per agent, exactly one bad, across at least four businesses, seven in all;
- every sample fits its agent's form, its ideal output parses as the agent's output, and fits the builder's limits;
- gold samples pass every guardrail with their Brand Brain, bad ones fail at least one;
- every template fills with a real Brand Brain: no placeholder left, every declared part filled, every input present;
- the installer saves through the builder as the launch author with the right notes, versions and statuses; is idempotent; never saves over a person's version; and a batch of all 35 samples on the fake provider succeeds, parses first time, runs every declared guardrail, reads brand fit, uses each sample's own Brand Brain, gives every run the other samples as examples but never its own, and returns Trend Scout's lookup sources.

## Open questions

For the owner:

1. **Homepage:** done in phase 9. The cards show this lineup and the seeds test checks it.
2. **Hashtag Optimizer's name:** the doc says "Hashtag and Keyword Optimizer" in the catalog and "Hashtag Optimizer" in the MVP list. The shorter one is used; the longer one says more about the search words.
3. **Trend Scout at launch:** answered. `trend_lookup` is a live web search through OpenRouter (Parallel, fast), about $0.002 a lookup, cached for 6 hours per niche and platform ([engine.md](engine.md#trend_lookup)). Official platform APIs (TikTok Research API, the Instagram Graph API's hashtag search) could add real post counts later; both need app review.
4. **Languages:** every sample is British English. The doc leaves launch markets and languages open. Should agents write in the Brand Brain's language when its posts are in another one?
5. **Model cost:** Idea Generator, Script Writer and Platform Repurposer use the strong slot. One pass over all 35 samples would cost about $1.15 at the estimate. Worth checking whether the standard slot is good enough for Idea Generator and the Repurposer.

For Funkai:

1. **Grow the gold sets.** The doc wants 30 to 50 per agent; there are 4 gold and 1 bad. Real posts from real businesses beat made-up ones.
2. **Platform rules to verify before launch:** the 5-hashtag cap on Instagram, X's 280 characters for accounts without Premium, the 100-character Shorts title, and how much of a caption shows before "more" on each platform. They live in the instructions and in `PLATFORM_LIMITS`.
3. **Script Writer's text-only format.** Faceless channels sometimes post text on screen with no voice at all. The script shape needs spoken lines, so only talking head and voiceover are offered. Add a third format, or keep it out?
4. **Idea count:** seven ideas, one for each day of a week. The doc does not fix a number.
5. **Brand rules against an agent's job:** a "No hashtags" brand gets search words only from Hashtag Optimizer. Is that the right call, or should it say so and return nothing?
6. **Hashtags without data:** Hashtag Optimizer cannot check that a tag is in use until a tool exists. Should it get `trend_lookup` when that is built?
