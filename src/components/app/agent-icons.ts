/** An icon and a short tag per agent, for the cards. Plain data, safe on the client. */
import type { IconName } from "@/components/ui/Icon";

export const AGENT_ICONS: Record<string, IconName> = {
  "trend-scout": "search",
  "idea-generator": "bulb",
  "hook-writer": "bolt",
  "script-writer": "film",
  "caption-writer": "spark",
  "hashtag-picker": "hash",
  repurposer: "copy",
  storyboarder: "image",
  "voice-and-cut": "play",
};

export const AGENT_TAGS: Record<string, string> = {
  "trend-scout": "Research",
  "idea-generator": "Ideas",
  "hook-writer": "Hooks",
  "script-writer": "Scripts",
  "caption-writer": "Captions",
  "hashtag-picker": "Reach",
  repurposer: "Repurposing",
};

export function agentIcon(id: string): IconName {
  return AGENT_ICONS[id] ?? "spark";
}

export function agentTag(id: string, category: string): string {
  return AGENT_TAGS[id] ?? category.replace(/^\w/, (c) => c.toUpperCase());
}

/** What a run of each agent hands back, for the "what you get" list beside the form. */
export const AGENT_GETS: Record<string, string[]> = {
  "idea-generator": ["Seven ideas, one for each day", "A format for each one", "Why it fits your brand and goal"],
  "hook-writer": ["Ten opening lines, ten angles", "Twelve words at most each", "Spoken for video, a first line for X"],
  "script-writer": ["Four beats: hook, setup, turn, ending", "What to say and what is on screen", "Timed to the length you pick"],
  "caption-writer": ["Two captions per platform", "Your facts in word for word", "One clear next step for people"],
  "hashtag-picker": ["Six tags and search words", "Where each one goes", "Why it fits this post"],
  repurposer: ["One native version per platform", "Same point, same facts, new shape", "Hook, script, on screen and caption for video"],
};
