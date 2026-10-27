/**
 * What the public agent pages (/agents/[id]) say about each live launch agent,
 * built from its spec so a page stays true when the agent changes: the
 * public view only (no instructions, no model routes, no safety list), the
 * output shape in plain words, the form as a read-only list, the Brand Brain
 * parts it reads, its quality bar and the pipeline templates it is part of.
 *
 * Nothing here runs an agent. Server-side and static.
 */
import type { IconName } from "@/components/ui/Icon";
import { LAUNCH_AGENTS } from "@/lib/launch/specs";
import { PIPELINE_TEMPLATES } from "@/lib/pipelines/templates";
import { gateFor } from "@/lib/quality/data";
import { BRAND_BRAIN_PARTS, BRAND_BRAIN_PART_LABELS, GUARDRAILS, PLATFORMS, type BrandBrainPart, type Platform } from "./catalog";
import { SHOWCASE, type ShowcaseExample } from "./showcase";
import { publicView, validateAgentSpec, type AgentInput, type AgentOutput } from "./spec";

export type ShowcaseAgent = ReturnType<typeof publicView>;

export const PLATFORM_FULL_NAMES: Record<Platform, string> = { x: "X", tiktok: "TikTok", shorts: "YouTube Shorts", reels: "Instagram Reels" };

/** The live, public launch agents as anyone may see them, in the product doc's order. */
export function showcaseAgents(): ShowcaseAgent[] {
  return LAUNCH_AGENTS.map((input) => {
    const r = validateAgentSpec(input);
    if (!r.ok) throw new Error(`Launch agent ${input.id} is not a valid spec: ${r.errors.join("; ")}`);
    return publicView(r.value);
  }).filter((a) => a.status === "live" && a.visibility === "public");
}

/** One live agent's public view, or null for an unknown or non-live id. */
export function showcaseAgent(id: string): ShowcaseAgent | null {
  return showcaseAgents().find((a) => a.id === id) ?? null;
}

/** The real result shown on an agent's page. */
export function showcaseExample(id: string): ShowcaseExample | null {
  return SHOWCASE[id] ?? null;
}

/** The platforms an agent writes for, by their full names, in launch order. */
export function platformNames(agent: Pick<ShowcaseAgent, "platforms">): string[] {
  return PLATFORMS.filter((p) => agent.platforms.includes(p)).map((p) => PLATFORM_FULL_NAMES[p]);
}

/* ---------- What you get ---------- */

export type GetLine = { icon: IconName; title: string; text: string };

const fieldList = (o: AgentOutput) => (o.kind === "list" ? (o.fields ?? []) : []);
const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The lengths an agent's form offers ("15, 30 or 60 seconds"), when it has a length choice. */
function lengthWords(agent: ShowcaseAgent): string | null {
  const input = agent.inputs.find((i) => i.key === "length" && i.type === "choice");
  if (!input || input.type !== "choice") return null;
  const secs = input.options.map((o) => /^(\d+) seconds$/.exec(o.label)?.[1]).filter((x): x is string => Boolean(x));
  if (secs.length !== input.options.length) return null;
  return `${secs.slice(0, -1).join(", ")} or ${secs[secs.length - 1]} seconds`;
}

/**
 * The output in plain words, three lines per agent. Every number comes from
 * the spec's output shape. An agent whose shape changed kind falls back to
 * lines read straight off the shape.
 */
