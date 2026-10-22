# The REST API and webhooks (phase 14)

From the product doc: power users want "the agents with my Claude or ChatGPT", "a public REST API, SDKs, webhooks, and API keys per workspace", and "the agent in my swarm". The same spec is "a web form, an MCP tool, a REST endpoint and an agent-to-agent call. One definition, four ways in."

This phase opens the engine to software: a versioned JSON API under `/api/v1`, webhooks, and the MCP server ([mcp.md](mcp.md)). Both sit on the same layers as the app: the guarded registry and engine (phase 4), Brand Brains (7), pipelines (10), review (11), the quality gate (12) and credits (13). A run started with a key is checked, held, gated, charged, listed in History and reviewed exactly like one started on a screen. Nothing here calls a real model, sends a real request or spends money: tests and screenshots use the fake provider, the test payment provider and the dev webhook sender.

The code lives in `src/lib/api/` and `src/lib/webhooks/`.

| File | What it holds |
|---|---|
| `api/service.ts` | `PublicApi`: everything a key may do, for REST and MCP alike. Always the key's own workspace. |
| `api/routes.ts` | The route table: method, path, body, response, the call it makes. Served by the router, read by the OpenAPI generator. |
| `api/rest.ts` | `RestApi.handle(Request)`: the key, rate limits, body size, the route, one error shape. |
| `api/schemas.ts` | The zod schemas for every body and every response. |
| `api/views.ts` | What comes back, built field by field from the public views. Each agent's inputs as JSON Schema. |
| `api/errors.ts` | `ApiError`, the codes and their HTTP statuses, and the mapping from every layer's errors. |
| `api/limits.ts` | The limits and the in-memory window counter. |
| `api/openapi.ts` | The OpenAPI 3.1 document, generated from the routes and the schemas. |
| `api/events.ts` | Engine events to webhooks. |
| `api/snippets.ts` | The copy-and-paste snippets the pages show, with a placeholder key. |
| `api/server.ts` | One of each per server process, on the app's own services. |
| `webhooks/webhooks.ts` | `Webhooks`: endpoints, dispatch, signed deliveries, retries with backoff, the log. |
| `webhooks/sender.ts` | The `WebhookSender` interface: the dev sender, a memory sender for tests, the HTTP sender, URL checks. |
| `webhooks/signing.ts` | Signatures, verifying them, and sealing secrets at rest. |
| `webhooks/store.ts`, `types.ts` | Two tables (`.data/webhooks.json`): `endpoints`, `deliveries`. |

Routes: `src/app/api/v1/[[...path]]/route.ts` and `src/app/mcp/route.ts`, each one line into the code above.

## Keys

The phase 4 API keys. Owners and admins make them on **Settings, API and assistants** (`/app/settings/api`), name them and pick a role; the key is shown once and stored as sha256 only.

- `Authorization: Bearer wovi_sk_...` on every request. The hash is looked up and compared in constant time.
- A key works in one workspace, with the lower of its own role and its maker's current role. It stops when it is revoked or its maker leaves.
- Viewer keys read. Editor keys also run agents and pipelines, pick and stop. Admin keys also see charges and manage webhooks.
- **Never for keys**, whatever the role: approve, reject or ask for changes (phase 11), top up or change limits (phase 13), make keys, add people. Those routes exist only to answer `forbidden` through the same guards.
- Another workspace's ids, keys or webhooks always answer `not_found`.
- Keys are never logged. The only log line is an internal error's request id and message.

## Endpoints

All JSON, under `/api/v1`. Lists come back as `{ "data": [...] }`.

