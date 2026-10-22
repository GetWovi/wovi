/**
 * A run as the screen shows it: the typed output as blocks and items (hooks
 * as lines, ideas and tags as cards with fields, a script as beats, captions
 * and repurposed posts per platform), brand fit as one number, every flagged
 * guardrail in plain words, and the one status a person needs.
 */
import type { PublicRun } from "@/lib/accounts/guard";
import type { Platform } from "@/lib/agents/catalog";
import type { AgentSpec } from "@/lib/agents/spec";
import type { CheckResult } from "@/lib/runs/guardrails";
import type { RunOutput } from "@/lib/runs/output";
import type { ReviewRow } from "./types";

export const PLATFORM_NAMES: Record<Platform, string> = { x: "X", tiktok: "TikTok", shorts: "YouTube Shorts", reels: "Instagram Reels" };

const FORMAT_NAMES: Record<string, string> = { post: "Post", thread: "Thread", carousel: "Carousel", short: "Short" };

export const FIELD_NAMES: Record<string, string> = {
  idea: "Idea",
  format: "Format",
  why_it_fits: "Why it fits",
  type: "Type",
  term: "Term",
  where: "Where it goes",
  why: "Why",
  trend: "Trend",
  what_it_looks_like: "What it looks like",
  evidence: "Evidence",
  how_you_could_use_it: "How you could use it",
};

