# The Agent Builder (phases 5 and 6)

The hidden tool where WOVI's own agents are made: described in a sentence, drafted as a full spec, shaped in an editor, given golden samples and a mood board, run on the test bench, scored, tuned, versioned, and published. Every preset agent goes through it, under the platform's creator account, the same way a creator's agent will later. Part 1 (phase 5) is the making; part 2 (phase 6) is the daily work of making an agent good: the [test bench](#the-test-bench-phase-6), [scoring](#scoring), [tuning](#tuning), [versions](#versions) and [batch runs](#batch-runs).

The code lives in `src/lib/builder/`; the screens in `src/app/builder/` and `src/components/builder/`.

| File | What it holds |
|---|---|
| `builder.ts` | `Builder`: every call, scoped to `ws_wovi`, open only to builders. Agents, drafting, samples, the board, files. Holds `bench` and `versions`. |
| `bench.ts` | `AgentBench`: estimates, bench runs, cancel, ratings, scorecards into the spec, tuning saves, batches. |
| `scoring.ts` | `autoScore`, `scorecard`: the arithmetic, on plain run records. |
| `versions.ts` | `AgentVersions`: history with authors and scorecards, compare, rollback. |
| `diff.ts` | `lineDiff` and `specDiff`: a readable diff of two versions. |
| `drafter.ts` | `templateDraft` (deterministic, no model) and `SpecDrafter` (the provider layer on top of it). |
| `storage.ts` | `FileStorage`: the interface, a memory store, the local folder store, the file limits. |
| `types.ts` | `Sample`, `BoardItem`, `Bench`, `Rating`, `Batch`, `BUILDER_LIMITS`, `BENCH_LIMITS`. |
| `store.ts` | The builder's tables (samples, board items, benches, ratings, batches) on the shared `Collection` interface. |
| `board-brain.ts` | The mood board as an extra Brand Brain source for the engine. |
| `local.ts` | `localBuilder`, `localDrafter`, `localBrandBrains` on `.data/`. |
| `server.ts` | `requireBuilder` (404 for everyone else), `builderAction`, `appBuilder`. |