| Method | Path | What it does |
|---|---|---|
| GET | `/me` | The key's workspace, role and limits. |
| GET | `/agents` | The agents the workspace can run: name, job, form (with `inputSchema` as JSON Schema), output shape, the quality bar and public scorecard, and about what a run costs. Never instructions or models. |
| GET | `/agents/{id}` | One agent. |
| POST | `/agents/{id}/runs` | Starts a run. `202` with the run and a `Location`. |
| GET | `/runs` | Runs, newest first. `limit`, `status`, `agent`. Pipeline step runs stay inside their pipeline. |
| GET | `/runs/{id}` | Status, the output in its typed shape, `ready`, quality (score, bar, verdict, reasons, each check), failed checks, the charge, a person's decision. |
| POST | `/runs/{id}/cancel` | Stops it; everything held comes back. |
| GET | `/pipelines` | The pipelines the workspace can start, with their form, chain and estimate. |
| POST | `/pipelines/{id}/runs` | Starts a pipeline run. `202`. |
| GET | `/pipeline-runs` | Pipeline runs, newest first. `limit`, `pipeline`. |
| GET | `/pipeline-runs/{id}` | Every step, `waiting` with the options when a step asks for a pick, the package at the end. |
| POST | `/pipeline-runs/{id}/pick` | `{ "step"?, "index" }`: picks option `index` (from 0) where the run waits. |
| POST | `/pipeline-runs/{id}/cancel` | Stops it. |
| GET | `/brand-brains` | The workspace's Brand Brains. Read only. |
| GET | `/credits` | Available, held, this month's use and limit of the key's maker. Read only. |
| GET, POST | `/webhooks` | List, or register `{ url, events, description? }`. The answer to POST carries the secret once. Admin keys. |
| GET, DELETE | `/webhooks/{id}` | One webhook, or remove it. |
| GET | `/webhooks/{id}/deliveries` | The delivery log, newest first. |
| POST | `/webhooks/{id}/test` | Sends a ping now. |
| GET | `/openapi.json` | The OpenAPI document. No key needed. |

Without a key, the two starts (`POST /agents/{id}/runs`, `POST /pipelines/{id}/runs`) also take x402 payments once the owner switches it on: a 402 with the price, then X-PAYMENT. See [x402.md](x402.md). With x402 off they answer 401, as above.

### Starting a run

```
POST /api/v1/agents/hook-writer/runs
Authorization: Bearer wovi_sk_...
Idempotency-Key: hooks-2026-10-22

{ "inputs": { "idea": "...", "platform": "tiktok" }, "brandBrainId": "bb_...", "idea": "...", "confirmations": { "rights": true }, "maxCredits": 4 }
```

- `inputs` are checked against the agent's form by the engine's own `validateRunInputs`. Unknown body fields are refused.
- The Brand Brain is `brandBrainId`, else the one the agent's profile input names, else the workspace default.
- Credits: the run holds its estimate (or `maxCredits` when lower) and is charged what it used, never more, exactly like the app. Not enough credits answers `402 not_enough_credits` before anything is queued.
- **Idempotency:** the same `Idempotency-Key` and body return the first run, also when two requests race; the same key with another body is `409 idempotency_conflict`. Keys are per workspace, 1 to 100 of `A-Z a-z 0-9 _ . : -`.
- Pipelines take `brandBrainId` too; it fills the pipeline's Brand Brain input.

## Errors

One shape for every error, REST and MCP:

```json
{ "error": { "code": "invalid_input", "message": "Some inputs need a look.", "issues": [{ "path": "inputs.idea", "message": "Must be at least 10 characters (got 4)." }] } }
```

| Code | Status | When |
|---|---|---|
| `unauthenticated` | 401 | No key, or a revoked or unknown one. |
| `forbidden` | 403 | The role may not do it. Always for approve, reject, top-up and limits. |
| `not_found` | 404 | Nothing with that id in the key's workspace. |
| `invalid_input` | 422 | Fields need a look; each issue has a path: `inputs.idea`, `brandBrainId`, `confirmations`, `index`, `url`, `events.0`, `body`. |
| `invalid_request` | 400 | Not JSON, or not possible as asked. |
| `not_enough_credits`, `over_limit` | 402 | Nothing was started. |
| `idempotency_conflict`, `not_ready` | 409 | A reused key with another body; a pick when nothing waits. |
| `rate_limited` | 429 | With `Retry-After` and `retryAfter`. |
| `payload_too_large` | 413 | Over the body limit. |
| `method_not_allowed` | 405 | With `Allow`. |
| `internal_error` | 500 | No detail, never a key; the request id is logged. |

