/**
 * The MCP server (phase 14): WOVI's agents as tools for Claude, ChatGPT,
 * Cursor and any other MCP client, over Streamable HTTP at /mcp, with the
 * official MCP TypeScript SDK.
 *
 * - The same API keys as REST, the same PublicApi underneath: the same
 *   workspace scoping, credits, quality gate and limits.
 * - Stateless: every POST builds a server for the key that sent it, so the
 *   tool descriptions list exactly the agents and pipelines that key can run,
 *   each with its inputs described from its spec.
 * - Tools: list_agents, run_agent, get_run, give_feedback, list_brand_brains,
 *   start_pipeline, pick_option, get_pipeline, credits_balance. Never a
 *   model, an instruction, another workspace or a builder tool.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { copyAll } from "@/lib/app/results";
import type { RunOutput } from "@/lib/runs/output";
import { ApiError, toApiError } from "./errors";
import type { RestApi } from "./rest";
import type { ApiAgent, ApiPipeline, ApiPipelineRun, ApiRun } from "./schemas";
import type { KeyCaller, PublicApi } from "./service";

export const MCP_TOOLS = ["list_agents", "run_agent", "get_run", "give_feedback", "list_brand_brains", "start_pipeline", "pick_option", "get_pipeline", "credits_balance"] as const;

const SERVER_INFO = { name: "wovi", title: "WOVI", version: "1.0.0" };
const INSTRUCTIONS =
  "WOVI runs content agents for small businesses: hooks, scripts, captions, hashtags, ideas, repurposed posts. Each agent has a typed form; fill its inputs exactly as described. Results are written in the workspace's Brand Brain voice and checked by a quality gate. Runs cost credits: check credits_balance when a run is refused. People approve results in the WOVI app; you cannot approve or reject.";

/* ---------- Words for an assistant ---------- */

function agentBlock(a: ApiAgent): string {
  const props = a.inputSchema.properties as Record<string, { description?: string }>;
  const required = new Set(a.inputSchema.required as string[]);
  const lines = a.inputs.map((i) => {
    const bits: string[] = [required.has(i.key) ? "required" : "optional"];
    const lim = i.limits as { minLength?: number; maxLength?: number; min?: number; max?: number } | undefined;
    if (i.type === "text" || i.type === "long_text") bits.push(lim?.minLength ? `${lim.minLength} to ${lim.maxLength} characters` : `up to ${lim?.maxLength} characters`);
    if (i.type === "choice") bits.push(`${i.multiple ? "a list, any of" : "one of"}: ${i.options!.map((o) => o.value).join(", ")}${i.default !== undefined ? `; default ${String(i.default)}` : ""}`);
    if (i.type === "number") bits.push(`${lim?.min} to ${lim?.max}`);
    if (i.type === "profile") bits.push("a Brand Brain id; leave out for the default");
    if (i.type === "url") bits.push("a full https:// link");
    return `  - ${i.key} (${bits.join("; ")}): ${props[i.key]?.description ?? i.label}`;
  });
  const conf = [a.confirmations.rights ? "needs confirm_rights: true" : "", a.confirmations.voiceConsent ? "needs confirm_voice_consent: true" : ""].filter(Boolean).join(", ");
  const cost = a.estimate.credits !== null ? ` About ${a.estimate.credits} credits a run.` : "";
  return [`${a.id}: ${a.name}. ${a.job}${cost}${conf ? ` It ${conf}.` : ""}`, ...lines].join("\n");
}

function pipelineBlock(p: ApiPipeline): string {
  const props = p.inputSchema.properties as Record<string, { description?: string }>;
  const required = new Set(p.inputSchema.required as string[]);
  const lines = p.inputs.map((i) => {
    const opts = i.type === "choice" ? `; one of: ${i.options!.map((o) => o.value).join(", ")}${i.default !== undefined ? `; default ${String(i.default)}` : ""}` : "";
    return `  - ${i.key} (${required.has(i.key) ? "required" : "optional"}${opts}): ${props[i.key]?.description ?? i.label}`;
  });
  const chain = p.steps.map((s) => s.agent.name).join(" > ");
  return [`${p.id}: ${p.name}. ${p.job} Chain: ${chain}.${p.confirmations.rights ? " Needs confirm_rights: true." : ""}`, ...lines].join("\n");
}

