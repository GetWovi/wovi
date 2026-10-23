/**
 * Prompt injection (phase 18). Everything a person types, every comment and
 * every page a tool fetches reaches the model as data inside its own
 * <data> block, never as instructions (src/lib/runs/prompt.ts). This file
 * adds two things on top:
 *
 * - `injectionSignals`: spots text that reads like instructions to the AI
 *   ("ignore the rules above", "reveal your prompt", a fake </data> tag). It
 *   never blocks: the text still runs as material, and the run records a note
 *   so a person can see it.
 * - `assertDeclaredTool`: the one gate every tool call must pass. An agent
 *   may only use tools its spec declares and the catalog knows. The engine
 *   sends no tools to a model today, so nothing can be called; this is the
 *   check the tool layer has to call when it arrives.
 */
import { TOOL_IDS } from "@/lib/agents/catalog";

export const INJECTION_PATTERNS: readonly { id: string; pattern: string }[] = [
  { id: "ignore_rules", pattern: "\\b(?:ignore|disregard|forget|override|bypass)\\b[^.\\n]{0,30}\\b(?:previous|prior|above|earlier|all|any|your|the|these|system)\\b[^.\\n]{0,20}\\b(?:instructions?|rules|prompts?|guidelines|directions)\\b" },
  { id: "new_role", pattern: "\\byou are now\\b|\\bact as (?:an? |the )?(?:system|developer|admin|administrator|root|jailbroken|dan)\\b|\\bdeveloper mode\\b|\\bjailbreak\\w*" },
  { id: "reveal_prompt", pattern: "\\b(?:reveal|show|print|repeat|output|leak|tell me)\\b[^.\\n]{0,20}\\b(?:system prompt|your prompt|your instructions|hidden instructions|the rules above)\\b" },
  { id: "fake_tags", pattern: "<\\s*/?\\s*(?:data|system|assistant|instructions?)\\b|^\\s*(?:system|assistant)\\s*:" },
  { id: "new_instructions", pattern: "\\bnew instructions?\\s*:|\\bfrom now on,? (?:you|ignore)\\b" },
  { id: "tool_call", pattern: "\\b(?:call|use|run|invoke|execute)\\s+(?:the\\s+)?[a-z_]+\\s+(?:tool|function)\\b" },
];

export type InjectionSignal = { field: string; pattern: string; match: string };

/** Text that reads like instructions to the AI, per field. Never blocks anything. */
export function injectionSignals(texts: Record<string, string>): InjectionSignal[] {
  const out: InjectionSignal[] = [];
  for (const [field, text] of Object.entries(texts)) {
    if (typeof text !== "string") continue;
    for (const p of INJECTION_PATTERNS) {
      const m = new RegExp(p.pattern, "im").exec(text);
      if (m) out.push({ field, pattern: p.id, match: m[0].trim().slice(0, 80) });
    }
  }
  return out;
}

export class ToolNotAllowed extends Error {
  constructor(readonly tool: string) {
    super(`This agent may not use the tool "${tool}". Only tools its spec declares can run.`);
    this.name = "ToolNotAllowed";
  }
}

/** The tools a run may use: the ones the spec declares that the catalog knows. */
export function toolsForRun(spec: { tools: readonly string[] }): string[] {
  return spec.tools.filter((t) => TOOL_IDS.includes(t));
}

/** Throws unless the agent declares the tool and the catalog has it. Every tool call goes through here. */
export function assertDeclaredTool(spec: { tools: readonly string[] }, tool: string): void {
  if (!toolsForRun(spec).includes(tool)) throw new ToolNotAllowed(tool);
}
