# The Brand Brain (phase 7)

Every agent anchors to the user's Brand Brain: the voice, the mood board, reference posts, the do and don't list, and the idea. It is the core of the product and the main answer to "slop": agents execute the user's direction, they do not invent one. The code lives in `src/lib/brand/`; the brand-fit check in `src/lib/runs/brand-fit.ts`; the screens in `src/app/brand-brain/` and `src/components/brand-brain/`.

| File | What it holds |
|---|---|
| `types.ts` | The body, the listing row, versions, proposals, `BRAND_LIMITS`, `TONE_TAGS`. |
| `validate.ts` | `checkBody`: cleans and checks a body, lists every problem at once. |
| `brains.ts` | `BrandBrains`: every call, guarded by the phase 4 policy. History, restore, files, the profile flow. |
| `profile.ts` | `analyzePosts`, `heuristicProfile` and `ProfileProposer` (the provider layer on top). The `LinkFetcher` interface. |
| `source.ts` | `storeBrainSource`: the real `BrandBrainSource` for the run engine. `toEngineBrain` flattens a version. |
| `store.ts` | Three tables (`brains`, `brainVersions`, `proposals`) on the shared `Collection` interface. |
| `seeds.ts` | Three example Brand Brains for the bench and local work. |
| `local.ts`, `server.ts` | `.data/brand-brains.json`, `.data/files/`, one instance per process, page and action guards. |

## The model

A workspace holds up to 20 Brand Brains, one per brand or client. One is the **default**: the first one made, until someone picks another. Deleting the default hands it to the oldest one left.

A Brand Brain is a listing row plus immutable versions, like an agent.

| Part | Fields |
|---|---|
| Basics | `name`, `niche`, `platforms` (`x`, `tiktok`, `shorts`, `reels`) |
| Voice | `description`, `tone` (tags, at most 12; the screens offer up to five), `use` (words and phrases to reach for), `avoid` (words to never use), `samples` (lines that sound exactly right) |
| Topics | short list |
| References | past posts: `text` and/or `url`, with a `note` on why it works |
| Mood board | `image`, `link`, `text` or `swatch` (`#RRGGBB`) items, each with a `note` |
| Dos and don'ts | two lists of short rules |
| Idea | the standing idea behind the brand; a run may bring its own |

Limits are data in `BRAND_LIMITS`: 30 references (3,000 characters each), 60 mood items, 20 dos and 20 don'ts, 10 sample lines, 40 words per list, and so on. Mood board images use the phase 5 `FileStorage` and its limits (PNG, JPEG, WebP or GIF up to 8 MB), stored under `.data/files/<workspace>/` and served back only to members of that workspace at `/brand-brain/files/<workspace>/<id>`.

## Versions

`save(caller, ws, id, changes, { note, baseVersion })` merges the changed fields onto the current version, checks the result, and writes the next version with who saved it (`by`, a user id or `key:<id>`), when, the note, and which fields changed. Nothing is overwritten.

- A save that changes nothing is refused (`no_change`).
- With `baseVersion`, a save on top of an older version is refused (`version_conflict`), so two editors never overwrite each other. The row moves with a conditional write, so two saves at the same moment cannot both win.
- `history` lists every version newest first with the author's name, the changed fields and a line diff of each changed field against the version before (the builder's `lineDiff`).
- `restore(version)` saves that version's content as a new version on top. History is never rewritten.
- Images stay in storage when an item is removed, because older versions still point at them.

## Who may do what

The phase 4 policy decides every call: members read (`view`), editors, admins and owners edit (`edit_brand_brain`), API keys follow their role. Someone outside the workspace gets `not_found` from every call, and a Brand Brain id from another workspace is never found. The engine looks Brand Brains up only in the run's own workspace.

## Building the profile from past posts