The layers below (accounts, engine, pipelines, Brand Brains, review, webhooks) keep their own errors; `toApiError` maps them by class name, because Next.js bundles each route with its own copy of the classes while the services are shared per process.

## Limits

| Limit | Default |
|---|---|
| Requests per key | 120 a minute |
| Requests per workspace, all keys | 300 a minute |
| Run and pipeline starts per key | 30 a minute |
| Unknown keys per address | 20 a minute |
| Body | 128 KB |

Every answer carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` for the key. The counters are fixed windows in memory, one set per server process; with more than one server they move to Redis behind the same class. MCP counts the same way.

## Webhooks

A workspace registers up to 10 URLs, each for some of:

| Event | When | `data` |
|---|---|---|
| `run.finished` | A run started from the app or the API succeeded, failed or was stopped. Pipeline step runs send nothing on their own. | `run`, as `GET /runs/{id}` shows it |
| `pipeline.waiting` | A step waits for a person to pick. | `pipelineRun`, with `waiting` |
| `pipeline.finished` | Ready for approval, failed or stopped. | `pipelineRun` |
| `ping` | A test, from the page or `POST /webhooks/{id}/test`. | `message` |

Every delivery is a POST with the body `{ id, type, createdAt, workspaceId, data }` and these headers:

- `Wovi-Signature: t=<unix seconds>,v1=<hex>`: HMAC-SHA256 of `<t>.<body>` with the endpoint's secret. Check it in constant time and refuse a `t` more than five minutes off (`verifySignature` in `signing.ts`; a Node snippet is on the webhooks page and in the reference).
- `Wovi-Event`, `Wovi-Delivery`, `User-Agent: WOVI-Webhooks/1.0`.

Rules:

- **Secrets** are `whsec_...`, shown once (at creation and on "New secret"), and stored sealed with AES-256-GCM under a key made from the server secret, since they must be read back to sign.
- **Once per endpoint:** a delivery's id is made from the endpoint and the event, so an event reported twice (a restart, a second save) lands once. The event id is the same for every endpoint; receivers dedupe on it.
- **Retries:** any 2xx counts as delivered. Anything else, or no answer, is tried again after 10 s, 1 min, 5 min, 30 min and 2 h, six tries in all, each signed again. Every try is in the log with its status, time, error and sender. Pending tries left by a previous process run on the next start.
- **Who:** managing webhooks is the new `manage_webhooks` action: owners, admins and admin keys. An endpoint stops getting deliveries when its maker can no longer manage webhooks there. Endpoints can be paused.
- **URLs:** `https://` only, no user name or password, no `#`. Plain `http://localhost` works while the app runs on this machine. Off this machine, addresses inside a network (10.x, 192.168.x, 172.16 to 31, 169.254.x, `.local`, `.internal`, names with no dot) are refused at registration and again before each send.
- **Senders:** everything goes through `WebhookSender`. While the app runs locally that is the **dev sender**: it logs each delivery and writes it to `.data/webhooks/`, opens no connection, and the log says "Logged on this machine, not sent". Off localhost (or `WOVI_WEBHOOK_SENDER=http`) the HTTP sender posts with a 10 second timeout and no redirects. Tests use a memory sender.

The engines tell webhooks about events through two small hooks added for this phase: `RunEngine.onFinished(listener)` and `PipelineEngine.onSettled(listener)`. `appApi()` wires them on first use, so runs started on the screens send `run.finished` too.

## The OpenAPI document

`GET /api/v1/openapi.json` (no key) is OpenAPI 3.1, generated by `openApiDocument(appUrl)` from the route table and the same zod schemas the API checks bodies with and the tests parse responses with: every path and operation id, parameters with the `Idempotency-Key` header, request bodies and responses as `$ref`s to named components (`Run`, `Agent`, `PipelineRun`, `StartRunBody`, `Error`, `ListAgentsResponse`, ...), the bearer scheme, the error codes, and the three webhook events with their headers. The forbidden-only routes are left out.

## In the app