function runText(run: ApiRun): string {
  const name = run.agent.name ?? run.agent.id;
  if (run.status === "queued" || run.status === "running") return `${name} is still working (run ${run.id}, ${run.status}). Call get_run with this run_id in a little while.`;
  if (run.status === "failed") return `${name} failed (run ${run.id}): ${run.error?.message ?? "no reason given"}. Its credits came back.`;
  if (run.status === "cancelled") return `${name} was stopped (run ${run.id}). Its credits came back.`;
  const q = run.quality;
  const head = q
    ? `${name} finished (run ${run.id}). Quality ${q.score} against a bar of ${q.bar}: ${run.ready ? "ready for a person to approve in WOVI" : `needs a closer look: ${q.reasons.join(" ") || run.flags.map((f) => f.message).join(" ")}`}.`
    : `${name} finished (run ${run.id}).`;
  const charge = run.charge?.charged != null ? ` Charged ${run.charge.charged} credits.` : "";
  // Phase 18: say plainly that an AI wrote it (EU AI Act Art. 50).
  const ai = run.output ? " Written by AI: a draft for a person to check, and to label as AI where a platform asks." : "";
  return `${head}${charge}${ai}\n\n${run.output ? copyAll(run.output as RunOutput) : ""}`.trim();
}

function pipelineText(run: ApiPipelineRun): string {
  const name = run.pipeline.name;
  if (run.status === "running") {
    const step = run.steps.find((s) => s.status === "running" || s.status === "rewriting");
    return `${name} is running (pipeline run ${run.id}${step ? `, now: ${step.label}` : ""}). Call get_pipeline with this pipeline_run_id in a little while.`;
  }
  if (run.status === "waiting" && run.waiting) {
    const w = run.waiting;
    const opts = w.options.map((o) => `${o.index}. ${o.text}${o.brandFit !== null ? ` (brand fit ${o.brandFit})` : ""}`).join("\n");
    return `${name} waits for a pick at "${w.label}" (pipeline run ${run.id}): ${w.prompt}.${w.suggested !== null ? ` The best brand fit is option ${w.suggested}.` : ""} Ask the person which one they want, then call pick_option with the index.\n\n${opts}`;
  }
  if (run.status === "failed") return `${name} stopped (pipeline run ${run.id}): ${run.error?.message ?? "no reason given"}.`;
  if (run.status === "cancelled") return `${name} was stopped (pipeline run ${run.id}).`;
  const parts = (run.package ?? []).map((p) => `${p.label}:\n${p.item ? p.item.text : p.output ? copyAll(p.output as RunOutput) : ""}`).join("\n\n");
  const state = run.status === "ready" ? "is ready for a person to approve in WOVI" : `was ${run.status} by a person`;
  return `${name} ${state} (pipeline run ${run.id}).${run.needsReview ? " A step was flagged, so look closely." : ""}\n\n${parts}`.trim();
}

const ok = (text: string, structured: Record<string, unknown>): CallToolResult => ({ content: [{ type: "text", text }], structuredContent: structured });

function fail(err: unknown): CallToolResult {
  const e = toApiError(err);
  const issues = e.issues.map((i) => `${i.path}: ${i.message}`).join("\n");
  return { isError: true, content: [{ type: "text", text: `${e.code}: ${e.message}${issues ? `\n${issues}` : ""}` }], structuredContent: e.toJSON() };
}

async function tool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return fail(err);
  }
}

/* ---------- The server ---------- */