export function whatYouGet(agent: ShowcaseAgent): GetLine[] {
  const o = agent.output;
  const words = (n: number | undefined) => (n ? `, at most ${n} words` : "");
  switch (agent.id) {
    case "trend-scout":
      if (o.kind === "list" && fieldList(o).includes("source"))
        return [
          { icon: "search", title: `${o.count} trends, strongest first`, text: "Formats, sounds and topics rising on the platform you pick. A live web search runs before it writes, so every trend comes from a page it found." },
          { icon: "link", title: "Evidence and a source for each", text: "What the page says, with its date, and the address it came from." },
          { icon: "bulb", title: "How you could use it", text: `One post your business could make this week with a phone. Each part${words(o.maxWordsPerItem)}.` },
        ];
      break;
    case "idea-generator":
      if (o.kind === "list" && o.fields)
        return [
          { icon: "bulb", title: `${o.count} post ideas, strongest first`, text: "A week of posts, each one a real moment, object or question from your business instead of a theme." },
          { icon: "film", title: "A format for each", text: "How each one is made, like talking to camera, a voiceover, a step-by-step demo or a short thread." },
          { icon: "check", title: "Why it fits", text: `One line on why your audience would watch, share or act on it${words(o.maxWordsPerItem)}.` },
        ];
      break;
    case "hook-writer":
      if (o.kind === "list" && !o.fields)
        return [
          { icon: "grid", title: `${o.count} hooks, each a different angle`, text: "A number, a mistake, a contrast, a question and more, strongest first, so you get a real choice." },
          { icon: "pen", title: `At most ${o.maxWordsPerItem ?? 12} words each`, text: "Said in the first two seconds of a video, or the first line of a post on X." },
          { icon: "check", title: "Built from your idea", text: "Every hook names something from your idea, so none of them could open someone else's post." },
        ];
      break;
    case "script-writer":
      if (o.kind === "script") {
        const len = lengthWords(agent);
        return [
          { icon: "film", title: `A script in ${o.sections.length} beats`, text: `${upper(and(o.sections.map((s) => lower(s.replace(/_/g, " ")))))}, in that order.` },
          { icon: "clock", title: "Timed to the second", text: `Each beat has its seconds, adding up to the length you pick${len ? `: ${len}` : `, up to ${o.maxSeconds} seconds`}.` },
          { icon: "pen", title: "What to say and what to show", text: "The exact words, then the shot and any on-screen text for each beat, using only what you can film." },
        ];
      }
      break;
    case "caption-writer":
      if (o.kind === "caption_set")
        return [
          { icon: "layers", title: `${o.variants} captions per platform`, text: "For each platform you pick, each one from a different angle, not just different wording." },
          { icon: "check", title: "Made for each platform", text: "A searchable title on YouTube Shorts, the point up front on Reels and TikTok, and 280 characters at most on X." },
          { icon: "pen", title: "Ready to paste", text: "Your facts word for word, and one clear next step when the post earns one. No hashtags; Hashtag Optimizer does those." },
        ];
      break;
    case "hashtag-picker":
      if (o.kind === "list" && fieldList(o).includes("where"))
        return [
          { icon: "hash", title: `${o.count} hashtags and search words`, text: "A mix that fits the platform: more hashtags on TikTok and Reels, more search words on X and YouTube Shorts." },
          { icon: "link", title: "Where each one goes", text: "The exact spot, like the first line of the caption, the Shorts title or the on-screen text." },
          { icon: "check", title: "Why each one fits", text: `Who searches or follows it and what they are looking for${words(o.maxWordsPerItem)}.` },
        ];
      break;
    case "repurposer":
      if (o.kind === "caption_set")
        return [
          { icon: "layers", title: o.variants === 1 ? "One version per platform" : `${o.variants} versions per platform`, text: "For each platform you pick, a version made for it, not pasted into it." },
          { icon: "film", title: "Ready to film for video", text: "For TikTok, YouTube Shorts and Instagram Reels: the hook, the script, what is on screen and the caption." },
          { icon: "check", title: "Same point, same facts", text: "Every number, name and date kept as it was, and the lines you mark kept word for word." },
        ];
      break;
  }
  return shapeLines(o);
}

/** Lines read straight off an output shape, for an agent without its own words. */
function shapeLines(o: AgentOutput): GetLine[] {
  switch (o.kind) {
    case "list":
      return [
        { icon: "grid", title: `${o.count} items`, text: o.fields ? `Each with ${and(o.fields.map((f) => lower(f.replace(/_/g, " "))))}.` : "One per line, ready to copy." },
        { icon: "pen", title: o.maxWordsPerItem ? `At most ${o.maxWordsPerItem} words each` : "Short and to the point", text: "Written for the platform you pick." },
        { icon: "check", title: "Checked before you see it", text: "Every result goes through the quality checks below." },
      ];
    case "script":
      return [
        { icon: "film", title: `A script in ${o.sections.length} beats`, text: `${upper(and(o.sections.map((s) => lower(s.replace(/_/g, " ")))))}.` },
        { icon: "clock", title: `Up to ${o.maxSeconds} seconds`, text: "Each beat timed to the second." },
        { icon: "check", title: "Checked before you see it", text: "Every result goes through the quality checks below." },
      ];
    case "caption_set":
      return [
        { icon: "layers", title: `${o.variants} per platform`, text: "For each platform you pick." },
        { icon: "pen", title: `At most ${o.maxChars} characters`, text: "Inside each platform's limits." },
        { icon: "check", title: "Checked before you see it", text: "Every result goes through the quality checks below." },
      ];
    default:
      return [{ icon: "check", title: "Checked before you see it", text: "Every result goes through the quality checks below." }];
  }
}

/** "10 hooks", "4 beats": what one run hands back, in a few words. */
export function handsBack(agent: ShowcaseAgent): string {
  const o = agent.output;
  const noun: Record<string, string> = {
    "trend-scout": "trends",
    "idea-generator": "post ideas",
    "hook-writer": "hooks",
    "hashtag-picker": "tags and search words",
  };
  switch (o.kind) {
    case "list":
      return `${o.count} ${noun[agent.id] ?? "items"}`;
    case "script":
      return `A script in ${o.sections.length} beats`;
    case "caption_set":
      return agent.id === "repurposer" ? "A version per platform" : `${o.variants} captions per platform`;
    default:
      return "A finished draft";
  }
}

