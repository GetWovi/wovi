/**
 * Each launch platform's rules that matter for a draft (phase 18): length,
 * the AI label, music, paid partnerships and automation. Shown where content
 * is made (the agent form and the result), written into every agent's prompt
 * as guidance, and the source of the AI-label reminder. Data only, from each
 * platform's own policy pages (read 2026-10-23); the links are in `sources`.
 * Client-safe.
 */
import type { Platform } from "@/lib/agents/catalog";

export type Source = { title: string; url: string };

export type PlatformPolicy = {
  platform: Platform;
  name: string;
  /** Length and hashtag limits, in plain words. */
  limits: string;
  ai: {
    /** When the platform asks for an AI label. */
    when: string;
    /** Where the label is set when posting. */
    where: string;
    /** Whether a draft that is only AI-written text (a caption, a script) needs the label itself. */
    textNeedsLabel: boolean;
  };
  music: string;
  paid: string;
  automation: string;
  sources: Source[];
};

export const PLATFORM_POLICIES: Record<Platform, PlatformPolicy> = {
  tiktok: {
    platform: "tiktok",
    name: "TikTok",
    limits: "Caption up to 2,200 characters (the limit for posts made through TikTok's API). WOVI keeps to 5 hashtags.",
    ai: {
      when: "When the video shows realistic AI-made scenes or people, or real footage changed a lot by AI.",
      where: "Turn on \"AI-generated content\" under More options when you post. TikTok may also add its own label.",
      textNeedsLabel: false,
    },
    music: "Posts that promote a business: only sounds from the Commercial Music Library. Other licences do not cover commercial use.",
    paid: "Promoting your own brand or a partner: turn on Content disclosure (\"Your brand\" or \"Branded content\").",
    automation: "No bots, scripts or bought likes and followers. Fake reviews are not allowed.",
    sources: [
      { title: "TikTok Community Guidelines: Integrity and Authenticity", url: "https://www.tiktok.com/community-guidelines/en/integrity-authenticity" },
      { title: "TikTok: AI-generated content", url: "https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content" },
      { title: "TikTok: Commercial use of music", url: "https://support.tiktok.com/en/business-and-creator/creator-and-business-accounts/commercial-use-of-music-on-tiktok" },
      { title: "TikTok for Developers: Content Sharing Guidelines", url: "https://developers.tiktok.com/doc/content-sharing-guidelines" },
    ],
  },
  reels: {
    platform: "reels",
    name: "Instagram Reels",
    limits: "Caption up to 2,200 characters. Instagram is moving to at most 5 hashtags a post, so WOVI keeps to 5.",
    ai: {
      when: "When the video is photorealistic and made or changed with AI, or has realistic AI audio.",
      where: "Add the AI label when you post. It shows as \"AI info\". Meta may also add it on its own.",
      textNeedsLabel: false,
    },
    music: "Business accounts: use the Meta Sound Collection or your own audio. Licensed songs are not for business accounts.",
    paid: "Paid deals: add the \"Paid partnership\" label and tag the partner.",
    automation: "No bought likes or followers, no repetitive comments, no apps that sell engagement.",
    sources: [
      { title: "Meta Community Standards: Spam", url: "https://transparency.meta.com/policies/community-standards/spam/" },
      { title: "Meta: labeling AI-generated content", url: "https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/" },
      { title: "Meta Sound Collection terms", url: "https://www.facebook.com/sound/collection/terms" },
      { title: "Instagram Help: branded content", url: "https://help.instagram.com/2467529163409127" },
      { title: "Meta Platform Terms", url: "https://developers.facebook.com/terms/" },
    ],
  },
  shorts: {
    platform: "shorts",
    name: "YouTube Shorts",
    limits: "Title up to 100 characters, description up to 5,000. More than 60 hashtags and YouTube ignores them all.",
    ai: {
      when: "When it looks real and shows a real person saying or doing something they did not, changes a real event or place, or shows a realistic scene that never happened.",
      where: "In YouTube Studio, under the video's details, answer the AI use question with Yes. Using AI for scripts, titles or captions needs no disclosure.",
      textNeedsLabel: false,
    },
    music: "Use tracks from the YouTube Audio Library and credit Creative Commons tracks. Content ID finds other music.",
    paid: "Sponsorships and product placement: tick \"My video contains paid promotion\".",
    automation: "No fake engagement, view bots or high-volume repetitive comments. No misleading titles or thumbnails.",
    sources: [
      { title: "YouTube Help: Disclosing use of altered or synthetic content", url: "https://support.google.com/youtube/answer/14328491" },
      { title: "YouTube Help: Fake engagement policy", url: "https://support.google.com/youtube/answer/3399767" },
      { title: "YouTube Help: Spam, deceptive practices and scams", url: "https://support.google.com/youtube/answer/2801973" },
      { title: "YouTube Help: Audio Library", url: "https://support.google.com/youtube/answer/3376882" },
      { title: "YouTube API Services Developer Policies", url: "https://developers.google.com/youtube/terms/developer-policies" },
    ],
  },
  x: {
    platform: "x",
    name: "X",
    limits: "280 characters a post (an emoji counts as 2). Longer posts need Premium. WOVI keeps to 2 hashtags.",
    ai: {
      when: "X has no AI label to set. Never share AI-made or edited media of real people as if it were real.",
      where: "No setting. X may add a \"Manipulated media\" label itself.",
      textNeedsLabel: false,
    },
    music: "X has no music library. Only post audio you own or have a licence for.",
    paid: "Sponsored posts: turn on the \"Paid Partnership\" label under Content disclosure.",
    automation: "No automated likes, no bulk following, no automated replies to people who did not ask. An AI reply bot needs X's written approval.",
    sources: [
      { title: "X Help: Automation rules", url: "https://help.x.com/en/rules-and-policies/x-automation" },
      { title: "X Help: Synthetic and manipulated media", url: "https://help.x.com/en/rules-and-policies/manipulated-media" },
      { title: "X Developer Policy", url: "https://docs.x.com/developer-terms/policy" },
      { title: "X Help: Paid partnerships", url: "https://help.x.com/en/rules-and-policies/paid-partnerships-policy" },
    ],
  },
};

/** The lines added to every agent's system message (prompt.ts): content rules first, then each of the agent's platforms. */
export function platformGuidance(platforms: readonly Platform[]): string {
  const lines = [
    "Never write fake reviews or customer quotes, speak as a real person or brand other than the creator, or make claims the material does not back (cures, guaranteed results, made-up numbers). Nothing hateful, harassing, sexual or unsafe.",
    "Never name a copyrighted song to use: describe the sound's mood and say to pick it from the platform's library.",
  ];
  for (const p of platforms) {
    const r = PLATFORM_POLICIES[p];
    if (r) lines.push(`${r.name}: ${r.limits} Music: ${r.music}`);
  }
  return lines.join("\n");
}

/** WOVI never automates engagement: no tool, route or agent may like, follow, comment, reply or post on its own. */
export const ENGAGEMENT_AUTOMATION = false as const;

/**
 * Words that may never name a tool, an MCP tool or an API route: they would
 * act on a social platform without a person (posting, liking, following,
 * replying for someone). A test reads every name against this list.
 * Comments inside WOVI's own review flow are not this: they stay in WOVI.
 */
export const FORBIDDEN_AUTOMATION_WORDS = ["like", "likes", "follow", "follows", "unfollow", "repost", "retweet", "publish", "post", "posting", "dm", "engage", "autoreply", "autocomment", "schedule"] as const;

/** A name split into lowercase words: "approvePipelineRun" and "post_to_x" both work. */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
