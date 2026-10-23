/**
 * The AI-label reminder (phase 18, EU AI Act Art. 50 and each platform's own
 * rules): for the platforms a result is for, when the platform asks for an AI
 * label and where it is set. WOVI's drafts are text; none of the four
 * platforms asks for a label on AI-written text alone, but the video or
 * picture made from the draft may need one. Client-safe.
 */
import { PLATFORMS, type Platform } from "@/lib/agents/catalog";
import { PLATFORM_POLICIES } from "./platforms";

export type AiLabelAdvice = { platform: Platform; name: string; when: string; where: string; textNeedsLabel: boolean };

export function aiLabelAdvice(platforms: readonly string[]): AiLabelAdvice[] {
  const list = platforms.filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
  return (list.length ? list : [...PLATFORMS]).map((p) => ({ platform: p, name: PLATFORM_POLICIES[p].name, ...PLATFORM_POLICIES[p].ai }));
}

/** The sentence above the reminder. */
export const AI_LABEL_INTRO =
  "An AI wrote this draft. Captions and scripts written with AI need no label on TikTok, Instagram, YouTube or X. If what you post shows realistic people, places or events made or changed with AI, or uses an AI voice, label it when you post:";

export const AI_LABEL_CHECK = "I will add the AI label where the platform asks for it.";