| Path | What it shows |
|---|---|
| `/app/settings/api` | **API and assistants**: the MCP configs for Claude Code, Claude Desktop, Cursor and ChatGPT, curl calls, the workspace's keys (make, list, revoke), what a key can and cannot do, and the MCP tools. Everyone signed in can read it; owners and admins manage keys. |
| `/app/settings/api/reference` | The reference, rendered from the OpenAPI document: keys, limits and errors, every endpoint with its parameters, body fields and answers, the main response shapes, and webhooks with the signature check. |
| `/app/settings/webhooks` | Each webhook with its events, secret hint and its last deliveries; send a test, pause, new secret, remove; add one. Owners and admins. |

Snippets always use the placeholder `wovi_sk_YOUR_KEY`. The Settings card "API and assistants" links here; `/account` still lists keys too.

## Commands

```
npm test                           # everything, on the fake provider
```

Screenshots of this phase (keep `OPENROUTER_API_KEY` empty):

```
WOVI_DATA_DIR=/tmp/wovi-api-screens OPENROUTER_API_KEY= npm run agents:launch
WOVI_DATA_DIR=/tmp/wovi-api-screens OPENROUTER_API_KEY= WOVI_FAKE_LATENCY_MS=2500 npm start
WOVI_DATA_DIR=/tmp/wovi-api-screens OPENROUTER_API_KEY= node scripts/api-screens.mjs
```

It signs in through the email flow, skips onboarding, runs `scripts/seed-credits.ts`, tops up with the test provider, makes two keys on the page, adds a webhook to `https://example.com/wovi-hook` (the dev sender only logs it) and sends a test, then runs curl against the local server with the admin key and writes the transcript to `curl-demo.txt` with the key kept in `$WOVI_KEY`, makes one MCP call over HTTP, and shoots the pages and a phone view. Output goes to `~/WOVI-api-screens/`.

## Tests

`src/lib/api/api.test.ts`, `src/lib/api/mcp.test.ts` and `src/lib/webhooks/webhooks.test.ts` (29 tests), plus the policy table:

- keys and scoping: no key, a made-up key, a revoked key; another workspace's runs, Brand Brains and webhooks answer not_found; the lower of the key's and the maker's role; a maker who leaves;
- agents: the list and one agent parse against the schemas, carry the form as JSON Schema, the output, the bar, the scorecard and an estimate, and contain no instructions, model ids or routes; runs and pipelines contain no cost fields;
- runs on the fake provider: held, charged, gated and typed; charges shown to admin keys only; the credits balance after; the run in the app's History; idempotency with racing requests, one hold, a conflicting reuse and a bad key; cancel giving everything back;
- pipelines: "Idea to ready post" through the hook pick to the package, picks out of range and on the wrong step, keys refused at approve; cancel while waiting;
- errors: not_enough_credits, field paths for inputs, unknown fields, the Brand Brain and confirmations, bad JSON, unknown agents and routes, 405 with Allow, 413, all in one shape; keys refused at top-up, limits, approve and reject while a person's decision reads back; errors mapped by class name across bundles;
- rate limits per key and per workspace with Retry-After and the RateLimit headers, the window opening again, starts per key, unknown keys per address;
- the OpenAPI document: every public route by operation id and none of the forbidden-only ones, refs that resolve, the bodies, the bearer scheme, the webhooks, no secrets;
- webhooks: registering with the secret once and sealed, roles and outsiders, rotating; URL and event checks with paths; run.finished signed and verified, tampering refused, an old signature refused, the payload parsing as a Run, once per event; retries with backoff logged try by try until delivered, and giving up after six; pipeline.waiting and pipeline.finished; paused endpoints and makers who lost the role; ping and remove; the dev sender writing a file with no fetch; the HTTP sender refusing inside addresses; sealing and verifying;
- MCP: see [mcp.md](mcp.md).

## Later

- SDKs (TypeScript, Python) generated from the OpenAPI document.
- An event stream (server-sent events) beside webhooks, as the doc's "webhooks and server-sent events".
- File uploads through the API (`POST /assets`); file inputs are described but need assets already in WOVI.
- The depth limit for agents calling agents (the doc's swarm section). Per-call payment without a key is x402 (phase 15, [x402.md](x402.md)).
- DNS checks at send time against rebinding; the URL checks cover literal addresses and names.
- Shared rate-limit counters (Redis) when there is more than one server.
