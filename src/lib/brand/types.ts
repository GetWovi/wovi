/**
 * The Brand Brain: one brand (or client) a workspace writes for. Every agent
 * anchors to it. A workspace may hold several; one is its default.
 *
 * A Brand Brain is a listing row plus immutable versions, like an agent: an
 * edit never changes a version, it saves the next one, with who saved it and
 * which fields changed.
 */
import type { Platform } from "@/lib/agents/catalog";
import type { StoredFile } from "@/lib/builder/storage";

export type Voice = {
  /** How the brand sounds, in a few plain sentences. */
  description: string;
  /** Tone tags, like "warm" or "punchy". */
  tone: string[];
  /** Words and short phrases the brand reaches for. */
  use: string[];
  /** Words the brand never uses. The brand-fit check flags them. */
  avoid: string[];
  /** Lines that sound exactly right. The brand-fit check compares drafts with them. */
  samples: string[];
};

/** A past post that worked: pasted text, a link, or both, with a note on why it works. */
export type Reference = {
  id: string;
  text: string;
  url: string | null;
  note: string;
};

export const MOOD_KINDS = ["image", "link", "text", "swatch"] as const;
export type MoodKind = (typeof MOOD_KINDS)[number];

/** One item on the mood board. Images live in FileStorage under the workspace. */
export type MoodItem = {
  id: string;
  kind: MoodKind;
  note: string;
  url: string | null;
  text: string | null;
  /** #RRGGBB for a swatch. */
  color: string | null;
  file: StoredFile | null;
};

/** Everything a version holds. */
export type BrainBody = {
  name: string;
  /** Who it is for, in a few words: "Small bakery in Leeds". */
  niche: string;
  platforms: Platform[];
  voice: Voice;
  topics: string[];
  references: Reference[];
  moodBoard: MoodItem[];
  dos: string[];
  donts: string[];
  /** The standing idea behind the brand. A run may bring its own idea instead. */
  idea: string;
};

export const BODY_FIELDS = ["name", "niche", "platforms", "voice", "topics", "references", "moodBoard", "dos", "donts", "idea"] as const satisfies readonly (keyof BrainBody)[];
export type BodyField = (typeof BODY_FIELDS)[number];

export const FIELD_LABELS: Record<BodyField, string> = {
  name: "Name",
  niche: "Niche",
  platforms: "Platforms",
  voice: "Voice",
  topics: "Topics",
  references: "References",
  moodBoard: "Mood board",
  dos: "Dos",
  donts: "Don'ts",
  idea: "Idea",
};

/** The listing row: one per Brand Brain. */
export type Brain = {
  id: string;
  workspaceId: string;
  name: string;
  isDefault: boolean;
  currentVersion: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** One immutable version. */
export type BrainVersion = {
  /** `${brainId}@${version}` */
  id: string;
  workspaceId: string;
  brainId: string;
  version: number;
  body: BrainBody;
  note: string;
  /** Which fields differ from the version before. Every field on version 1. */
  changed: BodyField[];
  /** A user id, or `key:<id>` for an API key. */
  by: string;
  at: string;
};

/** A proposed profile from past posts, waiting for the person to review it. */
export type ProfileProposal = {
  voice: Voice;
  topics: string[];
  dos: string[];
  donts: string[];
};

/** What the heuristics noticed, shown beside the proposal. */
export type PostSignals = {
  posts: number;
  wordsPerPost: number;
  wordsPerSentence: number;
  emojiPerPost: number;
  hashtagsPerPost: number;
  exclaimShare: number;
  questionShare: number;
  lowercaseShare: number;
  capsWords: number;
  linesPerPost: number;
  youShare: number;
  meShare: number;
  opening: { kind: OpeningKind; count: number } | null;
  recurring: string[];
  hashtags: string[];
};

export const OPENING_KINDS = ["question", "number", "personal", "command", "quote", "statement"] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];

/** One past post as pasted: text, or a link (read only when a link fetcher is set up). */
export type PastPost = { text: string; url: string | null };

/** A profile job: the posts, the proposal, and how it was made. Saved only after review. */
export type Proposal = {
  id: string;
  workspaceId: string;
  /** Set when the proposal rebuilds an existing Brand Brain. */
  brainId: string | null;
  name: string;
  niche: string;
  platforms: Platform[];
  posts: PastPost[];
  /** Links that were not read, and why. */
  unread: string[];
  signals: PostSignals;
  profile: ProfileProposal;
  source: "heuristics" | "fake" | "model";
  model: { route: string; provider: string; model: string } | null;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
  notes: string[];
  status: "open" | "saved";
  savedBrainId: string | null;
  createdBy: string;
  createdAt: string;
};

export const TONE_TAGS = [
  "warm",
  "dry",
  "playful",
  "punchy",
  "calm",
  "bold",
  "direct",
  "personal",
  "curious",
  "upbeat",
  "casual",
  "thoughtful",
  "practical",
  "nerdy",
  "loud",
  "formal",
] as const;

export const BRAND_LIMITS = {
  brainsPerWorkspace: 20,
  name: 60,
  niche: 80,
  voiceDescription: 1200,
  tags: 12,
  tag: 30,
  words: 40,
  word: 40,
  sampleLines: 10,
  sampleLine: 300,
  topics: 12,
  topic: 40,
  references: 30,
  referenceText: 3000,
  referenceNote: 300,
  moodItems: 60,
  moodNote: 300,
  moodText: 2000,
  rules: 20,
  rule: 200,
  idea: 1000,
  versionNote: 200,
  postsMin: 3,
  postsMax: 5,
  postText: 3000,
} as const;

export function emptyBody(name = "New Brand Brain"): BrainBody {
  return {
    name,
    niche: "",
    platforms: [],
    voice: { description: "", tone: [], use: [], avoid: [], samples: [] },
    topics: [],
    references: [],
    moodBoard: [],
    dos: [],
    donts: [],
    idea: "",
  };
}
