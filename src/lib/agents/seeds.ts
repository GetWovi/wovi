/**
 * The launch agents from the homepage, as real specs owned by the platform's
 * own creator account. Six are live; Storyboarder and Voice and Cut are built
 * but hidden until their drop.
 */
import type { AgentRegistry, CreateInput } from "./registry";
import { compareSemver, highestSemver } from "./semver";

/** The platform's workspace, where WOVI's own agents live. */
export const PLATFORM_WORKSPACE_ID = "ws_wovi";
/** The platform-owned creator account. Preset agents are built under it like any creator's. */
export const PLATFORM_CREATOR_ID = "creator_wovi";

const owner = { kind: "platform", creatorId: PLATFORM_CREATOR_ID } as const;

const platformChoice = (key: string, multiple: boolean) => ({
  key,
  label: multiple ? "Platforms" : "Platform",
  type: "choice" as const,
  required: true,
  multiple,
  options: [
    { value: "x", label: "X" },
    { value: "tiktok", label: "TikTok" },
    { value: "shorts", label: "YouTube Shorts" },
    { value: "reels", label: "Instagram Reels" },
  ],
});

const brandInput = {
  key: "brand",
  label: "Brand Brain",
  type: "profile" as const,
  required: false,
  help: "Which Brand Brain to write for. Uses your default when left empty.",
};

const ALL_PLATFORMS = ["x", "tiktok", "shorts", "reels"] as const;