The onboarding flow from the product doc: paste 3 to 5 past posts (or links), get a proposed **Brand Profile** (voice, topics, dos and don'ts), review and edit it, then save.

1. **`propose(caller, ws, { name, niche, platforms, posts, brainId? })`** takes 3 to 5 items. An item that is only a link is a link. Links are read only when a `LinkFetcher` is set up. The app sets up `xPostFetcher` (`link-fetcher.ts`): a link to a post on X is read through X's own embed lookup (publish.twitter.com/oembed, no key); any other link is kept as a reference and listed as not read. At least one post needs its text.
2. **`heuristicProfile`** reads the posts with plain counts: words per sentence (hashtags and list items left out), emoji and hashtags per post, exclamation and question marks, lowercase starts, ALL CAPS words, lines per post, "you" and "I/we", words and two-word phrases that come back in two or more posts, hashtags as words (`#SupplyChain` reads "supply chain"), and how posts open (question, number, personal, command, quote, statement). From those it writes the voice in plain sentences, picks tone tags, words to use, generic words to avoid that the posts never use, the first sentences as sample lines, topics, dos ("Open with a number or a list, like 3 of your 3 posts do.") and don'ts ("No hashtags.", "No emoji.").
3. **`ProfileProposer`** sends that proposal to a model through the phase 3 provider layer as the example to improve, with each post in its own `<data>` block, under a spend cap ($0.05 by default) checked before each call. On the **fake provider** (the default without `OPENROUTER_API_KEY` on a local app) the answer is the proposal itself, so tests and local work are deterministic and free. A model answer that does not fit gets one repair; then the counts stand. Tokens and cost are kept on the proposal row; the screen never sees them.

   **The AI read costs credits.** The product doc has no general free trial, so a real model reading the posts is a paid job like a run: before "Read my posts" the person sees "Have the AI read them, for up to N credits" (`readQuote`), ticked when the workspace's paid credits cover it. It holds the estimate (never more than shown), is charged its real cost after, and costs nothing when the model did not answer. Holder credits never pay for it: they are for agent runs only. Unticked, or without enough credits, plain counts read the posts for free and the proposal says so. AI reads are also limited to 10 an hour per person and 40 a day per workspace (`READ_LIMITS`). Without billing (`WOVI_CREDITS=off`) a local app reads for free as before; a server reads with plain counts only. The charge is on the proposal (`charge`, optional) and in the credits history as "Read past posts for a Brand Brain".
4. The proposal is saved as an open job. Nothing is a Brand Brain yet.
5. **`accept(caller, ws, proposalId, edits)`** takes the person's edits (they win over the proposal), checks them, and only then saves: a new Brand Brain with the posts as references ("Built from 4 past posts"), or, with `brainId`, a new version of an existing one that adds the posts it does not have yet. A proposal saves once; a bad edit leaves it open to fix.

## How the engine reads it

`storeBrainSource` replaced the phase 3 stub in the app's engine (`localEngine` and `localBrandBrains`). A run picks its Brand Brain in this order:

1. `brandBrainId` on the run request (the bench uses this);
2. the agent's `profile` input;
3. the workspace default.

A named one that does not exist in the run's workspace refuses the run (`invalid_input`). `brandIdea` on the request fills `{{brand.idea}}` for that run in place of the standing idea. The run records the Brand Brain's id, name, `updatedAt`, the parts read and a hash of them as filled in (`run.brandBrain`), and what the request asked for (`run.brandPick`).

The engine fills **only the parts the spec declares**, each as its own data block, with tags inside escaped so user content can never close a block or open a new one:

| Placeholder | What the agent gets |
|---|---|
| `{{brand.voice}}` | The description, niche, tone, topics, words to use, words to avoid, and the sample lines. |
| `{{brand.mood_board}}` | One line per item: `Image "crust.png" (note)`, `Colour #8A4B2A (note)`, `Link ... (note)`, or the text. |
| `{{brand.references}}` | Each post in quotes with its link, and "Why it works: ..." |
| `{{brand.dos_donts}}` | Dos, don'ts, and "Never use these words: ..." (the words to avoid). |
| `{{brand.idea}}` | The run's idea, or the standing one. |

The builder's per-agent mood board (phase 5) still joins after the user's own items: images, text and swatches to `mood_board`, links to `references`.

## Brand fit

`brandFit(texts, brain)` in `src/lib/runs/brand-fit.ts` is the first, deterministic brand-fit check:

- **Flags**: every word to avoid found in the draft, and every don't it breaks. A don't is checked when it starts with "No", "Never", "Don't", "Avoid", "Without" or "Stop", or quotes a phrase. Style rules come from `DONT_RULES` (hashtags, emoji, exclamation marks, ALL CAPS, links, mentions); otherwise a quoted phrase, or the one to three words after the negation ("Never call anything artisanal" checks "artisanal"). Rules it cannot read ("No discounts in the first line") are left alone, never guessed.
- **Similarity** to the voice's sample lines, 0 to 1: style (sentence length, emoji, hashtags, exclamation and question marks, lowercase starts; 70%) and wording (character trigrams; 30%), with the closest sample line.
- **Score**, 0 to 100: `40 + 60 * similarity` (100 without sample lines), minus 15 per flag.

It runs as the `brand_fit` check of the `brand_voice_check` guardrail, beside the existing banned-words check: a flag fails the check and marks the run for review; a similarity under 0.45 is a note. The check carries its `score`, which the test bench shows as "Brand fit 82". The Brand Brain's dos and don'ts screen runs the same function in the browser on a pasted draft. Phase 12 adds rules to `DONT_RULES`, an LLM judge or embeddings beside it without touching the engine.

## Screens

Screens on the brand tokens, inside the app chrome since phase 9 ([app.md](app.md)), reached from the app nav. All `noindex`, none linked from the site.

| Path | What it is |
|---|---|
| `/brand-brain` | The current workspace's Brand Brains as cards: niche, voice, tone, colours, counts, version, who edited it. "Start blank", "Build from past posts". The workspace switch is in the app header. |
| `/brand-brain/new` | Paste 3 to 5 past posts, read them, review and edit the proposal beside "What we noticed", save. `?brain=<id>` rebuilds an existing one as a new version. |
| `/brand-brain/[id]` | The editor: Voice (with "What agents read", the saved version as the engine fills it), References, Mood board, Dos and don'ts (with "Check a draft"), History (what changed, restore). Make default, rebuild, delete. Viewers see everything and can save nothing. |

In the builder, the test bench has a **Brand Brain** picker: the default of `ws_wovi`, or any other Brand Brain there. Every run of the bench uses it, and the bench says which one it ran with.

## Commands

- `npm run brains:seed` adds the three example Brand Brains (Crumb and Co, Desk Stretch, Night Owl Coffee) to `ws_wovi`, or to the workspace id given after `--`. Safe to run again. `npm run agents:launch` adds four more (a gym, an invoicing app, a plumber, a budget cooking creator) for the launch samples ([launch-agents.md](launch-agents.md)).
- `node scripts/brandbrain-screens.mjs [outDir]` takes the screenshots against a running build (after `agents:seed`, `builder:samples` and `brains:seed` on the same `WOVI_DATA_DIR`).
- `npm test` covers the store, versions and history, conflicts, restore, defaults, workspace isolation, the policy for every role and API keys, file and item limits, the profile on three post styles, links with and without a fetcher, review and edit before save, rebuilds, a model answer and a broken one, every brand placeholder filled only when declared, the pick order, the per-run idea, data blocks that cannot be escaped, the merge with agent boards, the brand-fit flags, similarity and score, the guardrail in a run, and the bench with a picked Brand Brain.

## Not yet

- **Reading links.** Only X posts are read. The fetcher only ever calls publish.twitter.com, never the pasted address itself, so no private address can be reached; the read stops after 10 seconds. TikTok's embed lookup no longer carries the caption and Instagram's needs an app key, so neither is read.
- **Onboarding and the run screen** are phase 9 ([app.md](app.md)): onboarding runs this proposal flow for a new person, and the agent form sets the idea per run (`brandIdea`).
- **Quality gates** (LLM judge, embeddings, publish only above a score) are phase 12.
