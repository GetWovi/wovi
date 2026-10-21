/** Deterministic sample runs for the hero's live demo. Illustrative copy only. */

export type DemoRun = {
  idea: string;
  hooks: string[];
  caption: string;
  frames: { label: string; text: string }[];
  fit: number;
};

export const DEMO_RUNS: DemoRun[] = [
  {
    idea: "We stopped doing custom cakes at the bakery. Here is why.",
    hooks: ["The day I said no to a wedding cake order", "Custom cakes were our best seller. We cut them anyway.", "Three words that saved my bakery: no custom cakes"],
    caption: "Custom cakes were paying the rent and eating the team. Here is what we chose instead, and what happened to the queue on Saturday.",
    frames: [
      { label: "Frame 1", text: "Hands boxing a plain loaf. On screen: We stopped." },
      { label: "Frame 2", text: "Empty cake display, early light." },
      { label: "Frame 3", text: "Saturday queue out the door." },
    ],
    fit: 94,
  },
  {
    idea: "A personal trainer explaining why she stopped counting calories with clients.",
    hooks: ["I threw out the calorie spreadsheet", "Why my clients eat more and lose more", "The number I stopped asking for"],
    caption: "Counting calories worked on paper and failed in kitchens. This is what we track now, and why it sticks past week three.",
    frames: [
      { label: "Frame 1", text: "Notebook closes. On screen: no more numbers." },
      { label: "Frame 2", text: "A full plate, overhead, natural light." },
      { label: "Frame 3", text: "Client laughing mid-set." },
    ],
    fit: 91,
  },
  {
    idea: "An indie studio shipping a game after four years, told from the last night.",
    hooks: ["Four years. One upload button.", "The last bug we fixed at 3am", "What shipping actually felt like"],
    caption: "Four years ended with one click at 3:14am. Here is the last hour, the bug that almost stopped it, and the first review.",
    frames: [
      { label: "Frame 1", text: "Dark room, one monitor, cursor on Publish." },
      { label: "Frame 2", text: "Terminal scroll, then silence." },
      { label: "Frame 3", text: "Phone lights up on the desk." },
    ],
    fit: 96,
  },
];

export const SLOP_LINES: { text: string; slop: boolean }[] = [
  { text: "In today's fast-paced digital landscape,", slop: true },
  { text: "game-changing content is key.", slop: true },
  { text: "The day I said no to a wedding cake order.", slop: false },
  { text: "Unlock your brand's full potential", slop: true },
  { text: "with next-level storytelling.", slop: true },
  { text: "Custom cakes paid the rent and ate the team.", slop: false },
  { text: "Elevate your presence today!", slop: true },
  { text: "Here is what we chose instead.", slop: false },
];

export const AGENTS = [
  { name: "Hook Writer", job: "Opens a post or a short with one line people stop for.", tag: "Hooks", fit: 94, icon: "bolt" as const, status: "live" as const },
  { name: "Caption Writer", job: "Writes the caption to match the clip, the format and your voice.", tag: "Captions", fit: 92, icon: "spark" as const, status: "live" as const },
  { name: "Trend Scout", job: "Finds the formats worth trying this week and says why.", tag: "Research", fit: 88, icon: "search" as const, status: "live" as const },
  { name: "Script Writer", job: "Turns one idea into beats with a beginning, a turn and an end.", tag: "Scripts", fit: 93, icon: "film" as const, status: "live" as const },
  { name: "Hashtag Picker", job: "Picks a small set of tags that fit the post, not a wall of them.", tag: "Reach", fit: 90, icon: "hash" as const, status: "live" as const },
  { name: "Repurposer", job: "Cuts a long piece into a thread, a carousel and three shorts.", tag: "Repurposing", fit: 89, icon: "copy" as const, status: "live" as const },
  { name: "Storyboarder", job: "Frames, shots and on-screen text for every beat of the script.", tag: "Storyboards", fit: 0, icon: "film" as const, status: "next" as const },
  { name: "Voice and Cut", job: "Narration in your voice and a first cut from the storyboard.", tag: "Video", fit: 0, icon: "play" as const, status: "next" as const },
];

export const PIPELINE = [
  { id: "idea", title: "Idea", text: "Type it, say it or paste a note. One sentence is enough.", agent: "You", tag: "Start" },
  { id: "script", title: "Script", text: "Script Writer turns it into beats: an opening, a turn, an ending.", agent: "Script Writer", tag: "Live" },
  { id: "storyboard", title: "Storyboard", text: "Frames, shots and on-screen text for every beat.", agent: "Storyboarder", tag: "Next" },
  { id: "approve", title: "Approve", text: "You say yes, or fix one line. Nothing ships without you.", agent: "You", tag: "Always" },
  { id: "video", title: "Voice and video", text: "Narration in your voice and a first cut you can post.", agent: "Voice and Cut", tag: "Next" },
];

export const CODE_TABS: { id: string; label: string; lang: string; code: string }[] = [
  {
    id: "claude",
    label: "Claude",
    lang: "json",
    code: `{
  "mcpServers": {
    "wovi": {
      "command": "npx",
      "args": ["-y", "@wovi/mcp"],
      "env": { "WOVI_API_KEY": "wovi_live_..." }
    }
  }
}

// Then, in a conversation:
// "Use Hook Writer on this idea and keep my bakery voice."`,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    lang: "text",
    code: `Add WOVI as a connector:

  Server URL   https://mcp.wovi.app
  Auth         API key (wovi_live_...)

Then ask:
  "Run Caption Writer on the kitchen tour clip,
   short version, no hashtags."`,
  },
  {
    id: "api",
    label: "API",
    lang: "bash",
    code: `curl https://api.wovi.app/v1/runs \\
  -H "Authorization: Bearer wovi_live_..." \\
  -d '{
    "agent": "hook-writer",
    "brief": "We stopped doing custom cakes. Here is why.",
    "brand_brain": "bakery-main",
    "variants": 3
  }'

# {
#   "status": "done",
#   "hooks": ["The day I said no to a wedding cake order", ...],
#   "brand_fit": 94
# }`,
  },
];
