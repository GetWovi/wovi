# The MCP server (phase 14)

From the product doc: "I want to use the agents with my Claude or ChatGPT": "every agent exposed as an MCP server and tool, so any assistant can call it", with the "official MCP SDK".

WOVI is an MCP server at `/mcp`, built with the official MCP TypeScript SDK (`@modelcontextprotocol/sdk`, `McpServer` and `WebStandardStreamableHTTPServerTransport`). It runs on the same `PublicApi` as the REST API ([api.md](api.md)), so an assistant's run is scoped, held, gated, charged and reviewed like any other. The code is `src/lib/api/mcp.ts`; the route is `src/app/mcp/route.ts`.

## How it connects

- **Streamable HTTP, stateless, JSON answers.** Every POST is handled on its own: the key is checked, the request is counted, a server is built for that key, and the transport answers in JSON. GET and DELETE answer 405 (there are no sessions to stream or close).
- **The same API keys** as REST: `Authorization: Bearer wovi_sk_...`. No key, or a dead one: 401 with `WWW-Authenticate: Bearer`. Same limits (requests per key and workspace, run starts per key, unknown keys per address, 128 KB per request).
- **Built per key.** The tool descriptions list exactly the agents and pipelines that key's workspace can run, each with its inputs described from its spec, so the assistant fills the form right the first time.

## Tools

| Tool | What it does | Arguments |
|---|---|---|
| `list_agents` | The agents with their job, inputs, about what a run costs and confirmations. | none |
| `run_agent` | Runs one agent and waits up to `wait_seconds` (default 25, at most 50); returns the result as text and as structured content, or the run id to come back for. | `agent`, `inputs`, `brand_brain_id?`, `idea?`, `confirm_rights?`, `confirm_voice_consent?`, `wait_seconds?`, `idempotency_key?` |
| `get_run` | Reads a run: status, typed result, quality score and reasons, charge. Can wait. | `run_id`, `wait_seconds?` |
| `give_feedback` | Says what the person did with a finished result, for the agent's live stats: used it, edited it (the whole kept text), asked for another try, or rated it. One of each per run. See [stats.md](stats.md). | `run_id`, `action`, `text?`, `rating?`, `note?` |
| `list_brand_brains` | The workspace's Brand Brains, the default marked. Read only. | none |
| `start_pipeline` | Starts a pipeline and waits for its first stop: a pick, ready, or failed. | `pipeline`, `inputs`, `brand_brain_id?`, `confirm_rights?`, `wait_seconds?`, `idempotency_key?` |
| `pick_option` | Answers a step that waits, with the option's index (from 0), then waits for the next stop. | `pipeline_run_id`, `index`, `step?`, `wait_seconds?` |
| `get_pipeline` | Reads a pipeline run: steps, the options while one waits, the package. | `pipeline_run_id`, `wait_seconds?` |
| `credits_balance` | Available, held, this month's use. Read only. | none |

`run_agent`'s description carries a block per agent, from its spec, for example:

```
hook-writer: Hook Writer. Opens a post or a short with one line people stop for. About 4 credits a run.
  - idea (required; 10 to 600 characters): Your idea. One or two sentences about the post, with the real details: ...
  - platform (required; one of: x, tiktok, shorts, reels): Platform. ...
  - who_for (optional; up to 120 characters): Who it is for. ...
  - brand (optional; a Brand Brain id; leave out for the default): Brand Brain. ...
```

Results are written for an assistant: "Hook Writer finished (run run_...). Quality 93 against a bar of 70: ready for a person to approve in WOVI. Charged 1 credits." followed by the result as plain text. A pipeline that waits says "Ask the person which one they want, then call pick_option with the index", with every option numbered and its brand fit.

Refusals come back as tool errors (`isError: true`) with the API's code and the field paths, for example `invalid_input: Some inputs need a look.` then `inputs.idea: Must be at least 10 characters (got 5).`, so the assistant can fix the input and try again.

The server's instructions tell the assistant what WOVI is, that runs cost credits, and that people approve results in the app; it cannot approve or reject.

## What it never exposes

- No model, route, instruction, cost in dollars or token count, in any description or result.
- Nothing from another workspace: every call is the key's own workspace.
- No builder tools, no approve or reject, no top-up or limits, no key or member management.

## Connecting an assistant

On **Settings, API and assistants** (`/app/settings/api`) each config is ready to copy, with the placeholder `wovi_sk_YOUR_KEY` to replace. Locally the address is `http://localhost:3900/mcp`; once WOVI is live it is the site's own address.

**Claude Code**

```
claude mcp add --transport http wovi http://localhost:3900/mcp \
  --header "Authorization: Bearer wovi_sk_YOUR_KEY"
```

**Claude Desktop** (`claude_desktop_config.json`, through the `mcp-remote` bridge)

```json
{
  "mcpServers": {
    "wovi": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3900/mcp", "--header", "Authorization:${WOVI_AUTH}"],
      "env": { "WOVI_AUTH": "Bearer wovi_sk_YOUR_KEY" }
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "wovi": { "url": "http://localhost:3900/mcp", "headers": { "Authorization": "Bearer wovi_sk_YOUR_KEY" } }
  }
}
```

**ChatGPT** calls the REST API through a custom GPT action: import `/api/v1/openapi.json`, authentication API key, type Bearer. ChatGPT has to reach WOVI's public address, so this works once WOVI is live, not on localhost.

No account was made anywhere for any of these; they are instructions with placeholders.

## Tests

`src/lib/api/mcp.test.ts` (5 tests), with an in-process MCP client from the SDK (`Client` over `InMemoryTransport`) and the HTTP handler:

- the server's name and instructions; exactly the eight tools; `run_agent`'s description with each agent's inputs, options and confirmations from its spec; the pipelines in `start_pipeline`; read-only hints; no model ids, routes, instructions or builder words anywhere;
- `run_agent` on the fake provider: the result text, the typed run as structured content, the charge taken from the balance; `get_run` by id and an unknown id; `wait_seconds: 0`;
- refusals as tool errors with codes and field paths: a short idea, an unknown agent, a viewer key;
- `start_pipeline` waiting for a pick, `pick_option` out of range and then in range to ready, `get_pipeline`, `list_brand_brains`, `credits_balance`;
- the HTTP endpoint: 401 without a key, `initialize` and `tools/list` with one, 405 on GET.

## Later

- OAuth for MCP clients that want it (ChatGPT's own connectors, Claude's remote connectors), beside API keys.
- Progress notifications while a long run (video) goes, once media agents exist.
- Agent-to-agent calls in a swarm with a depth limit.
- x402 on MCP. For now MCP stays on API keys: `/mcp` answers 401 without one, with x402 on or off. Per-call payment without a key is on the REST starts ([x402.md](x402.md)).