export const SEED_AGENTS: CreateInput[] = [
  {
    id: "hook-writer",
    version: "1.0.0",
    name: "Hook Writer",
    job: "Opens a post or a short with one line people stop for.",
    category: "writing",
    platforms: [...ALL_PLATFORMS],
    inputs: [
      {
        key: "idea",
        label: "Your idea",
        type: "long_text",
        required: true,
        limits: { minLength: 10, maxLength: 600 },
        help: "One or two sentences about the post. The more specific, the better the hooks.",
      },
      platformChoice("platform", false),
      brandInput,
    ],
    output: { kind: "list", count: 10, maxWordsPerItem: 12 },
    brandBrain: ["voice", "references", "dos_donts"],
    tools: ["trend_lookup"],
    guardrails: ["no_misleading_claims", "brand_voice_check", "banned_phrases", "specificity_check"],
    routing: { model: "text-standard", fallback: "text-fast", temperature: 0.8, maxCostUsd: 0.05, maxOutputTokens: 800 },
    instructions: [
      "You write opening lines for short social posts on {{platform}}.",
      "The idea: {{idea}}",
      "Write in this voice: {{brand.voice}}",
      "Match the feel of these past posts: {{brand.references}}",
      "Follow these rules from the brand: {{brand.dos_donts}}",
      "Each hook is one line of at most 12 words, says something only this idea could say, and makes a promise the post keeps.",
      "No generic openers, no questions that could start any post, no claims the idea does not support.",
    ].join("\n"),
    owner,
    status: "live",
    visibility: "public",
  },
  {
    id: "caption-writer",
    version: "1.0.0",
    name: "Caption Writer",
    job: "Writes the caption to match the clip, the format and your voice.",
    category: "writing",
    platforms: [...ALL_PLATFORMS],
    inputs: [
      {
        key: "post",
        label: "What the post shows",
        type: "long_text",
        required: true,
        limits: { minLength: 10, maxLength: 2000 },
        help: "Describe the clip or paste the script.",
      },
      platformChoice("platforms", true),
      {
        key: "length",
        label: "Length",
        type: "choice",
        required: false,
        options: [
          { value: "short", label: "Short" },
          { value: "medium", label: "Medium" },
          { value: "long", label: "Long" },
        ],
        default: "short",
      },
      brandInput,
    ],
    output: { kind: "caption_set", platforms: [...ALL_PLATFORMS], variants: 2, maxChars: 2200 },
    brandBrain: ["voice", "references", "dos_donts"],
    tools: [],
    guardrails: ["no_misleading_claims", "brand_voice_check", "banned_phrases", "platform_policy"],
    routing: { model: "text-standard", fallback: "text-fast", temperature: 0.7, maxCostUsd: 0.05, maxOutputTokens: 1200 },
    instructions: [
      "You write captions for one post, one caption per platform in {{platforms}}.",
      "The post: {{post}}",
      "Length: {{length}}",
      "Voice: {{brand.voice}}",
      "Past posts to match: {{brand.references}}",
      "Brand rules: {{brand.dos_donts}}",
      "Fit each platform's length and habits. Say what the post shows, add the one detail a viewer would miss, and end with a reason to reply or save.",
      "No hashtags; Hashtag Picker does those.",
    ].join("\n"),
    owner,
    status: "live",
    visibility: "public",
  },
  {
    id: "trend-scout",
    version: "1.0.0",
    name: "Trend Scout",
    job: "Finds the formats worth trying this week and says why.",
    category: "research",
    platforms: [...ALL_PLATFORMS],
    inputs: [
      {
        key: "niche",
        label: "Your niche",
        type: "text",
        required: true,
        limits: { minLength: 2, maxLength: 120 },
        help: "For example: small bakery, indie games, strength training for beginners.",
      },
      platformChoice("platform", false),
      brandInput,
    ],
    output: { kind: "list", count: 5, fields: ["format", "example", "why_now", "how_to_use_it"] },
    brandBrain: ["references", "dos_donts"],
    tools: ["trend_lookup"],
    guardrails: ["no_misleading_claims", "platform_policy"],
    routing: { model: "text-strong", fallback: "text-standard", temperature: 0.4, maxCostUsd: 0.15, maxOutputTokens: 1500 },
    instructions: [
      "You find formats on {{platform}} that a creator in this niche should try this week: {{niche}}",
      "Use trend_lookup for what is rising now. Only report what the lookup shows.",
      "Skip anything that clashes with these brand rules: {{brand.dos_donts}}",
      "Prefer formats that fit posts like these: {{brand.references}}",
      "For each format give a real example, why it works now, and how this creator could use it.",
    ].join("\n"),
    owner,
    status: "live",
    visibility: "public",
  },
  {
    id: "script-writer",
    version: "1.0.0",
    name: "Script Writer",
    job: "Turns one idea into beats with a beginning, a turn and an end.",
    category: "writing",
    platforms: ["tiktok", "shorts", "reels"],
    inputs: [
      {
        key: "idea",
        label: "Your idea",
        type: "long_text",
        required: true,
        limits: { minLength: 10, maxLength: 1000 },
      },
      {
        key: "length",
        label: "Length",
        type: "choice",
        required: true,
        options: [
          { value: "s15", label: "15 seconds" },
          { value: "s30", label: "30 seconds" },
          { value: "s60", label: "60 seconds" },
        ],
        default: "s30",
      },
      brandInput,
    ],
    output: { kind: "script", maxSeconds: 60, sections: ["opening", "turn", "ending"] },
    brandBrain: ["voice", "references", "dos_donts", "idea"],
    tools: [],
    guardrails: ["no_misleading_claims", "no_fake_testimonials", "brand_voice_check", "banned_phrases", "specificity_check"],
    routing: { model: "text-strong", fallback: "text-standard", temperature: 0.7, maxCostUsd: 0.12, maxOutputTokens: 1500 },
    instructions: [
      "You write a short-form video script of {{length}} from this idea: {{idea}}",
      "The bigger idea behind the brand: {{brand.idea}}",
      "Voice: {{brand.voice}}",
      "Past posts to match: {{brand.references}}",
      "Brand rules: {{brand.dos_donts}}",
      "Three parts: an opening line people stop for, a turn that changes how the viewer sees the idea, and an ending that lands.",
      "Write spoken lines plus a short note on what is on screen for each beat. Keep the user's direction; do not invent a new one.",
    ].join("\n"),
    owner,
    status: "live",
    visibility: "public",
  },
  {
    id: "hashtag-picker",
    version: "1.0.0",
    name: "Hashtag Picker",
    job: "Picks a small set of tags that fit the post, not a wall of them.",
    category: "optimization",
    platforms: [...ALL_PLATFORMS],
    inputs: [
      {
        key: "caption",
        label: "Caption",
        type: "long_text",
        required: true,
        limits: { minLength: 5, maxLength: 2200 },
      },
      platformChoice("platform", false),
      brandInput,
    ],
    output: { kind: "list", count: 5, maxWordsPerItem: 3 },
    brandBrain: ["dos_donts"],
    tools: ["trend_lookup"],
    guardrails: ["platform_policy", "banned_phrases"],
    routing: { model: "text-fast", fallback: "text-standard", temperature: 0.3, maxCostUsd: 0.02, maxOutputTokens: 300 },
    instructions: [
      "You pick up to five tags for this {{platform}} post: {{caption}}",
      "Mix one broad tag with specific ones a real viewer would search. Check with trend_lookup that each tag is in use.",
      "Never use tags the brand rules out: {{brand.dos_donts}}",
      "No banned, misleading or unrelated tags.",
    ].join("\n"),
    owner,
    status: "live",
    visibility: "public",
  },
  {
    id: "repurposer",
    version: "1.0.0",
    name: "Repurposer",
    job: "Cuts a long piece into a thread, a carousel and three shorts.",
    category: "optimization",
    platforms: [...ALL_PLATFORMS],
    inputs: [
      {
        key: "source",
        label: "The long piece",
        type: "long_text",
        required: true,
        limits: { minLength: 200, maxLength: 20000 },
        help: "Paste the article, newsletter or transcript. Only use work you own or have the rights to.",
      },
      {
        key: "source_video",
        label: "Or the video",
        type: "video",
        required: false,
        limits: { maxSizeMb: 1024, maxFiles: 1, maxSeconds: 3600 },
        help: "A long video to pull the shorts from.",
      },
      brandInput,
    ],
    output: {
      kind: "post_set",
      formats: [
        { format: "thread", count: 1 },
        { format: "carousel", count: 1 },
        { format: "short", count: 3 },
      ],
    },
    brandBrain: ["voice", "dos_donts"],
    tools: ["transcription"],
    guardrails: ["rights_confirmed", "no_misleading_claims", "brand_voice_check", "banned_phrases"],
    routing: { model: "text-strong", fallback: "text-standard", temperature: 0.5, maxCostUsd: 0.4, maxOutputTokens: 4000 },
    instructions: [
      "You turn one long piece into a thread for X, a carousel, and three short video scripts.",
      "The piece: {{source}}",
      "If there is a video, transcribe it with transcription and use its strongest moments: {{source_video}}",
      "Voice: {{brand.voice}}",
      "Brand rules: {{brand.dos_donts}}",
      "Each piece stands alone and makes one point from the source. Quote the source faithfully and add nothing it does not say.",
    ].join("\n"),
    owner,
    status: "live",
    visibility: "public",
  },
  {
    id: "storyboarder",
    version: "1.0.0",
    name: "Storyboarder",
    job: "Frames, shots and on-screen text for every beat of the script.",
    category: "production",
    platforms: ["tiktok", "shorts", "reels"],
    inputs: [
      {
        key: "script",
        label: "Approved script",
        type: "long_text",
        required: true,
        limits: { minLength: 20, maxLength: 6000 },
      },
      brandInput,
    ],
    output: { kind: "storyboard", maxFrames: 12, withImages: true, aspect: "9:16" },
    brandBrain: ["mood_board", "references", "dos_donts"],
    tools: ["image_generate"],
    guardrails: ["no_impersonation", "safe_content", "ai_disclosure", "brand_voice_check"],
    routing: { model: "text-standard", fallback: "text-fast", temperature: 0.6, maxCostUsd: 0.8, maxOutputTokens: 2500 },
    instructions: [
      "You storyboard this script for a vertical 9:16 video, one frame per beat: {{script}}",
      "For each frame give the shot, what is on screen, the on-screen text and its timing, then draw it with image_generate.",
      "The look comes from the mood board: {{brand.mood_board}}",
      "Stay close to past posts: {{brand.references}}",
      "Brand rules: {{brand.dos_donts}}",
      "Show the user's vision; never add people who look like real persons.",
    ].join("\n"),
    owner,
    status: "hidden",
    visibility: "public",
  },
  {
    id: "voice-and-cut",
    version: "1.0.0",
    name: "Voice and Cut",
    job: "Narration in your voice and a first cut from the storyboard.",
    category: "production",
    platforms: ["tiktok", "shorts", "reels"],
    inputs: [
      {
        key: "script",
        label: "Approved script",
        type: "long_text",
        required: true,
        limits: { minLength: 20, maxLength: 6000 },
      },
      {
        key: "frames",
        label: "Approved storyboard frames",
        type: "image",
        required: true,
        limits: { maxSizeMb: 20, maxFiles: 12 },
      },
      {
        key: "voice",
        label: "Voice",
        type: "choice",
        required: true,
        options: [
          { value: "my_voice", label: "My voice (needs consent on file)" },
          { value: "warm", label: "Warm" },
          { value: "calm", label: "Calm" },
          { value: "bright", label: "Bright" },
        ],
      },
      brandInput,
    ],
    output: { kind: "video", maxSeconds: 90, aspect: "9:16" },
    brandBrain: ["voice", "mood_board"],
    tools: ["voice_synth", "video_cut"],
    guardrails: ["voice_consent", "no_impersonation", "ai_disclosure", "safe_content"],
    routing: { model: "text-standard", fallback: "text-fast", temperature: 0.3, maxCostUsd: 2, maxOutputTokens: 1500 },
    instructions: [
      "You make a first cut of a short video.",
      "Read this approved script aloud with voice_synth in the {{voice}} voice: {{script}}",
      "Cut the approved frames to the narration with video_cut, in order, one frame per beat: {{frames}}",
      "Pace and delivery follow the brand voice: {{brand.voice}}",
      "Transitions and rhythm follow the mood board: {{brand.mood_board}}",
      "Change nothing the user approved.",
    ].join("\n"),
    owner,
    status: "hidden",
    visibility: "public",
  },
];

async function highestVersion(registry: AgentRegistry, id: string): Promise<string> {
  const versions = await registry.versions(PLATFORM_WORKSPACE_ID, id);
  return highestSemver(versions.map((v) => v.version)) ?? "0.0.0";
}

/**
 * Puts the launch agents into the platform workspace. Safe to run again:
 * missing agents are created, agents whose seed version is higher are updated
 * to it, and the rest are left alone.
 */
export async function seedPlatformAgents(registry: AgentRegistry) {
  const result = { created: [] as string[], updated: [] as string[], unchanged: [] as string[] };
  for (const seed of SEED_AGENTS) {
    const existing = await registry.get(PLATFORM_WORKSPACE_ID, seed.id);
    if (!existing) {
      await registry.create(PLATFORM_WORKSPACE_ID, seed, { note: "Launch seed" });
      result.created.push(seed.id);
    } else if (compareSemver(seed.version, await highestVersion(registry, seed.id)) > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, owner, status, visibility, ...body } = seed;
      await registry.update(PLATFORM_WORKSPACE_ID, seed.id, body, { note: "Launch seed" });
      result.updated.push(seed.id);
    } else {
      result.unchanged.push(seed.id);
    }
  }
  return result;
}