/* ---------- What it asks you ---------- */

export type AskRow = {
  key: string;
  label: string;
  required: boolean;
  /** The kind of answer, in plain words: "A few words", "Pick one". */
  kind: string;
  help: string | null;
  /** The choices for a choice input, with the one picked by default. */
  options: { label: string; isDefault: boolean }[];
};

function kindWords(i: AgentInput): string {
  switch (i.type) {
    case "text":
      return `A few words, up to ${i.limits.maxLength} characters`;
    case "long_text":
      return `A few sentences, up to ${i.limits.maxLength.toLocaleString("en-US")} characters`;
    case "choice":
      return i.multiple ? "Pick one or more" : "Pick one";
    case "profile":
      return "Pick a Brand Brain";
    case "number":
      return `A number from ${i.limits.min} to ${i.limits.max}`;
    case "url":
      return "A web address";
    case "file":
      return "A file";
    case "image":
      return "An image";
    case "video":
      return "A video";
  }
}

/** The agent's form as a read-only list, in its own order. */
export function askRows(agent: ShowcaseAgent): AskRow[] {
  return agent.inputs.map((i) => {
    const defaults = i.type === "choice" ? [i.default ?? []].flat() : [];
    return {
      key: i.key,
      label: i.label,
      required: i.required,
      kind: kindWords(i),
      help: i.help ?? null,
      options: i.type === "choice" ? i.options.map((o) => ({ label: o.label, isDefault: defaults.includes(o.value) })) : [],
    };
  });
}

/** How the example run filled in the form: each input it carried, by its label, in plain words. */
export function askedValues(agent: ShowcaseAgent, inputs: Record<string, string | string[]>): { label: string; text: string }[] {
  return agent.inputs
    .filter((i) => i.type !== "profile" && inputs[i.key] !== undefined)
    .map((i) => {
      const v = inputs[i.key];
      const text =
        i.type === "choice"
          ? [v]
              .flat()
              .map((p) => i.options.find((o) => o.value === p)?.label ?? p)
              .join(", ")
          : [v].flat().join(", ");
      return { label: i.label, text };
    });
}

/* ---------- Brand Brain ---------- */

const PART_WORDS: Record<BrandBrainPart, string> = {
  voice: "How you sound: how long your sentences run, the words you reach for and the ones you never use.",
  references: "Posts that worked for you. It learns their shape, how they open and how they end, without copying your lines.",
  dos_donts: "Every do wherever it fits. Every don't is a hard rule.",
  mood_board: "The look you want: light, colour, framing and pace for what is on screen.",
  idea: "The bigger idea behind your brand. What it writes serves it and never works against it.",
};

/** Every Brand Brain part, with whether this agent reads it. */
export function brainParts(agent: ShowcaseAgent): { part: BrandBrainPart; label: string; text: string; used: boolean }[] {
  // Voice first, the look near the end; then the parts it reads before the ones it does not.
  const order: BrandBrainPart[] = ["voice", "references", "dos_donts", "mood_board", "idea"];
  const all = [...order, ...BRAND_BRAIN_PARTS.filter((p) => !order.includes(p))];
  return all
    .map((part) => ({ part, label: BRAND_BRAIN_PART_LABELS[part], text: PART_WORDS[part], used: agent.brandBrain.includes(part) }))
    .sort((a, b) => Number(b.used) - Number(a.used));
}

/* ---------- Quality ---------- */

/** The agent's bar and rewrite cap, and its own guardrails by name. */
export function qualityGate(agent: ShowcaseAgent): { bar: number; rewrites: number; guardrails: string[] } {
  const g = gateFor(agent);
  return { bar: g.minScore, rewrites: g.maxRewrites, guardrails: agent.guardrails.map((id) => GUARDRAILS.find((x) => x.id === id)?.label ?? id) };
}

/* ---------- Chains ---------- */

export type ChainView = { id: string; name: string; job: string; steps: { label: string; agentId: string; agentName: string }[] };

/** The pipeline templates this agent is a step of, with each step's agent by name. */
export function chainsFor(agentId: string): ChainView[] {
  const names = Object.fromEntries(showcaseAgents().map((a) => [a.id, a.name]));
  return PIPELINE_TEMPLATES.filter((t) => t.steps.some((s) => s.agent.id === agentId)).map((t) => ({
    id: t.id,
    name: t.name,
    job: t.job,
    steps: t.steps.map((s) => ({ label: s.label, agentId: s.agent.id, agentName: names[s.agent.id] ?? s.agent.id })),
  }));
}
