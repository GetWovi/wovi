/**
 * The copy-and-paste snippets the connect page and the docs show: MCP
 * configs for Claude, Cursor and ChatGPT, curl calls, and checking a webhook
 * signature. Always with a placeholder key; a real key is never put in a
 * snippet. Client-safe.
 */

export const KEY_PLACEHOLDER = "wovi_sk_YOUR_KEY";

export type Snippet = { id: string; title: string; where: string; lang: "shell" | "json" | "js" | "text"; code: string; note?: string };

const HOOK_BODY = JSON.stringify({ inputs: { idea: "We stopped taking wedding cake orders so the bakery could open at 6 a.m. again.", platform: "tiktok" } });

export function mcpSnippets(base: string): Snippet[] {
  const url = `${base.replace(/\/$/, "")}/mcp`;
  return [
    {
      id: "claude-code",
      title: "Claude Code",
      where: "In a terminal",
      lang: "shell",
      code: `claude mcp add --transport http wovi ${url} \\\n  --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`,
      note: "Then ask Claude: use WOVI to write hooks for my next post.",
    },
    {
      id: "claude-desktop",
      title: "Claude Desktop",
      where: "Settings, Developer, Edit config: claude_desktop_config.json",
      lang: "json",
      code: JSON.stringify(
        { mcpServers: { wovi: { command: "npx", args: ["-y", "mcp-remote", url, "--header", "Authorization:${WOVI_AUTH}"], env: { WOVI_AUTH: `Bearer ${KEY_PLACEHOLDER}` } } } },
        null,
        2,
      ),
      note: "mcp-remote bridges Claude Desktop to a remote server. Restart Claude after saving.",
    },
    {
      id: "cursor",
      title: "Cursor",
      where: "~/.cursor/mcp.json, or .cursor/mcp.json in a project",
      lang: "json",
      code: JSON.stringify({ mcpServers: { wovi: { url, headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` } } } }, null, 2),
    },
    {
      id: "chatgpt",
      title: "ChatGPT",
      where: "A custom GPT: Configure, Actions, Create new action",
      lang: "text",
      code: [`Import from URL:  ${base.replace(/\/$/, "")}/api/v1/openapi.json`, "Authentication:   API Key", "Auth type:        Bearer", `API key:          ${KEY_PLACEHOLDER}`].join("\n"),
      note: "ChatGPT calls the REST API through the OpenAPI document. It needs WOVI's public address, so it works once WOVI is live, not on localhost.",
    },
  ];
}

export function curlSnippets(base: string): Snippet[] {
  const api = `${base.replace(/\/$/, "")}/api/v1`;
  const auth = `-H "Authorization: Bearer ${KEY_PLACEHOLDER}"`;
  return [
    {
      id: "start",
      title: "Start a run",
      where: "Hook Writer, with your default Brand Brain",
      lang: "shell",
      code: `curl -s ${api}/agents/hook-writer/runs \\\n  ${auth} \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: hooks-2026-10-22" \\\n  -d '${HOOK_BODY}'`,
      note: "Answers 202 at once with the run and its id. The same Idempotency-Key never starts a second run.",
    },
    {
      id: "poll",
      title: "Get the result",
      where: "Poll until status is succeeded, or listen for run.finished",
      lang: "shell",
      code: `curl -s ${api}/runs/RUN_ID \\\n  ${auth}`,
    },
    {
      id: "agents",
      title: "List the agents",
      where: "Each one's inputs as JSON Schema, its output and about what it costs",
      lang: "shell",
      code: `curl -s ${api}/agents \\\n  ${auth}`,
    },
  ];
}

export const VERIFY_SNIPPET: Snippet = {
  id: "verify",
  title: "Check the signature",
  where: "Node.js, on your server, with the raw body",
  lang: "js",
  code: [
    'import { createHmac, timingSafeEqual } from "node:crypto";',
    "",
    "export function fromWovi(secret, header, rawBody) {",
    '  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));',
    "  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;",
    '  const want = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");',
    "  return want.length === v1.length && timingSafeEqual(Buffer.from(want), Buffer.from(v1));",
    "}",
  ].join("\n"),
  note: "Wovi-Signature is t=<seconds>,v1=<hex>. Refuse anything older than five minutes, and dedupe on the event id.",
};