export function fieldName(key: string): string {
  return FIELD_NAMES[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export type ResultItem = {
  /** A short name for the item: "1", "Hook", "Variant 1". */
  label: string;
  /** The item as text, for copying. */
  text: string;
  /** Labelled parts, when the item has them. */
  fields: { label: string; value: string }[];
  /** A small line beside the label: "8 s", "#hashtag". */
  meta?: string;
};

export type ResultBlock = { title: string | null; items: ResultItem[] };

export type ResultView = {
  /** How to lay the items out. */
  layout: "lines" | "cards" | "beats" | "platforms";
  blocks: ResultBlock[];
  /** How many items in all. */
  count: number;
};

/** "Hook: ...\nScript: ...\nOn screen: ...\nCaption: ..." as labelled parts, or null for a plain caption. */
export function labelledLines(text: string): { label: string; value: string }[] | null {
  const lines = text.split("\n");
  const parts: { label: string; value: string }[] = [];
  for (const line of lines) {
    const m = /^(Hook|Script|On screen|Caption|Title|Description):\s*(.*)$/i.exec(line);
    if (m) parts.push({ label: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase().replace("on screen", "On screen"), value: m[2] });
    else if (parts.length) parts[parts.length - 1].value += `\n${line}`;
    else return null;
  }
  return parts.length >= 2 ? parts : null;
}

/** The output as blocks of items. */
export function resultView(output: RunOutput): ResultView {
  switch (output.kind) {
    case "text":
      return { layout: "lines", count: 1, blocks: [{ title: null, items: [{ label: "Text", text: output.text, fields: [] }] }] };
    case "list": {
      const fielded = output.items.some((it) => typeof it !== "string");
      const items = output.items.map((it, i): ResultItem => {
        if (typeof it === "string") return { label: String(i + 1), text: it, fields: [] };
        const fields = Object.entries(it).map(([k, v]) => ({ label: fieldName(k), value: v }));
        const lead = it.term ?? it.idea ?? it.trend ?? Object.values(it)[0] ?? "";
        const meta = it.type ? it.type : it.format ? it.format : undefined;
        return { label: String(i + 1), text: lead, fields, meta };
      });
      return { layout: fielded ? "cards" : "lines", count: items.length, blocks: [{ title: null, items }] };
    }
    case "script": {
      const items = output.sections.map((s): ResultItem => ({
        label: s.section.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
        text: s.spoken,
        meta: `${s.seconds} s`,
        fields: [
          { label: "Say", value: s.spoken },
          { label: "On screen", value: s.on_screen },
        ],
      }));
      return { layout: "beats", count: items.length, blocks: [{ title: null, items }] };
    }
    case "caption_set": {
      const blocks = output.captions.map((c): ResultBlock => ({
        title: PLATFORM_NAMES[c.platform] ?? c.platform,
        items: c.variants.map((v, i): ResultItem => {
          const parts = labelledLines(v);
          return { label: c.variants.length > 1 ? `Variant ${i + 1}` : (PLATFORM_NAMES[c.platform] ?? c.platform), text: v, fields: parts ?? [] };
        }),
      }));
      return { layout: "platforms", count: blocks.reduce((n, b) => n + b.items.length, 0), blocks };
    }
    case "post_set": {
      const blocks = output.posts.map((p, i): ResultBlock => ({
        title: `${FORMAT_NAMES[p.format] ?? p.format}${output.posts.filter((x) => x.format === p.format).length > 1 ? ` ${output.posts.slice(0, i + 1).filter((x) => x.format === p.format).length}` : ""}`,
        items: p.parts.map((t, j): ResultItem => ({ label: p.format === "post" ? "Post" : String(j + 1), text: t, fields: [] })),
      }));
      return { layout: "platforms", count: blocks.reduce((n, b) => n + b.items.length, 0), blocks };
    }
  }
}

/** The whole result as plain text, for one copy button. */
export function copyAll(output: RunOutput): string {
  const view = resultView(output);
  return view.blocks
    .map((b) => {
      const lines = b.items.map((it) => (it.fields.length ? it.fields.map((f) => `${f.label}: ${f.value}`).join("\n") : view.layout === "lines" && view.count > 1 ? `${it.label}. ${it.text}` : it.text));
      return [b.title ? `${b.title}` : null, ...lines].filter((x) => x !== null).join("\n\n");
    })
    .join("\n\n\n");
}

/** Words for the output kind, for headings: "10 hooks", "4 beats". */
export function resultNoun(spec: Pick<AgentSpec, "id" | "output">, count: number): string {
  const one: Record<string, [string, string]> = {
    "hook-writer": ["hook", "hooks"],
    "idea-generator": ["idea", "ideas"],
    "hashtag-picker": ["tag and search word", "tags and search words"],
    "caption-writer": ["caption", "captions"],
    repurposer: ["version", "versions"],
    "script-writer": ["beat", "beats"],
    "trend-scout": ["trend", "trends"],
  };
  const byKind: Record<RunOutput["kind"], [string, string]> = { text: ["text", "texts"], list: ["item", "items"], script: ["beat", "beats"], caption_set: ["caption", "captions"], post_set: ["post", "posts"] };
  const [a, b] = one[spec.id] ?? byKind[spec.output.kind as RunOutput["kind"]] ?? ["item", "items"];
  return `${count} ${count === 1 ? a : b}`;
}

/* ---------- Checks in plain words ---------- */

export type CheckExplanation = { title: string; detail: string; findings: string[]; tone: "fail" | "note" };

const TITLES: Record<string, string> = {
  anti_slop_phrases: "Uses filler phrases",
  misleading_claim_phrases: "Makes a claim it cannot back up",
  testimonial_phrases: "Reads like an invented review",
  impersonation_phrases: "Speaks as someone else",
  unsafe_phrases: "Gives unsafe advice",
  brand_banned_words: "Uses words your brand avoids",
  brand_fit: "Breaks a brand rule",
  specific_to_input: "Could be about anyone",
  platform_lengths: "Too long for the platform",
  ai_label: "Label it as AI where the platform asks",
};

const DETAILS: Record<string, string> = {
  anti_slop_phrases: "These lines could come from any brand. Swap them for something only you would say.",
  misleading_claim_phrases: "Promises about results, money or health need proof. Soften or cut them before posting.",
  testimonial_phrases: "Quotes and reviews must be real. Remove any that are not.",
  impersonation_phrases: "Nothing should speak as a real person who is not you.",
  unsafe_phrases: "Keep to what you can stand behind and point people to a professional where it matters.",
  brand_banned_words: "Your Brand Brain lists these as words to never use.",
  brand_fit: "Checked against the dos and don'ts in your Brand Brain.",
  specific_to_input: "Nothing in it names what you typed, or lines repeat. Add a real detail and run it again.",
  platform_lengths: "Trim it so it fits.",
  ai_label: "Some platforms ask for an AI-content label. Add it when you post.",
};

/** A failed or noted check, in the words a person needs. Null for a pass. */
export function explainCheck(check: CheckResult): CheckExplanation | null {
  if (check.status === "pass") return null;
  if (check.status === "note" && check.check !== "ai_label" && check.check !== "brand_fit") return null;
  if (check.check === "brand_fit" && check.status === "note") {
    return { title: "Reads a little unlike your voice", detail: "Compared with the sample lines in your Brand Brain. A quick edit for your brand usually fixes it.", findings: check.findings ?? [], tone: "note" };
  }
  return {
    title: TITLES[check.check] ?? check.message,
    detail: DETAILS[check.check] ?? check.message,
    findings: check.findings ?? [],
    tone: check.status === "fail" ? "fail" : "note",
  };
}

/** Every failed check first, then the notes worth showing. */
export function explainChecks(checks: CheckResult[]): CheckExplanation[] {
  const out = checks.map(explainCheck).filter((c): c is CheckExplanation => c !== null);
  return [...out.filter((c) => c.tone === "fail"), ...out.filter((c) => c.tone === "note")];
}

/** The brand-fit score, 0 to 100, when the run read one. */
export function brandFitOf(run: Pick<PublicRun, "checks">): number | null {
  const c = run.checks.find((x) => x.check === "brand_fit" && typeof x.score === "number");
  return c?.score ?? null;
}

/* ---------- One status per run ---------- */

export type RunState = "queued" | "running" | "failed" | "cancelled" | "needs_review" | "ready" | "approved" | "rejected";

export const STATE_LABELS: Record<RunState, string> = {
  queued: "In the queue",
  running: "Running",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_review: "Needs review",
  ready: "Ready",
  approved: "Approved",
  rejected: "Rejected",
};

/** The run's state as the person sees it: the engine's status, then the human decision. */
export function runState(run: Pick<PublicRun, "status" | "needsReview">, review: Pick<ReviewRow, "decision"> | null): RunState {
  if (run.status === "queued" || run.status === "running" || run.status === "failed" || run.status === "cancelled") return run.status;
  if (review) return review.decision;
  return run.needsReview ? "needs_review" : "ready";
}

/** Which Wovi pose a state gets. */
export function poseFor(state: RunState): "move" | "wait" | "done" | "hello" {
  if (state === "queued" || state === "running") return "move";
  if (state === "failed" || state === "cancelled") return "wait";
  return "done";
}

/** The run's own title: the first text input, shortened. */
export function runTitle(run: Pick<PublicRun, "inputs">, spec: Pick<AgentSpec, "inputs"> | null, max = 90): string {
  const keys = spec ? spec.inputs.filter((i) => i.type === "text" || i.type === "long_text").map((i) => i.key) : Object.keys(run.inputs);
  for (const k of keys) {
    const v = run.inputs[k];
    if (typeof v === "string" && v.trim()) {
      // The note a quick edit or a change request added is not part of the title. Cut it before folding the whitespace.
      const cut = v.lastIndexOf(`\n\nNote for this run: `);
      const clean = (cut === -1 ? v : v.slice(0, cut)).replace(/\s+/g, " ").trim();
      return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}...` : clean;
    }
  }
  return "Untitled run";
}

/** Every piece of text in a run, for search. */
export function runSearchText(run: Pick<PublicRun, "inputs" | "output">): string {
  const inputs = Object.values(run.inputs).flatMap((v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : "")) : []));
  const output = run.output ? copyAll(run.output) : "";
  return [...inputs, output].join("\n").toLowerCase();
}