Clip samples live in `src/lib/clips/` (see [Clip samples](#clip-samples)).

## Who gets in

Builders only. A builder is an account with `builder: true` (made with a builder code and a passkey, see [accounts.md](accounts.md#the-hidden-builder)) or an email on the optional allowlist, and they own `ws_wovi`. `Builder.builderFor(caller)` is the one check; every page runs `requireBuilder()` and answers `notFound()` to anyone else, so `/builder` does not exist for them. Every action runs `builderAction()`, which adds the origin, session and CSRF checks from phase 4. API keys never reach the builder.

Everything the builder saves lands in `ws_wovi`: agents through `GuardedAgents` (the same policy as any workspace edit), samples and board items as rows that carry the workspace id and the agent id, files under `.data/files/ws_wovi/`.

## Screens

| Path | What it is |
|---|---|
| `/builder` | The agents of `ws_wovi`: name, job, category, platforms, status, version, versions, last edited. Filter by status and category, search by name, id or job. "New agent". |
| `/builder/new` | Create by prompt: describe the agent, get a draft, open it in the editor. |
| `/builder/agents/[id]` | The editor: Spec, Samples, Mood board and JSON tabs; publish, back to draft, hide and unhide with a confirmation. Links to the bench and the versions. |
| `/builder/agents/[id]/bench` | The test bench with the tuning panel beside it. |
| `/builder/agents/[id]/versions` | Version history, compare (`?tab=compare`), rollback. |
| `/builder/batch` | Every sample of every live agent at once, with a summary table. |
| `/builder/clips` | The clip library: upload clips, see each one's status and cost, today's spend against the cap. |
| `/builder/clips/[id]` | One clip: the player, its text sample to edit, gold or bad, the agents it is a sample of, the cost of each call. |
| `/builder/clips/upload` | The upload route (POST, the raw clip as the body), streamed to disk. |
| `/builder/clips/[id]/video` | Streams a clip back to builders, with byte ranges. |
| `/builder/join` | The hidden join page (a code, a name, a passkey). |
| `/builder/files/[id]` | Serves an upload back to builders only. |

All `noindex`, none linked from the site. Wovi's poses carry the state: hello on empty lists, on the move while a draft is made or a bench runs, waiting when a form is valid and unchanged (or a bench was cancelled), done when a draft, a saveable version or a finished bench is ready.

## Create by prompt

`Builder.draft(caller, description)` calls the `SpecDrafter`, which has two layers:

1. **`templateDraft`** reads the description for the shape of the job and builds a complete spec from templates: the thing it makes (hooks, captions, a script, tags, trends, ideas, threads, carousels, replies, titles, a bio, a summary, a translation, repurposed versions, a storyboard, covers, a calendar, a check, or a plain draft), how many ("10 hooks"), for which platforms (none named means all four, with a platform choice in the form), what it starts from (an idea, a niche, a caption, a long piece, a video with transcription and `rights_confirmed`, a photo, a link), the tone words, the "no ..." and "always ..." rules, and a word cap. From that it picks the category, the inputs (the source, a platform choice when needed, a language for translations, a tone choice when the brief mentions tone, always a Brand Brain profile), the output shape, the Brand Brain parts, tools, guardrails, the model slot (fast for tags, strong for research, scripts, summaries and repurposing, standard otherwise) with a spend cap and output tokens sized to the output, and an instruction template that uses every required input and every declared Brand Brain part. It is deterministic and always passes the validator; the id is the slug of the name, made free of ids already in the workspace (`hook-writer-2`).
2. **`SpecDrafter.draft`** sends that template to a model through the phase 3 provider layer as the example to improve, with the description in a `<data>` block, the catalog lists and the rules. The answer is read as JSON, the fields the drafter owns are forced (`owner` platform, `status` draft, `version` 1.0.0, a free id), and the result goes through `validateAgentSpec`. If it does not pass, one repair message lists the problems; if the repair does not pass either, the template is used. Tokens and cost are counted per call. On the **fake provider** (the default without `OPENROUTER_API_KEY`) the answer is the template itself, so local work and tests are deterministic and free; `source` says `template`, `fake` or `model`.

The draft is not saved. "Open in the editor" calls `Builder.createAgent`, which saves it as a draft owned by `creator_wovi`.

## The editor

The Spec tab is a form for every field of the body, with the validator (`validateAgentBody`, run in the browser on every change) and its messages mapped to the fields by path (`inputs[2].limits.maxLength: ...`): a card at the top counts the problems, the section list on the left shows a count per section, each field shows its own message, and inputs with a problem get a Blaze border.

- Basics: name, job, category, platforms.
- Inputs: a list to add, reorder and remove; per input the label, key, type, required, help, and the limits that type takes (lengths, sizes, counts, accepted files, options with values and labels, min, max, step, defaults). Changing a type resets its limits to sensible ones.
- Output: the kind and its shape.
- Brand Brain: a toggle per part.
- Tools and guardrails: chips from the catalog with their descriptions.
- Model slot: shown to builders only. Route, fallback, temperature, spend cap per run, max output tokens.
- Instructions: the template, with a chip per input key and per declared Brand Brain part that inserts the placeholder at the cursor.
- Save: a patch bump from the header's Save button, or bump and note from the card at the bottom. Save is disabled until the spec is valid and changed. `Builder.saveAgent` goes through `GuardedAgents.update`, so every save is a new immutable version; a save that changes nothing is refused by the registry.

The JSON tab shows the body (without id and version) for power editing; "Apply to the form" parses it into the form state, where the same validation runs before a save.

Status actions open a confirmation: publish (live), back to draft, hide, unhide. The homepage and the engine already respect status (only public live agents show and run outside `ws_wovi`).

## Samples

`Sample`: `agentId`, the spec `version` it was written against, `label` (`gold` or `bad`), `title`, `inputs`, `idealOutput`, `note`, `links`, `files`, and, for a sample made from a clip, `clip` (the clip's id, name and first frame) and `updatedAt`. Both are optional: samples from before read unchanged. The inputs are checked with `validateRunInputs` against the agent's current form, so every sample can run; image inputs take uploaded images as file references. Text files (`.txt`, `.md`, `.csv`, `.json`, up to 2 MB) attach to a sample. Phase 6's test bench runs every new version against these.

Limits (`BUILDER_LIMITS`): 50 samples per agent, 20,000 characters of output, a 500-character note, 10 links, 6 files.

## Mood boards

`BoardItem`: per agent, `kind` (`image`, `link`, `text`, `swatch`), a short `note`, and the `url`, `text`, `color` (`#RRGGBB`) or `file` the kind needs. Images are PNG, JPEG, WebP or GIF up to 8 MB. 60 items per agent, a 300-character note, 2,000 characters per snippet.

The board reaches the engine as extra Brand Brain material. `boardBrandBrains(base, boards)` wraps any `BrandBrainSource`: the engine now passes the agent's identity to `get`, and for an agent with a board the items are appended to the user's parts: images, text and swatches to `mood_board`, links to `references`, each with its note. An instruction template reads them through the usual `{{brand.mood_board}}` and `{{brand.references}}`, so nothing new is needed in a spec; the user's own Brand Brain stays first. With no user Brand Brain at all, the board alone fills those parts. `localBrandBrains()` wires this for the local engine (`appRuns()`).

## Files

`FileStorage` has `put`, `get` and `delete`, each with the workspace id, and on disk also `putStream` (writes a file as its bytes arrive, under a size limit and a check of the first bytes, to a `.part` file renamed when done), `head` (the metadata without the bytes) and `pathOf`, so a file is only ever served back to its workspace. `localFileStorage(.data/files)` keeps one file plus one `.json` of metadata per upload under a folder per workspace; ids and workspace ids are pattern-checked before they touch a path. `checkFile(kind, file)` holds the limits as data (`FILE_LIMITS`: images, text and, for clips, `video`: MP4, MOV or WebM up to 200 MB). Uploads go through a server action (10 MB request limit in `next.config.ts`, the per-kind limits are stricter), and `/builder/files/[id]` serves them to builders with `nosniff`.

## The test bench (phase 6)

`Builder.bench` runs an agent version against its samples through the phase 3 engine, so the queue's concurrency, the retries and the spec's spend cap all apply, and a real model is used automatically once `OPENROUTER_API_KEY` is set (the fake provider until then). The bench only keeps the list of runs and what each was compared against; the runs themselves sit in the run store, in `ws_wovi`. Builders see what users never do: the model that answered, the tokens and the cost.

- **`bench.run(caller, agentId, { version?, sampleIds?, adhoc? })`** starts one engine run per chosen sample (every sample when none are named; at most 50), or one ad-hoc run from the agent's own form (`adhoc.inputs`, checked with `validateRunInputs`). It returns at once with the bench view; the screen polls **`bench.get`** every second. A sample whose inputs do not fit the chosen version (an input added later) is listed as `refused` with the engine's reason instead of being skipped silently; the same goes for a run the engine refuses up front, like one over its cap. The bench gives the confirmations the agent's own guardrails ask for (`rights_confirmed`, `voice_consent`), since the samples are the builder's own.
- **Brand Brain.** `bench.run(..., { brandBrainId })` runs every item with that Brand Brain of `ws_wovi` (phase 7); left out, the workspace default (or a sample's own profile input). The screen has a picker, and the bench view says which Brand Brain the runs used. `npm run brains:seed` adds three examples to pick from.
- **`bench.estimate`** says, before anything runs, how many runs fit the version and what they would cost: the first call on the main route per run, never above the cap, and the sum of the caps as the most it could be.
- **`bench.cancel`** cancels every run of the bench that has not ended (queued ones leave the queue, running ones abort). Cancelled runs count for nothing.
- A bench ends when its last run ends. The finisher is single-flight per bench, writes the scorecard into the spec first and flips the status after, so whoever sees "done" sees the score too. After a restart, a poll closes a bench whose runs have all ended, and the engine re-queues runs it left behind.

Each result shows: the produced output in its typed shape beside the sample's ideal output (or "what to avoid" for a bad sample); every guardrail with pass, fail or note and its reason; whether the answer parsed first time or needed a repair; the model, the time, the tokens and the cost; the auto score; and the builder's rating.

`WOVI_FAKE_LATENCY_MS` makes the fake provider take its time, so a running bench can be seen on a screen.

## Scoring

Two numbers, both plain arithmetic in `scoring.ts`:

- **Auto score** per run, 0 to 100: a succeeded run with every guardrail passing and an answer that parsed first time is 100; a repair costs 15, each failed guardrail 20; a failed run is 0; a cancelled run has none.
- **Rating** by the builder per run: good, ok or bad (100, 50, 0 as points) with an optional note. One rating per run; rating again replaces it. `bench.rate` takes a finished run of the named agent only.

The **scorecard** of a version rolls up every finished run of that version (benches, ad-hoc runs and batches alike): runs, pass rate (succeeded with no failed guardrail), average auto score, how many were rated and their average, average cost and time, and one **score**: the average of the auto score and the rating when any run is rated, else the auto score alone.

The current version's scorecard is written into the spec's quality fields (`score`, `runs`, `lastScoredAt`) through `AgentRegistry.setQuality`, a listing write: no version is made and "last edited" does not move. It is refreshed when a bench ends, after a rating, after a save (a new version starts unscored) and after a rollback (the version that is current again brings its own card).

## Tuning

The tuning panel beside the bench edits the instruction template, the model route and fallback, temperature, max output tokens and the spend cap, with the validator running on every change. **`bench.tune(caller, agentId, changes, { bump, note, rerun })`** saves the changes as a new version (through `saveAgent`, so the guarded registry and the no-change rule apply) and, with `rerun`, runs the chosen samples against the new version in the same call. "Save and re-run" on the screen is that one call; "Save only" leaves the bench alone.

## Versions

`Builder.versions`:

- **`history`**: every version, oldest first, with its note, who saved it (the registry now keeps `by` on each version; `GuardedAgents` fills it from the caller, seeds and scripts leave it null) as a display name, and its scorecard.
- **`compare(a, b)`**: both specs, both scorecards, and `specDiff`: every body field as lines of plain text (inputs one per line, the output shape in words, the model slot as five lines, the instructions as they are) with a line diff of a against b, so the screen shows what was added and removed field by field. Unchanged fields are listed too, side by side.
- **`rollback(version)`**: the phase 2 rollback (nothing created or deleted, the next save still goes above the newest version), then the quality fields refreshed. The screen asks first and says what goes live.

## Batch runs

`bench.planBatch(caller, agentIds?)` lists every live agent (or the given ones) with its sample count, how many fit, and the estimate and cap; `bench.runBatch` starts one bench per agent, all through the engine's queue, so the global and per-workspace limits hold and every run stays inside its agent's cap. At most 400 runs per batch. Above **$0.50** estimated (`BENCH_LIMITS.batchConfirmUsd`) the call refuses with `confirmation_required` until `confirmed` is passed; the screen shows the estimate and asks. The summary per agent: version, samples, done, pass rate, average auto score, guardrail fails, refused runs, cost and average time, with a link to that agent's bench. `bench.cancelBatch` cancels every bench of it.

## Quality (phase 12)

`/builder/agents/[id]/quality` rolls up, per version, what the quality gate and people said: which checks fail most, drafts that failed, the most common change requests, decisions and bench ratings. The quality bar and rewrites are set in Tuning on the bench. See [quality.md](quality.md).

## Live stats, canary releases and the audit log

`/builder/agents/[id]/stats`, beside Quality, shows the agent's live numbers per version from people's runs (used as is, edited and how much, run again, thumbs up, fits the format, quality, time, cost per run), the edits and notes people allowed builders to read, the release panel and the agent's audit log. `/builder/audit` is every agent's audit log.

Canary releases are behind `WOVI_CANARY` (off by default). Off, a save works as it always did: a live agent's new version reaches everyone at once, with no canary step and no gold-set gate in the way; the Stats page shows the numbers per version, the edits people allowed and the audit log, without the release panel. With `WOVI_CANARY=on`, a **live** agent's save from the editor or from Tuning no longer reaches everyone at once: the Save has a choice beside it, "Canary to 10% of live runs" by default (5, 25, 50, or bench only). The new version is written beside the current one, which keeps serving everyone else; the editor and the bench work on the canary from then on. On Stats it is compared with the current version side by side, its share and stop rules change, and it is published to everyone through the regression gate or rolled back in one click. A version rollback on the Versions page ends a running canary. Drafts save as before. See [stats.md](stats.md).

## Clip samples

Short clips (TikTok, Reels, Shorts) that worked become samples for the text agents. The agents read text, so a clip is useful as its words: the hook, what is said, the text on screen and what happens. A clip is uploaded, read in the background, and kept as a text sample the builder checks, marks gold or bad, and gives to agents. The code is in `src/lib/clips/`; the screens in `src/components/builder/ClipLibrary.tsx` and `ClipDetail.tsx`.

| File | What it holds |
|---|---|
| `types.ts` | `Clip`, `ClipCall`, `ClipText`, the text limits. |
| `config.ts` | The settings from the environment, the clip limits, the price table for estimates. |
| `store.ts` | `clips.json`: the `clips` and `calls` tables. |
| `media.ts` | ffmpeg: the probe, the sound as an MP3, a frame as a JPEG, the first-bytes check. |
| `provider.ts` | The two OpenRouter calls, and a fake provider. |
| `compose.ts` | The text sample from what the models read, the flags, and one clip as a sample of one agent. |
| `queue.ts` | `ClipQueue`: the background reader. |
| `library.ts` | `ClipLibrary`: upload, list, totals, edit, assign, retry, remove; builders only. |
| `local.ts`, `server.ts` | The process queue (started from `instrumentation.ts`) and the library on the local stores. |

### Upload

- MP4, MOV or WebM, up to 200 MB and 3 minutes each, as many at once as the builder drops or picks. Two upload at a time, each with its own progress bar.
- The browser checks the type, the size and (when it can read it) the length before a byte is sent, and shows the reason: "3:05 long; clips can be at most 3:00", "Not a clip WOVI reads", "210 MB; the limit is 200 MB".
- The server checks again. The clip is the raw body of `POST /builder/clips/upload` (with the CSRF token, the name, the size and the rights box in headers), streamed to disk with the 200 MB limit and the first bytes checked (an MP4 or MOV box, or the WebM magic), so it is never held whole in memory. ffmpeg reads its length at once, and a clip over 3 minutes or one ffmpeg cannot read is removed again with the reason.
- The rights box ("I own this, or I have the rights to use it here.") is required. It is kept on the clip with who and when, and in `safety.json` as a rights row (`subject: "clip_sample"`), like other uploads since phase 18.
- The library keeps at most 500 clips.

### Reading a clip

The queue (`ClipQueue`) reads clips in the background, two at a time (`WOVI_CLIP_CONCURRENCY`, at most 6), oldest first:

1. The probe (free): length, frame size (turned for portrait phone video) and whether there is sound.
2. The first frame (free), saved as a JPEG and shown as the clip's picture.
3. The spoken words: the sound as a mono 16 kHz MP3, sent as base64 `input_audio` to OpenRouter's `/audio/transcriptions` with `verbose_json`, so the answer has segments with start and end times. A model that gives no timestamps refuses `verbose_json` with a 400 (which costs nothing) and is asked again for plain text. A clip with no sound skips this call.
4. The frames: three JPEGs (half a second in, the middle, half a second before the end, at most 768 px) sent as `image_url` parts to a cheap vision model through `/chat/completions`, which answers in JSON: the on-screen text as written, one line on what happens, and a platform only when a watermark or the app layout shows it.
5. The text sample: the hook (the first spoken sentence, or the first on-screen line when nobody speaks), the transcript with `[m:ss]` stamps, the on-screen text one line each, the description, the length and a platform guess (from the frames, else vertical and under a minute reads as "TikTok, Reels or Shorts", landscape as X).

Each clip shows its status: In line, Reading, Waiting (the cap, or no key), Ready, or Failed with the reason and a Retry button.

**Retries.** A failure the same call would hit again (a 400, 401, 402, 403, a file ffmpeg cannot read) fails the clip at once. Anything else (a 429, a 5xx, a lost connection) is tried again after 30 s, 2 min and 8 min; after the fourth try the clip fails. Retry puts it back in line with the steps already done kept.

**Never paid twice.** Every model call is a row in `calls` with the id `<clip>:<step>:<attempt>`, written as `started` before it is sent and `done` (with OpenRouter's `usage.cost`, the generation id, the tokens or audio seconds, and the result) when it answers. A step with a done call is never sent again: a retry or a restart reads the result from the row. The insert refuses an id that exists, so a call is never counted twice.

**Restarts.** State lives in `clips.json`, not in memory. On start the queue puts clips left `reading` back in line (their done steps stay done), closes calls left `started` as failed and counts them at their estimate (the provider may have charged; this is the one call that can be sent again), and looks at waiting clips at once, so a raised cap or a new key takes effect. A worker holds a clip with a lease (10 minutes); another may take it once the lease runs out.

### Cost control

- Each call's cost is OpenRouter's own `usage.cost` (rounded up to the micro-dollar). When a provider gives none, the estimate is used and marked "(est.)".
- The library shows today's spend (UTC) against the cap, the total of every call, and the average cost of a minute of clip. Each clip shows its cost, and its page the cost of each call.
- **Daily cap**: `WOVI_CLIP_DAILY_CAP_USD` (default 5). Before every call, today's spend (done and failed calls at their cost, calls still out at their estimate) plus this call's estimate must fit under the cap. When it does not, nothing is sent and the clip waits until the next UTC day. Estimates are twice the list price, and a model not in the price table is estimated high, so the cap holds.
- **Off switch**: `WOVI_CLIP_SAMPLES=off` stops uploads and the queue. Clips already there stay and can be edited.
- With no `OPENROUTER_API_KEY`, clips upload, get their length and first frame, and wait. `WOVI_CLIP_PROVIDER=fake` reads them with the fake provider for local work.

Measured on 2026-10-23 (three clips of 5 to 7 seconds, read twice): the transcript cost about $0.00001 to $0.00002 a clip ($0.0002 a minute of speech; one call was billed $0.00011, a provider's minimum), the frames $0.00003 to $0.00013 a clip whatever its length. A 30-second clip comes to about $0.0002, so a hundred clips cost a few cents.

### Settings

| Variable | Default | What it does |
|---|---|---|
| `WOVI_CLIP_SAMPLES` | on | `off` turns clip samples off. |
| `WOVI_CLIP_TRANSCRIBE_MODEL` | `openai/whisper-large-v3-turbo` | The speech-to-text model on `/audio/transcriptions`. The cheapest that transcribes well on OpenRouter's list on 2026-10-23 ($0.0002 a minute, segment timestamps). |
| `WOVI_CLIP_VISION_MODEL` | `google/gemini-2.5-flash-lite` | The model that reads the three frames ($0.10 per million tokens in, $0.40 out). |
| `WOVI_CLIP_DAILY_CAP_USD` | 5 | The most clip reading spends per UTC day. |
| `WOVI_CLIP_CONCURRENCY` | 2 | Clips read at once, 1 to 6. |
| `WOVI_CLIP_PROVIDER` | (none) | `fake` reads clips with the fake provider, for local work only. |
| `WOVI_FFMPEG_PATH` | (none) | An ffmpeg binary to use instead of the bundled one. |

ffmpeg comes from the `@ffmpeg-installer/ffmpeg` dependency, which carries a static binary per platform (linux x64 and macOS among them) in its optional packages, so the server needs no system ffmpeg. It is listed in `serverExternalPackages` so the binary stays in `node_modules`. If a build skips install scripts, the binary is made runnable on first use. Work files (the MP3 and the frames) go to `WOVI_DATA_DIR/tmp/clips/<clip>/` and are removed after each read. Clips are kept under `WOVI_DATA_DIR/files/ws_wovi/`, so the volume needs room for them (a hundred phone clips are typically 1 to 3 GB).

### Safety

- The transcript and the on-screen text are data, never instructions. The frames prompt says text in a frame is copied, never followed; no tools are sent; the answer is read into fixed, capped fields. When the text reaches an agent as a sample's inputs, the engine puts it in `<data>` blocks like any input (phase 3 and phase 18).
- The content rules (phase 18) and the prompt injection signals read the text of every clip, as a request and as an output. A finding is a flag on the clip and its card ("Flagged", with the rule and the words), never a reason not to store it. A bench run of a flagged sample is refused by the content rules like any request.

### The sample it becomes

"Use as a sample" gives a ready clip to any agents picked. For each one the clip becomes a normal `Sample` (so the test bench runs it with every new version and the quality gate's reference anchoring reads it like any golden or bad sample):

- **Inputs** fit the agent's current form: free text from the clip by input (`idea`, `topic` and `niche` get what happens and the hook; `post` gets that plus the words and the on-screen text; `caption` the hook and the on-screen text; `source` the words), a platform choice from the clip's guess (TikTok when unknown), a script length from the clip's length, other required choices at their defaults. The form check runs as for any sample; an agent whose form does not fit is listed with the reason.
- **Ideal output** in the shape the launch samples use: Hook Writer gets the hook and the on-screen lines; Script Writer the stamped transcript and what is on screen; Caption Writer the on-screen text for the platform; Platform Repurposer the `Hook:`, `Script:`, `On screen:`, `Caption:` layout; Hashtag Optimizer the hashtags in the clip; Idea Generator and Trend Scout the idea and the format.
- The clip's label (gold or bad), title and note.

An edit on the clip page (any text field, the label, the title, the note) is saved as the builder's own: a later read never overwrites it, the flags are read again, and every sample made from the clip is rewritten in place (same id, author and creation time). Removing a clip removes its video, its first frame and its samples; what it cost stays in the totals.

### Data

Nothing stored before clips is migrated or rewritten. Clips and calls live in their own file, `clips.json`, created on the first upload; the new `Sample` fields and the `clip_sample` rights subject are optional. `src/lib/clips/phase17-clips.test.ts` loads the phase 17 data dir and checks that reading it changes no file and creates no `clips.json`, that every existing sample reads with no clip, that a clip given to all seven launch agents leaves every earlier sample and every other data file byte for byte the same, and that a restart reads the same state back.

### Tests

`src/lib/clips/clips.test.ts` (fake ffmpeg, fake provider, a clock the test moves): the file limits, streaming in chunks with no part file left after a refusal, the first-bytes check, the rights box kept with a time, refusals for too long, too big and wrong type, builders only, the off switch; a clip read into its text sample with the first frame and the cost of each call, no transcription call for a silent clip, two at a time, backoff after a passing failure with the done step not paid again, failing at once on a repeating failure and after four tries otherwise, a broken file failing with no call, the daily cap (waiting with nothing sent, going on the next UTC day, a cap of zero, calls still out counted at their estimate), no key, a restart with a done call reused and a lost call counted, an expired lease; the text sample, every launch agent's form filled from a clip, assigning, edits reaching the samples and the quality references, unassigning and removing; the flags; and the OpenRouter calls on a stubbed fetch (the transcription body, the plain-text fallback, the frames body with no tools, usage.cost, which failures repeat). `media.test.ts` runs the bundled ffmpeg on a real two-second clip.

### The real check and the screenshots

```
# three short clips made locally: speech from macOS say, a coloured video with the text drawn by ffmpeg
export WOVI_DATA_DIR=$PWD/.data/clip-screens
OPENROUTER_API_KEY= npm run agents:launch
npm run build
OPENROUTER_API_KEY=... WOVI_CLIP_DAILY_CAP_USD=0.10 npm start
CLIPS_DIR=/path/to/clips OPENROUTER_API_KEY= node scripts/clip-screens.mjs ~/WOVI-clip-screens
```

`CLIPS_DIR` holds `croissant-three-days.mp4`, `plumber-fat-in-the-sink.mp4`, `first-squat-chair.mp4`, `too-long-clip.mp4` (over three minutes) and `notes.txt`. The script joins as a builder, uploads through the page's own file input with the upload slowed so the progress shows, and takes the upload, the status while clips are read, the ready library, a clip sample, the agents it was given to, its cost, and the sample on the agent, at 1440x900 and 390x844.

## Commands

- `npm run builder:code` makes a builder code; `-- --list`, `-- --revoke <id>`, `-- --label <text>`.
- `npm run agents:seed` puts the eight launch agents into `ws_wovi` so the builder has something to show.
- `npm run builder:samples` adds example golden and bad samples to the launch agents, so the bench has something to run. Safe to run again.
- `npm run agents:launch` installs the phase 8 launch set (the seven launch specs as new versions, 35 samples, seven Brand Brains) and `-- --bench` runs it all once as a batch on the fake provider. See [launch-agents.md](launch-agents.md).
- `node scripts/clip-screens.mjs [outDir]` takes the clip screenshots (see [Clip samples](#clip-samples)); `ONLY=detail` shoots the clip pages again without uploading.
- `node scripts/builder-screens.mjs [outDir]` takes the part 1 screenshots and `node scripts/builder2-screens.mjs [outDir]` the part 2 ones, each against a running build, joining through the real join page with Chrome's virtual authenticator. Start the server with `WOVI_FAKE_LATENCY_MS=2500` for the second.
- `npm test` covers the code lifecycle, the passkey-only join, the builder-only guard on every call, the drafter on a range of descriptions, saves as new versions, sample and board limits, the board in the prompt, bench runs on the fake provider, refused samples, ad-hoc runs, cancel, the auto score and scorecard math, quality written without a version, tuning saves that re-run, the version diff, rollback, batch plans, the confirmation threshold, spend caps, the queue's concurrency, and that everything stays in `ws_wovi`.

## Not yet

Conversational tuning (describe a change in plain words and get a proposed instruction edit) and an LLM judge beside the deterministic checks come with the quality gates in phase 12. Real model calls happen only when `OPENROUTER_API_KEY` is set; nothing here makes one by default.

Clip samples read three frames, so on-screen text shown only between them is missed (the builder adds it by hand); speaker labels are not asked for; a clip is read once (an edit is the way to change its text); and the cost per call is OpenRouter's figure, not a reconciliation with the invoice.
