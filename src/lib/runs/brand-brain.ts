/**
 * The Brand Brain as the run engine sees it: the parts an agent may read,
 * already flattened to text and lists. The stored Brand Brain (phase 7,
 * src/lib/brand) is richer: versions, files, reference notes. Its source
 * turns the current version into this shape (see src/lib/brand/source.ts).
 */
import { createHash } from "node:crypto";
import type { BrandBrainPart } from "@/lib/agents/catalog";

export type BrandBrain = {
  id: string;
  workspaceId: string;
  name: string;
  updatedAt: string;
  /** How the brand sounds, in a few sentences. */
  voice: string;
  /** The voice in detail, when the Brand Brain has it: tone tags, words to use and avoid, sample lines, topics. */
  voiceDetail?: { tone: string[]; use: string[]; avoid: string[]; samples: string[]; topics: string[] };
  /** Who it is for, in a few words. */
  niche?: string;
  /** Words for the look: colours, light, pace, framing. */
  mood_board: string[];
  /** Past posts that worked. */
  references: string[];
  dos_donts: { dos: string[]; donts: string[]; bannedWords: string[] };
  /** The bigger idea behind the brand. */
  idea: string;
};

/** What a run records about the Brand Brain it used. */
export type BrandBrainRef = {
  id: string;
  /** The Brand Brain's name when the run started. */
  name?: string;
  updatedAt: string;
  parts: BrandBrainPart[];
  /** Hash of the parts as they were filled in, so a later edit is visible. */
  hash: string;
};

/** The agent a run is for, so a source can add the agent's own references (its mood board) to the parts. */
export type BrandBrainAgentRef = { workspaceId: string; id: string };

export interface BrandBrainSource {
  /** One Brand Brain by id, or the workspace's default when id is left out. Null when none. */
  get(workspaceId: string, id?: string, agent?: BrandBrainAgentRef): Promise<BrandBrain | null>;
}

/** Fixed Brand Brains. The first one per workspace is its default. */
export function staticBrandBrains(brains: BrandBrain[]): BrandBrainSource {
  return {
    async get(workspaceId, id) {
      const mine = brains.filter((b) => b.workspaceId === workspaceId);
      const found = id === undefined ? mine[0] : mine.find((b) => b.id === id);
      return found ? structuredClone(found) : null;
    },
  };
}

/** A sample Brand Brain for a small bakery, used in dev and tests. */
export function sampleBrandBrain(workspaceId: string, id = "bb_default"): BrandBrain {
  return {
    id,
    workspaceId,
    name: "Crumb and Co",
    updatedAt: "2026-10-21T00:00:00.000Z",
    voice: "Warm, dry humour, short sentences. Talks like the baker at 5 a.m., not like a brand.",
    mood_board: ["flour dust in morning light", "close hands, slow pours", "cream, rust and dark wood"],
    references: [
      "We burned 40 croissants so you would not have to. Here is what we learned.",
      "The sourdough starter is called Gerald. Gerald is nine years old.",
    ],
    dos_donts: {
      dos: ["Show the hands and the process", "Name the real ingredient"],
      donts: ["No discounts in the first line", "Never call anything artisanal"],
      bannedWords: ["artisanal", "mouthwatering"],
    },
    idea: "Honest baking: show the mess behind every good loaf.",
  };
}

/** Every workspace gets the sample brain as its default. For tests only; the app reads the real store (src/lib/brand). */
export function stubBrandBrains(): BrandBrainSource {
  return {
    async get(workspaceId, id) {
      if (id !== undefined && id !== "bb_default") return null;
      return sampleBrandBrain(workspaceId);
    },
  };
}

const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "None given.");

/** One part as text for a prompt. */
export function renderBrandPart(brain: BrandBrain | null, part: BrandBrainPart): string {
  if (!brain) return "Not set yet.";
  switch (part) {
    case "voice":
      return renderVoice(brain);
    case "idea":
      return brain.idea || "Not set yet.";
    case "mood_board":
      return list(brain.mood_board);
    case "references":
      return list(brain.references);
    case "dos_donts":
      return [
        "Do:",
        list(brain.dos_donts.dos),
        "Don't:",
        list(brain.dos_donts.donts),
        `Never use these words: ${brain.dos_donts.bannedWords.join(", ") || "none"}`,
      ].join("\n");
  }
}

function renderVoice(brain: BrandBrain): string {
  const d = brain.voiceDetail;
  const lines: string[] = [];
  if (brain.voice) lines.push(brain.voice);
  if (brain.niche) lines.push(`Niche: ${brain.niche}`);
  if (d?.tone.length) lines.push(`Tone: ${d.tone.join(", ")}`);
  if (d?.topics.length) lines.push(`Topics: ${d.topics.join(", ")}`);
  if (d?.use.length) lines.push(`Words to use: ${d.use.join(", ")}`);
  if (d?.avoid.length) lines.push(`Words to avoid: ${d.avoid.join(", ")}`);
  if (d?.samples.length) lines.push("Lines that sound right:", list(d.samples));
  return lines.length ? lines.join("\n") : "Not set yet.";
}

export function brandBrainRef(brain: BrandBrain, parts: readonly BrandBrainPart[]): BrandBrainRef {
  const filled = parts.map((p) => `${p}\n${renderBrandPart(brain, p)}`).join("\n\n");
  return {
    id: brain.id,
    name: brain.name,
    updatedAt: brain.updatedAt,
    parts: [...parts],
    hash: createHash("sha256").update(filled).digest("hex").slice(0, 16),
  };
}
