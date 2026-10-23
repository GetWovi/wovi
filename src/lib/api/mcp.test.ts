import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { MODEL_ROUTES } from "@/lib/agents/catalog";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { SAMPLE_RUNS } from "@/lib/runs/samples";
import { MCP_TOOLS, buildMcpServer, handleMcp } from "./mcp";
import { RunSchema } from "./schemas";
import type { KeyCaller } from "./service";
import { testApi } from "./test-helpers";

const HOOK = SAMPLE_RUNS["hook-writer"].inputs;
type ToolResult = { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: Record<string, unknown> };

/** An MCP client talking to the server in this process, for one key. */
async function connect(t: Awaited<ReturnType<typeof testApi>>, key: string) {
  const caller = (await t.accounts.apiKeys.authenticate(key)) as KeyCaller;
  const server = await buildMcpServer({ api: t.api, caller, maxWaitMs: 5_000 });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-assistant", version: "1.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
  return { client, call };
}

const text = (r: ToolResult) => r.content.map((c) => c.text).join("\n");

describe("mcp: tools", () => {
  it("lists exactly the nine tools, with each agent's inputs from its spec and nothing hidden", async () => {
    const t = await testApi();
    const { client } = await connect(t, await t.key("editor"));
    expect(client.getServerVersion()?.name).toBe("wovi");
    expect(client.getInstructions()).toContain("you cannot approve or reject");
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual([...MCP_TOOLS].sort());

    const run = tools.find((x) => x.name === "run_agent")!;
    expect(run.description).toContain("hook-writer: Hook Writer.");
    expect(run.description).toContain("idea (required; 10 to 600 characters): Your idea.");
    expect(run.description).toContain("platform (required; one of: x, tiktok, shorts, reels)");
    expect(run.description).toContain("repurposer");
    expect(run.description).toContain("needs confirm_rights: true");
    expect(run.inputSchema.required).toEqual(["agent", "inputs"]);
    expect(Object.keys(run.inputSchema.properties ?? {})).toContain("brand_brain_id");
    expect(tools.find((x) => x.name === "start_pipeline")!.description).toContain("idea-to-post: Idea to ready post.");
    expect(tools.find((x) => x.name === "get_run")!.annotations?.readOnlyHint).toBe(true);

    const all = JSON.stringify(tools);
    for (const r of MODEL_ROUTES) {
      expect(all).not.toContain(r.id);
      if (r.model) expect(all).not.toContain(r.model);
    }
    for (const a of LAUNCH_AGENTS) expect(all).not.toContain(a.instructions.split("\n")[1].slice(0, 40));
    expect(all).not.toMatch(/builder|bench|tuning/i);
    expect(all).not.toContain("\u2014");
  });

  it("runs an agent through run_agent and returns the result, charged like any run", async () => {
    const t = await testApi();
    await t.topUp(1000);
    const { call } = await connect(t, await t.key("admin"));
    const r = await call("run_agent", { agent: "hook-writer", inputs: HOOK, wait_seconds: 5 });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/^Hook Writer finished \(run run_/);
    expect(text(r)).toContain("Charged");
    const run = RunSchema.parse(r.structuredContent!.run);
    expect(run.status).toBe("succeeded");
    expect((run.output as unknown as { items: string[] }).items).toHaveLength(10);
    expect(text(r)).toContain((run.output as unknown as { items: string[] }).items[0]);
    expect((await t.call("GET", "/credits", { key: await t.key("admin") })).json.available).toBe(1000 - run.charge!.charged!);

    const again = await call("get_run", { run_id: run.id });
    expect((again.structuredContent!.run as { id: string }).id).toBe(run.id);
    expect((await call("get_run", { run_id: "run_nope" })).isError).toBe(true);

    // wait_seconds 0 answers at once with the run id to come back for.
    const quick = await call("run_agent", { agent: "hook-writer", inputs: HOOK, wait_seconds: 0 });
    expect(text(quick)).toMatch(/still working|finished/);
    await t.engine.idle();
  });

  it("answers refusals as tool errors with the code and the field paths", async () => {
    const t = await testApi();
    await t.topUp(1000);
    const editor = await connect(t, await t.key("editor"));
    const bad = await editor.call("run_agent", { agent: "hook-writer", inputs: { idea: "short", platform: "tiktok" } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain("invalid_input");
    expect(text(bad)).toContain("inputs.idea: Must be at least 10 characters");
    expect(text(await editor.call("run_agent", { agent: "nope", inputs: {} }))).toContain("not_found");

    const viewer = await connect(t, await t.key("viewer"));
    const refused = await viewer.call("run_agent", { agent: "hook-writer", inputs: HOOK });
    expect(refused.isError).toBe(true);
    expect(text(refused)).toContain("forbidden");
  });

  it("starts a pipeline, picks an option, reads it, and reads Brand Brains and credits", async () => {
    const t = await testApi();
    await t.topUp(5000);
    const { call } = await connect(t, await t.key("editor"));
    const brains = await call("list_brand_brains");
    expect(text(brains)).toContain("Crumb and Co");
    const credits = await call("credits_balance");
    expect(text(credits)).toMatch(/^5000 credits available, 0 held/);

    const started = await call("start_pipeline", { pipeline: "caption-and-tags", inputs: { post: "Time-lapse of Gerald, our nine-year-old sourdough starter, rising overnight.", platform: "tiktok" }, wait_seconds: 5 });
    expect(started.isError).toBeFalsy();
    expect(text(started)).toContain("waits for a pick");
    const id = (started.structuredContent!.pipelineRun as { id: string }).id;
    expect(text(await call("pick_option", { pipeline_run_id: id, index: 99 }))).toContain("index: Pick from 0 to");
    const picked = await call("pick_option", { pipeline_run_id: id, index: 0, wait_seconds: 5 });
    expect(text(picked)).toContain("is ready for a person to approve in WOVI");
    const read = await call("get_pipeline", { pipeline_run_id: id });
    expect((read.structuredContent!.pipelineRun as { status: string }).status).toBe("ready");
    await t.pipelineEngine.idle();
  });
});

describe("mcp: the HTTP endpoint", () => {
  const rpc = (body: unknown, key?: string, method = "POST") =>
    new Request("http://localhost:3900/mcp", {
      method,
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    });

  it("speaks Streamable HTTP with the same keys, limits and refusals as REST", async () => {
    const t = await testApi();
    const key = await t.key("editor");
    const o = { rest: t.rest, api: t.api };
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "curl", version: "1" } } };

    const none = await handleMcp(rpc(init), o);
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toContain("Bearer");
    expect(JSON.stringify(await none.json())).toContain("unauthenticated");

    const ok = await handleMcp(rpc(init, key), o);
    expect(ok.status).toBe(200);
    const hello = await ok.json();
    expect(hello.result.serverInfo.name).toBe("wovi");

    const list = await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, key), o);
    const tools = (await list.json()).result.tools.map((x: { name: string }) => x.name);
    expect(tools.sort()).toEqual([...MCP_TOOLS].sort());

    const get = await handleMcp(rpc(null, key, "GET"), o);
    expect(get.status).toBe(405);
  });
});
