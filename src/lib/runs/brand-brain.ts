/**
 * A minimal Brand Brain, just enough for the run engine to fill prompts. The
 * real Brand Brain (onboarding, editing, versions) is phase 7; it will
 * implement BrandBrainSource and nothing in the engine changes.
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
  updatedAt: string;
  parts: BrandBrainPart[];
  /** Hash of the parts as they were filled in, so a later edit is visible. */
  hash: string;
};

export interface BrandBrainSource {
  /** One Brand Brain by id, or the workspace's default when id is left out. Null when none. */
  get(workspaceId: string, id?: string): Promise<BrandBrain | null>;
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

/** Every workspace gets the sample brain as its default. Stands in until phase 7. */
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
      return brain.voice || "Not set yet.";
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

export function brandBrainRef(brain: BrandBrain, parts: readonly BrandBrainPart[]): BrandBrainRef {
  const filled = parts.map((p) => `${p}\n${renderBrandPart(brain, p)}`).join("\n\n");
  return {
    id: brain.id,
    updatedAt: brain.updatedAt,
    parts: [...parts],
    hash: createHash("sha256").update(filled).digest("hex").slice(0, 16),
  };
}
