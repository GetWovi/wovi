/**
 * The quality system's data (phase 12): the banned generic phrases and filler
 * words per language, the platform rules, the check weights and the default
 * bar per category. Everything here is data, so tuning it never touches the
 * checks or the engine. Client-safe.
 */
import type { Category, Platform } from "@/lib/agents/catalog";
import type { GateSettings, QualityCheckId } from "./types";

export const LANGUAGES = ["en"] as const;
export type Language = (typeof LANGUAGES)[number];

/**
 * Generic lines that could come from any brand. One hit fails the check.
 * Matched case-insensitively on word boundaries. More languages come later as
 * new keys.
 */
export const GENERIC_PHRASES: Record<Language, string[]> = {
  en: [
    // The phase 3 anti-slop list.
    "in today's fast-paced",
    "digital landscape",
    "game-changing",
    "game changer",
    "unlock your",
    "unlock the power",
    "unleash",
    "next-level",
    "take it to the next level",
    "elevate your",
    "let's dive in",
    "dive into",
    "delve",
    "look no further",
    "revolutionize",
    "cutting-edge",
    "harness the power",
    "it's no secret",
    "embark on a journey",
    "a testament to",
    "tapestry",
    "buckle up",
    "secret sauce",
    "supercharge",
    "skyrocket",
    "in the world of",
    "you won't believe",
    // Added in phase 12.
    "we've got you covered",
    "we have got you covered",
    "this changes everything",
    "stop scrolling",
    "ever wondered",
    "did you know",
    "look no more",
    "level up your",
    "must-have",
    "seamless",
    "seamlessly",
    "in this day and age",
    "whether you're a",
    "the ultimate guide",
    "say goodbye to",
    "say hello to",
    "has never been easier",
    "like a pro",
    "the secret to",
    "here's the thing",
    "trust me",
    "you need this",
    "best kept secret",
    "hidden gem",
    "a must-see",
    "don't miss out",
  ],
};

/**
 * Filler words: not wrong on their own, but a line made of them says
 * nothing. Each one costs the specificity score a little.
 */
export const FILLER_WORDS: Record<Language, string[]> = {
  en: [
    "amazing",
    "incredible",
    "awesome",
    "stunning",
    "epic",
    "insane",
    "mind-blowing",
    "unbelievable",
    "literally",
    "truly",
    "totally",
    "super",
    "stuff",
    "things",
    "something",
    "everyone",
    "everything",
    "anyone",
    "best ever",
    "so good",
    "vibes",
  ],
};

/** Words that never count as a concrete detail, even when the input has them. */
export const VAGUE_WORDS = new Set(
  "about after again also because been before being could does doing down each every from have here into just like make many more most much only other over same should some such than that their them then there these they this those through very what when where which while will with would your yours post posts video videos content today thing things people know need want really".split(
    " ",
  ),
);

/**
 * Platform rules. Hard limits break the check; soft ones only lower it.
 * Caption lengths are each platform's own limit; hashtag counts and the
 * Reels first line are WOVI's house rules, set to match the launch agents'
 * instructions. Check them against the platforms before launch.
 */
export type PlatformRule = {
  name: string;
  /** Longest caption or post, in characters. */
  captionChars: number;
  /** Most hashtags in one caption, or in one set of tags. */
  hashtagsMax: number;
  /** Longest title, for platforms with one (the first line of a Shorts caption). */
  titleChars: number | null;
  /** Soft: the first line shows before "more", so the point should be in it. */
  firstLineChars: number | null;
};

export const PLATFORM_RULES: Record<Platform, PlatformRule> = {
  x: { name: "X", captionChars: 280, hashtagsMax: 2, titleChars: null, firstLineChars: null },
  tiktok: { name: "TikTok", captionChars: 2200, hashtagsMax: 5, titleChars: null, firstLineChars: null },
  shorts: { name: "YouTube Shorts", captionChars: 5000, hashtagsMax: 15, titleChars: 100, firstLineChars: null },
  reels: { name: "Instagram Reels", captionChars: 2200, hashtagsMax: 5, titleChars: null, firstLineChars: 125 },
};

/** Thread posts on X. */
export const THREAD_PART_CHARS = 280;

/** The checks, their names and their share of the combined score. Skipped checks drop out and the rest are scaled up. */
export const CHECKS: Record<QualityCheckId, { label: string; weight: number; what: string }> = {
  specificity: { label: "Specific to you", weight: 25, what: "Names real details from your input and Brand Brain: names, numbers, places, the thing itself." },
  generic_phrases: { label: "No generic phrases", weight: 20, what: "None of the stock lines that could come from any brand." },
  brand_fit: { label: "Brand fit", weight: 20, what: "Keeps your Brand Brain's rules and sounds like its sample lines." },
  reference_anchoring: { label: "Like your best posts", weight: 15, what: "Close to your own posts that worked and to the agent's best examples." },
  claims: { label: "No misleading claims", weight: 10, what: "No promises about results, money or health, no invented reviews, nobody else's voice." },
  platform_rules: { label: "Fits the platform", weight: 10, what: "Inside each platform's length, title and hashtag limits." },
  judge: { label: "Second opinion", weight: 25, what: "A model reads it against a rubric. Off unless switched on." },
};

/** A check that fails caps the combined score here, so a score never reads "fine" over a hard problem. */
export const FAIL_CAP = 55;

/** Points off for each generic phrase, each filler word and each repeated line. */
export const PENALTIES = { genericPhrase: 35, fillerWord: 6, fillerMax: 30, repeat: 25, platformSoft: 8, platformHard: 40, badReference: 15 } as const;

/** Below this a check that does not fail on its own is weak. */
export const WEAK_BELOW = 60;

/** The default bar per category. An agent's spec can set its own (`gate.minScore`). */
export const DEFAULT_BAR: Record<Category, number> = {
  research: 60,
  ideation: 65,
  writing: 70,
  production: 65,
  optimization: 65,
  publish: 70,
};

/** Rewrites the gate may run per run, when the spec does not say. The spec may set 0, 1 or 2. */
export const DEFAULT_MAX_REWRITES = 2;
export const MAX_REWRITES_LIMIT = 2;

export function gateDefaults(category: Category): GateSettings {
  return { minScore: DEFAULT_BAR[category] ?? 65, maxRewrites: DEFAULT_MAX_REWRITES };
}

/** The agent's bar and rewrite cap: its spec's `gate`, else the defaults for its category. */
export function gateFor(spec: { category: Category; gate?: Partial<GateSettings> }): GateSettings {
  const d = gateDefaults(spec.category);
  return {
    minScore: spec.gate?.minScore ?? d.minScore,
    maxRewrites: Math.max(0, Math.min(MAX_REWRITES_LIMIT, spec.gate?.maxRewrites ?? d.maxRewrites)),
  };
}
