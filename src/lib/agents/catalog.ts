/**
 * The fixed lists an agent spec may name: model routes, tools, guardrails,
 * Brand Brain parts, platforms and categories. They are data, kept in this one
 * file, so adding a tool or swapping a model never touches the validator or
 * the agents.
 */

/* ---------- Model routes ---------- */

export type ModelModality = "text" | "image" | "video" | "audio";
export type ModelTier = "fast" | "standard" | "strong";

export type ModelRoute = {
  /** What a spec names in routing.model and routing.fallback. */
  id: string;
  modality: ModelModality;
  tier: ModelTier;
  /**
   * The provider and provider model this route maps to. Not chosen yet (an
   * open decision in the product doc), so phase 3 fills these in. Agents never
   * change when they do.
   */
  provider: string | null;
  model: string | null;
};

export const MODEL_ROUTES: readonly ModelRoute[] = [
  { id: "text-fast", modality: "text", tier: "fast", provider: null, model: null },
  { id: "text-standard", modality: "text", tier: "standard", provider: null, model: null },
  { id: "text-strong", modality: "text", tier: "strong", provider: null, model: null },
  { id: "image-standard", modality: "image", tier: "standard", provider: null, model: null },
  { id: "video-standard", modality: "video", tier: "standard", provider: null, model: null },
  { id: "audio-standard", modality: "audio", tier: "standard", provider: null, model: null },
];

export function findModelRoute(id: string): ModelRoute | undefined {
  return MODEL_ROUTES.find((m) => m.id === id);
}

/* ---------- Tools ---------- */

export type ToolDef = { id: string; label: string; description: string };

/** The allowlist. An agent may only call tools it declares, and only these exist. */
export const TOOLS: readonly ToolDef[] = [
  { id: "trend_lookup", label: "Trend lookup", description: "Current formats, sounds and topics on a platform." },
  { id: "transcription", label: "Transcription", description: "Speech in a video or audio file to timed text." },
  { id: "video_cut", label: "Video cut", description: "Cuts and joins clips on a timeline." },
  { id: "image_generate", label: "Image generation", description: "Makes a still image from a frame description." },
  { id: "voice_synth", label: "Voice", description: "Reads a script aloud in a chosen voice." },
];

export const TOOL_IDS: readonly string[] = TOOLS.map((t) => t.id);

/* ---------- Guardrails ---------- */

export type GuardrailDef = { id: string; label: string; description: string };

export const GUARDRAILS: readonly GuardrailDef[] = [
  { id: "no_misleading_claims", label: "No misleading claims", description: "Blocks false or unprovable claims about results, health or money." },
  { id: "no_fake_testimonials", label: "No fake testimonials", description: "Blocks invented quotes, reviews or customer stories." },
  { id: "no_impersonation", label: "No impersonation", description: "Blocks speaking as a real person who is not the user." },
  { id: "brand_voice_check", label: "Brand voice check", description: "Scores the draft against the Brand Brain voice and do and don't list." },
  { id: "banned_phrases", label: "Banned phrases", description: "Removes generic filler lines from the anti-slop list." },
  { id: "specificity_check", label: "Specificity check", description: "Sends back drafts that could be about anyone." },
  { id: "platform_policy", label: "Platform policy", description: "Keeps output inside each platform's rules and limits." },
  { id: "safe_content", label: "Safe content", description: "Filters hate, harassment, sexual content and unsafe advice." },
  { id: "ai_disclosure", label: "AI disclosure", description: "Marks output that needs a platform AI-content label." },
  { id: "rights_confirmed", label: "Rights confirmed", description: "Runs only on content the user confirmed they own or may use." },
  { id: "voice_consent", label: "Voice consent", description: "A cloned or real person's voice needs documented consent." },
];

export const GUARDRAIL_IDS: readonly string[] = GUARDRAILS.map((g) => g.id);

/* ---------- Brand Brain, platforms, categories ---------- */

/** The parts of a user's Brand Brain an agent can read. */
export const BRAND_BRAIN_PARTS = ["voice", "mood_board", "references", "dos_donts", "idea"] as const;
export type BrandBrainPart = (typeof BRAND_BRAIN_PARTS)[number];

/** Launch platforms: X, TikTok, YouTube Shorts and Instagram Reels. */
export const PLATFORMS = ["x", "tiktok", "shorts", "reels"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** The six stages of the content cycle in the product doc. */
export const CATEGORIES = ["research", "ideation", "writing", "production", "optimization", "publish"] as const;
export type Category = (typeof CATEGORIES)[number];

export const ASPECTS = ["9:16", "1:1", "4:5", "16:9"] as const;
