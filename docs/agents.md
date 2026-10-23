# Agents: the spec and the registry (phase 2)

Every WOVI agent, ours or a creator's, is one **spec**: data, not code. The run engine, the web form, MCP, the API and agent-to-agent calls all read the same spec, so a new agent works everywhere without a deploy. The code lives in `src/lib/agents/`.

| File | What it holds |
|---|---|
| `catalog.ts` | The fixed lists a spec may name: model routes, tools, guardrails, Brand Brain parts, platforms, categories. Data only. |
| `spec.ts` | The `AgentSpec` type, the zod validator, `validateAgentSpec`, `publicView`. |
| `template.ts` | Reads `{{placeholders}}` out of an instruction template. |
| `semver.ts` | Version compare and bump. |
| `store.ts` | The `AgentStore` interface, an in-memory store and the JSON file store. |
| `registry.ts` | `AgentRegistry`: create, update, get, list, versions, rollback, status, hide. |
| `seeds.ts` | The eight launch agents, owned by the platform creator account. |

## The spec

A spec has two halves. The **body** defines what the agent does; every change to it is a new version. The **listing** (owner, status, visibility, quality) sits beside it, so hiding an agent or updating its score never makes a new version.

### Body (versioned)

| Field | Meaning |
|---|---|
| `id` | Slug, like `hook-writer`. Unique per workspace, never changes. |
| `version` | Semver `MAJOR.MINOR.PATCH`. Patch for tweaks, minor for new optional fields, major for output changes that could break a pipeline. |
| `name` | Display name, up to 40 characters. |
| `job` | The one job, in one line. |
| `category` | `research`, `ideation`, `writing`, `production`, `optimization` or `publish`. |
| `platforms` | Any of `x`, `tiktok`, `shorts`, `reels`. |
| `inputs` | The form the user fills in, so nobody writes a prompt. Each has `key` (snake_case), `label`, `type`, `required`, optional `help`, and limits for its type (below). |
| `output` | What one run returns: its `kind` and shape (below). |
| `brandBrain` | Which parts of the user's Brand Brain it reads: `voice`, `mood_board`, `references`, `dos_donts`, `idea`. |
| `tools` | The tools it may call. Only tools in the catalog exist; naming any other makes the spec invalid. |
| `guardrails` | Named rules from the catalog, such as `no_misleading_claims`, `brand_voice_check`, `banned_phrases`, `rights_confirmed`, `voice_consent`. |
| `routing` | Hidden from users. `model` and `fallback` name model routes from the catalog (same modality, not the same route), optional `temperature` and `maxOutputTokens`, and `maxCostUsd`, the hard spend cap for one run (at most 10). |
| `instructions` | The template the engine fills in. `{{key}}` is a run input, `{{brand.part}}` a Brand Brain part. |
| `gate` | Optional (phase 12). The quality bar a result must reach to be ready (`minScore`, 40 to 95) and how many rewrites the engine runs below it (`maxRewrites`, 0 to 2). Left out, the category's defaults apply. See [quality.md](quality.md). |

Input types and their limits:

| Type | Limits |
|---|---|
| `text`, `long_text` | `maxLength` (2000 and 20000 at most), optional `minLength` |
| `url` | none |
| `file` | `maxSizeMb`, `maxFiles`, `accept` (MIME types or extensions) |
| `image` | `maxSizeMb`, `maxFiles` |
| `video` | `maxSizeMb`, `maxFiles`, `maxSeconds` |
| `choice` | `options` (at least 2), `multiple`, optional `default` |
| `number` | `min`, `max`, optional `step` and `default` |
| `profile` | none; picks one of the workspace's Brand Brains |

Output kinds: `text` (maxWords), `list` (count, optional maxWordsPerItem, optional `fields` for structured items), `script` (maxSeconds, sections), `caption_set` (platforms, variants, maxChars), `post_set` (formats like thread, carousel, short with counts), `image` (count, aspect), `storyboard` (maxFrames, withImages, aspect), `video` (maxSeconds, aspect).

### Listing (not versioned)