export type McpOptions = {
  api: PublicApi;
  caller: KeyCaller;
  /** Counts a run or pipeline start against the key's limit. Throws rate_limited. */
  onStart?: () => void;
  /** The longest a tool waits for a run before it answers with the run id. */
  maxWaitMs?: number;
};

/** An MCP server for one key: its tools describe what that key can run. */
export async function buildMcpServer(o: McpOptions): Promise<McpServer> {
  const { api, caller } = o;
  const maxWait = o.maxWaitMs ?? 50_000;
  const waitMs = (s: number | undefined) => Math.max(0, Math.min(maxWait, Math.round((s ?? 25) * 1000)));
  const [agents, pipelines] = await Promise.all([api.listAgents(caller).catch(() => []), api.listPipelines(caller).catch(() => [])]);

  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS, capabilities: { tools: {} } });
  const read = { readOnlyHint: true, openWorldHint: false } as const;

  server.registerTool(
    "list_agents",
    {
      title: "List WOVI agents",
      description: "Lists the agents this workspace can run: what each one does, its inputs, its output, its quality record and about what a run costs in credits. Call it first when you are not sure which agent fits.",
      inputSchema: {},
      annotations: read,
    },
    () =>
      tool(async () => {
        const list = await api.listAgents(caller);
        return ok(list.map(agentBlock).join("\n\n") || "No agents are available to this key.", { agents: list });
      }),
  );

  server.registerTool(
    "run_agent",
    {
      title: "Run a WOVI agent",
      description: [
        "Runs one agent with the person's inputs, in their Brand Brain's voice. Waits up to wait_seconds (default 25) and returns the result; if it is not done by then, returns a run_id to pass to get_run. The run holds its estimate in credits and is charged what it used, never more.",
        "Fill inputs with exactly the keys listed for the agent. Use real details from the person: names, numbers, what happens.",
        "",
        "Agents and their inputs:",
        agents.length ? agents.map(agentBlock).join("\n\n") : "(none available to this key)",
      ].join("\n"),
      inputSchema: {
        agent: z.string().min(1).max(48).describe(`The agent id${agents.length ? `: ${agents.map((a) => a.id).join(", ")}` : ""}.`),
        inputs: z.record(z.string(), z.unknown()).describe("The agent's inputs by key, as listed above."),
        brand_brain_id: z.string().max(100).optional().describe("A Brand Brain id from list_brand_brains. Leave it out to use the workspace default."),
        idea: z.string().max(1000).optional().describe("An idea for this run only, for agents that read the brand's idea."),
        confirm_rights: z.boolean().optional().describe("The person confirmed they own the material or may use it. Only for agents that need it."),
        confirm_voice_consent: z.boolean().optional().describe("The person confirmed they have consent to use the voice. Only for agents that need it."),
        wait_seconds: z.number().min(0).max(maxWait / 1000).optional().describe("How long to wait for the result, in seconds. 0 returns the run id at once."),
        idempotency_key: z.string().max(100).optional().describe("Send the same key when you retry, so the run starts only once."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      tool(async () => {
        o.onStart?.();
        const confirmations = args.confirm_rights || args.confirm_voice_consent ? { ...(args.confirm_rights ? { rights: true } : {}), ...(args.confirm_voice_consent ? { voiceConsent: true } : {}) } : undefined;
        const started = await api.startRun(caller, args.agent, { inputs: args.inputs, ...(args.brand_brain_id ? { brandBrainId: args.brand_brain_id } : {}), ...(args.idea ? { idea: args.idea } : {}), ...(confirmations ? { confirmations } : {}) }, args.idempotency_key ?? null);
        const run = await api.waitForRun(caller, started.id, waitMs(args.wait_seconds));
        return ok(runText(run), { run });
      }),
  );

  server.registerTool(
    "get_run",
    {
      title: "Get a WOVI run",
      description: "Reads one run by its id: its status, its result in its typed shape, the quality score with the reasons, and what it was charged. Pass wait_seconds to wait for a run that is still going.",
      inputSchema: {
        run_id: z.string().min(1).max(100).describe("The run id from run_agent."),
        wait_seconds: z.number().min(0).max(maxWait / 1000).optional().describe("Wait this long for it to finish. Default 0."),
      },
      annotations: read,
    },
    (args) =>
      tool(async () => {
        const run = await api.waitForRun(caller, args.run_id, waitMs(args.wait_seconds ?? 0));
        return ok(runText(run), { run });
      }),
  );

  server.registerTool(
    "give_feedback",
    {
      title: "Say what happened to a result",
      description: "Tells WOVI what the person did with a finished run's result, for the agent's live stats: use (used as it is), edit (changed it: send the whole text they kept), regenerate (asked for another try) or rating (thumbs up or down, with an optional note). Only send what the person actually did.",
      inputSchema: {
        run_id: z.string().min(1).max(100),
        action: z.enum(["use", "edit", "regenerate", "rating"]),
        text: z.string().min(1).max(20_000).optional().describe("For edit: the whole text the person kept."),
        rating: z.enum(["up", "down"]).optional().describe("For rating."),
        note: z.string().max(300).optional().describe("For rating: a short note in the person's words."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) =>
      tool(async () => {
        const state = await api.feedback(caller, args.run_id, { action: args.action, ...(args.text ? { text: args.text } : {}), ...(args.rating ? { rating: args.rating } : {}), ...(args.note ? { note: args.note } : {}) }, "mcp");
        return ok(`Recorded. Used: ${state.used ? "yes" : "no"}. Edited: ${state.edited ? `${Math.round(state.edited.distance * 100)}% changed` : "no"}. Run again: ${state.regenerated ? "yes" : "no"}. Rating: ${state.rating ?? "none"}.`, { feedback: state });
      }),
  );

  server.registerTool(
    "list_brand_brains",
    {
      title: "List Brand Brains",
      description: "Lists the workspace's Brand Brains: each brand or client the agents can write for, with its niche, platforms and voice. The default is used when you name none. Read only.",
      inputSchema: {},
      annotations: read,
    },
    () =>
      tool(async () => {
        const list = await api.listBrandBrains(caller);
        const text = list.length ? list.map((b) => `${b.id}: ${b.name}${b.isDefault ? " (default)" : ""}. ${b.niche}. Voice: ${b.voice || "not set"}`).join("\n") : "No Brand Brains yet. Agents still run, without a brand voice.";
        return ok(text, { brandBrains: list });
      }),
  );

  server.registerTool(
    "start_pipeline",
    {
      title: "Start a WOVI pipeline",
      description: [
        "Starts a pipeline: a chain of agents where each step feeds the next, all in the Brand Brain's voice. Some steps ask the person to pick (a hook, a caption); then the run waits and you call pick_option. Waits up to wait_seconds (default 25) for the first stop.",
        "",
        "Pipelines and their inputs:",
        pipelines.length ? pipelines.map(pipelineBlock).join("\n\n") : "(none available to this key)",
      ].join("\n"),
      inputSchema: {
        pipeline: z.string().min(1).max(48).describe(`The pipeline id${pipelines.length ? `: ${pipelines.map((p) => p.id).join(", ")}` : ""}.`),
        inputs: z.record(z.string(), z.unknown()).describe("The pipeline's inputs by key, as listed above."),
        brand_brain_id: z.string().max(100).optional().describe("A Brand Brain id from list_brand_brains. Leave it out for the default."),
        confirm_rights: z.boolean().optional().describe("The person confirmed they own the material or may use it. Only for pipelines that need it."),
        wait_seconds: z.number().min(0).max(maxWait / 1000).optional(),
        idempotency_key: z.string().max(100).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      tool(async () => {
        o.onStart?.();
        const started = await api.startPipeline(caller, args.pipeline, { inputs: args.inputs, ...(args.brand_brain_id ? { brandBrainId: args.brand_brain_id } : {}), ...(args.confirm_rights ? { confirmations: { rights: true } } : {}) }, args.idempotency_key ?? null);
        const run = await api.waitForPipeline(caller, started.id, waitMs(args.wait_seconds));
        return ok(pipelineText(run), { pipelineRun: run });
      }),
  );

  server.registerTool(
    "pick_option",
    {
      title: "Pick an option in a pipeline",
      description: "Answers a pipeline step that waits for a pick, with the option's index (from 0, as get_pipeline lists them). Ask the person which one they want first. The pipeline goes on and this waits up to wait_seconds (default 25) for its next stop.",
      inputSchema: {
        pipeline_run_id: z.string().min(1).max(100),
        index: z.number().int().min(0).describe("The option to pick, counting from 0."),
        step: z.string().max(40).optional().describe("The step that waits. Leave it out for whichever step waits now."),
        wait_seconds: z.number().min(0).max(maxWait / 1000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      tool(async () => {
        await api.pick(caller, args.pipeline_run_id, { index: args.index, ...(args.step ? { step: args.step } : {}) });
        const run = await api.waitForPipeline(caller, args.pipeline_run_id, waitMs(args.wait_seconds));
        return ok(pipelineText(run), { pipelineRun: run });
      }),
  );

  server.registerTool(
    "get_pipeline",
    {
      title: "Get a WOVI pipeline run",
      description: "Reads one pipeline run: every step, the options when a step waits for a pick, and the package a person approves at the end.",
      inputSchema: {
        pipeline_run_id: z.string().min(1).max(100),
        wait_seconds: z.number().min(0).max(maxWait / 1000).optional().describe("Wait this long while it is still running. Default 0."),
      },
      annotations: read,
    },
    (args) =>
      tool(async () => {
        const run = await api.waitForPipeline(caller, args.pipeline_run_id, waitMs(args.wait_seconds ?? 0));
        return ok(pipelineText(run), { pipelineRun: run });
      }),
  );

  server.registerTool(
    "credits_balance",
    {
      title: "Credits balance",
      description: "The workspace's credits: what is available, what is held for runs in progress, and this month's use. One credit is one cent. Read only: top-ups happen in the WOVI app.",
      inputSchema: {},
      annotations: read,
    },
    () =>
      tool(async () => {
        const c = await api.credits(caller);
        return ok(`${c.available} credits available, ${c.held} held for runs in progress. ${c.usedThisMonth} used this month${c.monthlyLimit !== null ? ` of a ${c.monthlyLimit} limit` : ""}.`, { credits: c });
      }),
  );

  return server;
}

/**
 * The /mcp endpoint: Streamable HTTP, stateless, JSON answers. The key is
 * checked and counted like a REST request before anything is parsed.
 */
export async function handleMcp(req: Request, o: { rest: RestApi; api: PublicApi }): Promise<Response> {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  let caller: KeyCaller;
  try {
    caller = await o.rest.authenticate(req.headers);
    o.rest.limit(caller);
    if (req.method !== "POST") throw new ApiError("method_not_allowed", "This MCP server answers POST only (stateless Streamable HTTP).");
    const declared = Number(req.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > o.api.limits.maxBodyBytes) throw new ApiError("payload_too_large", "The request is too large.");
  } catch (err) {
    const e = toApiError(err);
    const res = new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: `${e.code}: ${e.message}` }, id: null }), { status: e.status, headers });
    if (e.retryAfterSec !== undefined) res.headers.set("Retry-After", String(e.retryAfterSec));
    if (e.code === "unauthenticated") res.headers.set("WWW-Authenticate", 'Bearer realm="wovi"');
    if (e.code === "method_not_allowed") res.headers.set("Allow", "POST");
    return res;
  }
  const server = await buildMcpServer({ api: o.api, caller, onStart: () => o.rest.limitStart(caller) });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: o.api.limits.maxBodyBytes });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close().catch(() => undefined);
  }
}
