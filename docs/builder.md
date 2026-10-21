# The Agent Builder, part 1 (phase 5)

The hidden tool where WOVI's own agents are made: described in a sentence, drafted as a full spec, shaped in an editor, given golden samples and a mood board, and published. Every preset agent goes through it, under the platform's creator account, the same way a creator's agent will later. Part 2 (phase 6) adds conversational tuning, the test bench, version compare and rollback.

The code lives in `src/lib/builder/`; the screens in `src/app/builder/` and `src/components/builder/`.

| File | What it holds |
|---|---|
| `builder.ts` | `Builder`: every call, scoped to `ws_wovi`, open only to builders. Agents, drafting, samples, the board, files. |
| `drafter.ts` | `templateDraft` (deterministic, no model) and `SpecDrafter` (the provider layer on top of it). |
| `storage.ts` | `FileStorage`: the interface, a memory store, the local folder store, the file limits. |
| `types.ts` | `Sample`, `BoardItem`, `BUILDER_LIMITS`. |
| `store.ts` | The builder's tables (samples, board items) on the shared `Collection` interface. |
| `board-brain.ts` | The mood board as an extra Brand Brain source for the engine. |
| `local.ts` | `localBuilder`, `localDrafter`, `localBrandBrains` on `.data/`. |
| `server.ts` | `requireBuilder` (404 for everyone else), `builderAction`, `appBuilder`. |

## Who gets in

Builders only. A builder is an account with `builder: true` (made with a builder code and a passkey, see [accounts.md](accounts.md#the-hidden-builder)) or an email on the optional allowlist, and they own `ws_wovi`. `Builder.builderFor(caller)` is the one check; every page runs `requireBuilder()` and answers `notFound()` to anyone else, so `/builder` does not exist for them. Every action runs `builderAction()`, which adds the origin, session and CSRF checks from phase 4. API keys never reach the builder.

Everything the builder saves lands in `ws_wovi`: agents through `GuardedAgents` (the same policy as any workspace edit), samples and board items as rows that carry the workspace id and the agent id, files under `.data/files/ws_wovi/`.

## Screens

| Path | What it is |
|---|---|
| `/builder` | The agents of `ws_wovi`: name, job, category, platforms, status, version, versions, last edited. Filter by status and category, search by name, id or job. "New agent". |
| `/builder/new` | Create by prompt: describe the agent, get a draft, open it in the editor. |
| `/builder/agents/[id]` | The editor: Spec, Samples, Mood board and JSON tabs; publish, back to draft, hide and unhide with a confirmation. |
| `/builder/join` | The hidden join page (a code, a name, a passkey). |
| `/builder/files/[id]` | Serves an upload back to builders only. |

All `noindex`, none linked from the site. Wovi's poses carry the state: hello on empty lists, on the move while a draft is made, waiting when the form is valid and unchanged, done when a draft or a saveable version is ready.

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

`Sample`: `agentId`, the spec `version` it was written against, `label` (`gold` or `bad`), `title`, `inputs`, `idealOutput`, `note`, `links`, `files`. The inputs are checked with `validateRunInputs` against the agent's current form, so every sample can run; image inputs take uploaded images as file references. Text files (`.txt`, `.md`, `.csv`, `.json`, up to 2 MB) attach to a sample. Phase 6's test bench runs every new version against these.

Limits (`BUILDER_LIMITS`): 50 samples per agent, 20,000 characters of output, a 500-character note, 10 links, 6 files.

## Mood boards

`BoardItem`: per agent, `kind` (`image`, `link`, `text`, `swatch`), a short `note`, and the `url`, `text`, `color` (`#RRGGBB`) or `file` the kind needs. Images are PNG, JPEG, WebP or GIF up to 8 MB. 60 items per agent, a 300-character note, 2,000 characters per snippet.

The board reaches the engine as extra Brand Brain material. `boardBrandBrains(base, boards)` wraps any `BrandBrainSource`: the engine now passes the agent's identity to `get`, and for an agent with a board the items are appended to the user's parts: images, text and swatches to `mood_board`, links to `references`, each with its note. An instruction template reads them through the usual `{{brand.mood_board}}` and `{{brand.references}}`, so nothing new is needed in a spec; the user's own Brand Brain stays first. With no user Brand Brain at all, the board alone fills those parts. `localBrandBrains()` wires this for the local engine (`appRuns()`).

## Files

`FileStorage` has `put`, `get` and `delete`, each with the workspace id, so a file is only ever served back to its workspace. `localFileStorage(.data/files)` keeps one file plus one `.json` of metadata per upload under a folder per workspace; ids and workspace ids are pattern-checked before they touch a path. `checkFile(kind, file)` holds the limits as data. Uploads go through a server action (10 MB request limit in `next.config.ts`, the per-kind limits are stricter), and `/builder/files/[id]` serves them to builders with `nosniff`.

## Commands

- `npm run builder:code` makes a builder code; `-- --list`, `-- --revoke <id>`, `-- --label <text>`.
- `npm run agents:seed` puts the eight launch agents into `ws_wovi` so the builder has something to show.
- `node scripts/builder-screens.mjs [outDir]` takes the builder screenshots against a running build, joining through the real join page with Chrome's virtual authenticator.
- `npm test` covers the code lifecycle, the passkey-only join, the builder-only guard, the drafter on a range of descriptions, saves as new versions, sample and board limits, the board in the prompt, and that everything stays in `ws_wovi`.

## Not in this phase

Conversational tuning, the test bench, version compare and rollback from the screen (phase 6). Real model calls for drafting happen only when `OPENROUTER_API_KEY` is set; nothing in this phase makes one by default.