| Field | Meaning |
|---|---|
| `owner` | `{ kind: "platform" or "creator", creatorId }`. Our own agents use the platform creator account `creator_wovi`. |
| `status` | `draft`, `live` or `hidden` (built and kept, but not shown until its drop). |
| `visibility` | `public` (in the gallery once live) or `workspace` (only the owner's workspace). |
| `quality` | `score` (0 to 100 or null), `runs`, `lastScoredAt`. Written by the builder's scorecard for the current version ([builder.md](builder.md#scoring)); never by a save. |

### Rules the validator enforces

- Every placeholder in `instructions` is a declared input key, or a Brand Brain part listed in `brandBrain`.
- Every required input appears in `instructions`. Optional inputs may be left out.
- Input keys are unique; choice defaults are real options; number defaults sit inside min and max.
- Tools, guardrails and model routes exist in the catalog.
- Unknown fields are rejected, so a typo never passes silently.

Errors read like `tools[0]: Unknown tool "web_scrape". Allowed tools: trend_lookup, ...`.

`publicView(spec)` drops `routing` and `instructions`. Anything a user, MCP client or API caller sees goes through it.

### Model routes

The spec never names a provider. It names a route like `text-standard`, and `MODEL_ROUTES` in `catalog.ts` maps each route to a provider and model. Phase 3 filled the text routes with OpenRouter model ids (see [engine.md](engine.md#models-owners-choice)); swapping a model is a one-line change in that file plus a price row in `src/lib/runs/prices.ts`, and no agent changes.

## The registry

```ts
import { localRegistry } from "@/lib/agents";
const agents = localRegistry(); // JSON store in .data/agents.json
```

Every call takes a workspace id first, and every stored row carries it. One workspace never sees another's agents. Since phase 4 the web app, MCP and the API reach the registry only through `GuardedAgents`, which names the caller on every call and checks their role in that workspace ([accounts.md](accounts.md#the-registry-and-engine-behind-the-policy)).

| Call | What it does |
|---|---|
| `create(ws, spec, { note, by })` | Validates and saves version one. Quality always starts empty. `by` is who saved it (a user id; `GuardedAgents` fills it in, seeds leave it null). |
| `update(ws, id, changes, { bump, note, by })` | Merges the changed body fields onto the current version, validates, and saves a new immutable version that becomes current. The version is the one in `changes` (must be higher than every existing version) or the highest one bumped (patch by default). A save that changes nothing is refused. |
| `get(ws, id, version?)` | The current version, or a given one. `null` if missing. |
| `list(ws, { owner, status, category, visibility })` | Current versions, sorted by id. `status` takes one value or a list. |
| `versions(ws, id)` | Every version, oldest first, with its note, who saved it, and which one is current. |
| `setQuality(ws, id, quality)` | Writes the quality fields on the listing. No version is made and `updatedAt` stays: a score is not an edit. |
| `rows(ws)` | The listing rows with `createdAt` and `updatedAt`, for the builder's list. |
| `rollback(ws, id, version)` | Makes an existing version current again. Nothing is created or deleted, so semver stays honest; the next save still goes above the highest version. |
| `setStatus(ws, id, "draft" or "live")` | Publishes a draft, or takes it back. |
| `hide(ws, id)`, `unhide(ws, id)` | Hidden keeps the agent but takes it out of view. Unhide returns it to the status it had, or `live` if it was created hidden. |

Every failure is a `RegistryError` with a `code` (`invalid_spec`, `invalid_workspace`, `not_found`, `already_exists`, `version_conflict`, `no_change`) and, for invalid specs, the list of `issues`.

The store sits behind the `AgentStore` interface (five methods). `memoryStore()` is for tests, `jsonFileStore(file)` for local work. A Postgres store implements the same interface; nothing else changes.

## Seeds

`npm run agents:seed` puts the eight launch agents into the platform workspace `ws_wovi`, owned by `creator_wovi`: Hook Writer, Caption Writer, Trend Scout, Script Writer, Hashtag Picker and Repurposer live; Storyboarder and Voice and Cut hidden until their drop. Running it again is safe: missing agents are created, a seed with a higher version is saved as a new version, the rest are left alone.

These seeds match the homepage cards (a test checks it). The doc's MVP lineup, with Idea Generator added, Hashtag Optimizer and Platform Repurposer renamed and Trend Scout back to draft, is saved on top of them as new versions by `npm run agents:launch` (phase 8, [launch-agents.md](launch-agents.md)).

## How the run engine uses this

The run engine (phase 3, [engine.md](engine.md)) takes a workspace, an agent id (and a pinned version or the current one) and the user's form values. It loads the exact version with `registry.get`, checks the values against `inputs`, fills `instructions` with the inputs and the declared `brandBrain` parts as delimited data, routes `routing.model` (then `routing.fallback`) through `MODEL_ROUTES` within `maxCostUsd`, parses the answer into `output`, and runs the `guardrails`. Declared `tools` are not called yet.

Pipelines pin `agentId@version`, which `get(ws, id, version)` serves even after later saves or a rollback.

## Commands

- `npm test` runs the vitest suite.
- `npm run agents:seed` seeds the local store. Data lives in `.data/` (git-ignored); set `WOVI_DATA_DIR` to put it elsewhere.
- `npm run agents:try -- <agent-id>` runs a launch agent end to end on the fake provider.
- `npm run agents:launch` installs the phase 8 launch set: specs, golden samples and Brand Brains ([launch-agents.md](launch-agents.md)).

## Safety field (phase 18)

`safety` is an optional body field: `{ "block": ["Crumbly Bakes"] }`, up to 30 phrases of 2 to 60 characters. The agent refuses requests that name them and keeps them out of its drafts, on top of the platform's content rules. Specs saved before phase 18 have none and read unchanged. `publicView` leaves it out. See [safety.md](safety.md).
