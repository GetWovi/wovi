/**
 * Onboarding, the pure part: the four steps from the product doc (welcome,
 * pick niche and platforms, paste 3 to 5 past posts, review the proposed
 * voice), what moves between them, and how a saved row is cleaned. The
 * storage and the Brand Brain calls are in api.ts.
 */
import { PLATFORMS, type Platform } from "@/lib/agents/catalog";
import { BRAND_LIMITS } from "@/lib/brand/types";
import { ONBOARDING_STEPS, type OnboardingRow, type OnboardingStep } from "./types";

export const STEP_TITLES: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  brand: "Your brand",
  posts: "Your posts",
  review: "Your voice",
};

/** What a person edits; the rest of the row is bookkeeping. */
export type OnboardingState = Pick<OnboardingRow, "step" | "name" | "niche" | "platforms" | "posts" | "proposalId" | "status" | "brainId">;

export function emptyOnboarding(): OnboardingState {
  return { step: "welcome", name: "", niche: "", platforms: [], posts: ["", "", ""], proposalId: null, status: "open", brainId: null };
}

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(step) + 1] ?? null;
}

export function prevStep(step: OnboardingStep): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(step) - 1] ?? null;
}

export function isStep(v: unknown): v is OnboardingStep {
  return typeof v === "string" && (ONBOARDING_STEPS as readonly string[]).includes(v);
}

/** The posts that count: trimmed and not empty. */
export function filledPosts(posts: string[]): string[] {
  return posts.map((p) => p.trim()).filter(Boolean);
}

/** Whether the posts step can go on to the proposal: 3 to 5 posts, none too long. */
export function canReadPosts(posts: string[]): { ok: true } | { ok: false; reason: string } {
  const filled = filledPosts(posts);
  if (filled.length < BRAND_LIMITS.postsMin) return { ok: false, reason: `Add ${BRAND_LIMITS.postsMin - filled.length} more post${BRAND_LIMITS.postsMin - filled.length === 1 ? "" : "s"} to go on.` };
  if (filled.length > BRAND_LIMITS.postsMax) return { ok: false, reason: `At most ${BRAND_LIMITS.postsMax} posts.` };
  const long = filled.findIndex((p) => p.length > BRAND_LIMITS.postText);
  if (long >= 0) return { ok: false, reason: `Post ${long + 1} is longer than ${BRAND_LIMITS.postText} characters.` };
  return { ok: true };
}

export type OnboardingPatch = Partial<Pick<OnboardingState, "step" | "name" | "niche" | "platforms" | "posts">>;

/** A patch from a form, cleaned to the Brand Brain's limits. Unknown fields and bad values are dropped. */
export function cleanPatch(patch: OnboardingPatch): OnboardingPatch {
  const out: OnboardingPatch = {};
  if (isStep(patch.step)) out.step = patch.step;
  if (typeof patch.name === "string") out.name = patch.name.trim().replace(/\s+/g, " ").slice(0, BRAND_LIMITS.name);
  if (typeof patch.niche === "string") out.niche = patch.niche.trim().replace(/\s+/g, " ").slice(0, BRAND_LIMITS.niche);
  if (Array.isArray(patch.platforms)) {
    out.platforms = PLATFORMS.filter((p) => (patch.platforms as unknown[]).includes(p)) as Platform[];
  }
  if (Array.isArray(patch.posts)) {
    const posts = patch.posts.filter((p): p is string => typeof p === "string").map((p) => p.slice(0, BRAND_LIMITS.postText)).slice(0, BRAND_LIMITS.postsMax);
    while (posts.length < BRAND_LIMITS.postsMin) posts.push("");
    out.posts = posts;
  }
  return out;
}

/** Which steps a person may open: never past the review without a proposal. */
export function reachableStep(state: OnboardingState, wanted: OnboardingStep): OnboardingStep {
  if (wanted === "review" && !state.proposalId) return "posts";
  return wanted;
}

/** How many steps the person does: the welcome is the door, not a step, so the screens say three like the welcome does. */
export const STEPS_TO_DO = ONBOARDING_STEPS.length - 1;

/** The number on a step's pill: none for the welcome, 1 to 3 after it. */
export function stepNumber(step: OnboardingStep): number | null {
  return step === "welcome" ? null : stepIndex(step);
}

/** The progress line above each screen: "Step 2 of 3", and the time it takes on the welcome. */
export function progressLabel(step: OnboardingStep): string {
  const n = stepNumber(step);
  return n === null ? `${STEPS_TO_DO} short steps` : `Step ${n} of ${STEPS_TO_DO}`;
}

/** Whether a Brand Brain has a voice yet: words about it, a tone, past posts or rules. A name and platforms alone are not one. */
export function hasVoice(brain: { voice: string; tone: readonly string[]; references: number; rules: number }): boolean {
  return Boolean(brain.voice.trim()) || brain.tone.length > 0 || brain.references > 0 || brain.rules > 0;
}

/** The welcome after onboarding, true to what the Brand Brain holds: null when none was made. */
export function welcomeWords(brain: { voiced: boolean } | null): { title: string; description: string } {
  if (!brain) return { title: "You are in", description: "Build a Brand Brain whenever you like." };
  if (brain.voiced) return { title: "Your Brand Brain is in", description: "Every agent reads it first." };
  return { title: "You are in", description: "Your Brand Brain only has the basics so far. Add a few posts on the Brand page so agents can sound like you." };
}
