/**
 * The app's record shapes and fixed lists (phase 9): onboarding progress and
 * the human approve step. No storage here, so client components can import
 * the lists and types.
 */
import type { Platform } from "@/lib/agents/catalog";

export const ONBOARDING_STEPS = ["welcome", "brand", "posts", "review"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingStatus = "open" | "done" | "skipped";

/** One person's progress through onboarding in one workspace. Saved after every step. */
export type OnboardingRow = {
  /** `${workspaceId}:${userId}` */
  id: string;
  workspaceId: string;
  userId: string;
  step: OnboardingStep;
  name: string;
  niche: string;
  platforms: Platform[];
  posts: string[];
  /** The open profile proposal from the pasted posts, once read. */
  proposalId: string | null;
  status: OnboardingStatus;
  /** The Brand Brain onboarding made, once it is done. */
  brainId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const REVIEW_DECISIONS = ["approved", "rejected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** The human approve step on one run. One row per run; deciding again replaces it. */
export type ReviewRow = {
  /** The run id. */
  id: string;
  workspaceId: string;
  runId: string;
  decision: ReviewDecision;
  note: string;
  /** A user id, or `key:<id>` for an API key. */
  by: string;
  at: string;
};
