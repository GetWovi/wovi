/**
 * The spec as the editor holds it while someone types: the same shape as the
 * validator's input, loose enough to be half-filled. The validator runs on
 * every change and the messages land next to the fields.
 */
import { BODY_KEYS, type AgentBody, type AgentInput, type AgentOutput } from "@/lib/agents/spec";

export type AnyInput = {
  key: string;
  label: string;
  type: AgentInput["type"];
  required: boolean;
  help?: string;
  limits?: Record<string, number | string[] | undefined>;
  options?: { value: string; label: string }[];
  multiple?: boolean;
  default?: unknown;
};

export type AnyOutput = { kind: AgentOutput["kind"] } & Record<string, unknown>;

export type Body = {
  name: string;
  job: string;
  category: AgentBody["category"];
  platforms: string[];
  inputs: AnyInput[];
  output: AnyOutput;
  brandBrain: string[];
  tools: string[];
  guardrails: string[];
  routing: { model: string; fallback: string; temperature?: number; maxCostUsd?: number; maxOutputTokens?: number };
  instructions: string;
  /** Phase 18: phrases this agent refuses in requests and keeps out of drafts, on top of the platform's rules. */
  safety?: { block: string[] };
};

/** The versioned body only (no id, version, or listing fields), as the form holds it. */
export function bodyOf(spec: AgentBody): Body {
  const picked = Object.fromEntries(BODY_KEYS.filter((k) => k !== "id" && k !== "version").map((k) => [k, spec[k]]));
  return structuredClone(picked) as unknown as Body;
}

/** A fresh input of a type, with the limits that type needs. */
export function blankInput(type: AgentInput["type"], key = ""): AnyInput {
  const base = { key, label: "", required: true };
  switch (type) {
    case "text":
      return { ...base, type, limits: { maxLength: 200 } };
    case "long_text":
      return { ...base, type, limits: { maxLength: 2000 } };
    case "url":
      return { ...base, type };
    case "file":
      return { ...base, type, limits: { maxSizeMb: 20, maxFiles: 1, accept: [".pdf"] } };
    case "image":
      return { ...base, type, limits: { maxSizeMb: 20, maxFiles: 1 } };
    case "video":
      return { ...base, type, limits: { maxSizeMb: 1024, maxFiles: 1, maxSeconds: 600 } };
    case "choice":
      return { ...base, type, multiple: false, options: [{ value: "one", label: "One" }, { value: "two", label: "Two" }] };
    case "number":
      return { ...base, type, limits: { min: 0, max: 10 } };
    case "profile":
      return { ...base, type, required: false, key: key || "brand", label: "Brand Brain" };
  }
}

/** A fresh output of a kind. */
export function blankOutput(kind: AgentOutput["kind"]): AnyOutput {
  switch (kind) {
    case "text":
      return { kind, maxWords: 300 };
    case "list":
      return { kind, count: 5, maxWordsPerItem: 30 };
    case "script":
      return { kind, maxSeconds: 60, sections: ["opening", "turn", "ending"] };
    case "caption_set":
      return { kind, platforms: ["x", "tiktok", "shorts", "reels"], variants: 2, maxChars: 2200 };
    case "post_set":
      return { kind, formats: [{ format: "thread", count: 1 }] };
    case "image":
      return { kind, count: 3, aspect: "9:16" };
    case "storyboard":
      return { kind, maxFrames: 12, withImages: true, aspect: "9:16" };
    case "video":
      return { kind, maxSeconds: 60, aspect: "9:16" };
  }
}

export const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v));
export const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
