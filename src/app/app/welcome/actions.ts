"use server";

import { appCall, type Result } from "@/app/app/actions";
import type { OnboardingPatch, OnboardingState } from "@/lib/app/onboarding";
import type { ProposalEdits, PublicProposal } from "@/lib/brand/brains";

export async function saveOnboarding(csrf: string, patch: OnboardingPatch): Promise<Result<OnboardingState>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.saveOnboarding(me, workspaceId, patch));
}

/** Reads the pasted posts into a proposed voice and moves to the review step. */
export async function readPosts(csrf: string): Promise<Result<{ state: OnboardingState; proposal: PublicProposal }>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.readOnboardingPosts(me, workspaceId));
}

/** Saves the reviewed voice as the first Brand Brain and lands in the app. */
export async function finishOnboarding(csrf: string, edits: ProposalEdits): Promise<Result<OnboardingState>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.finishOnboarding(me, workspaceId, edits), { refresh: "/app" });
}

export async function skipOnboarding(csrf: string): Promise<Result<OnboardingState>> {
  return appCall(csrf, ({ api, me, workspaceId }) => api.skipOnboarding(me, workspaceId), { refresh: "/app" });
}
