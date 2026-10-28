/**
 * The ready-to-post pack under a made video: a caption for each platform from
 * WOVI's own Caption Writer and the tags and search words from the Hashtag
 * Optimizer, both started from the video's script through the normal app API,
 * so they are charged as normal runs (the price shown first) and show in the
 * history like any other run.
 */
import type { Principal } from "@/lib/accounts/accounts";
import type { StartRunInput } from "@/lib/app/api";
import type { Aspect } from "./planner";
import { spokenText, type VideoProject } from "./studio";

export const PACK_AGENTS = { captions: "caption-writer", hashtags: "hashtag-picker" } as const;
/** The platforms a caption is written for. */
export const PACK_PLATFORMS = ["tiktok", "reels", "shorts", "x"] as const;

/** The one platform the tags are picked for, from the video's format. */
export function packPlatform(aspect: Aspect | undefined): "tiktok" | "reels" | "shorts" {
  return aspect === "1:1" ? "reels" : aspect === "16:9" ? "shorts" : "tiktok";
}

/** What the post shows, for both agents: the length and the script, inside their input limits. */
export function packPost(v: Pick<VideoProject, "scenes" | "title" | "video">): string {
  const script = spokenText(v).replace(/\n\n/g, " ");
  const head = `A ${v.video?.seconds ? `${v.video.seconds} second` : "short"} video${v.title ? ` about ${v.title}` : ""}. What is said: `;
  return (head + (script || v.scenes.map((s) => s.onScreen).join(" "))).slice(0, 2000);
}

/** The two runs' inputs, as the Caption Writer and the Hashtag Optimizer forms would send them. */
export function packInputs(v: VideoProject, opts: { brandBrainId: string | null; quoted?: { captions?: number; hashtags?: number } }): { captions: StartRunInput; hashtags: StartRunInput } {
  const post = packPost(v);
  const brand = opts.brandBrainId ? { brandBrainId: opts.brandBrainId } : {};
  return {
    captions: { agentId: PACK_AGENTS.captions, inputs: { post, platforms: [...PACK_PLATFORMS], length: "short", action: "best" }, ...brand, ...(opts.quoted?.captions !== undefined ? { quotedCredits: opts.quoted.captions } : {}) },
    hashtags: { agentId: PACK_AGENTS.hashtags, inputs: { caption: post, platform: packPlatform(v.brief?.aspect) }, ...brand, ...(opts.quoted?.hashtags !== undefined ? { quotedCredits: opts.quoted.hashtags } : {}) },
  };
}

/** Starts both runs. The captions start first; if the tags cannot start, the captions still count. */
export async function startPostPack(
  api: { startRun(caller: Principal, workspaceId: string, input: StartRunInput): Promise<{ id: string }> },
  caller: Principal,
  workspaceId: string,
  v: VideoProject,
  opts: { brandBrainId: string | null; quoted?: { captions?: number; hashtags?: number } },
): Promise<{ captionRunId: string | null; hashtagRunId: string | null; platform: string; error: string | null }> {
  if (v.stage !== "done" || !v.video) throw new Error("Make the video first.");
  const input = packInputs(v, opts);
  const captions = await api.startRun(caller, workspaceId, input.captions);
  try {
    const tags = await api.startRun(caller, workspaceId, input.hashtags);
    return { captionRunId: captions.id, hashtagRunId: tags.id, platform: String(input.hashtags.inputs.platform), error: null };
  } catch (err) {
    return { captionRunId: captions.id, hashtagRunId: null, platform: String(input.hashtags.inputs.platform), error: err instanceof Error ? err.message : "The tags could not start." };
  }
}
